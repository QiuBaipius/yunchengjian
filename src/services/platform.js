// 站台（路侧）规则
//
// 一个公交站其实是「路两侧各一个站台」，一个站台只能被某个方向的车停靠：
// 中国靠右行驶，车行方向的**右手侧**才是能停靠的一侧。
// 屏坐标 x 向东、y 向南，所以车行方向 d 的右手侧 = (-dy, dx)。
//
//   · 路北站台 → 右手侧朝北 → 只服务「向西」的车（车从东边来）
//   · 路南站台 → 只服务「向东」的车
//   · 路东站台 → 只服务「向北」的车
//   · 路西站台 → 只服务「向南」的车
//
// 由此得到两条运行规则（抽象自用户给的「轻工学校 → 黑石礁」示例）：
//
//   规则 1（上车侧匹配）
//     派到的车按它到站的方向判断能不能停在你选的这一侧。
//     不能停 → 提示你走到对侧站台候车（只提示，不给你换侧的按钮：
//     站台是乘客自己选的，车不会为一个人掉头，乘客必须过街到对侧）。
//     例：你在「轻工学校（路北）」，车自西向东开来（向东行驶，右手侧是南），
//         停不了路北 → 提示去「轻工学校（路南）」；
//         车自东向西开来（右手侧是北）→ 正好停路北，不提示。
//
//   规则 2（下车侧顺路）
//     下车后车上还有人要送，车必须接着往那位乘客的方向走，
//     这时只能在「顺路侧」落客：你选的侧顺路就停你选的侧，
//     不顺路就停到对侧（不会为了你一个人掉头逆行）。
//     如果本单是车上最后一位乘客，车没有后续方向约束，可以直接停你选的那一侧。
import { stopById } from '../data/config.js'

// 各侧法线（由道路中心指向站台）
const NORMAL = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }
const SIDE_TXT = { N: '路北', S: '路南', E: '路东', W: '路西' }
const COMPASS = ['东', '东北', '北', '西北', '西', '西南', '南', '东南']
const OPP = { 东: '西', 西: '东', 南: '北', 北: '南', 东北: '西南', 西南: '东北', 西北: '东南', 东南: '西北' }

// 车行方向的右手侧单位向量
export function rightOf(d) {
  return { x: -d.y, y: d.x }
}

// 两点之间的单位方向
export function dirOf(a, b) {
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  return L > 0.001 ? { x: dx / L, y: dy / L } : null
}

// 方向 → 方位名（东 / 东北 / 北 / …）
export function compassOf(d) {
  if (!d) return ''
  const ang = (Math.atan2(-d.y, d.x) * 180) / Math.PI // 0 = 东，90 = 北
  const i = ((Math.round(ang / 45) % 8) + 8) % 8
  return COMPASS[i]
}

// 「自西向东」这样的口语描述
export function dirText(d) {
  const c = compassOf(d)
  return c ? `自${OPP[c]}向${c}` : ''
}

// 站台是否服务这个车行方向（右手侧与站台法线同侧）
export function serves(stop, heading) {
  if (!stop?.side || !heading) return true
  const n = NORMAL[stop.side]
  if (!n) return true
  const r = rightOf(heading)
  const dot = r.x * n.x + r.y * n.y
  // dot ≈ 0 说明车是横穿路口拐进来的，判断不了停哪一侧 —— 宁可不提示，也不要来回翻
  return dot > -0.35
}

// 进站方向：取路线最后约 22 m 的走向。
// 不能用「车 → 站」的直线方向——车可能从北边的小路一路南下，直线方向是南，
// 而它真正进站时是在黄浦路上向东/向西，两者会得出完全相反的结论。
export function approachDir(pts) {
  if (!pts || pts.length < 2) return null
  const end = pts[pts.length - 1]
  for (let i = pts.length - 2; i >= 0; i--) {
    const dx = end.x - pts[i].x
    const dy = end.y - pts[i].y
    const d = Math.hypot(dx, dy)
    if (d >= 0.85) return { x: dx / d, y: dy / d } // 0.85 单位 ≈ 21 m
  }
  return null
}

function twinOf(stop) {
  if (!stop) return null
  return stop.twin ? stopById(stop.twin) : null
}

// 规则 1：上车侧匹配
// approach = 车辆进站方向（车 → 站台）
export function pickupCheck(stop, approach) {
  if (!stop || !stop.side || !approach) return { ok: true }
  if (serves(stop, approach)) return { ok: true }
  const twin = twinOf(stop)
  const right = SIDE_TXT[stop.side]
  const oppSide = twin?.sideTxt || (stop.side === 'N' ? '路南' : stop.side === 'S' ? '路北' : stop.side === 'E' ? '路西' : '路东')
  const body = `${dirText(approach)}驶来，车辆停在${oppSide}一侧，本站台在${right}（对向车道）`
  return {
    ok: false,
    twinId: twin?.id || null,
    twinName: twin?.name || `${stop.rawName || stop.name}（${oppSide}）`,
    sideTxt: right,
    dirTxt: dirText(approach),
    text: twin ? `${body}，请到对面「${twin.name}」候车` : `${body}，请到路对面候车`,
  }
}

// 规则 2：下车侧顺路
// onward = 车送完本乘客后的继续行驶方向（没有后续任务时传 null）
export function dropCheck(stop, onward) {
  if (!stop || !stop.side || !onward) return { stop, changed: false }
  if (serves(stop, onward)) return { stop, changed: false }
  const twin = twinOf(stop)
  if (!twin) return { stop, changed: false }
  return {
    stop: twin,
    changed: true,
    text: `车上还有乘客要送，车辆继续${dirText(onward)}行驶，本站台（${SIDE_TXT[stop.side]}）不顺路，已改为在「${twin.name}」落客`,
  }
}

// 站台展示名（数据里已带后缀，这里只做兜底）
export function platformName(stop) {
  if (!stop) return ''
  if (stop.name) return stop.name
  return stop.sideTxt ? `${stop.rawName}（${stop.sideTxt}）` : stop.rawName
}
