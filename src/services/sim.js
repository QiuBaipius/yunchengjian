// 车辆模拟引擎（前端内置的"后端"）：车辆沿道路行驶、派单匹配、订单生命周期、实时事件
// 对应 PRD「车辆运行规则」中与前端交互相关的部分：匹配规则 3/4/5、取消规则 8、改站与结算规则 9
// 派单规则见 services/dispatch.js（与独立仿真工程 ../simlab 同源同文）
//
// 第十七轮的两处结构性变化：
//   ① 一单可以有多段（legs）：同区一单一段；跨区一单两段，在「边界站点」换乘另一条线路。
//      第一段行驶到距边界站不足 2 分钟时，自动为第二段呼叫另一条线路的车辆。
//   ② 改为「行程结束后统一支付」：创建订单即派单（status='dispatched'），
//      下车结算后进入 status='settled' 待支付，支付完成才变 'completed'。
import { AREAS, DISPATCH, FLEET_SEED, STOPS, UNITS_PER_KM, areaContains, stopById } from '../data/config.js'
import { toLngLat } from '../data/geo.js'
import { dist, etaMin, km, nearestRoadPoint, routeKm, stopsOnPolyline, streetPath } from './routing.js'
import { selectBestVehicle } from './dispatch.js'
import { approachDir, dirOf, dropCheck, pickupCheck } from './platform.js'
import { priceForService } from './pricing.js'
import { pathToXY, polylineKm } from './roadRoute.js'

const TICK_MS = 1000 // 真实 1s
const TIME_SCALE = 20 // 1 真实秒 = 20 模拟秒
const SPEED_KM_PER_SIMMIN = 0.5 // 约 30km/h
const UNITS_PER_TICK = (SPEED_KM_PER_SIMMIN * UNITS_PER_KM * TICK_MS * TIME_SCALE) / 60000
const SIM_MIN_PER_TICK = (TICK_MS * TIME_SCALE) / 60000
const NEXT_CALL_MIN = 2 // 距边界站点还有 2 分钟时自动呼叫下一程
// 下一程车辆「还能不能取消」的分界：距边界站点不足 1 分 20 秒时车已经在路上，取消没有意义
export const NEXT_CANCEL_MIN = 80 / 60

const state = {
  vehicles: [],
  quotes: new Map(),
  runtimes: new Map(), // orderId -> 运行态
  routes: new Map(), // orderId -> { pickup, dest, next } 高德真实导航路线（锁定后不再变）
  listeners: new Set(),
  timer: null,
  tickCount: 0,
  seq: 100,
}

function emit(evt) {
  state.listeners.forEach((fn) => fn(evt))
}

function round2(n) {
  return Math.round(n * 100) / 100
}
function round1(n) {
  return Math.round(n * 10) / 10
}
function pad(n) {
  return String(n).padStart(2, '0')
}
export function fmtTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function demandRatio() {
  const active = [...state.runtimes.keys()].length
  const freeSeats = state.vehicles
    .filter((v) => v.onboard < v.capacity)
    .reduce((n, v) => n + (v.capacity - v.onboard), 0)
  return freeSeats > 0 ? Math.min(1, active / freeSeats + 0.12) : 1
}

// ---- 匹配（PRD 规则 3/4/5，规则实现见 services/dispatch.js）----
function evaluateMatch(fromId, toId, service = 'standard', exclude = []) {
  const from = stopById(fromId)
  const to = stopById(toId)
  const odKm = routeKm(from, to)
  // 三种模式的区别落在派单约束上：
  //   标准：顺路插入，逐人绕行 ≤ 33%，不限上客次数
  //   效率：逐人绕行 ≤ 15%，一程最多上 4 人
  //   专属：只接空车、不拼载
  const opts = { odKm, exclusive: service === 'exclusive', line: from?.areaId }
  if (service === 'efficiency') Object.assign(opts, { detourRatio: 0.15, maxRiders: 4 })
  // 「换一辆」：把用户主动跳过的车从候选里剔掉（派单规则本身不变）
  const pool = exclude.length ? state.vehicles.filter((v) => !exclude.includes(v.id)) : state.vehicles
  const r = selectBestVehicle(pool, from, to, opts)
  return { from, to, odKm, odMin: r.odMin, candidates: r.candidates, rejected: r.rejected }
}

function buildQuoteMatch(v, fromId, toId, odKm, service = 'standard') {
  const from = stopById(fromId)
  const pickupKm = routeKm(v, from)
  const pickupMin = etaMin(pickupKm)
  // 规则 1：这辆车进站的方向停不停得了你选的这一侧站台
  // 进站方向按真实站间路径的最后一段算，比「车 → 站」的直线方向准
  const side = pickupCheck(from, approachDir(streetPath(v, from)) || dirOf(v, from))
  return {
    vehicleId: v.id,
    plate: v.plate,
    service,
    distanceKm: round2(pickupKm),
    etaPickupMin: Math.max(1, Math.ceil(pickupMin)),
    etaDestMin: Math.ceil(pickupMin + etaMin(odKm)),
    onboard: v.onboard,
    seats: v.seats,
    capacity: v.capacity,
    seated: v.onboard < v.seats,
    ...(side.ok ? {} : { pickupSide: side }),
  }
}

// 路径剩余长度（车辆当前位置 → 途经 waypoints → 终点）
function remainingLen(v, rt) {
  if (!rt.target) return 0 // 尚未派单（idle）：还没有目标点
  if (!rt.path || !rt.path.length) return dist(v, rt.target)
  let sum = dist(v, rt.path[0])
  for (let i = 0; i < rt.path.length - 1; i++) sum += dist(rt.path[i], rt.path[i + 1])
  return sum
}

