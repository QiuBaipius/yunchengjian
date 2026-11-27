// 行程分段（同区直达 / 跨区换乘）与实时接驾预估
//
// 运营规则：X1、X2 是两条独立线路，正常情况下一单只走一条线。
// 跨区（起点在一条线、终点在另一条线）时，必须经过一个「边界站点」——
// 指两条线路同时停靠的站点（config.js 的 INTERCHANGES）。
// 我们把一单拆成两段：起点 → 边界站点（线路 A）、边界站点 → 终点（线路 B），
// 用户在确认窗口看到这条预计路径，可以换一个边界站点。
import { INTERCHANGES, STOPS, UNITS_PER_KM, stopById } from '../data/config.js'
import { areaOfPoint } from '../data/config.js'
import { routeKm } from './routing.js'

export const SHUTTLE_KM_PER_MIN = 0.5 // 运营速度 ≈ 30 km/h
const TRANSFER_WALK_MIN = 2 // 同站换乘的步行 + 候车

export function lineOfStop(s) {
  if (!s) return 'X1'
  // 站台可能有两条线都停（边界共站、地铁站出入口跟 base 同站），
  // 优先按 lines 判；只有没写 lines 的老数据才退回 areaId。
  if (Array.isArray(s.lines) && s.lines.length) return s.lines.includes('X2') && s.lines.includes('X1') ? 'X2' : s.lines[0]
  return s.areaId === 'a2' ? 'X2' : 'X1'
}

export function areaIdOfStop(s) {
  if (!s) return 'a1'
  if (Array.isArray(s.lines) && s.lines.includes('X2') && !s.lines.includes('X1')) return 'a2'
  return s.areaId || 'a1'
}

// 起终点是否跨线（跨区）
export function isCrossLine(fromId, toId) {
  const a = stopById(fromId)
  const b = stopById(toId)
  if (!a || !b) return false
  return areaIdOfStop(a) !== areaIdOfStop(b)
}

// 边界站点候选：按「起点→边界站 + 边界站→终点」的总里程排序
// 每个候选同时给出两段里程、总里程与含换乘的预计总用时，换站时能直接比出代价
export function interchangeCandidates(fromId, toId) {
  const a = stopById(fromId)
  const b = stopById(toId)
  if (!a || !b) return []
  return INTERCHANGES.map((t) => {
    const km1 = routeKm(a, t)
    const km2 = routeKm(t, b)
    return {
      id: t.id,
      name: t.name,
      line1: lineOfStop(a),
      line2: lineOfStop(b),
      km1: Math.round(km1 * 10) / 10,
      km2: Math.round(km2 * 10) / 10,
      km: Math.round((km1 + km2) * 10) / 10,
      min: totalMin([{ km: km1 }, { km: km2 }], TRANSFER_WALK_MIN),
    }
  }).sort((x, y) => x.km - y.km)
}

/**
 * 生成行程分段。
 * @returns {{
 *   cross: boolean,
 *   legs: Array<{ line: string, fromId: string, toId: string, km: number }>,
 *   transferId: string|null,
 *   transferName: string|null,
 *   candidates: Array<{ id, name, km, km1, km2 }>,
 *   transferMin: number,
 * }}
 */
export function buildItinerary({ fromId, toId, transferId } = {}) {
  const a = stopById(fromId)
  const b = stopById(toId)
  if (!a || !b) return { cross: false, legs: [], transferId: null, transferName: null, candidates: [], transferMin: 0 }

  const cross = areaIdOfStop(a) !== areaIdOfStop(b)
  if (!cross) {
    return {
      cross: false,
      legs: [{ line: lineOfStop(a), fromId, toId, km: Math.round(routeKm(a, b) * 10) / 10 }],
      transferId: null,
      transferName: null,
      candidates: [],
      transferMin: 0,
    }
  }

  const candidates = interchangeCandidates(fromId, toId)
  const pick = candidates.find((c) => c.id === transferId) || candidates[0]
  if (!pick) {
    // 理论上不会发生：两条线由同一条边界相接，一定有共站
    return {
      cross: true,
      legs: [
        { line: lineOfStop(a), fromId, toId, km: Math.round(routeKm(a, b) * 10) / 10 },
      ],
      transferId: null,
      transferName: null,
      candidates: [],
      transferMin: 0,
    }
  }
  return {
    cross: true,
    legs: [
      { line: lineOfStop(a), fromId, toId: pick.id, km: pick.km1 },
      { line: lineOfStop(b), fromId: pick.id, toId, km: pick.km2 },
    ],
    transferId: pick.id,
    transferName: pick.name,
    candidates,
    transferMin: TRANSFER_WALK_MIN,
  }
}

// ---- 实时接驾预估 ----
// 依据当前车队位置计算「最近一辆同线路车辆到上车点还要几分钟」，
// 车在动，所以这个数字会随时间变化（界面每 10 秒随车队快照刷新）。
export function pickupEtaMin(fromId, line, fleet = [], service = 'standard') {
  const from = stopById(fromId)
  if (!from) return null
  const pool = fleet.filter((v) => !line || v.lineId === line)
  if (!pool.length) return null
  let best = Infinity
  for (const v of pool) {
    const d = Math.hypot(v.x - from.x, v.y - from.y) / UNITS_PER_KM
    if (d < best) best = d
  }
  const min = Math.max(1, Math.ceil(best / SHUTTLE_KM_PER_MIN))
  // 专属服务只接空车：车少，等待通常更长
  return service === 'exclusive' ? Math.max(min, 3) : min
}

// 空车数量（专属服务用）
export function idleCount(fleet = [], line) {
  return fleet.filter((v) => v.onboard === 0 && (!line || v.lineId === line)).length
}

// 运营区（按站点归属）
export function areaOfStop(s) {
  return areaOfPoint(s, 2)
}

// 行程总里程
export function totalKm(legs = []) {
  return Math.round(legs.reduce((n, l) => n + (l.km || 0), 0) * 10) / 10
}

// 行程总时长估算（行驶 + 换乘）
export function totalMin(legs = [], transferMin = 0) {
  const ride = legs.reduce((n, l) => n + (l.km || 0) / SHUTTLE_KM_PER_MIN, 0)
  return Math.max(2, Math.round(ride + transferMin + (legs.length > 1 ? 1 : 0)))
}

// 站名（供文案拼接）
export function nameOf(stopId) {
  return stopById(stopId)?.name || ''
}

export const ALL_STOPS = STOPS
