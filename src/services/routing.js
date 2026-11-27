// 几何与路由计算：距离 / ETA / 多边形 / 角度 / 沿真实道路的路径与里程
//
// 路网来源（data/dalian-roads.js）：高德驾车路径规划离线预计算的 368+ 条真实折线。
//
// 第二十二轮：路由从「站点图」改成「道路网」。
//   原来的做法是「站点 = 节点，站点之间连边」，任意两点先吸附到最近站点再走 Dijkstra。
//   问题在于站点之间的边是稀疏的（每个站只连最近几个站），断一条边就要绕一大圈：
//   「万达广场 → 敬贤街」直线 0.73 km，却给出 6.22 km；「轻工学校 → 黑石礁」直线 1.4 km
//   给出 4.4 km，画在图上就是绕到东北财经大学再拐回来。
//   现在把全部折线按 25 m 合并成一张真正的路网（≈850 个节点、2400 段），
//   站点只负责吸附到最近的路上，路径与里程都是沿路面走的。
import { STOPS, UNITS_PER_KM } from '../data/config.js'
import { ROAD_EDGES } from '../data/dalian-roads.js'

const AVG_SPEED_KM_PER_MIN = 0.5 // 平均运营速度约 30km/h
const SNAP_TOL = 12 // 车辆贴近站点 300m 内视为到站
const NET_MERGE = 1.0 // 折线合并容差（抽象单位，25 m）

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function km(a, b) {
  return dist(a, b) / UNITS_PER_KM
}

export function etaMin(kmVal) {
  return kmVal / AVG_SPEED_KM_PER_MIN
}

export function parsePolygon(str) {
  return str.split(' ').map((p) => p.split(',').map(Number))
}

export function pointInPolygon(p, polyStr) {
  const poly = typeof polyStr === 'string' ? parsePolygon(polyStr) : polyStr
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function nearestStop(p, pool = STOPS) {
  let best = null
  let bestD = Infinity
  for (const s of pool) {
    if (s.hidden) continue
    const d = dist(p, s)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return { stop: best, distance: bestD }
}

// b 点处，ba 与 bc 的夹角（度）
export function angleDeg(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)
  if (!m) return 0
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / m))
  return (Math.acos(cos) * 180) / Math.PI
}

// 两个方向向量 (b-a) 与 (d-c) 的夹角（度，0~180）
export function vectorAngleDeg(a, b, c, d) {
  const u = { x: b.x - a.x, y: b.y - a.y }
  const w = { x: d.x - c.x, y: d.y - c.y }
  const m = Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)
  if (!m) return 0
  const cos = Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / m))
  return (Math.acos(cos) * 180) / Math.PI
}

// 点 p 到线段 ab 的距离
export function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (!len2) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

// 线段 ab 上离 p 最近的点
function closestOnSeg(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (!len2) return { x: a.x, y: a.y }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// 任意点 → 最近的道路折线上的点。
// 「车只能在路上」：车辆出场位置、巡游途中都不允许落在小区、海面、山体里，
// 所以先把坐标吸附到真实路网（ROAD_EDGES 的折线）上。
export function nearestRoadPoint(p) {
  let best = { x: p.x, y: p.y }
  let bd = Infinity
  for (const e of ROAD_EDGES) {
    const pts = e.pts
    for (let i = 0; i < pts.length - 1; i++) {
      const q = closestOnSeg(p, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] })
      const d = dist(p, q)
      if (d < bd) {
        bd = d
        best = q
      }
    }
  }
  return { x: best.x, y: best.y, moved: Number.isFinite(bd) ? bd : 0 }
}

// ---- 道路网 ----
// 把全部站间边的折线按 25 m 合并成一张图：折线拐点即节点，相邻拐点之间连双向边。
// 同一条路的上行/下行折线、不同站点出发的重叠路段都会并到一起，路口自然连通。
const NET = buildNetwork()

function buildNetwork() {
  const nodes = []
  const adj = []
  const grid = new Map()
  const GX = 512
  const gkey = (gx, gy) => (gx + GX) * 4096 + (gy + GX)

  const nodeAt = (x, y) => {
    const gx = Math.floor(x / NET_MERGE)
    const gy = Math.floor(y / NET_MERGE)
    let best = -1
    let bd = NET_MERGE * NET_MERGE
    for (let i = gx - 1; i <= gx + 1; i++) {
      for (let j = gy - 1; j <= gy + 1; j++) {
        const list = grid.get(gkey(i, j))
        if (!list) continue
        for (let k = 0; k < list.length; k++) {
          const n = list[k]
          const d = (nodes[n].x - x) ** 2 + (nodes[n].y - y) ** 2
          if (d < bd) {
            bd = d
            best = n
          }
        }
      }
    }
    if (best >= 0) return best
    const id = nodes.length
    nodes.push({ x, y })
    const k = gkey(gx, gy)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(id)
    adj.push([])
    return id
  }

  const link = (a, b) => {
    if (a === b) return
    const w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) / UNITS_PER_KM
    adj[a].push({ to: b, km: w })
    adj[b].push({ to: a, km: w })
  }

  for (const e of ROAD_EDGES) {
    let prev = -1
    for (const p of e.pts) {
      const id = nodeAt(p[0], p[1])
      if (prev >= 0) link(prev, id)
      prev = id
    }
  }
  return { nodes, adj, grid, gkey }
}