// 沿路径移动一步；到达路径终点返回 true
function moveAlong(v, rt, step) {
  let left = step
  while (left > 0 && rt.path.length) {
    const t = rt.path[0]
    const d = dist(v, t)
    if (d <= left) {
      v.x = t.x
      v.y = t.y
      left -= d
      rt.traveled += d
      rt.path.shift()
    } else if (d > 0.001) {
      v.x += ((t.x - v.x) / d) * left
      v.y += ((t.y - v.y) / d) * left
      rt.traveled += left
      left = 0
    } else {
      rt.path.shift()
    }
  }
  return rt.path.length === 0
}

// 车辆在路径上的最近点（用于把已走的路段切掉，避免锁定新路线时倒车/瞬移）
function nearestOnPath(pts, v) {
  let bi = 0
  let bd = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - v.x, pts[i].y - v.y)
    if (d < bd) {
      bd = d
      bi = i
    }
  }
  return { i: bi, d: bd }
}

// 目的地变更后解除锁定，等上层重新请求高德导航
function clearLockedDest(orderId) {
  const rt = state.runtimes.get(orderId)
  const rec = state.routes.get(orderId)
  if (rt) {
    rt.destXY = null
    rt.destKm = null
  }
  if (rec) {
    rec.dest = null
    emit({ type: 'route', orderId, paths: { ...rec } })
  }
}

function curLeg(o) {
  return o.legs?.[o.legIdx] || null
}

function snapshot(orderId) {
  const rt = state.runtimes.get(orderId)
  if (!rt) return null
  const v = state.vehicles.find((x) => x.id === rt.vehicleId)
  const o = rt.order
  const snap = {
    ...o,
    legs: (o.legs || []).map((l) => ({ ...l })),
    vehiclePos: v ? { x: v.x, y: v.y } : null,
    etaPickupSec: 0,
    etaDestSec: 0,
    flags: { ...rt.flags },
  }
  const remain = v ? remainingLen(v, rt) : 0
  const remainMin = (remain / UNITS_PER_TICK) * SIM_MIN_PER_TICK
  if (rt.leg === 'pickup') {
    snap.etaPickupMin = Math.max(1, Math.ceil(remainMin))
    // 真实导航里程优先（锁定后），保证乘客看到的剩余时间与将走的路线一致
    const legKm = curLeg(o)?.km || o.routeKm || o.km
    snap.etaDestMin = snap.etaPickupMin + Math.ceil(etaMin(legKm) + transferWaitMin(o))
    snap.etaPickupSec = Math.ceil((remain / UNITS_PER_TICK) * TICK_MS / 1000 * TIME_SCALE)
  } else if (rt.leg === 'ride') {
    snap.etaPickupMin = 0
    snap.etaDestMin = Math.max(1, Math.ceil(remainMin + transferWaitMin(o)))
    snap.etaDestSec = Math.ceil((remain / UNITS_PER_TICK) * TICK_MS / 1000 * TIME_SCALE)
    // 本程剩余分钟：改站 / 提前下车时判断「下一程还能不能取消」的依据
    snap.remainMin = Math.round(remainMin * 100) / 100
  } else if (rt.leg === 'wait_transfer') {
    snap.etaPickupMin = rt.next?.etaMin ?? 0
    snap.etaDestMin = Math.max(1, Math.ceil((rt.next?.etaMin ?? 0) + etaMin(curLeg(o)?.km || 0)))
  }
  // 换乘等待时，地图要显示的是「第二程的车」，不是刚下车的上一程
  if (rt.next) {
    const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
    if (nv) {
      snap.nextVehiclePos = { x: nv.x, y: nv.y }
      snap.nextPlate = nv.plate
      // 第二程车还没到换乘站时，把它「当前位置 → 换乘站」的剩余路径一起推给界面，
      // 地图上画成虚线，乘客能看着车一点点开过来（不然只有一个孤零零的点）
      if (!rt.next.arrived && (rt.next.path || []).length) {
        snap.nextApproach = [{ x: nv.x, y: nv.y }, ...rt.next.path].map((p) => toLngLat(p))
      }
    }
  }
  if (o.cancelDeadline && ['dispatched', 'arrived'].includes(o.status)) {
    snap.cancelCountdownSec = Math.max(0, Math.ceil((o.cancelDeadline - Date.now()) / 1000))
  }
  return snap
}

// 剩余换乘等待（分钟）：跨区订单还有下一程时给个粗估
function transferWaitMin(o) {
  if (!o.legs || o.legIdx >= o.legs.length - 1) return 0
  return 2
}

function emitTrip(orderId) {
  const snap = snapshot(orderId)
  if (snap) emit({ type: 'trip', order: snap })
}

