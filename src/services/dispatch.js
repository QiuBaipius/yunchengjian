// 共享派单规则（严格对应 PRD 车辆运行规则 3/4/5）
// 应用内模拟引擎（services/sim.js）使用本模块；算法仿真系统已独立为 ../simlab 工程，
// 其 src/services/dispatch.js 与本文件同源同文（规则改动需同步两份，保证「仿真检验的即为线上算法」）。
//
// 核心算法：**带服务质量约束的可行插入（Cheapest Feasible Insertion, CFI）**
//   —— 这是 DRT / ride-pooling 领域公认的在线求解范式（文献见 ../simlab/src/services/ridepool.js 顶部注释）：
//   · 车辆行程被建模为「服务事件序列」（上车 / 下车），新订单枚举插入到最优位次；
//   · **对车上每一位乘客**（而不是只对首位）逐一校验：乘车里程增加数 ≤ 该乘客自己的 OD 最优路径 × 1/3，
//     时间增加数 ≤ 该乘客自己的 OD 最优路径用时 × 1/3；
//   · 同时校验容量（不允许超员）与新乘客等待上限；
//   · 最后按「加入后原本用时增加最少」选车（PRD 规则 4）。
//
// 与旧版「只看首位乘客绕路 + 夹角」规则的关键差别：
//   1) 距离基准：OD 最优路径（路网最短路，routeKm），不是直线；
//   2) 约束对象：车上每一位乘客 + 新乘客，各自用自己的 OD 预算（不再只看首位乘客）；
//   3) 行程结构：新订单插入最优位次（上车点与下车点可分开插入），而不是固定「先接新客再送首位」；
//   4) 夹角规则被逐人绕路预算取代：后者严格更强、更符合「大方向不绕路」的诉求。
import { DISPATCH, STOPS, stopById } from '../data/config.js'
import { etaMin, routeKm } from './routing.js'

const EPS = 1e-9

// 车上乘客（保留上车顺序，首位 = 最早下车的乘客）
function ridersOf(v, stopOf) {
  const list = v.riders || []
  return list
    .map((r) => {
      if (typeof r === 'object' && r !== null) {
        const from = typeof r.fromId === 'object' ? r.fromId : stopOf(r.fromId)
        const to = typeof r.toId === 'object' ? r.toId : stopOf(r.toId)
        return from && to ? { orderId: r.orderId || r.id, from, to } : null
      }
      // 兼容旧数据：仅有下车点 id
      const to = stopOf(r)
      return to ? { orderId: r, from: null, to } : null
    })
    .filter(Boolean)
}

// 某位乘客的 OD 最优路径里程（无上车站记录时，以「当前位置→下车点」近似）
function odKmOf(rider, v, kmFn) {
  return rider.from ? kmFn(rider.from, rider.to) : kmFn(v, rider.to)
}

// 序列 [起点, s1, s2, ...] 的累计里程前缀和：prefix[k] = 起点到第 k 个站的里程
function prefixDist(seq, kmFn) {
  const acc = new Array(seq.length).fill(0)
  for (let i = 1; i < seq.length; i++) acc[i] = acc[i - 1] + kmFn(seq[i - 1], seq[i])
  return acc
}

