// 云乘见 · 静态数据配置（大连运营区）
//
// 数据来源：web/src/data/dalian.js —— 由高德地图离线采集的真实地理数据。
//   · X1 软件园接驳区：博远路 / 广贤路 / 学子街 / 七贤东路 / 凌滨路 / 仁水街 / 善水街 /
//     黄浦路 / 中山路 / 连山街 / 西南路 / 五一路 / 软件园东路 / 软件园路 围成的主环，
//     外加三段延伸（黑石礁街南延、西南路—南沙街—五一路三角、西北数码路—屹馨街走廊）
//   · X2 凌水—小平岛接驳区：海事大学 → 小平岛 → 鹤大线 → 聚贤路 → 兴贤街 → 学子街 的闭环
//   · 站点：范围内全部现有公交站 + 全部地铁站（重点标注），全部为可乘降点；
//     校区内部站点与范围外站点均已剔除
//
// 第十三轮：边界改为「并集栅格化」——主干环与支路走廊先合成一个面再提取外轮廓，
// 同一条线路只有一条连续边界（不再出现主干与支路并列成两个环的重影），
// 并按用户给定道路顺序重取了 X1 ③ 段与 X2 北段。
//
// 第十四轮：X2 的小平岛段按用户手绘红线重画（亲海街—品海街—邻海街—依海街—品海南街—瞰海街—
// 环海路，面积 4.2 → 4.5 km²）；X1 在中山路连山街路口向东伸出一小段，把「大医二院」地铁站纳入范围。
//
// 第十五轮：X2 再按红线改两处 —— ① 南部边界不再沿黄浦路斜切，改走七贤路—七贤西路—七贤南路—
// 瑞丰园—瞰海街（河口软件园、七贤岭一带纳入，面积 4.5 → 5.3 km²）；② 小平岛西南角不再直接走
// 依海街，改为 依海街 → 亲海街（南下）→ 小平岛路（东北上）→ 品海南街。
//
// 第二十二轮：X2 新增「七贤东路—凌滨路—仁水街—善水街」地块（万达广场 / 和光大厦一带，0.70 km²），
// 边界直接取 X1 环上的对应点位，两区在这块完全重合；停靠线路改按「站点是否落在该区多边形内」判定，
// 于是这块里的站台自动变成 X1/X2 共站。
//
// 第十六轮：X2 南边界全部改成沿路面走 —— 黄浦路七贤东路路口 → 七贤东路 → 七贤路 → 七贤中路 →
// 七贤南路 → 七贤西路 → 七贤路 → 揽涛街（面积 5.3 → 5.5 km²，不再有离开道路的直线段）。
//
// 坐标系：业务算法使用 0–320 的抽象坐标（1 单位 = 25 米），由 data/geo.js 投影到真实经纬度。
// 一个运营区可以由多个环组成（多环多边形），单个点在任一环内即视为区内。
import { RINGS_LNGLAT, RINGS_XY, STOPS_RAW } from './dalian.js'
import { PLATFORM_EXTRA, STOP_META } from './platforms.js'

export const UNITS_PER_KM = 40