// ---- 模拟主循环 ----
function tick() {
  state.tickCount += 1
  for (const [orderId, rt] of state.runtimes) {
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    if (!v) continue
    const o = rt.order

    // 下一程的车同时在往边界站点开（提前 2 分钟出发，乘客到站即可换乘）
    if (rt.next && !rt.next.arrived) {
      const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
      if (nv) {
        const nrt = { path: rt.next.path, traveled: 0 }
        const done = moveAlong(nv, nrt, UNITS_PER_TICK)
        if (done) {
          rt.next.arrived = true
          rt.next.etaMin = 0
          emitTrip(orderId)
        } else {
          const left = nrt.path.length ? dist(nv, nrt.path[0]) + nrt.path.slice(1).reduce((n, p, i) => n + dist(nrt.path[i], p), 0) : 0
          rt.next.etaMin = Math.max(1, Math.ceil(left / 20))
        }
      }
    }

    if (!rt.target || rt.leg === 'idle' || rt.leg === 'wait_board' || rt.leg === 'wait_transfer') {
      // 换乘等待期：第二程车还在往边界站开，位置必须逐帧推给界面，
      // 否则地图上那辆车会定在「进入等待的那一刻」，看起来完全不动
      if (rt.next && !rt.next.arrived) emitTrip(orderId)
      continue
    }

    const arrived = moveAlong(v, rt, UNITS_PER_TICK)
    const remain = remainingLen(v, rt)

    // 距离边界站点不足 2 分钟：自动呼叫下一程
    if (rt.leg === 'ride' && o.legIdx < (o.legs?.length || 1) - 1 && !rt.next) {
      const remainMin = remain / 20
      if (remainMin <= NEXT_CALL_MIN + 0.15) callNextLeg(orderId, remainMin)
    }

    // 1 分钟（模拟时间）到达提醒
    if (rt.leg === 'pickup' && !rt.flags.pickupSoon && remain <= UNITS_PER_TICK * 3) {
      rt.flags.pickupSoon = true
    }
    if (rt.leg === 'ride' && !rt.flags.destSoon && remain <= UNITS_PER_TICK * 3) {
      rt.flags.destSoon = true
    }

    if (arrived || remain <= 0.6) {
      const last = rt.path.length ? rt.path[rt.path.length - 1] : rt.target
      v.x = last.x
      v.y = last.y
      if (rt.leg === 'pickup') {
        o.status = 'arrived'
        rt.leg = 'wait_board'
        emitTrip(orderId)
      } else if (rt.leg === 'ride') {
        const leg = curLeg(o)
        if (leg) leg.status = 'arrived'
        if (o.legs && o.legIdx < o.legs.length - 1) {
          // 到边界站点：下车换乘，等下一程的车
          o.status = 'transfer_wait'
          rt.leg = 'wait_transfer'
          v.status = 'idle'
          emitTrip(orderId)
        } else {
          // 规则 2（下车侧顺路）：车上还有人要送时，车必须接着往那位乘客的方向走，
          // 只能在「顺路侧」落客——你选的侧不顺路就停到对侧，绝不为一个人掉头逆行。
          if (!rt.flags.sideDropDone) {
            rt.flags.sideDropDone = true
            const next = nextDropAfter(o, v, rt.target)
            const onward = next ? dirOf(rt.target, next) : null
            const r = dropCheck(rt.target, onward)
            if (r.changed) {
              o.sideDrop = {
                fromId: rt.target.id,
                fromName: rt.target.name,
                toId: r.stop.id,
                toName: r.stop.name,
                note: r.text,
              }
              rt.target = { ...r.stop }
              rt.path = [{ x: r.stop.x, y: r.stop.y }]
              emitTrip(orderId)
              continue
            }
          }
          o.status = 'await_alight'
          emitTrip(orderId)
        }
      }
      continue
    }
    emitTrip(orderId)
  }

  // 空闲车辆沿真实路网、在本线路运营范围内巡游（首页地图上的车队位置）
  for (const v of state.vehicles) {
    if (v.status === 'to_pickup' || v.status === 'to_transfer') continue
    stepCruise(v)
  }
  if (state.tickCount % 3 === 0) emit({ type: 'fleet', fleet: fleetSnapshot() })
}

// ---- 空车巡游：车只能在路上，且只在本线路的运营范围内 ----
// 旧做法是每 10 秒把坐标随机抖一下，车会漂进小区、海面甚至运营范围外，
// 看起来就像「车从各种莫名其妙的地方冒出来」。改成沿真实站间路网巡游：
// 每辆车有个「下一个目的地站」（同线路、同运营区），沿 streetPath 的真实折线
// 一格格往前挪，到站再换一个，于是永远在路上、永远不出范围。
const CRUISE_UNITS_PER_TICK = 3 // ≈75 m/tick，比运营速度慢，看着像空驶找客
// 运营区边界是沿道路画出来的细走廊，路边点位（路中心线、站台）会有 ±20 m 的出入，
// 所以判定「在范围内」留 50 m 容差；再往外就是真出去了。
const AREA_TOL = 2

function areaOf(v) {
  return AREAS.find((a) => a.id === v.areaId) || null
}

function inArea(p, area) {
  return !area || areaContains(area, p, AREA_TOL)
}

// 本线路的乘降点：按「停靠线路」取（X2 新增地块的站点主属区仍是 a1，但两条线都停）
function areaPool(v) {
  return STOPS.filter((s) => !s.hidden && !s.exit && !s.base && (s.lines || []).includes(v.lineId))
}

function startCruise(v) {
  const area = areaOf(v)
  const pool = areaPool(v)
  if (!pool.length) {
    v.cruise = null
    return
  }
  // 随机挑一个不是脚下这个的站；路径只走到第一个越界点之前
  // （站间路网里有些边会绕出运营区，宁可少走两段，也不让车开出去）
  for (let n = 0; n < 8; n++) {
    const target = pool[Math.floor(Math.random() * pool.length)]
    if (dist(v, target) < 6) continue
    const pts = streetPath(v, target).slice(1)
    const cut = []
    for (const p of pts) {
      if (!inArea(p, area)) break
      cut.push(p)
    }
    if (cut.length) {
      v.cruise = { targetId: target.id, path: cut }
      return
    }
  }
  v.cruise = null
}