// ---- 核心：对一辆车评估「插入新订单」是否可行，并给出增量 ----
// 返回 { ok, incKm, incMin, pickupEtaMin, perRider, reason? }
export function evaluateInsertion(v, from, to, odKm, opts = {}) {
  const kmFn = opts.kmFn || routeKm
  const etaFn = opts.etaFn || etaMin
  const capacity = opts.capacity ?? v.capacity ?? 17
  const detourRatio = opts.detourRatio ?? DISPATCH.detourMileageRatio
  const waitMaxMin = opts.waitMaxMin ?? DISPATCH.maxWaitMin

  // 容量（规则 5：不允许超员）
  if ((v.onboard || 0) + 1 > capacity) return { ok: false, reason: 'capacity' }

  // 新乘客等待上限（PRD：预估等待超过 20min 不匹配）——先做直接里程的廉价剪枝
  const directPickupMin = etaFn(kmFn(v, from))
  if (directPickupMin > waitMaxMin + EPS) return { ok: false, reason: 'wait_too_long', pickupEtaMin: directPickupMin }

  const onboard = ridersOf(v, opts.stopOf || stopById)
  // 效率服务：一程最多上 4 位乘客（含自己）
  if (opts.maxRiders && onboard.length + 1 > opts.maxRiders) return { ok: false, reason: 'stop_limit' }
  const drops = onboard.map((r) => r.to) // 现有乘客下车点（按上车顺序）

  // 旧行程：v → d0 → d1 → ...
  const oldSeq = [v, ...drops]
  const oldPrefix = prefixDist(oldSeq, kmFn)
  const oldTotal = oldPrefix[oldPrefix.length - 1]

  // 枚举新订单 (P=from, D=to) 的插入位次：P 插在第 i 个位置，D 插在第 j 个位置（i ≤ j）
  let best = null
  for (let i = 0; i <= drops.length; i++) {
    for (let j = i; j <= drops.length; j++) {
      const seq = [...drops.slice(0, i), from, ...drops.slice(i, j), to, ...drops.slice(j)]
      const full = [v, ...seq]
      const prefix = prefixDist(full, kmFn)

      // 定位新乘客的 P / D 在序列中的索引
      const pIdx = i + 1
      const dIdx = j + 2 // P 占一位
      // 新乘客实际等待 = 到达其上车点的累计用时（而非直接里程），超时则此插入不可行
      const pickupEtaMin = etaFn(prefix[pIdx])
      if (pickupEtaMin > waitMaxMin + EPS) continue
      const newRide = prefix[dIdx] - prefix[pIdx]
      const newIncrement = newRide - odKm
      if (newIncrement > odKm * detourRatio + EPS) continue // 新乘客绕路超预算

      // 车上每一位乘客：里程增加数 ≤ 自己的 OD 最优路径 × 1/3
      // 逐人校验（按顺序推进，避免同站下车 indexOf 命中错误位置）
      let scan = 1
      const perRiderRows = []
      let allOk = true
      for (let k = 0; k < onboard.length; k++) {
        const rider = onboard[k]
        // 在 full 序列里从 scan 开始找 rider.to
        let dropIdx = -1
        for (let m = scan; m < full.length; m++) {
          if (full[m] === rider.to) { dropIdx = m; scan = m + 1; break }
        }
        if (dropIdx < 0) { allOk = false; break }
        const newRemain = prefix[dropIdx]
        const oldRemain = oldPrefix[k + 1]
        const inc = newRemain - oldRemain
        const direct = odKmOf(rider, v, kmFn)
        if (!(direct > 0) || !isFinite(direct)) { allOk = false; break }
        if (inc > direct * detourRatio + EPS) { allOk = false; perRiderRows.push({ orderId: rider.orderId, inc, direct, ratio: inc / direct }); break }
        perRiderRows.push({ orderId: rider.orderId, inc, direct, ratio: direct ? inc / direct : 0 })
      }
      if (!allOk) continue

      const newTotal = prefix[prefix.length - 1]
      const incKm = newTotal - oldTotal
      const incMin = etaFn(Math.max(0, incKm))
      const cand = {
        incKm,
        incMin,
        pickupEtaMin,
        seq,
        perRider: perRiderRows,
        newPassenger: { incKm: newIncrement, rideKm: newRide, odKm },
      }
      if (!best || cand.incKm < best.incKm - EPS || (Math.abs(cand.incKm - best.incKm) < EPS && cand.pickupEtaMin < best.pickupEtaMin)) {
        best = cand
      }
    }
  }

  if (!best) return { ok: false, reason: 'detour_budget' }
  return { ok: true, ...best }
}