// ---- 运营区域 ----
export const AREAS = [
  {
    id: 'a1',
    line: 'X1',
    name: '软件园接驳区',
    hours: '06:30 – 22:30',
    desc: '自博远路软件园路路口起，沿博远路、广贤路向南，学子街、七贤东路向东南至凌滨路，沿凌滨路向东北，经仁水街、善水街转至黄浦路，过学苑广场接中山路向东北，过中山路与连山街路口后向东至大医二院地铁站东侧掉头，再由连山街、西南路北上，沿五一路、软件园东路回到软件园路。',
    extra:
      '延伸段：① 中山路黑石礁街路口沿黑石礁街向南至大连海洋大学；② 西南路五一路路口沿西南路向北至南沙街，沿南沙街向东至五一路，再沿五一路向西南回到西南路；③ 数码路软件园路路口沿数码路向北至燕知街，沿燕知街向西、经燕南街转红凌路向北至红凌路博广路路口，沿博广路向西南（含博翔街段）至博广路静恬街路口，沿静恬街、清恬街向东南至屹馨街，沿屹馨街向西南到 IT家园，南下至凌水路，经金百合三期沿凌水路向东回到博远路。',
    rings: RINGS_XY.a1,
    ringsLngLat: RINGS_LNGLAT.a1,
  },
  {
    id: 'a2',
    line: 'X2',
    name: '凌水—小平岛接驳区',
    hours: '06:00 – 21:00',
    desc: '自海事大学起，沿黄浦路（旅顺南路）向西南至黄浦路七贤东路路口，沿七贤东路向东南至七贤东路七贤路路口，沿七贤路向西南至七贤路七贤中路路口，沿七贤中路向东南至七贤中路七贤南路路口，先后沿七贤南路、七贤西路至七贤西路七贤路路口，再沿七贤路向西南经瑞丰园至揽涛街路口；转瞰海街、环海路到小平岛圣汐湾；再沿品海南街向西北，经小平岛广场、海洋大厦转小平岛路向西南到亲海街路口，沿亲海街北上至依海街，沿依海街向西经邻海街、品海街、亲海园转亲海街至品涛街环岛，经小平岛路回到黄浦路，沿鹤大线（黄浦路）至聚贤路辅路，沿聚贤路经海创半山花园公交站至聚贤中街，再沿聚贤中街、火炬路到火炬路兴贤街路口，后依次沿兴贤街、高能街、亿阳路、科海街、广贤路、学子街向东北，到学子街黄浦路路口回到黄浦路，形成闭环。',
    extra: '线路长度约 16 km，覆盖七贤岭、小平岛、庙岭三个片区，与 X1 在海事大学、学子街—黄浦路一带衔接；枫峪街、桃峪园方向为三条尽端支路，一并纳入运营范围。北部边界在黄浦路七贤东路—海事大学站一段沿黄浦路两侧各取 30 m 形成走廊，把「海事大学」公交站与「海事大学」地铁站纳入环内；南部与东南边界全部沿实际道路：黄浦路—七贤东路—七贤路—七贤中路—七贤南路—七贤西路—七贤路—揽涛街，没有离开路面的直线段；河口软件园、瑞丰园、七贤岭大市场一带都在范围内。新增地块：七贤东路向东南、沿凌滨路向北、沿仁水街向西北、沿善水街向西围合的一块约 0.70 km²（万达广场、和光大厦、恒大御景湾、亿海贤府一带），边界直接取 X1 的环线点位，两区在这一块完全重合；X2 车场（和光大厦）就在其中。环内合计约 6.26 km²。',
    rings: RINGS_XY.a2,
    ringsLngLat: RINGS_LNGLAT.a2,
  },
]

// 点是否在运营区内（任一环命中，或距任一边界 ≤ tol 个抽象单位）
export function areaContains(area, p, tol = 0) {
  if (!area) return false
  for (const ring of area.rings) {
    if (pointInRing(p, ring)) return true
    if (tol > 0 && distToRing(p, ring) <= tol) return true
  }
  return false
}

export function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function distToRing(p, ring) {
  let d = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    d = Math.min(d, distToSegment2(p, ring[j], ring[i]))
  }
  return d
}

function distToSegment2(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy
  let t = L2 ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy))
}

// 按坐标找所属运营区（供界外终点推荐、分区校验使用）
export function areaOfPoint(p, tol = 2) {
  const hit = AREAS.find((a) => areaContains(a, p, tol))
  if (hit) return hit
  // 公交站 POI 常落在边界道路的路侧（几十米到一百多米），以站点自身归属为准
  let best = null
  let bd = Infinity
  for (const s of STOPS) {
    const d = Math.hypot(s.x - p.x, s.y - p.y)
    if (d < bd) { bd = d; best = s }
  }
  if (best && bd <= 8) return AREAS.find((a) => a.id === best.areaId) || null
  return null
}