// 任意点 → 最近的网络节点（先查 3×3、再逐步扩大格窗，最后兜底全表）
function snapNode(p) {
  const { nodes, grid, gkey } = NET
  const gx = Math.floor(p.x / NET_MERGE)
  const gy = Math.floor(p.y / NET_MERGE)
  let best = -1
  let bd = Infinity
  for (let ring = 1; ring <= 12; ring++) {
    for (let i = gx - ring; i <= gx + ring; i++) {
      for (let j = gy - ring; j <= gy + ring; j++) {
        // 只扫这一圈的边框，内圈上一轮已经看过
        if (ring > 1 && Math.abs(i - gx) !== ring && Math.abs(j - gy) !== ring) continue
        const list = grid.get(gkey(i, j))
        if (!list) continue
        for (let k = 0; k < list.length; k++) {
          const n = list[k]
          const d = (nodes[n].x - p.x) ** 2 + (nodes[n].y - p.y) ** 2
          if (d < bd) {
            bd = d
            best = n
          }
        }
      }
    }
    // 找到的节点已经在当前搜索半径内「够近」，就没必要再扩大
    if (best >= 0 && Math.sqrt(bd) <= ring * NET_MERGE - NET_MERGE) break
  }
  if (best >= 0) return { node: best, gap: Math.sqrt(bd) }
  // 兜底：极端点（比如离路网很远）直接线性扫一遍
  for (let n = 0; n < nodes.length; n++) {
    const d = (nodes[n].x - p.x) ** 2 + (nodes[n].y - p.y) ** 2
    if (d < bd) {
      bd = d
      best = n
    }
  }
  return { node: best, gap: Math.sqrt(bd) }
}

// ---- 最短路 ----
const N = NET.nodes.length
const _dist = new Float64Array(N)
const _prev = new Int32Array(N)
const _seen = new Int32Array(N)
let _stamp = 0
const _heap = new Int32Array(N * 8)
const _hkey = new Float64Array(N * 8)

function dijkstra(a, b) {
  if (a === b) return { km: 0, nodes: [a] }
  _stamp++
  let hn = 0
  const push = (node, d) => {
    let i = hn++
    _heap[i] = node
    _hkey[i] = d
    while (i > 0) {
      const p = (i - 1) >> 1
      if (_hkey[p] <= _hkey[i]) break
      ;[_heap[p], _heap[i]] = [_heap[i], _heap[p]]
      ;[_hkey[p], _hkey[i]] = [_hkey[i], _hkey[p]]
      i = p
    }
  }
  const pop = () => {
    const top = _heap[0]
    hn--
    if (hn > 0) {
      _heap[0] = _heap[hn]
      _hkey[0] = _hkey[hn]
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < hn && _hkey[l] < _hkey[m]) m = l
        if (r < hn && _hkey[r] < _hkey[m]) m = r
        if (m === i) break
        ;[_heap[m], _heap[i]] = [_heap[i], _heap[m]]
        ;[_hkey[m], _hkey[i]] = [_hkey[i], _hkey[m]]
        i = m
      }
    }
    return top
  }

  _dist[a] = 0
  _prev[a] = -1
  _seen[a] = _stamp
  push(a, 0)
  while (hn > 0) {
    const cur = pop()
    if (_dist[cur] < 0) continue // 已出队（用负值标记）
    if (cur === b) break
    const dv = _dist[cur]
    _dist[cur] = -Math.abs(dv) - 1e-9
    for (const e of NET.adj[cur]) {
      const nd = dv + e.km
      if (_seen[e.to] !== _stamp || nd < _dist[e.to]) {
        _seen[e.to] = _stamp
        _dist[e.to] = nd
        _prev[e.to] = cur
        push(e.to, nd)
      }
    }
  }
  if (_seen[b] !== _stamp) return null
  const out = []
  let cur = b
  for (let guard = 0; cur >= 0 && guard < N + 5; guard++) {
    out.push(cur)
    if (cur === a) break
    cur = _prev[cur]
  }
  out.reverse()
  return { km: Math.abs(_dist[b]), nodes: out }
}

// 节点对之间的最短路缓存（车辆位置会吸附到固定节点，命中率很高）
const netCache = new Map()
function netRoute(a, b) {
  const key = a + '|' + b
  const hit = netCache.get(key)
  if (hit) return hit
  const r = dijkstra(a, b)
  if (netCache.size > 20000) netCache.clear()
  netCache.set(key, r)
  return r
}

// 站点 id → 网络节点
const STOP_MAP = new Map(STOPS.map((s) => [s.id, s]))
const stopNodeCache = new Map()
function stopNode(id) {
  if (stopNodeCache.has(id)) return stopNodeCache.get(id)
  const s = STOP_MAP.get(id)
  if (!s) return null
  const r = snapNode(s)
  stopNodeCache.set(id, r)
  return r
}