function stepCruise(v) {
  if (!v.cruise || !v.cruise.path.length) startCruise(v)
  const c = v.cruise
  if (!c || !c.path.length) return
  const from = { x: v.x, y: v.y }
  let left = CRUISE_UNITS_PER_TICK
  while (left > 0 && c.path.length) {
    const t = c.path[0]
    const d = dist(v, t)
    if (d <= left) {
      v.x = t.x
      v.y = t.y
      left -= d
      c.path.shift()
    } else if (d > 0.001) {
      v.x += ((t.x - v.x) / d) * left
      v.y += ((t.y - v.y) / d) * left
      left = 0
    } else {
      c.path.shift()
    }
  }
  // 兜底：这一步迈出去越界了就退回原地，换一条巡游路线
  if (!inArea({ x: v.x, y: v.y }, areaOf(v))) {
    v.x = from.x
    v.y = from.y
    v.cruise = null
    return
  }
  if (!c.path.length) startCruise(v)
}

// 自动呼叫下一程：选「预计到达边界站点的时间 ≥ 乘客剩余时间」里最早的一辆，
// 保证车不会比乘客先到太久（不浪费运力），也不会让乘客到了没车。
function callNextLeg(orderId, remainMin) {
  const rt = state.runtimes.get(orderId)
  const o = rt.order
  const leg = o.legs[o.legIdx + 1]
  if (!leg) return
  const transfer = stopById(leg.fromId)
  const pool = state.vehicles.filter((v) => v.lineId === leg.line && v.status !== 'to_pickup')
  if (!pool.length) return
  let best = null
  for (const v of pool) {
    const eta = etaMin(routeKm(v, transfer))
    const cand = { v, eta, ok: eta + 0.35 >= remainMin }
    if (!best) best = cand
    else if (cand.ok && !best.ok) best = cand
    else if (cand.ok === best.ok && (cand.ok ? cand.eta < best.eta : cand.eta > best.eta)) best = cand
  }
  const v = best.v
  leg.vehicleId = v.id
  leg.plate = v.plate
  leg.status = 'called'
  v.status = 'to_transfer'
  rt.next = {
    vehicleId: v.id,
    path: streetPath({ x: v.x, y: v.y }, transfer),
    arrived: false,
    etaMin: Math.max(1, Math.ceil(best.eta)),
  }
  rt.flags.nextCalled = true
  emitTrip(orderId)
}

// 车队种子只给了「车上人数」没给乘客明细。补齐乘客有两个用处：
//   ① 派单的逐人绕路预算（CFI）才有人可算；
//   ② 「下车后车上还有人要送」这条顺路侧规则才有判断依据。
// 目的地按线路站表等间隔取，保证是真实存在的站，且不会都堆在同一处。
function seedRiders(v) {
  const have = Array.isArray(v.riders) ? v.riders.slice() : []
  const need = (v.onboard || 0) - have.length
  if (need <= 0) return have
  const pool = STOPS.filter((s) => (s.lines || []).includes(v.lineId) && !s.base && !s.exit && !s.hidden)
  if (!pool.length) return have
  const start = Math.max(0, pool.findIndex((s) => Math.hypot(s.x - v.x, s.y - v.y) < 3))
  for (let i = 0; i < need; i++) {
    const to = pool[(start + 2 + i * 3) % pool.length]
    have.push({ fromId: null, toId: to.id })
  }
  return have
}