// ---- 边界站点（两线共站）----
// 跨区行程的换乘点：站点同时贴近 X1 与 X2 的边界，说明两条线路都会停靠这一站。
// 判定用「到两条边界的距离都 ≤ 220 m」，与站点的 area 归属无关
// （边界道路两侧的站点各自归属一条线，但两条线的车都会经过）。
const INTERCHANGE_TOL_M = 220

// 站台（路侧拆分的对侧站 + 地铁出入口）由 tools/gen-platforms-r20.mjs 生成
const RAW_ALL = [...STOPS_RAW, ...PLATFORM_EXTRA]

function ringDistM(lng, lat, ring) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110540
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0]
    const ay = ring[j][1]
    const dx = (ring[i][0] - ax) * kx
    const dy = (ring[i][1] - ay) * ky
    const L = dx * dx + dy * dy
    let t = L ? (((lng - ax) * kx) * dx + ((lat - ay) * ky) * dy) / L : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot((lng - ax) * kx - t * dx, (lat - ay) * ky - t * dy)
    if (d < best) best = d
  }
  return best
}

export const INTERCHANGE_IDS = new Set(
  RAW_ALL.filter((s) => {
    const d1 = Math.min(...RINGS_LNGLAT.a1.map((r) => ringDistM(s.lng, s.lat, r)))
    const d2 = Math.min(...RINGS_LNGLAT.a2.map((r) => ringDistM(s.lng, s.lat, r)))
    return d1 <= INTERCHANGE_TOL_M && d2 <= INTERCHANGE_TOL_M
  }).map((s) => s.id),
)

// ---- 乘降点 ----
// 全部站点均为可乘降点（与地图里的普通公交站一致），不再区分"仅下车"
// metro 字段为地铁站的下一班车信息（仅地铁站有）
const METRO_ETA = [
  { dir: '往河口方向', left: 2, min: 4 },
  { dir: '往姚家方向', left: 3, min: 7 },
]

// 站台侧向的中文说法（给用户看的后缀）
const SIDE_TXT = { N: '路北', S: '路南', E: '路东', W: '路西' }

// 某一侧站台服务哪个车行方向：
//   靠右行驶时，车行方向的**右手侧**就是能停靠的一侧（中国右侧通行）
//   屏坐标 x 东 / y 南：右手侧 = (-dy, dx)
//   路北 → 只服务西行；路南 → 只服务东行；路东 → 只服务北行；路西 → 只服务南行
export const SIDE_DIR = { N: 'W', S: 'E', E: 'N', W: 'S' }

export const STOPS = RAW_ALL.map((s) => {
  const meta = STOP_META[s.id] || {}
  const isMetroStation = !!s.metro // 运营中的地铁站「站体」（换乘枢纽，不代表某个站台）
  const areaId = s.area || 'a1'
  const both = INTERCHANGE_IDS.has(s.id)
  const side = s.side || meta.side || null
  const label = s.label || meta.label || (side ? SIDE_TXT[side] : null)
  const isExit = !!s.stationId // 地铁出入口：侧向参与规则，但不与对侧配对
  const pairId = isExit ? null : s.twin || meta.twin || s.base || null
  // 名称带上站台信息：公交站「轻工学校（路北）」，地铁出入口「黑石礁地铁站（A口）」
  // 地铁站体统一叫「XX地铁站」，不再用 POI 原名（原名有的带「地铁站」有的不带）
  const baseName = s.name.replace(/地铁站$/, '')
  const name = isMetroStation ? `${baseName}地铁站` : label ? `${s.name}（${label}）` : s.name
  // 停靠线路：只看这条接驳线是否真的经过这个站台。
  //   站点归属 a2 → 只有 X2；跨区边界共站 → 两条线都停
  //   （不能因为「是地铁站」就给两条线，蔡大岭在 12 号线上，X1 根本不到那儿）
  const lines = s.lines || (both ? ['X1', 'X2'] : areaId === 'a2' ? ['X2'] : ['X1'])
  return {
    id: s.id,
    name,
    rawName: s.name,
    x: s.x,
    y: s.y,
    type: s.type,
    areaId,
    lines,
    side,
    sideTxt: side ? SIDE_TXT[side] : null,
    serveDir: side ? SIDE_DIR[side] : null, // 该站台服务的车行方向
    // 站台配对：主站指向对侧站台，对侧站台回指主站（地铁出入口不参与配对）
    ...(isExit ? {} : pairId ? { twin: pairId } : {}),
    ...(s.base ? { base: s.base } : {}),
    ...(s.stationId ? { stationId: s.stationId, exit: s.exit } : {}),
    ...(isMetroStation ? { hub: true, station: true, metro: METRO_ETA } : {}),
    ...(both ? { interchange: true } : {}),
    ...(s.planned ? { planned: true } : {}),
    // 同名近距的重复 POI：只隐藏（不画、不进搜索），路网里仍然有效，
    // 否则「蔡大岭公交车站 / 蔡大岭轻轨站」两个标签会叠在一起
    ...(meta.hidden ? { hidden: true, mergedInto: meta.mergedInto } : {}),
    ...(areaId === 'a2' ? { area2: true } : {}),
  }
})