// 站台 → 路网节点：对侧站台 / 地铁出入口不是路网里的节点，
// 计算路径时统一用它们的「基准站」进图，最后再把站台自己的坐标接到两端。
export function graphId(id) {
  const s = STOP_MAP.get(id)
  return s && s.base && STOP_MAP.has(s.base) ? s.base : id
}

const routeCache = new Map()

// 站点/站台 → 站点/站台：沿真实道路的里程与折线（含两端吸附段）
export function stopRoute(fromId, toId) {
  if (!fromId || !toId) return null
  const a0 = STOP_MAP.get(fromId)
  const b0 = STOP_MAP.get(toId)
  const f = graphId(fromId)
  const t = graphId(toId)
  if (!a0 || !b0) return null
  if (f === t) return { km: dist(a0, b0) / UNITS_PER_KM, pts: [a0, b0] }

  const key = f + '|' + t
  let base = routeCache.get(key)
  if (base === undefined) {
    const A = stopNode(f)
    const B = stopNode(t)
    const r = A && B ? netRoute(A.node, B.node) : null
    base = r
      ? {
          km: r.km + (A.gap + B.gap) / UNITS_PER_KM,
          pts: [STOP_MAP.get(f), ...r.nodes.map((n) => NET.nodes[n]), STOP_MAP.get(t)],
        }
      : { km: km(STOP_MAP.get(f), STOP_MAP.get(t)) * 1.3, pts: [STOP_MAP.get(f), STOP_MAP.get(t)] }
    if (routeCache.size > 20000) routeCache.clear()
    routeCache.set(key, base)
  }
  // 站台偏移（22 m 量级）单独加在两端
  const head = a0.id !== f ? dist(a0, STOP_MAP.get(f) || a0) : 0
  const tail = b0.id !== t ? dist(b0, STOP_MAP.get(t) || b0) : 0
  if (!head && !tail) return base
  const pts = [...base.pts]
  if (head) pts[0] = a0
  if (tail) pts[pts.length - 1] = b0
  return { km: base.km + (head + tail) / UNITS_PER_KM, pts }
}

// 任意两点：先吸附到路网，再走最短路
function snapPoint(p) {
  if (p && p.id && STOP_MAP.has(p.id)) {
    const s = STOP_MAP.get(p.id)
    const g = s.base && STOP_MAP.get(s.base)
    const net = stopNode(g ? g.id : s.id)
    return { net, offset: (g ? dist(s, g) : 0) + (net ? net.gap : 0), stop: s }
  }
  return { net: snapNode(p), offset: 0, stop: null }
}

// 沿真实道路的折线路径 a→b（抽象坐标）
export function streetPath(a, b) {
  if (!a || !b) return [a, b]
  const A = snapPoint(a)
  const B = snapPoint(b)
  if (!A.net || !B.net) return [a, b]
  const r = netRoute(A.net.node, B.net.node)
  const mid = r ? r.nodes.map((n) => NET.nodes[n]) : [NET.nodes[A.net.node], NET.nodes[B.net.node]]
  const pts = []
  const push = (p) => {
    const last = pts[pts.length - 1]
    if (!last || dist(last, p) > 0.01) pts.push(p)
  }
  push(a)
  for (const p of mid) push(p)
  push(b)
  return pts
}

export function polylineLen(pts) {
  let sum = 0
  for (let i = 0; i < pts.length - 1; i++) sum += dist(pts[i], pts[i + 1])
  return sum
}

// 沿道路的通行距离（km）
export function routeKm(a, b) {
  if (!a || !b) return 0
  const A = snapPoint(a)
  const B = snapPoint(b)
  if (!A.net || !B.net) return km(a, b) * 1.3
  const r = netRoute(A.net.node, B.net.node)
  const base = r ? r.km : km(NET.nodes[A.net.node], NET.nodes[B.net.node]) * 1.3
  return base + (A.offset + B.offset) / UNITS_PER_KM
}

// 折线路径附近（横向容忍 tol）的站点，按距起点的路程排序
export function stopsOnPolyline(pts, pool = STOPS, tol = 30) {
  return pool
    .map((s) => {
      let d = Infinity
      for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(s, pts[i], pts[i + 1]))
      return { s, d, proj: dist(pts[0], s) }
    })
    .filter((x) => x.d <= tol)
    .sort((m, n) => m.proj - n.proj)
    .map((x) => x.s)
}

// 车辆预计运行轨迹上/附近的站点（保留给兼容场景）
export function stopsOnPath(a, b, pool = STOPS, tol = 30) {
  return stopsOnPolyline(streetPath(a, b), pool, tol)
}

// 路网规模（调试/验收用）
export const NET_STATS = { nodes: NET.nodes.length, links: NET.adj.reduce((s, x) => s + x.length, 0) / 2 }

export { SNAP_TOL }
