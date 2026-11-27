// 跨区域公共交通规划
//
// 服务对象是「干线 + 响应型接驳公交」这套运营模式，不是通用地图：
//   · 同城：只做大连市内的规划，跨城（直线 > 120 km / 高德返回跨城）明确不支持
//   · 公共交通：只输出「响应型接驳公交 + 地铁/干线」，不提供电动车、汽车、打车、骑行
//   · 跨区域：OD 在同一个接驳区时不规划——直接坐接驳公交可直达；
//     真正需要规划的是跨区域：接驳到哪个地铁站 → 坐哪条线 → 在哪换乘 → 哪站下车 → 下车后怎么走
//
// 数据来源两段拼起来：
//   1) 接驳段：本系统站点路网（stopRoute，真实道路里程）+ 候车/运营速度模型
//   2) 干线段：高德 AMap.Transfer（只要含地铁的方案），返回真实线路、换乘站、班次时间
import { AREAS, STOPS, areaContains, stopById } from '../data/config.js'
import { toLngLat, toXY } from '../data/geo.js'
import { loadAMap } from './amapLoader.js'
import { nearestStop, routeKm, stopRoute } from './routing.js'
import { fare } from './pricing.js'
import { wgs84ToGcj02 } from './coords.js'

export const SHUTTLE_WAIT_MIN = 3 // 平均候车时间
export const SHUTTLE_KM_PER_MIN = 0.5 // 运营速度 ≈ 30 km/h
export const WALK_KM_PER_MIN = 0.08 // 步行 ≈ 4.8 km/h
// 响应型接驳是「短距离喂给地铁」的产品：接驳段超过这个里程就不是它的主场了，
// 宁可换一个更近的地铁站，也不要让乘客坐着接驳车横穿半个城区。
export const SHUTTLE_MAX_KM = 6
const MAX_CITY_KM = 120 // 超过即视为跨城，不规划
const EDGE_TOL_UNITS = 150 / 25 // 边界容差 150 m（站点 POI 常落在边界道路外侧）

const DEFAULT_AREA = AREAS[0]
const HUB_STOPS = STOPS.filter((s) => s.hub) // 地铁站 = 接驳枢纽

// 某运营区可用的接驳枢纽（地铁站）：站点归属本区，或本区线路经过该站
function hubsOf(area) {
  if (!area) return []
  return HUB_STOPS.filter((s) => s.areaId === area.id || (s.lines || []).includes(area.line)).map((s) => s.id)
}

// ---- 基础工具 ----

// 点所属运营区（落在边界道路上或距边界 ≤ 45 m 也算区内）
export function areaAt(lng, lat) {
  const p = toXY(lng, lat)
  for (const a of AREAS) {
    if (areaContains(a, p, EDGE_TOL_UNITS)) return a
  }
  return null
}

// 兼容旧接口：是否在任一运营区内
export function inArea(lng, lat) {
  return !!areaAt(lng, lat)
}