// 边界站点清单（跨区换乘候选，按「同时贴近两区边界」排序靠前的在前）
// 只取基准站：路两侧的两个站台是同一个换乘点，都列出来会让「换边界站点」出现双份
export const INTERCHANGES = STOPS.filter((s) => s.interchange && !s.base)

// ---- 响应式接驳公交线路 ----// 车辆不按预设顺序行驶，stops 仅用于线路说明与车辆归属
// 只列基准站：路两侧的两个站台是同一处地点，都列出来「途经可乘降点」会翻倍
// 按「停靠线路」而不是「主属区」取：X2 新增的万达广场—和光大厦地块里，
// 站点主属区仍是 a1（X1 也停），但 X2 同样要能上下客
const X1_STOPS = STOPS.filter((s) => s.lines.includes('X1') && !s.base && !s.hidden).map((s) => s.id)
const X2_STOPS = STOPS.filter((s) => s.lines.includes('X2') && !s.base && !s.hidden).map((s) => s.id)

export const LINES = [
  {
    id: 'X1',
    name: '软件园接驳 1 路',
    areaId: 'a1',
    hours: '06:30 – 22:30',
    interval: '高峰 8 分钟 / 平峰 15 分钟',
    stops: X1_STOPS,
    desc: '覆盖软件园、凌水、学苑广场、大医二院一带，接驳地铁 1 号线学苑广场站与 2 号线大医二院站。',
  },
  {
    id: 'X2',
    name: '凌水—小平岛接驳线',
    areaId: 'a2',
    hours: '06:00 – 21:00',
    interval: '高峰 10 分钟 / 平峰 20 分钟',
    stops: X2_STOPS,
    desc: '自海事大学经七贤岭、小平岛、庙岭回到黄浦路的环线，服务枫峪园、桃峪园、海创半山花园等居住区与软件园通勤。',
  },
]

// 兼容旧字段名：线路绘制/展示顺序
for (const l of LINES) l.drawOrder = l.stops

// ---- 用户可搜索的目的地（含少量区域外 POI，用于演示「终点超出服务范围」）----
const stopOf = (id) => STOPS.find((s) => s.id === id)
const poi = (id, name, stopId) => {
  const s = stopOf(stopId)
  return { id, name, x: s.x, y: s.y, inside: true, stopId }
}

export const POIS = [
  poi('p1', '学苑广场', 'm1'),
  poi('p2', '万达广场（高新店）', 'b22'),
  poi('p3', '海事大学', 'm2'),
  poi('p4', '数码广场', 'm6'),
  poi('p5', '理工大学', 'm5'),
  poi('p6', '黑石礁', 'm3'),
  poi('p10', '大连海洋大学', 'b101'),
  poi('p11', 'IT家园', 'b102'),
  poi('p12', '金百合三期', 'b103'),
  poi('p13', '小平岛中心广场', 'x205'),
  poi('p14', '枫峪园', 'x201'),
  poi('p15', '桃峪园', 'x202'),
  poi('p16', '海创半山花园', 'x204'),
  // 区域外目的地：用于演示「终点超出服务范围」的推荐逻辑
  { id: 'p7', name: '大连北站', x: 158, y: 8, inside: false },
  { id: 'p8', name: '星海广场', x: 292, y: 118, inside: false },
  { id: 'p9', name: '周水子机场', x: 34, y: 44, inside: false },
]