// 车上「下一位要送」的乘客目的站（不含本乘客自己）：
// 取离当前站点最近的那个——车接下来就是要往那边开。
function nextDropAfter(o, v, atStop) {
  const mine = curLeg(o)?.toId || o.toId
  const others = (v?.riders || [])
    .map((r) => (typeof r === 'object' ? r.toId : r))
    .filter((id) => id && id !== mine)
  if (!others.length) return null
  let best = null
  let bd = Infinity
  for (const id of others) {
    const s = stopById(id)
    if (!s) continue
    const d = routeKm(atStop, s)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best && bd > 0.02 ? best : null
}

function fleetSnapshot() {
  return state.vehicles.map((v) => ({
    id: v.id,
    plate: v.plate,
    lineId: v.lineId,
    x: Math.round(v.x * 10) / 10,
    y: Math.round(v.y * 10) / 10,
    onboard: v.onboard,
    capacity: v.capacity,
    seated: v.onboard < v.seats,
  }))
}

export const sim = {
  init() {
    if (state.timer) return
    state.vehicles = FLEET_SEED.map((v) => {
      // 出场位置吸附到真实道路上（种子给的是站点坐标，站台离路中心 20 m 左右）
      const rp = nearestRoadPoint({ x: v.x, y: v.y })
      return { ...v, x: rp.x, y: rp.y, status: 'idle', riders: seedRiders(v), cruise: null }
    })
    // 出场点若落在运营区外（路网有跨出范围的边），拉回本区最近的站
    for (const v of state.vehicles) {
      if (!inArea({ x: v.x, y: v.y }, areaOf(v))) {
        const pool = areaPool(v)
        if (pool.length) {
          const near = pool.reduce((a, s) => (dist(v, s) < dist(v, a) ? s : a))
          v.x = near.x
          v.y = near.y
        }
      }
      startCruise(v)
    }
    state.timer = setInterval(tick, TICK_MS)
    // 调试钩子：验收脚本要读「车上还有谁要送」这类内部状态，生产构建里不存在
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__sim = state
      // 服务方法也挂一份：验收脚本要直接调 changePickup 构造「逆向来车」这种确定性场景
      window.__simApi = sim
    }
  },
  onEvent(fn) {
    state.listeners.add(fn)
    return () => state.listeners.delete(fn)
  },
  demandRatio,
  fleetSnapshot,
  // 与服务端下单同口径的报价预览
  pricePreview(km, service = 'standard') {
    return priceForService(km, service, new Date(), demandRatio())
  },

  // POST /v1/match —— 请求匹配最合适车辆（只匹配第一程）
  // exclude：用户点过「换一辆」的车，不再派给它（全试过一遍后自动回到全车队）
  requestMatch({ fromId, toId, service = 'standard', legs, exclude = [] }) {
    const { odKm } = evaluateMatch(fromId, toId, service, exclude)
    const quote = {
      id: 'q' + ++state.seq,
      fromId,
      toId,
      legs: legs || [{ line: stopById(fromId)?.areaId === 'a2' ? 'X2' : 'X1', fromId, toId }],
      service,
      odKm: round1(odKm),
      odKmRaw: odKm,
      status: 'searching',
      createdAt: Date.now(),
    }
    // 各程票价合计（一口价，确认窗口与匹配面板显示同一个数）
    // 逐程都用「该程里程」，与确认窗口同一口径，避免四舍五入差一分钱
    quote.total = round2(
      (quote.legs || []).reduce(
        (n, l) => n + priceForService(l.km || odKm, l.service || service, new Date(), 0).total,
        0,
      ),
    )
    state.quotes.set(quote.id, quote)
    const resolve = () => {
      let r = evaluateMatch(fromId, toId, service, exclude)
      let best = r.candidates[0]
      // 排除列表把车队试遍了：回到全车队再算一次，避免「换一辆」走到死胡同
      if (!best && exclude.length) {
        r = evaluateMatch(fromId, toId, service, [])
        best = r.candidates[0]
        quote.exhausted = true
      }
      if (!best) {
        quote.status = 'no_match'
        quote.reason = 'no_vehicle'
        emit({ type: 'match', quote })
        return
      }
      if (best.etaPickupMin > DISPATCH.maxWaitMin) {
        quote.status = 'no_match'
        quote.reason = 'wait_too_long'
        quote.maxEtaPickupMin = Math.ceil(best.etaPickupMin)
        emit({ type: 'match', quote })
        return
      }
      quote.status = 'matched'
      quote.match = buildQuoteMatch(best.v, fromId, toId, r.odKm, service)
      quote.price = priceForService(odKm, service, new Date(), demandRatio())
      emit({ type: 'match', quote })
    }
    const wait = demandRatio() > 0.55 ? 3500 + Math.random() * 3500 : 500 + Math.random() * 700
    setTimeout(resolve, wait)
    return quote
  },
  getQuote(quoteId) {
    return state.quotes.get(quoteId) || null
  },
  cancelQuote(quoteId) {
    const q = state.quotes.get(quoteId)
    if (q) q.status = 'cancelled'
    state.quotes.delete(quoteId)
  },

  // POST /v1/orders —— 确认呼叫即创建订单并派单（不再预付费，行程结束后统一支付）
  createOrder(quoteId) {
    const q = state.quotes.get(quoteId)
    if (!q || q.status !== 'matched') return null
    const m = q.match
    const now = new Date()
    const v = state.vehicles.find((x) => x.id === m.vehicleId)
    if (!v) return null
    v.status = 'to_pickup'

    const legs = (q.legs || []).map((l, i) => {
      const svc = l.service || q.service || 'standard'
      const legKm = l.km || q.odKmRaw
      const price = priceForService(legKm, svc, now, 0)
      return {
        line: l.line || (stopById(l.fromId)?.areaId === 'a2' ? 'X2' : 'X1'),
        fromId: l.fromId,
        toId: l.toId,
        km: round1(legKm),
        service: svc,
        price,
        vehicleId: i === 0 ? v.id : null,
        plate: i === 0 ? v.plate : null,
        status: i === 0 ? 'on_way' : 'pending',
      }
    })
    const total = round2(legs.reduce((n, l) => n + (l.price?.total || 0), 0))

    const order = {
      id: 'YC' + `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` + String(++state.seq).padStart(3, '0'),
      status: 'dispatched',
      service: q.service || 'standard',
      fromId: q.fromId,
      toId: legs[legs.length - 1]?.toId || q.toId,
      actualAlightId: null,
      legs,
      legIdx: 0,
      km: round1(legs.reduce((n, l) => n + (l.km || 0), 0)),
      price: { base: total, surge: 1, total },
      amountDue: total,
      paidAmount: 0,
      plate: m.plate,
      vehicleId: m.vehicleId,
      etaPickupMin: m.etaPickupMin,
      etaDestMin: m.etaDestMin,
      // 规则 1 的提示（站台在车辆来向的对向车道时才有）
      pickupSide: m.pickupSide || null,
      onboard: m.onboard,
      seats: m.seats,
      capacity: m.capacity,
      seated: m.seated,
      orderTime: fmtTime(now),
      boardTime: null,
      alightTime: null,
      cancelDeadline: Date.now() + DISPATCH.freeCancelMs,
      cancelCountdownSec: 0,
      deviated: false,
      routeStopIds: [],
      flags: {},
      rating: null,
      penalty: 0,
      extraFee: 0,
      refund: null,
      payMethod: null,
      earlyAlight: false,
    }
    state.runtimes.set(order.id, {
      orderId: order.id,
      vehicleId: v.id,
      leg: 'pickup',
      target: { ...stopById(order.fromId) },
      path: streetPath({ x: v.x, y: v.y }, stopById(order.fromId)),
      traveled: 0,
      flags: {},
      order,
      startPos: { x: v.x, y: v.y },
      next: null,
    })
    state.routes.set(order.id, { pickup: null, dest: null, next: null })
    state.quotes.delete(quoteId)
    emitTrip(order.id)
    return snapshot(order.id)
  },

  // POST /v1/orders/:id/pay —— 行程结束后的统一支付
  payOrder(orderId, method) {
    const rt = state.runtimes.get(orderId)
    const o = rt?.order || state.settled.get(orderId)
    if (!o || o.status !== 'settled') return null
    o.status = 'completed'
    o.payMethod = method
    o.paidAmount = o.amountDue ?? o.price?.total ?? 0
    o.payTime = fmtTime()
    state.settled.set(orderId, o)
    if (rt) {
      state.runtimes.delete(orderId)
      state.routes.delete(orderId)
    }
    emit({ type: 'trip', order: snapshot0(o) })
    return snapshot0(o)
  },

  // DELETE /v1/orders/:id —— 取消订单（规则 8）
  cancelOrder(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return null
    const o = rt.order
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    o.status = 'cancelled'
    o.penalty = 0
    o.refund = { amount: 0, method: null, eta: '—', note: '行程开始前取消，未产生费用（本平台为行程结束后统一支付）' }
    if (v) {
      v.status = 'idle'
      v.riders = []
    }
    if (rt.next) {
      const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
      if (nv) nv.status = 'idle'
    }
    state.runtimes.delete(orderId)
    state.routes.delete(orderId)
    emit({ type: 'trip', order: snapshot0(o) })
    return snapshot0(o)
  },

  // ---- 真实导航路线（高德驾车规划结果，一次锁定、全程复用）----
  // 锁定接驾路线：车辆当前位置 → 上车点。
  // 车辆已经驶过的部分按最近点切掉，不会倒退或瞬移；偏离过远则放弃替换。
  setPickupRoute(orderId, pts) {
    const rt = state.runtimes.get(orderId)
    const rec = state.routes.get(orderId)
    if (!rt || !rec || !Array.isArray(pts) || pts.length < 2) return null
    if (rt.leg !== 'pickup') return null
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    if (!v) return null
    const xy = pathToXY(pts)
    const { i, d } = nearestOnPath(xy, v)
    if (d > 900 / 25) return null // 车已离这条线超过 900 m，替换只会造成折返
    rt.path = xy.slice(i + 1)
    rec.pickup = pts
    emit({ type: 'route', orderId, paths: { ...rec } })
    return rec
  },

  // 锁定当前段的行程路线：本段上车点 → 本段下车点（跨区时即边界站点）
  setDestRoute(orderId, pts) {
    const rt = state.runtimes.get(orderId)
    const rec = state.routes.get(orderId)
    if (!rt || !rec || !Array.isArray(pts) || pts.length < 2) return null
    const xy = pathToXY(pts)
    const realKm = polylineKm(pts)
    if (!(realKm > 0.05)) return null
    rt.destXY = xy
    rt.destKm = realKm
    rec.dest = pts
    rt.order.routeKm = round1(realKm)
    // 本程的「计价里程」保持下单时议定值不变（一口价），真实行驶里程另存 routeKm
    if (curLeg(rt.order)) curLeg(rt.order).routeKm = round1(realKm)
    // 已经在车上：从车辆当前位置切入新路线，已走部分不重走
    if (rt.leg === 'ride') {
      const v = state.vehicles.find((x) => x.id === rt.vehicleId)
      if (v) {
        const { i, d } = nearestOnPath(xy, v)
        if (d <= 900 / 25) rt.path = xy.slice(i + 1)
      }
    }
    emit({ type: 'route', orderId, paths: { ...rec } })
    if (rt.target) emitTrip(orderId)
    return rec
  },

  // 锁定「第二程」的行程路线：边界站点 → 最终目的地。
  // 换乘等待期间地图要显示这一条（以及第二程的车），不再显示刚坐完的第一程。
  setNextRoute(orderId, pts) {
    const rt = state.runtimes.get(orderId)
    const rec = state.routes.get(orderId)
    if (!rt || !rec || !Array.isArray(pts) || pts.length < 2) return null
    if (!rt.next && rt.leg !== 'wait_transfer') return null
    rec.next = pts
    rt.nextXY = pathToXY(pts)
    emit({ type: 'route', orderId, paths: { ...rec } })
    return rec
  },

  // UI 读取当前锁定路线（返回同一引用，便于地图按引用判断是否需要重绘）
  getRoute(orderId) {
    return state.routes.get(orderId) || { pickup: null, dest: null, next: null }
  },

  // POST /v1/orders/:id/board —— 刷乘车码核销上车
  // 第一程到站、以及换乘站上第二程，都走这里
  verifyBoard(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return null
    const o = rt.order
    if (o.status === 'arrived') {
      const v = state.vehicles.find((x) => x.id === rt.vehicleId)
      const leg = curLeg(o)
      o.status = 'riding'
      o.boardTime = fmtTime()
      if (v) {
        v.onboard += 1
        o.onboard = v.onboard
        v.riders.push({ fromId: leg.fromId, toId: leg.toId })
      }
      if (leg) leg.status = 'riding'
      rt.leg = 'ride'
      rt.target = { ...stopById(leg.toId) }
      rt.path = rt.destXY?.length ? rt.destXY.slice() : streetPath(stopById(leg.fromId), rt.target)
      rt.traveled = 0
      o.routeStopIds = stopsOnPolyline(rt.path).map((s) => s.id)
      emitTrip(orderId)
      return snapshot(orderId)
    }
    // 换乘：第一程已到边界站点，第二程的车也到了，刷码上第二程
    if (o.status === 'transfer_wait') {
      if (!rt.next?.arrived) return null
      const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
      const prevLeg = curLeg(o)
      if (prevLeg) prevLeg.status = 'done'
      // 下第一程的车
      const old = state.vehicles.find((x) => x.id === rt.vehicleId)
      if (old) {
        old.onboard = Math.max(0, old.onboard - 1)
        const idx = old.riders.findIndex((r) => r.toId === prevLeg?.toId)
        if (idx >= 0) old.riders.splice(idx, 1)
        old.status = 'idle'
      }
      o.legIdx += 1
      const leg = curLeg(o)
      if (leg) {
        leg.status = 'riding'
        if (nv) {
          nv.onboard += 1
          nv.riders.push({ fromId: leg.fromId, toId: leg.toId })
        }
        rt.vehicleId = nv?.id || rt.vehicleId
        rt.leg = 'ride'
        rt.target = { ...stopById(leg.toId) }
        rt.path = rt.nextXY?.length ? rt.nextXY.slice() : streetPath(stopById(leg.fromId), rt.target)
        rt.destXY = rt.nextXY?.length ? rt.nextXY.slice() : null
        rt.nextXY = null
        rt.traveled = 0
        o.onboard = nv?.onboard || 0
        o.plate = leg.plate || nv?.plate || o.plate
        o.status = 'riding'
        o.transferTime = fmtTime()
        o.routeStopIds = stopsOnPolyline(rt.path).map((s) => s.id)
      }
      rt.next = null
      rt.flags.destSoon = false
      rt.flags.destDone = false
    rt.flags.sideDropDone = false
      rt.flags.nextCalled = false
      const rec = state.routes.get(orderId)
      if (rec && rec.next) {
        rec.next = null
        emit({ type: 'route', orderId, paths: { ...rec } })
      }
      emitTrip(orderId)
      return snapshot(orderId)
    }
    return null
  },

  // GET /v1/orders/:id/route-stops —— 车辆预计运行轨迹中的站点（规则 9：可改站至此）
  getRouteStops(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return []
    if (rt.order.routeStopIds?.length) return rt.order.routeStopIds
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    if (!v) return []
    return stopsOnPolyline(streetPath({ x: v.x, y: v.y }, rt.target)).map((s) => s.id)
  },

  // PATCH /v1/orders/:id/destination —— 中途更改目的地
  // 本程后面还有一程（跨区第一程）时，改站等于把本程结束在新站点，后续各程不再运行
  changeDest(orderId, toId, opts = {}) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return null
    if ((rt.order.legs?.length || 1) > (rt.order.legIdx || 0) + 1) {
      return endEarly(orderId, toId, opts.dropNext !== false)
    }
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    const o = rt.order
    o.toId = toId
    o.actualAlightId = null
    const leg = curLeg(o)
    if (leg) {
      leg.toId = toId
      repriceLeg(o, leg, routeKm(stopById(leg.fromId), stopById(toId)))
    }
    rt.target = { ...stopById(toId) }
    rt.path = streetPath({ x: v.x, y: v.y }, rt.target)
    rt.traveled = 0
    clearLockedDest(orderId)
    o.routeStopIds = stopsOnPolyline(rt.path).map((s) => s.id)
    rt.flags.destSoon = false
    rt.flags.destDone = false
    rt.flags.sideDropDone = false
    emitTrip(orderId)
    return snapshot(orderId)
  },

  // POST /v1/orders/:id/early-alight —— 提前下车（在轨迹站点中选站）
  earlyAlight(orderId, stopId, opts = {}) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return null
    if ((rt.order.legs?.length || 1) > (rt.order.legIdx || 0) + 1) {
      return endEarly(orderId, stopId, opts.dropNext !== false)
    }
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    const o = rt.order
    o.earlyAlight = true
    rt.target = { ...stopById(stopId) }
    rt.path = streetPath({ x: v.x, y: v.y }, rt.target)
    rt.traveled = 0
    clearLockedDest(orderId)
    rt.flags.destSoon = false
    rt.flags.destDone = false
    rt.flags.sideDropDone = false
    emitTrip(orderId)
    return snapshot(orderId)
  },

  // POST /v1/orders/:id/alight —— 刷乘车码核销下车（终到站），进入待支付
  verifyAlight(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt || rt.order.status !== 'await_alight') return null
    const o = rt.order
    const actualStop = rt.target
    const actualKm = round1(km(stopById(curLeg(o)?.fromId || o.fromId), actualStop))
    return finishRide(orderId, actualStop, actualKm)
  },

  // POST /v1/orders/:id/alight-here —— 专属服务：在当前车辆位置就近下车
  alightHere(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt || rt.order.status !== 'riding' || rt.order.service !== 'exclusive') return null
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    if (!v) return null
    const from = stopById(rt.order.fromId)
    const limit = rt.order.km || round1(routeKm(from, stopById(rt.order.toId)))
    const actualKm = Math.max(0.1, Math.min(round1(routeKm(from, { x: v.x, y: v.y })), limit))
    return finishRide(orderId, { id: null, name: '当前位置' }, actualKm, 'here')
  },

  // 换乘前取消已自动呼叫的第二程（距边界站点 2:00–1:20 之间才可以取消）
  cancelNextLeg(orderId) {
    const rt = state.runtimes.get(orderId)
    if (!rt?.next) return null
    const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
    if (nv) nv.status = 'idle'
    const leg = rt.order.legs?.[(rt.order.legIdx || 0) + 1]
    if (leg) {
      leg.vehicleId = null
      leg.plate = null
      leg.status = 'pending'
    }
    rt.next = null
    rt.nextXY = null
    rt.flags.nextCalled = false
    const rec = state.routes.get(orderId)
    if (rec) {
      rec.next = null
      emit({ type: 'route', orderId, paths: { ...rec } })
    }
    emitTrip(orderId)
    return snapshot(orderId)
  },

  // PATCH /v1/orders/:id/pickup —— 改上车站台（规则 1 的「提示走到对面」落地为一次操作）
  changePickup(orderId, stopId) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return null
    const o = rt.order
    if (!['dispatched', 'arrived'].includes(o.status)) return null
    const v = state.vehicles.find((x) => x.id === rt.vehicleId)
    const stop = stopById(stopId)
    if (!v || !stop) return null
    const leg = curLeg(o)
    if (leg) leg.fromId = stopId
    o.fromId = stopId
    o.pickupSide = null
    rt.target = { ...stop }
    rt.path = streetPath({ x: v.x, y: v.y }, rt.target)
    rt.traveled = 0
    rt.leg = 'pickup'
    if (o.status === 'arrived') o.status = 'dispatched'
    const side = pickupCheck(stop, approachDir(rt.path) || dirOf(v, stop))
    if (!side.ok) o.pickupSide = side
    emitTrip(orderId)
    return snapshot(orderId)
  },

  ackPopup(orderId, which) {
    const rt = state.runtimes.get(orderId)
    if (!rt) return
    rt.flags[`${which}Done`] = true
    emitTrip(orderId)
  },

  snapshot(orderId) {
    return snapshot(orderId)
  },
}

