// 真实道路导航（高德驾车规划）——行程路线一次性锁定
//
// 为什么需要这一层：
//   站间路网（data/dalian-roads.js）是离线采集的 K=6 近邻图，边是双向的，
//   既没有单行线/禁左约束，也不是全连接图，Dijkstra 在个别 OD 上会拼出绕行折线
//   （例如从北往南逆行尖山街单行段）。它只适合做「兜底」和「站点吸附」。
//   对外展示与车辆行驶必须用高德真实的驾车路线：
//     · 遵守单行线、禁转、掉头规则
//     · 按实时路况选路（LEAST_TIME）
//     · 返回逐点折线，可直接作为车辆运行轨迹
//
// 关键设计：**同一 OD 只请求一次**。
//   路线一旦锁定就不再重算，否则乘客会看到预估路线来回跳（此前的 bug 正是如此）。
//   缓存键是起终点坐标，跨订单共享；同一次行程内永远命中缓存。
import { toLngLat, toXY } from '../data/geo.js'
import { loadAMap } from './amapLoader.js'

const TIMEOUT_MS = 9000
const memo = new Map() // key -> { pts, km, min, source }
const pending = new Map() // key -> Promise

const toLL = (p) => {
  if (!p) return null
  if (typeof p.getLng === 'function') return [p.getLng(), p.getLat()]
  if (Array.isArray(p)) return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null
  if (typeof p.lng === 'number' && typeof p.lat === 'number') return [p.lng, p.lat]
  return null
}

const keyOf = (a, b) => `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`

let drivingReady = null
function ensureDriving() {
  if (!drivingReady) {
    drivingReady = loadAMap().then(
      (AMap) => new Promise((res) => AMap.plugin(['AMap.Driving'], () => res(AMap))),
    )
  }
  return drivingReady
}

// 一次高德驾车规划。policy：0 最少时间（默认） / 1 最短路 / 2 避免拥堵 ...
function requestDriving(AMap, fromLL, toLLArr, policy) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      const dr = new AMap.Driving({
        hideMarkers: true,
        policy: policy ?? AMap.DrivingPolicy?.LEAST_TIME ?? 0,
        extensions: 'base',
      })
      dr.search(fromLL, toLLArr, (status, result) => {
        const route = result?.routes?.[0]
        if (status !== 'complete' || !route) return finish(null)
        const pts = []
        for (const step of route.steps || []) {
          for (const p of step.path || []) {
            const ll = toLL(p)
            if (!ll) continue
            const last = pts[pts.length - 1]
            if (!last || Math.abs(last[0] - ll[0]) > 1e-7 || Math.abs(last[1] - ll[1]) > 1e-7) pts.push(ll)
          }
        }
        if (pts.length < 2) return finish(null)
        finish({
          pts,
          km: Math.round(((route.distance || 0) / 1000) * 10) / 10,
          min: Math.max(1, Math.round((route.time || 0) / 60)),
          source: 'amap',
        })
      })
    } catch {
      finish(null)
    }
    setTimeout(() => finish(null), TIMEOUT_MS)
  })
}

/**
 * 取真实驾车路线（带缓存）。
 * @param {[number,number]} fromLL 起点 [lng, lat]
 * @param {[number,number]} toLLArr 终点 [lng, lat]
 * @returns {Promise<{pts:number[][],km:number,min:number,source:string}|null>}
 */
export async function drivingRoute(fromLL, toLLArr, policy) {
  if (!fromLL || !toLLArr) return null
  const key = keyOf(fromLL, toLLArr) + '#' + (policy ?? 0)
  if (memo.has(key)) return memo.get(key)
  if (pending.has(key)) return pending.get(key)

  const p = (async () => {
    try {
      const AMap = await ensureDriving()
      const r = await requestDriving(AMap, fromLL, toLLArr, policy)
      if (r) return r
    } catch {
      /* 高德不可用：交给调用方回退到站间路网 */
    }
    return null
  })()
  pending.set(key, p)
  const res = await p
  pending.delete(key)
  memo.set(key, res)
  return res
}

// 站点 → 站点（站点对象含 x/y）
export function drivingRouteStops(a, b, policy) {
  if (!a || !b) return Promise.resolve(null)
  return drivingRoute(toLngLat(a), toLngLat(b), policy)
}

// 折线 [[lng,lat]] → 抽象坐标 [{x,y}]（车辆运动仍用 0–320 坐标系）
export function pathToXY(pts) {
  return (pts || []).map(([lng, lat]) => toXY(lng, lat))
}

// 折线长度（km），用于 ETA 复核
export function polylineKm(pts) {
  let m = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dy = (b[1] - a[1]) * 110540
    const dx = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180)
    m += Math.hypot(dx, dy)
  }
  return m / 1000
}

export function clearRouteCache() {
  memo.clear()
  pending.clear()
}