// ---- 车队种子：车辆初始停在真实站点点位上 ----
// riders：车上乘客（首位 = 最早下车的乘客），用于派单绕路与角度规则
function vehicle(id, plate, lineId, onboard, stopId, riders = []) {
  const s = stopOf(stopId)
  const areaId = s.areaId === 'a2' ? 'a2' : 'a1'
  return { id, plate, lineId, areaId, seats: 9, capacity: 17, onboard, x: s.x, y: s.y, riders }
}

export const FLEET_SEED = [
  vehicle('v1', '辽B·X1D92', 'X1', 6, 'm9'),
  vehicle('v2', '辽B·X1C17', 'X1', 3, 'b22', [{ fromId: 'b22', toId: 'm2' }]),
  vehicle('v3', '辽B·X1E05', 'X1', 12, 'm6'),
  vehicle('v4', '辽B·X1A33', 'X1', 4, 'm1'),
  vehicle('v5', '辽B·X1F21', 'X1', 0, 'b2'),
  // X2 线：环线较长，投 3 辆，其中 1 辆空车便于演示「空车接你」的效率服务
  vehicle('v6', '辽B·X2B08', 'X2', 0, 'x204'),
  vehicle('v7', '辽B·X2C16', 'X2', 3, 'x205', [{ fromId: 'x205', toId: 'x201' }]),
  vehicle('v8', '辽B·X2D27', 'X2', 7, 'x203'),
]

// ---- 计价规则（PRD 规则 7）----
// 一口价：起步 1 元（1 km 内），之后 0.75 元/km，按运营模式上浮。
// 不再使用「特别高峰溢价」——用户在确认窗口看到的价格就是最终价格，
// 三种模式的差别只体现在系数上：效率 1.4 倍、专属 1.9 倍。
export const PRICING = {
  baseFare: 1, // 起步价 1 元（1km 内）
  baseKm: 1,
  perKm: 0.75, // 后续每公里 0.75 元
  maxSurge: 1, // 溢价已下线，保留字段兼容旧数据
  surgePeakWindows: [],
  nightNoSurge: true,
  efficiencyFactor: 1.4, // 效率服务系数
  exclusiveFactor: 1.9, // 专属服务系数（一人一车、不拼载）
}

// ---- 运营模式 ----
// 标准模式：预设站点、顺路拼载，价格最低（1.0 倍）
// 效率服务：同样站点乘降，全程沿最优路径行驶、一程最多停 4 站（1.4 倍）
// 专属服务：一人一车，直达，可就近下车（1.9 倍）
export const SERVICE_MODES = [
  {
    id: 'standard',
    name: '标准模式',
    icon: '🚌',
    tagline: '区内直达 · 无需换乘',
    desc: '区内直达',
    tags: ['区内直达', '无需换乘', '站点就近'],
    rules: [
      '上车点与下车点均须为预设站点',
      '在你所在的运营区内点到点直达，中途不需要换线路',
      '系统把你的订单插进最顺路的车辆行程，沿途可能接送其他乘客',
      '按里程一口价结算，行程结束后统一支付',
    ],
  },
  {
    id: 'efficiency',
    name: '效率服务',
    icon: '🚐',
    tagline: '沿最优路径 · 最多停 4 站',
    desc: '最优路径拼载',
    tags: ['预设站点', '沿最优路径', '最多停 4 站'],
    rules: [
      '上车点与下车点均须为预设站点，单价为标准模式的 1.4 倍',
      '空车来接你时，车辆沿你的最优路径行驶，中途最多停 4 次上客',
      '非空车来接你时，说明你的起点、终点与最优路线都在车上乘客的最优路线上',
      '全程沿最优路线行驶，不因拼载改变你的行驶路径',
    ],
  },
  {
    id: 'exclusive',
    name: '专属服务',
    icon: '🚗',
    tagline: '一人一车 · 直达',
    desc: '一人一车',
    tags: ['一人一车', '不限站点', '可就近下车'],
    rules: [
      '只为你一个人服务，中途不接其他乘客，单价为标准模式的 1.9 倍',
      '按你起点到目的地的最优路径行驶，不为拼载改变路线',
      '可以自由上下车，不受预设站点约束',
      '按专属一口价结算，行程结束后统一支付',
    ],
  },
]