// 待支付订单在运行态里已删除，这里单独存一份，支付页要用
state.settled = new Map()

function snapshot0(o) {
  return { ...o, flags: {}, vehiclePos: null, etaPickupSec: 0, etaDestSec: 0, cancelCountdownSec: 0 }
}

// 改站 / 提前下车后按新里程重新给本程计价，并刷新订单应付合计
function repriceLeg(o, leg, newKm) {
  const km1 = round1(Math.max(0.1, newKm || 0))
  leg.km = km1
  leg.price = priceForService(km1, leg.service || o.service, new Date(), 0)
  const total = round2((o.legs || []).reduce((n, l) => n + (l.price?.total || 0), 0))
  o.amountDue = total
  o.price = { ...(o.price || {}), total }
  // 起步价按实际里程算，订单级 km 同步
  o.km = round1((o.legs || []).reduce((n, l) => n + (l.km || 0), 0))
}

// 跨区订单在本程中途下车 / 改站：本程结束在所选站点，后续各程不再运行。
//   dropNext = true  → 同时取消已经自动呼叫的第二程车辆，未乘坐的后续程不计费
//   dropNext = false → 第二程的车已无法取消（距边界站点 < 1 分 20 秒），车费保留在结算单里
function endEarly(orderId, stopId, dropNext) {
  const rt = state.runtimes.get(orderId)
  if (!rt) return null
  const o = rt.order
  const v = state.vehicles.find((x) => x.id === rt.vehicleId)
  const target = stopById(stopId)
  if (!target) return null
  const rest = (o.legs || []).slice((o.legIdx || 0) + 1)

  if (rt.next) {
    const nv = state.vehicles.find((x) => x.id === rt.next.vehicleId)
    if (nv) nv.status = 'idle'
    rt.next = null
    rt.nextXY = null
    rt.flags.nextCalled = false
  }
  const rec = state.routes.get(orderId)
  if (rec) {
    rec.next = null
    emit({ type: 'route', orderId, paths: { ...rec } })
  }

  for (const l of rest) {
    l.status = dropNext ? 'dropped' : 'charged'
    l.vehicleId = null
    l.plate = null
  }
  o.legs = (o.legs || []).slice(0, (o.legIdx || 0) + 1)
  const leg = o.legs[o.legIdx || 0]
  if (leg) {
    leg.toId = stopId
    leg.status = 'riding'
    repriceLeg(o, leg, routeKm(stopById(leg.fromId), target))
  }
  o.toId = stopId
  o.earlyAlight = true
  if (dropNext) {
    o.droppedLegs = rest.map((l) => ({ line: l.line, km: l.km, service: l.service, price: l.price }))
    o.amountDue = round2(o.legs.reduce((n, l) => n + (l.price?.total || 0), 0))
    o.price = { ...(o.price || {}), total: o.amountDue }
  } else {
    // 第二程的车已经出发，钱照付：金额不动，只在明细里标出「已计费未乘坐」
    o.carriedLegs = rest.map((l) => ({ line: l.line, km: l.km, service: l.service, price: l.price }))
  }

  if (v) {
    rt.target = { ...target }
    rt.path = streetPath({ x: v.x, y: v.y }, rt.target)
    rt.traveled = 0
  }
  clearLockedDest(orderId)
  rt.flags.destSoon = false
  rt.flags.destDone = false
    rt.flags.sideDropDone = false
  o.routeStopIds = rt.path ? stopsOnPolyline(rt.path).map((x) => x.id) : []
  emitTrip(orderId)
  return snapshot(orderId)
}