// 单车规则校验（保留旧接口，供可能的调用方使用）
export function checkVehicle(v, from, to, odKm, opts = {}) {
  const r = evaluateInsertion(v, from, to, odKm, opts)
  if (!r.ok) return { ok: false, reason: r.reason, detail: r.pickupEtaMin ?? null }
  return { ok: true }
}

// 规则 4：按「加入后原本用时增加的时间」排序，选出最合适的车辆
// opts.exclusive = true 时走「专属服务」：只接空车、不做拼载插入与绕路预算校验
export function selectBestVehicle(vehicles, from, to, opts = {}) {
  const stopOf = opts.stopOf || stopById
  const kmFn = opts.kmFn || routeKm
  const etaFn = opts.etaFn || etaMin
  const odKm = opts.odKm != null ? opts.odKm : kmFn(from, to)
  const odMin = etaFn(odKm)
  // 这辆车所属线路是否停靠起始站：
  //   站点带 lines 时按线路判断（边界共站两线都能接），否则退回按运营区判断
  const lineServes = (v, stop) => {
    if (!stop) return true
    if (Array.isArray(stop.lines) && v.lineId) return stop.lines.includes(v.lineId)
    if (stop.areaId == null || v.areaId == null) return true
    return v.areaId === stop.areaId
  }

  const candidates = []
  const rejected = []

  if (opts.exclusive) {
    const waitMaxMin = opts.waitMaxMin ?? DISPATCH.maxWaitMin
    for (const v of vehicles) {
      if (v.status !== 'idle' || (v.onboard || 0) > 0) {
        rejected.push({ vehicleId: v.id, reason: v.onboard ? 'vehicle_occupied' : 'vehicle_busy' })
        continue
      }
      if (opts.areaMatch !== false && !lineServes(v, from)) {
        rejected.push({ vehicleId: v.id, reason: 'cross_area' })
        continue
      }
      const pickMin = etaFn(kmFn(v, from))
      if (pickMin > waitMaxMin + EPS) {
        rejected.push({ vehicleId: v.id, reason: 'wait_too_long', detail: pickMin })
        continue
      }
      candidates.push({ v, inc: pickMin, incKm: 0, etaPickupMin: pickMin, perRider: [], exclusive: true })
    }
    candidates.sort((a, b) => a.etaPickupMin - b.etaPickupMin || a.inc - b.inc)
    return { odKm, odMin, candidates, rejected }
  }

  for (const v of vehicles) {
    // 占用 / 跨区 / 满载等硬性淘汰
    if (v.status === 'resting' || v.status === 'reserved' || v.status === 'to_pickup') {
      rejected.push({ vehicleId: v.id, reason: 'vehicle_busy' })
      continue
    }
    if (opts.areaMatch !== false && !lineServes(v, from)) {
      rejected.push({ vehicleId: v.id, reason: 'cross_area' })
      continue
    }
    const r = evaluateInsertion(v, from, to, odKm, {
      stopOf,
      kmFn,
      etaFn,
      capacity: opts.capacity ?? v.capacity,
      detourRatio: opts.detourRatio,
      waitMaxMin: opts.waitMaxMin,
      maxRiders: opts.maxRiders,
    })
    if (!r.ok) {
      rejected.push({ vehicleId: v.id, reason: r.reason, detail: r.pickupEtaMin ?? null })
      continue
    }
    const onboard = ridersOf(v, stopOf)
    candidates.push({
      v,
      inc: onboard.length ? r.incMin : r.pickupEtaMin, // 空车 = 到达乘客用时；有客 = 行程时间增量
      incKm: r.incKm,
      etaPickupMin: r.pickupEtaMin,
      perRider: r.perRider,
    })
  }
  candidates.sort((a, b) => a.inc - b.inc || a.etaPickupMin - b.etaPickupMin)
  return { odKm, odMin, candidates, rejected }
}

// 默认站点池（应用内数据）
export const DEFAULT_STOPS = STOPS
