// 规划页的本地偏好：家 / 公司 / 收藏夹 / 历史记录
//
// 全部落在 localStorage，不经过后端：
//   · 家、公司：各存一个地址，可在规划页直接点用，也可重新设置
//   · 收藏夹：常用地点列表（历史记录里的 ☆ 一键收藏）
//   · 历史记录：最近规划过的目的地，按时间倒序，去重，最多 20 条
// 首次进入没有历史时给几条大连的真实地点做示例，清空后不再补种。
//
// 关于站名（第二十一轮）：
//   站台名会随数据更新（「轻工学校」→「轻工学校（路北）」、「学苑广场」→「学苑广场地铁站」），
//   而 localStorage 里存的是当时的字符串，于是历史记录里会一直显示旧名。
//   解决办法：① 新记录带上 stopId；② 读取时按 stopId 取最新站名；
//            ③ 老记录只有名字，就用「名字 == 站点的裸名」把站台找回来，
//              取离记录坐标最近的那个站台（当年就是从它的坐标存下来的）。
import { STOPS, stopById } from '../data/config.js'
import { toXY } from '../data/geo.js'

const NS = 'ycx.plan.'
// 记录坐标与找回的站台相距超过这个距离（单位 = 25 m，即 250 m）就不算同一个地方
const MATCH_TOL = 10

function read(key, dflt) {
  try {
    const raw = localStorage.getItem(NS + key)
    if (raw == null) return dflt
    const v = JSON.parse(raw)
    return v ?? dflt
  } catch {
    return dflt
  }
}

function write(key, v) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(v))
  } catch {
    /* 隐私模式下写不进去，忽略即可 */
  }
}

export const placeId = (p) =>
  `${String(p.name || '').slice(0, 12)}|${(+p.lng).toFixed(5)}|${(+p.lat).toFixed(5)}`

// 记录的唯一键：优先用站点 id（站名改了也还是同一条记录），否则用「名字 + 坐标」
export const keyOf = (p) => (p?.stopId ? `stop:${p.stopId}` : placeId(p))

const norm = (p) => ({
  id: keyOf(p),
  name: String(p.name || '').slice(0, 24),
  sub: p.sub || p.addr || '',
  lng: +p.lng,
  lat: +p.lat,
  ...(p.stopId ? { stopId: p.stopId } : {}),
  t: Date.now(),
})

// ---- 站名保鲜 ----
// 名字索引：裸名（去掉路侧后缀前的原 POI 名）与当前全名都能找到站台
const NAME_INDEX = new Map()
for (const s of STOPS) {
  for (const key of [s.name, s.rawName]) {
    if (!key) continue
    if (!NAME_INDEX.has(key)) NAME_INDEX.set(key, [])
    NAME_INDEX.get(key).push(s)
  }
}

// 记录的坐标（lng/lat）→ 抽象坐标，用来和站台比远近
const xyOf = (lng, lat) => toXY(lng, lat)

/**
 * 把一条本地记录升级成「当前站名」。
 *  - 有 stopId：直接用站点最新名字（站名改了也能跟上）
 *  - 没有 stopId：拿名字去站台表里找，取离记录坐标最近的那个（250 m 内）
 *  - 都对不上：原样返回（普通 POI 不该被改名）
 */
function freshen(p) {
  if (!p || !Number.isFinite(+p.lng)) return p
  const direct = p.stopId ? stopById(p.stopId) : null
  if (direct) return { ...p, id: keyOf({ ...p, stopId: direct.id }), stopId: direct.id, name: direct.name }

  const cands = (NAME_INDEX.get(String(p.name || '')) || []).filter((s) => !s.hidden)
  if (!cands.length) return { ...p, id: keyOf(p) }
  const cur = xyOf(+p.lng, +p.lat)
  let best = null
  let bd = Infinity
  for (const s of cands) {
    const d = Math.hypot(s.x - cur.x, s.y - cur.y)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  if (!best || bd > MATCH_TOL) return { ...p, id: keyOf(p) }
  return { ...p, id: keyOf({ ...p, stopId: best.id }), stopId: best.id, name: best.name }
}

// ---- 家 / 公司 ----

export function getPinned(which) {
  const v = read(which, null)
  if (!v || !Number.isFinite(v.lng)) return null
  return freshen(v)
}

export function setPinned(which, place) {
  const p = norm(place)
  const up = freshen(p)
  write(which, up)
  return up
}

export function clearPinned(which) {
  write(which, null)
}

// ---- 收藏夹 ----

export function getFavs() {
  const v = read('favs', [])
  if (!Array.isArray(v)) return []
  // 读取时统一「保鲜」：老记录里存的是旧站名，这里换成当前站名并重建 id
  const out = []
  for (const p of v) {
    if (!p || !Number.isFinite(+p.lng)) continue
    const up = freshen(p)
    if (out.some((x) => x.id === up.id)) continue
    out.push(up)
  }
  return out
}

export function isFav(p) {
  const id = keyOf(freshen(norm(p)))
  return getFavs().some((f) => f.id === id)
}

// 返回收藏后的状态：true = 已收藏
export function toggleFav(p) {
  const item = freshen(norm(p))
  const id = item.id
  const list = getFavs()
  const i = list.findIndex((f) => f.id === id)
  if (i >= 0) {
    list.splice(i, 1)
    write('favs', list)
    return false
  }
  list.unshift(item)
  write('favs', list.slice(0, 30))
  return true
}

export function removeFav(id) {
  write('favs', getFavs().filter((f) => f.id !== id))
}

// ---- 历史记录 ----

const SEED = [
  { name: '学苑广场', sub: '甘井子区 · 地铁站', lng: 121.545596, lat: 38.874769 },
  { name: '小平岛中心广场', sub: '甘井子区 · 接驳区', lng: 121.502977, lat: 38.832004 },
  { name: '大连海事大学', sub: '甘井子区 · 凌海路 1 号', lng: 121.529636, lat: 38.869401 },
  { name: '星海广场', sub: '沙河口区 · 地标', lng: 121.58859, lat: 38.87874 },
  { name: '高新万达广场', sub: '甘井子区 · 商圈', lng: 121.532238, lat: 38.862887 },
  { name: '大连站', sub: '中山区 · 火车站', lng: 121.6184, lat: 38.92042 },
]

export function getHistory() {
  const seeded = read('seeded', false)
  if (!seeded) {
    const now = Date.now()
    const list = SEED.map((p, i) => ({ ...freshen(norm(p)), t: now - i * 3600_000 }))
    write('history', list)
    write('seeded', true)
    return list
  }
  const v = read('history', [])
  if (!Array.isArray(v)) return []
  const out = []
  for (const p of v) {
    if (!p || !Number.isFinite(+p.lng)) continue
    const up = freshen(p)
    if (out.some((x) => x.id === up.id)) continue
    out.push(up)
  }
  return out
}

export function addHistory(place) {
  if (!place || !Number.isFinite(place.lng)) return getHistory()
  const p = freshen(norm(place))
  const list = getHistory().filter((h) => h.id !== p.id)
  list.unshift(p)
  const next = list.slice(0, 20)
  write('history', next)
  return next
}

export function removeHistory(id) {
  const next = getHistory().filter((h) => h.id !== id)
  write('history', next)
  return next
}

export function clearHistory() {
  write('history', [])
  write('seeded', true)
  return []
}