function havKm(a, b) {
  const R = 6371
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const round1 = (n) => Math.round(n * 10) / 10

// 高德返回的 path 有时是 LngLat 对象、有时是 [lng,lat] 数组，统一成 [lng,lat]
function toLL(p) {
  if (!p) return null
  if (typeof p.getLng === 'function') return [p.getLng(), p.getLat()]
  if (Array.isArray(p)) return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null
  if (typeof p.lng === 'number' && typeof p.lat === 'number') return [p.lng, p.lat]
  return null
}

// 高德每个 segment 的 transit.path 就是这一段的真实折线（步行段也有），
// 直接拿来分段上色，不需要再从整条方案 path 里切。
function segPath(t) {
  const arr = t?.path
  if (!Array.isArray(arr)) return []
  const out = []
  for (const p of arr) {
    const ll = toLL(p)
    if (!ll) continue
    const last = out[out.length - 1]
    if (!last || Math.abs(last[0] - ll[0]) > 1e-7 || Math.abs(last[1] - ll[1]) > 1e-7) out.push(ll)
  }
  return out
}

// 接驳段的上下车站：必须落在**这条接驳线路**上，且按「道路里程」取最近。
//   · 之前直接取全局直线最近的站，于是可能挑到另一条线的站台，
//     甚至直线看着近、实际要绕一大圈（跨铁路/快速路）的站 —— 用户看到的就是
//     「明明我在 A 附近，却要我去 B 上车」。
//   · 现在先按直线筛 8 个候选，再用真实站间路网里程比一次，取真正最好走的那个。
function boardingStop(ll, lineId, preferId) {
  // 按「这条线停不停这一站」筛，而不是按主属区：
  // X2 新增的万达广场—和光大厦地块，站点主属区还是 a1，但 X2 也停靠
  const pool = STOPS.filter((s) => !s.hidden && !s.exit && !s.base && (s.lines || []).includes(lineId))
  if (!pool.length) return null
  const p = toXY(ll[0], ll[1])
  const prefer = preferId ? pool.find((s) => s.id === preferId) : null
  if (prefer) return { stop: prefer, walkM: Math.round(Math.hypot(prefer.x - p.x, prefer.y - p.y) * 25) }
  const near = pool
    .map((s) => ({ s, d: Math.hypot(s.x - p.x, s.y - p.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
  let best = near[0]
  let bestKm = Infinity
  for (const c of near) {
    const k = routeKm(p, c.s)
    if (k < bestKm) {
      bestKm = k
      best = c
    }
  }
  return { stop: best.s, walkM: Math.round(best.d * 25) }
}

// 接驳段：任意点 → 区域内某个地铁站（走真实站间路网）
// dir='toHub'   ：上车点 → 地铁站（起点侧）
// dir='fromHub' ：地铁站 → 下车点（终点侧，折线方向与真实行驶方向一致）
// lineId：本段属于哪条接驳线路（X1 / X2），决定上下车站只能从该线路的站台里选
// 返回 { km, min, boardName, walkM, path }
function shuttleToHub(fromLL, hubId, fromStopId, dir = 'toHub', lineId = DEFAULT_AREA.line) {
  const hub = stopById(hubId)
  const pick = boardingStop(fromLL, lineId, fromStopId)
  const boardStop = pick?.stop || stopById(hubId)
  const walkM = pick ? pick.walkM : 0
  const r = dir === 'fromHub' ? stopRoute(hubId, boardStop.id) : stopRoute(boardStop.id, hubId)
  const km = r ? r.km : 0
  const rideMin = km / SHUTTLE_KM_PER_MIN
  const walkMin = walkM / 1000 / WALK_KM_PER_MIN
  const min = SHUTTLE_WAIT_MIN + rideMin + walkMin
  const base = {
    fromLL,
    dir,
    boardName: boardStop.name,
    boardId: boardStop.id,
    hubName: hub.name,
    hubId,
  }
  // 起点本身就是这个枢纽站：不需要接驳，直接进地铁
  if (boardStop.id === hubId) {
    return { ...base, km: 0, min: 0, walkM: 0, walkMin: 0, waitMin: 0, rideMin: 0, path: [] }
  }
  // 接驳段太短（≤0.7 km）：等车 3 分钟比走过去还慢，这一段直接按步行算
  const walkInstead = km * 1000 <= 700
  return {
    ...base,
    km: round1(km),
    min: walkInstead ? Math.max(1, Math.round(km / WALK_KM_PER_MIN)) : Math.max(1, Math.round(min)),
    walkM: walkInstead ? round1(km * 1000) : walkM,
    walkMin: walkInstead ? Math.max(1, Math.round(km / WALK_KM_PER_MIN)) : Math.round(walkMin),
    waitMin: walkInstead ? 0 : SHUTTLE_WAIT_MIN,
    rideMin: walkInstead ? 0 : Math.round(rideMin),
    walkInstead,
    path: r ? r.pts.map(toLngLat) : dir === 'fromHub' ? [toLngLat(hub), fromLL] : [fromLL, toLngLat(hub)],
  }
}

// 区域内直达（不需要换乘）
function directShuttle(fromLL, destLL, fromStopId, destStopId, area) {
  const line = area?.line || DEFAULT_AREA.line
  const a = boardingStop(fromLL, line, fromStopId)?.stop || stopById(fromStopId)
  const b = boardingStop(destLL, line, destStopId)?.stop || nearestStop(toXY(destLL[0], destLL[1])).stop
  const r = stopRoute(a.id, b.id)
  const km = r ? r.km : havKm(fromLL, destLL) * 1.3
  const rideMin = km / SHUTTLE_KM_PER_MIN
  const min = Math.max(2, Math.round(SHUTTLE_WAIT_MIN + rideMin))
  const path = r ? r.pts.map(toLngLat) : [fromLL, destLL]
  const leg = {
    mode: 'shuttle',
    line: '响应型接驳 ' + line,
    text: `${a.name} 上车 → ${b.name} 下车`,
    from: a.name,
    to: b.name,
    min,
    km: round1(km),
    note: `含候车约 ${SHUTTLE_WAIT_MIN} 分钟 · 全程真实道路 ${round1(km)} km`,
    path,
  }
  return {
    id: 'p-direct',
    kind: 'direct',
    title: '响应型接驳公交直达',
    tag: '同区域内 · 无需换乘',
    totalMin: min,
    walkM: 0,
    fare: fare(km),
    transfers: 0,
    legs: [leg],
    segments: [{ mode: 'shuttle', line: leg.line, text: leg.text, min, path }],
    path,
  }
}

// ---- 高德公共交通换乘 ----
let transferReady = null
function ensureTransfer() {
  if (!transferReady) {
    transferReady = loadAMap().then(
      (AMap) =>
        new Promise((res) => {
          AMap.plugin(['AMap.Transfer'], () => res(AMap))
        }),
    )
  }
  return transferReady
}

// policy：换乘策略。默认「最少时间」，必要时再按「最少换乘 / 最少步行」找备选方案
async function callTransfer(fromLL, toLL, policy) {
  const AMap = await ensureTransfer()
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      const tr = new AMap.Transfer({
        city: '大连',
        cityd: '大连',
        policy: policy ?? AMap.TransferPolicy.LEAST_TIME,
        nightflag: 0,
        extensions: 'all',
      })
      tr.search(fromLL, toLL, (status, result) => {
        if (status === 'complete' && result?.plans?.length) finish(result.plans)
        else finish(null)
      })
    } catch {
      finish(null)
    }
    setTimeout(() => finish(null), 12000)
  })
}

// 把高德的一段行程转成统一的 leg 结构；滤掉打车等非公共交通
function toLegs(plan) {
  const legs = []
  for (const seg of plan.segments || []) {
    const mode = seg.transit_mode
    const t = seg.transit || {}
    if (mode === 'WALK') {
      legs.push({
        mode: 'walk',
        text: seg.instruction || `步行 ${seg.distance} 米`,
        min: Math.max(1, Math.round((seg.time || 0) / 60)),
        km: round1((seg.distance || 0) / 1000),
        m: Math.round(seg.distance || 0),
        path: segPath(t),
      })
    } else if (mode === 'SUBWAY') {
      legs.push({
        mode: 'subway',
        line: (seg.instruction || '').replace(/^乘坐/, '').split('途径')[0] || '地铁',
        text: `${t.on_station?.name || ''} → ${t.off_station?.name || ''}`,
        from: t.on_station?.name,
        to: t.off_station?.name,
        stops: t.via_num || 0,
        min: Math.max(1, Math.round((seg.time || 0) / 60)),
        km: round1((seg.distance || 0) / 1000),
        path: segPath(t),
      })
    } else if (mode === 'BUS') {
      legs.push({
        mode: 'bus',
        line: (seg.instruction || '').replace(/^乘坐/, '').split('途径')[0] || '公交',
        text: `${t.on_station?.name || ''} → ${t.off_station?.name || ''}`,
        from: t.on_station?.name,
        to: t.off_station?.name,
        stops: t.via_num || 0,
        min: Math.max(1, Math.round((seg.time || 0) / 60)),
        km: round1((seg.distance || 0) / 1000),
        path: segPath(t),
      })
    } else if (mode === 'TAXI') {
      return null // 不提供打车方案
    }
  }
  return legs
}

// 判断这个高德方案是否"以地铁为干线"
// 只卖地铁干线：含常规公交（406 路这种 18 站慢车）的方案不算我们的模式，直接丢弃
function isMetroPlan(legs) {
  if (!legs) return false
  if (legs.some((l) => l.mode === 'bus')) return false
  return legs.some((l) => l.mode === 'subway')
}

function metroSignature(legs) {
  return legs
    .filter((l) => l.mode === 'subway')
    .map((l) => `${l.line}|${l.from}|${l.to}`)
    .join('>')
}

// 站点所属线路（用于接驳段文案；枢纽站按主属区）
function lineOfStop(stopId) {
  const s = stopById(stopId)
  if (!s) return DEFAULT_AREA.line
  const a = AREAS.find((x) => x.id === s.areaId)
  return a?.line || DEFAULT_AREA.line
}

// 组装一个完整方案：接驳段 + 高德干线段
function composePlan({ fromLeg, destLeg, transferPlan, destLL }) {
  const legs = toLegs(transferPlan)
  if (!legs) return null
  const body = legs.filter((l) => l.mode !== 'walk' || l.m > 60) // 丢掉 <60 m 的零碎步行段

  const all = []
  const boardLL = fromLeg ? toLngLat(stopById(fromLeg.boardId)) : null
  const alightLL = destLeg ? toLngLat(stopById(destLeg.boardId)) : null

  // 起点侧：先步行到上车点，再坐接驳公交到地铁站（步行时间已计入 fromLeg.min，需拆开避免重复计时）
  // 接驳段过短时（walkInstead）整段按步行处理，不再让乘客为 300 m 等一趟车
  if (fromLeg && fromLeg.walkInstead) {
    all.push({
      mode: 'walk',
      text: `步行 ${Math.round(fromLeg.km * 1000)} 米到「${fromLeg.hubName}」地铁站`,
      min: fromLeg.min,
      m: Math.round(fromLeg.km * 1000),
      km: fromLeg.km,
      path: fromLeg.path,
    })
  } else if (fromLeg && fromLeg.min > 0) {
    const wMin = fromLeg.walkM > 30 ? fromLeg.walkMin || 0 : 0
    if (wMin > 0) {
      all.push({
        mode: 'walk',
        text: `步行 ${fromLeg.walkM} 米到「${fromLeg.boardName}」上车点`,
        min: wMin,
        m: fromLeg.walkM,
        km: round1(fromLeg.walkM / 1000),
        path: fromLeg.fromLL && boardLL ? [fromLeg.fromLL, boardLL] : [],
      })
    }
    all.push({
      mode: 'shuttle',
      line: `响应型接驳 ${lineOfStop(fromLeg?.boardId)}`,
      text: `${fromLeg.boardName} 上车 → ${fromLeg.hubName} 下车`,
      from: fromLeg.boardName,
      to: fromLeg.hubName,
      min: Math.max(1, fromLeg.min - wMin),
      km: fromLeg.km,
      note: `含候车约 ${fromLeg.waitMin} 分钟 · 行驶 ${fromLeg.rideMin} 分钟`,
      path: fromLeg.path,
    })
  }
  // 高德段（每段自带真实折线）
  for (const l of body) all.push(l)
  // 终点侧：接驳公交到最近站点，再步行到目的地
  // 终点侧接驳段过短（walkInstead）时整段不补：高德从下车站到目的地那一段步行已经算过，
  // 再补一条「步行 300 米」会跟前一段重复，用户会看到两次「步行到达目的地」。
  if (destLeg && !destLeg.walkInstead && destLeg.min > 0) {
    const wMin = destLeg.walkM > 30 ? destLeg.walkMin || 0 : 0
    all.push({
      mode: 'shuttle',
      line: `响应型接驳 ${lineOfStop(destLeg?.boardId)}`,
      text: `${destLeg.hubName} 上车 → ${destLeg.boardName} 下车`,
      from: destLeg.hubName,
      to: destLeg.boardName,
      min: Math.max(1, destLeg.min - wMin),
      km: destLeg.km,
      note: `含候车约 ${destLeg.waitMin} 分钟 · 行驶 ${destLeg.rideMin} 分钟`,
      path: destLeg.path,
    })
    if (wMin > 0) {
      all.push({
        mode: 'walk',
        text: `步行 ${destLeg.walkM} 米到达目的地`,
        min: wMin,
        m: destLeg.walkM,
        km: round1(destLeg.walkM / 1000),
        path: alightLL && destLeg.fromLL ? [alightLL, destLeg.fromLL] : [],
      })
    }
  }

  const totalMin = all.reduce((s, l) => s + (l.min || 0), 0)
  const walkM = all.filter((l) => l.mode === 'walk').reduce((s, l) => s + (l.m || 0), 0)
  const subwayCnt = all.filter((l) => l.mode === 'subway' || l.mode === 'bus').length
  const transfers = Math.max(0, subwayCnt - 1)
  const metroFare = transferPlan.cost || 0
  // 只有真正坐车的接驳段才计费（walkInstead 的那段按步行算，不产生车费）
  const shuttleKm =
    (fromLeg && !fromLeg.walkInstead ? fromLeg.km : 0) + (destLeg && !destLeg.walkInstead ? destLeg.km : 0)
  const price = Math.round((metroFare + (shuttleKm > 0 ? fare(shuttleKm) : 0)) * 100) / 100

  // 分段折线：每一段（步行 / 接驳 / 地铁 / 公交）各自一条，地图上按交通方式分别上色。
  // 高德每个 segment 的 transit.path 就是真实走向，直接沿用。
  const segments = []
  for (const l of all) {
    if (!Array.isArray(l.path) || l.path.length < 2) continue
    segments.push({
      mode: l.mode,
      line: l.line || '',
      text: l.text || '',
      min: l.min || 0,
      m: l.m || 0,
      km: l.km || 0,
      path: l.path,
    })
  }
  if (!segments.length) {
    // 兜底：高德没给分段折线时用整条方案路径
    const flat = []
    for (const p of transferPlan.path || []) {
      const ll = toLL(p)
      if (ll) flat.push(ll)
    }
    if (flat.length > 1) segments.push({ mode: 'subway', line: '', text: '', min: 0, path: flat })
  }

  // 整条折线（未选中状态下的概览）
  const path = []
  for (const sg of segments) {
    for (const p of sg.path) {
      const last = path[path.length - 1]
      if (!last || Math.abs(last[0] - p[0]) > 1e-7 || Math.abs(last[1] - p[1]) > 1e-7) path.push(p)
    }
  }
  if (!path.length) path.push(destLL)

  const firstMetro = all.find((l) => l.mode === 'subway')
  const lineName = firstMetro ? firstMetro.line.split('(')[0] : ''
  const title = firstMetro
    ? [fromLeg?.hubName ? `经${fromLeg.hubName}` : '', `乘 ${lineName}`, destLeg?.hubName ? `至${destLeg.hubName}` : '']
        .filter(Boolean)
        .join(' ')
    : '公共交通'
  return {
    id: 'p-' + (fromLeg?.hubId || 'x') + '-' + (destLeg?.hubId || 'x') + '-' + metroSignature(body).slice(0, 20),
    kind: 'cross',
    title,
    tag: transfers === 0 ? '跨区域 · 直达干线' : `跨区域 · ${transfers} 次换乘`,
    totalMin,
    walkM,
    fare: price,
    transfers,
    legs: all,
    segments,
    path,
  }
}

// ---- 对外主函数 ----

async function planOne({ origin, dest }) {
  const oLL = [origin.lng, origin.lat]
  const dLL = [dest.lng, dest.lat]

  if (havKm(oLL, dLL) > MAX_CITY_KM) {
    return {
      ok: false,
      mode: 'unsupported',
      notice: '暂不支持跨城规划。本服务面向「干线 + 响应型接驳公交」的同城公共交通，跨城出行请使用铁路或长途客运。',
      plans: [],
    }
  }

  const oArea = areaAt(oLL[0], oLL[1])
  const dArea = areaAt(dLL[0], dLL[1])

  // ① 起终点都不在接驳区：这套「干线 + 响应型接驳公交」的模式用不上，不做大众化地图规划
  if (!oArea && !dArea) {
    return {
      ok: false,
      mode: 'out-of-scope',
      notice: '起终点都不在接驳运营区内。本服务只规划与接驳区相关的出行：一端在区内，才需要「接驳公交 + 地铁干线」的组合。',
      plans: [],
    }
  }

  // ② 同一接驳区内：直达，不做换乘规划
  if (oArea && dArea && oArea.id === dArea.id) {
    return {
      ok: true,
      mode: 'intra',
      notice: `起终点都在${oArea.name}内，直接乘坐 ${oArea.line} 线接驳公交即可直达，无需换乘。`,
      plans: [directShuttle(oLL, dLL, origin.stopId, dest.stopId, oArea)],
    }
  }

  // ③ 跨区域（含跨线路、一端在区内）：起点侧接驳 → 地铁干线 → 终点侧接驳
  const plans = []
  const seen = new Set()

  // 起点侧候选枢纽：区域内按接驳时间排序
  //   ① 起点本身就是枢纽（min=0）：不需要再接驳，直接进地铁
  //   ② 其余只留「接驳里程 ≤ SHUTTLE_MAX_KM」的站：接驳车不是长途工具
  const usable = (c) => c && (c.min === 0 || (c.km || 0) <= SHUTTLE_MAX_KM)
  let fromCands = []
  if (oArea) {
    const hubIds = hubsOf(oArea)
    const sorted = hubIds.map((id) => shuttleToHub(oLL, id, origin.stopId, 'toHub', oArea.line)).sort((a, b) => a.min - b.min)
    // 起点本身就在地铁站上时，没必要先坐接驳公交去别的站换乘
    fromCands = sorted[0] && sorted[0].min === 0 ? [sorted[0]] : sorted.filter(usable).slice(0, 2)
    if (!fromCands.length) fromCands = sorted.slice(0, 1) // 都太远时至少留最近的一个
    if (!fromCands.length) fromCands = [null]
  } else {
    // 起点在区域外：接驳段不适用，交给高德；接驳段为空
    fromCands = [null]
  }

  // 终点侧：若终点在区域内，则先坐地铁到区域内某个地铁站，再坐接驳公交到终点
  let destCands = [null]
  if (dArea) {
    const hubIds = hubsOf(dArea)
    const sorted = hubIds
      .map((id) => shuttleToHub(dLL, id, dest.stopId, 'fromHub', dArea.line))
      .sort((a, b) => a.min - b.min)
    destCands = sorted[0] && sorted[0].min === 0 ? [sorted[0]] : sorted.filter(usable).slice(0, 2)
    if (!destCands.length) destCands = sorted.slice(0, 1)
    if (!destCands.length) destCands = [null]
  }

  const tasks = []
  for (const f of fromCands) {
    const boardLL = f ? toLngLat(stopById(f.hubId)) : oLL
    const targets = destCands
    for (const t of targets) {
      const alightLL = t ? toLngLat(stopById(t.hubId)) : dLL
      tasks.push({ f, t, boardLL, alightLL })
    }
  }

  const results = await Promise.all(
    tasks.map(async ({ f, t, boardLL, alightLL }) => {
      const out = []
      const sigs = new Set()
      // 同一接驳点下，只保留换乘结构不同的方案（最多 3 个）
      const collect = (tPlans) => {
        if (!tPlans) return
        for (const tp of tPlans) {
          const legs = toLegs(tp)
          if (!isMetroPlan(legs)) continue
          const sig = metroSignature(legs)
          if (sigs.has(sig)) continue
          if (sigs.size >= 3) return
          sigs.add(sig)
          const p = composePlan({ fromLeg: f, destLeg: t, transferPlan: tp, destLL: dLL })
          if (p) out.push(p)
        }
      }

      collect(await callTransfer(boardLL, alightLL))
      // 只有一个地铁方案时，高德给的第二条往往是常规公交（我们不出售），
      // 此时换「最少换乘 / 最少步行」两个策略再找一次，凑出可比的备选方案
      if (out.length < 2) {
        const [a, b] = await Promise.all([
          callTransfer(boardLL, alightLL, 2), // LEAST_TRANSFER
          callTransfer(boardLL, alightLL, 3), // LEAST_WALK
        ])
        collect(a)
        collect(b)
      }
      return out
    }),
  )

  for (const arr of results) {
    for (const p of arr) {
      if (!p) continue
      const key = p.title + '|' + p.totalMin + '|' + p.legs.map((l) => l.line || l.mode).join(',')
      if (seen.has(key)) continue
      seen.add(key)
      plans.push(p)
    }
  }

  plans.sort((a, b) => a.totalMin - b.totalMin)
  const top = plans.slice(0, 3)

  if (!top.length) {
    return {
      ok: false,
      mode: 'no-route',
      notice: '没有找到以地铁为干线的公共交通方案，请调整起终点后重试。',
      plans: [],
    }
  }

  // 不再事后删段：totalMin / walkM 是在 composePlan 里按同一份 legs 累加的，
  // 事后 pop 会让卡片上的"步行 X 米"与详情页步骤对不上（首末一公里也必须保留）。

  // 结论文案按「实际选中的那条方案」写，别让用户看到「还要换 X2 接驳」却被规划成
  // 地铁直达地铁站（终点本身就是地铁站时，第二程接驳根本不存在）。
  const lineOf = (a) => (a ? `${a.line} 线（${a.name}）` : null)
  const p0 = top[0]
  const metroIdx = p0.legs.map((l, i) => (l.mode === 'subway' ? i : -1)).filter((i) => i >= 0)
  const firstMetroIdx = metroIdx.length ? metroIdx[0] : -1
  const lastMetroIdx = metroIdx.length ? metroIdx[metroIdx.length - 1] : -1
  const usedFrom = p0.legs.some((l, i) => l.mode === 'shuttle' && firstMetroIdx >= 0 && i < firstMetroIdx)
  const usedDest = p0.legs.some((l, i) => l.mode === 'shuttle' && i > lastMetroIdx)
  const feederIn = usedFrom ? `先乘 ${oArea?.line || '接驳'} 接驳公交到地铁站，` : ''
  const feederOut = usedDest ? `下车后再换 ${dArea?.line || '接驳'} 接驳公交到目的地。` : '下车后步行即达。'
  let notice
  if (oArea && dArea) {
    notice =
      `跨线路出行：起点在 ${lineOf(oArea)}，终点在 ${lineOf(dArea)}。` + `${feederIn}换乘地铁，${feederOut}`
  } else if (dArea) {
    notice = `终点在 ${lineOf(dArea)}内：先坐地铁到区内最近的地铁站，${feederOut}`
  } else if (oArea) {
    notice = `起点在 ${lineOf(oArea)}内：${feederIn}再换乘地铁前往。`
  } else {
    notice = '起终点均在接驳区外，以下为地铁干线方案。'
  }

  return {
    ok: true,
    mode: 'cross',
    notice: notice + (top.length === 1 ? '当前仅找到 1 条以地铁为干线的方案。' : ''),
    plans: top,
  }
}

// ---- 途经点（至多 1 个）----
//
// 途经点不改变这套运营模式本身，只是把一次出行拆成「起点→途经点」「途经点→终点」两段规划，
// 再把两段拼回一个方案：
//   · 两段都是同区直达时，两段接驳合成「一趟车经途经点」，候车只算一次
//   · 其余情况按段拼接，相邻的步行段合并，地铁换乘次数与总里程各自累加
function mergeViaPlans(p1, p2, via) {
  const SHUTTLE_WAIT_MIN_ONE = 3
  const out = []
  for (const l of [...p1.legs, ...p2.legs]) {
    const prev = out[out.length - 1]
    // 只有「上一段在这里下车、下一段在这里上车」且不是原地绕回时，才算同一趟车经停
    const sameRide =
      prev &&
      prev.mode === 'shuttle' &&
      l.mode === 'shuttle' &&
      (prev.line || '') === (l.line || '') &&
      prev.to === l.from &&
      prev.from !== l.to
    if (sameRide) {
      prev.text = `${prev.from} 上车 → 经${via.name} → ${l.to} 下车`
      prev.to = l.to
      prev.min += Math.max(1, (l.min || 0) - SHUTTLE_WAIT_MIN_ONE) // 同一趟车，候车不重复计
      prev.km = round1((prev.km || 0) + (l.km || 0))
      prev.note = `含候车约 ${SHUTTLE_WAIT_MIN_ONE} 分钟 · 途经 ${via.name} · 全程真实道路 ${prev.km} km`
      prev.path = [...(prev.path || []), ...(l.path || [])]
      continue
    }
    if (prev && prev.mode === 'walk' && l.mode === 'walk') {
      prev.m += l.m || 0
      prev.min += l.min || 0
      prev.km = round1(prev.m / 1000)
      prev.text = `步行 ${prev.m} 米`
      prev.path = [...(prev.path || []), ...(l.path || [])]
      continue
    }
    out.push({ ...l })
  }

  const shuttleKm = out.filter((l) => l.mode === 'shuttle').reduce((s, l) => s + (l.km || 0), 0)
  const totalMin = out.reduce((s, l) => s + (l.min || 0), 0)
  const walkM = out.filter((l) => l.mode === 'walk').reduce((s, l) => s + (l.m || 0), 0)
  const subwayCnt = out.filter((l) => l.mode === 'subway' || l.mode === 'bus').length
  const transfers = Math.max(0, subwayCnt - 1)
  const sameLine = p1.kind === 'direct' && p2.kind === 'direct'
  const price = Math.round((sameLine ? fare(shuttleKm) : (p1.fare || 0) + (p2.fare || 0)) * 100) / 100

  const segments = []
  const path = []
  for (const l of out) {
    if (Array.isArray(l.path) && l.path.length >= 2) {
      segments.push({ mode: l.mode, line: l.line || '', text: l.text || '', min: l.min || 0, m: l.m || 0, km: l.km || 0, path: l.path })
      for (const pt of l.path) {
        const last = path[path.length - 1]
        if (!last || Math.abs(last[0] - pt[0]) > 1e-7 || Math.abs(last[1] - pt[1]) > 1e-7) path.push(pt)
      }
    }
  }
  if (!path.length) path.push([via.lng, via.lat])

  return {
    id: 'p-via-' + (p1.id || '') + '-' + (p2.id || ''),
    kind: 'via',
    title: p1.title === p2.title ? p1.title : `${p1.title} · 经${via.name}`,
    tag: `经途经点 · ${transfers} 次换乘`,
    totalMin,
    walkM,
    fare: price,
    transfers,
    legs: out,
    segments,
    path,
  }
}

export async function planTrip({ origin, dest, via }) {
  if (!via || !Number.isFinite(via.lng)) return planOne({ origin, dest })

  const oLL = [origin.lng, origin.lat]
  const vLL = [via.lng, via.lat]
  const dLL = [dest.lng, dest.lat]
  if (havKm(oLL, vLL) + havKm(vLL, dLL) > MAX_CITY_KM) {
    return {
      ok: false,
      mode: 'unsupported',
      notice: '暂不支持跨城规划。本服务面向「干线 + 响应型接驳公交」的同城公共交通。',
      plans: [],
    }
  }

  const [r1, r2] = await Promise.all([
    planOne({ origin, dest: via }),
    planOne({ origin: via, dest }),
  ])
  const bad = !r1.ok ? { r: r1, seg: `起点 → ${via.name}` } : !r2.ok ? { r: r2, seg: `${via.name} → 终点` } : null
  if (bad) {
    return { ok: false, mode: bad.r.mode, notice: `加了途经点「${via.name}」后无法规划：${bad.seg}这一段 ${bad.r.notice}`, plans: [] }
  }

  const plan = mergeViaPlans(r1.plans[0], r2.plans[0], via)
  const intra = r1.mode === 'intra' && r2.mode === 'intra'
  return {
    ok: true,
    mode: intra ? 'intra' : 'cross',
    notice:
      `途经点：${via.name}。` +
      (intra
        ? `起终点同区，同一趟响应型接驳公交经停途经点即可，无需换乘。`
        : `起点 → ${via.name}：${r1.notice} 途经点 → 终点：${r2.notice}`),
    plans: [plan],
  }
}

// ---- 地点搜索 / 逆地理编码（规划页输入与地图选点用）----

export async function searchPlaces(keyword, city = '大连') {
  if (!keyword || keyword.trim().length < 1) return []
  const AMap = await ensurePlugin(['AMap.PlaceSearch'])
  return new Promise((resolve) => {
    try {
      const ps = new AMap.PlaceSearch({ city, citylimit: true, pageSize: 8, extensions: 'base' })
      ps.search(keyword.trim(), (status, result) => {
        if (status === 'complete' && result?.poiList?.pois) {
          resolve(
            result.poiList.pois.map((p) => ({
              name: p.name,
              lng: +(+p.location.lng).toFixed(6),
              lat: +(+p.location.lat).toFixed(6),
              addr: p.address || '',
              district: p.adname || '',
            })),
          )
        } else resolve([])
      })
    } catch {
      resolve([])
    }
    setTimeout(() => resolve([]), 8000)
  })
}

export async function reverseGeocode(lng, lat) {
  const AMap = await ensurePlugin(['AMap.Geocoder'])
  return new Promise((resolve) => {
    try {
      const gc = new AMap.Geocoder({ city: '大连' })
      gc.getAddress([lng, lat], (status, result) => {
        if (status === 'complete' && result?.regeocode) {
          const rc = result.regeocode
          resolve(rc.formattedAddress || rc.addressComponent?.street || '地图选点')
        } else resolve('地图选点')
      })
    } catch {
      resolve('地图选点')
    }
    setTimeout(() => resolve('地图选点'), 8000)
  })
}

export async function locateMe() {
  // ① 浏览器原生 GPS/Wi-Fi 定位（最准，WGS-84 → GCJ-02）
  const gps = await new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      )
    } catch {
      finish(null)
    }
    setTimeout(() => finish(null), 9000)
  })
  if (gps && Number.isFinite(gps.lng)) {
    const [glng, glat] = wgs84ToGcj02(gps.lng, gps.lat)
    return { lng: +glng.toFixed(6), lat: +glat.toFixed(6), name: '我的位置', source: 'gps' }
  }

  // ② 高德 IP 定位兜底
  const AMap = await ensurePlugin(['AMap.Geolocation'])
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 6000 })
      geo.getCurrentPosition((status, result) => {
        if (status === 'complete' && result?.position) {
          const lng = +(+result.position.lng).toFixed(6)
          const lat = +(+result.position.lat).toFixed(6)
          finish({ lng, lat, name: result.formattedAddress || '我的位置', source: 'ip' })
        } else finish(null)
      })
    } catch {
      finish(null)
    }
    setTimeout(() => finish(null), 7000)
  })
}

async function ensurePlugin(names) {
  const AMap = await loadAMap()
  return new Promise((res) => AMap.plugin(names, () => res(AMap)))
}