export const serviceMode = (id) => SERVICE_MODES.find((m) => m.id === id) || SERVICE_MODES[0]

// ---- 派单规则（PRD 规则 8）----
export const DISPATCH = {
  freeCancelMs: 40000, // 派单成功后 40s 内免费取消
  maxWaitMin: 20, // 预估等待超过 20min 不匹配
  detourMileageRatio: 1 / 3, // 绕路里程容忍阈值
  detourTimeRatio: 1 / 3, // 绕路时间容忍阈值
  restEveryMin: 60, // 司机每 1h 强制休息 10min（后端规则）
  restMin: 10,
}

// ---- 历史订单 / 消息（演示数据，站点均取自真实公交站）----
export const SEED_ORDERS = [
  {
    id: 'YC20261019001',
    status: 'completed',
    amount: 3.1,
    paidAmount: 3.1,
    plate: '辽B·X1D92',
    fromId: 'b22', toId: 'm1', actualAlightId: 'm1',
    km: 3.8, actualKm: 3.8,
    boardTime: '2026-10-19 08:12', alightTime: '2026-10-19 08:27',
    orderTime: '2026-10-19 08:06',
    duration: '15分钟',
    rating: { env: 5, drive: 4, eta: 5, text: '' },
    surge: 1,
  },
  {
    id: 'YC20261018022',
    status: 'cancelled',
    amount: 0,
    paidAmount: 0,
    plate: '—',
    fromId: 'b5', toId: 'm2', actualAlightId: null,
    km: 2.1, actualKm: 0,
    boardTime: '—', alightTime: '—',
    orderTime: '2026-10-18 19:41',
    duration: '已取消',
    rating: null,
    surge: 1,
  },
  {
    id: 'YC20261017008',
    status: 'completed',
    amount: 1.75,
    paidAmount: 1.75,
    plate: '辽B·X1C17',
    fromId: 'b7', toId: 'm6', actualAlightId: 'm6',
    km: 2.0, actualKm: 2.0,
    boardTime: '2026-10-17 17:48', alightTime: '2026-10-17 18:02',
    orderTime: '2026-10-17 17:43',
    duration: '14分钟',
    rating: { env: 4, drive: 5, eta: 4, text: '' },
    surge: 1,
  },
]

export const SEED_MESSAGES = [
  {
    id: 'm1',
    kind: 'lost',
    title: '失物招领 · 黑色长柄雨伞',
    body: 'X1 线 辽B·X1D92 于今日 08:00–08:40 班次收车时发现一把黑色长柄雨伞，如有遗失请点击下方按钮联系招领处工作人员。',
    time: '2026-10-22 09:10',
    line: 'X1',
    plate: '辽B·X1D92',
  },
  {
    id: 'm2',
    kind: 'lost',
    title: '失物招领 · 蓝色保温杯',
    body: 'X1 线 辽B·X1C17 于昨日 18:30–19:00 班次收车时发现一个蓝色保温杯，如有遗失请点击下方按钮联系招领处工作人员。',
    time: '2026-10-21 20:05',
    line: 'X1',
    plate: '辽B·X1C17',
  },
]

export function stopById(id) {
  return STOPS.find((s) => s.id === id) || null
}

export function lineById(id) {
  return LINES.find((l) => l.id === id) || null
}

export function areaById(id) {
  return AREAS.find((a) => a.id === id) || null
}