// 结束行程：进入「待支付」，不再像以前那样下车即结算完成
function finishRide(orderId, actualStop, actualKm, mode = 'stop') {
  const rt = state.runtimes.get(orderId)
  if (!rt) return null
  const v = state.vehicles.find((x) => x.id === rt.vehicleId)
  const o = rt.order
  o.actualAlightId = actualStop.id || null
  o.actualAlightName = actualStop.name
  o.alightMode = mode
  o.actualKm = actualKm
  o.status = 'settled'
  o.alightTime = fmtTime()
  o.durationMin = Math.max(1, Math.round(etaMin(actualKm)))
  o.amountDue = round2(o.price?.total ?? 0)
  if (v) {
    v.onboard = Math.max(0, v.onboard - 1)
    o.onboard = v.onboard
    const idx = v.riders.findIndex((r) => r.toId === o.toId)
    if (idx >= 0) v.riders.splice(idx, 1)
    v.status = 'idle'
  }
  const leg = curLeg(o)
  if (leg) leg.status = 'done'
  state.settled.set(orderId, o)
  // 运行态到此为止：再让它跑下去，tick 会把已经 settled 的订单重新判成「即将到达」
  state.runtimes.delete(orderId)
  state.routes.delete(orderId)
  emit({ type: 'trip', order: snapshot0(o) })
  return snapshot0(o)
}
