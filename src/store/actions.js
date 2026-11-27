// 业务动作：所有用户操作经由此处调用 API 并更新状态
import { STOPS, areaOfPoint, stopById } from '../data/config.js'
import { toLngLat } from '../data/geo.js'
import { api } from '../services/api.js'
import { sim } from '../services/sim.js'
import { drivingRoute, drivingRouteStops } from '../services/roadRoute.js'
import { buildOrderContext, chatStream } from '../services/support.js'
import { internal } from './store.js'

const { setState, getState } = internal
let toastSeq = 0
// 已经为哪几笔订单取过第二程路线（避免每帧 trip 事件都重算）
const nextRouteLocks = new Set()

export function toast(text, kind = 'info') {
  const id = ++toastSeq
  setState((s) => ({ ...s, toasts: [...s.toasts, { id, text, kind }] }))
  setTimeout(() => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }))
  }, 2600)
}

// ---- 初始化：注册模拟引擎事件 ----
export function initStore() {
  sim.init()
  internal.hydrate()
  sim.onEvent((evt) => {
    if (evt.type === 'match') {
      const cur = getState().match
      if (cur.quoteId === evt.quote.id) {
        setState((s) => ({
          ...s,
          match: {
            ...s.match,
            status: evt.quote.status,
            quote: { ...evt.quote },
            // 排除列表已经试遍、sim 回到全车队重算时，这里同步清空
            exclude: evt.quote.exhausted ? [] : s.match.exclude || [],
          },
        }))
      }
    } else if (evt.type === 'trip' && evt.order) {
      const o = evt.order
      setState((s) => ({
        ...s,
        activeOrder: s.activeOrder && s.activeOrder.id === o.id ? { ...s.activeOrder, ...o } : s.activeOrder,
        orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? { ...x, ...o } : x)) : [o, ...s.orders],
      }))
      // 到换乘站：把地图切到第二程（第二程的车 + 第二程的路线）
      if (o.status === 'transfer_wait' && !nextRouteLocks.has(o.id)) {
        nextRouteLocks.add(o.id)
        lockNextDest(o)
      }
      if (o.status === 'riding' || o.status === 'settled' || o.status === 'completed') nextRouteLocks.delete(o.id)
    } else if (evt.type === 'route') {
      // 高德真实导航路线锁定完成：只在这里更新一次，行程内不再变化
      const cur = getState().activeOrder
      if (cur && cur.id === evt.orderId) setState((s) => ({ ...s, activeRoute: evt.paths }))
    } else if (evt.type === 'fleet') {
      setState((s) => ({ ...s, fleet: evt.fleet }))
    }
  })
  setState((s) => ({ ...s, fleet: sim.fleetSnapshot() }))
}

// ---- 定位授权（PRD：须向用户请求授权；拒绝后由用户自行填写）----
export async function grantLocation() {
  const res = await api.authorizeLocation()
  if (res.granted) {
    const nearest = nearestBoarding(res.location)
    setState((s) => ({
      ...s,
      user: { ...s.user, locationPermission: 'granted', location: res.location },
      trip: { ...s.trip, fromId: nearest.id },
    }))
    toast(
      res.location?.source === 'gps'
        ? `定位成功，已自动匹配最近上车点「${nearest.name}」`
        : res.location?.source === 'ip'
          ? `已按网络定位匹配最近上车点「${nearest.name}」，可点地图微调`
          : `已按默认位置匹配最近上车点「${nearest.name}」，可点地图重新定位`,
    )
  }
  return res
}

export function denyLocation() {
  setState((s) => ({ ...s, user: { ...s.user, locationPermission: 'denied' } }))
  toast('定位未授权，请手动输入上车点', 'warn')
}

function nearestBoarding(loc) {
  let best = null
  let bd = Infinity
  for (const s of STOPS) {
    if (s.type !== 'both') continue
    const d = Math.hypot(s.x - loc.x, s.y - loc.y)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}

// ---- OD 选择 ----
// 每次「用户主动选点」都把 pickSeq 加一：
//   ① 首页靠它触发「起终点齐了立刻跳转」，选同一个终点（值没变）也能再跳一次；
//   ② 顺带把上一次的行程分段（legs）清空，避免沿用旧的两程结构。
function pickTrip(trip, patch) {
  return { ...trip, ...patch, legs: null, pickSeq: (trip.pickSeq || 0) + 1 }
}

export function setFrom(stopId) {
  setState((s) => ({ ...s, trip: pickTrip(s.trip, { fromId: stopId }) }))
}

// 清空终点：离开首页（去匹配页 / 订单 / 我的）之后再回来，终点框不能还留着上一次的站点。
// 只清终点，上车点保留（用户下次出门大概率还是从同一个站上车）。
export function clearTripDest() {
  setState((s) => ({
    ...s,
    trip: { ...s.trip, toId: null, legs: null, outOfRegion: false, notice: '' },
  }))
}

// 选择终点：站点直接选；POI 在区域外时推荐最近下车点（PRD 规则 1）
export function setDestStop(stopId) {
  setState((s) => ({ ...s, trip: pickTrip(s.trip, { toId: stopId, outOfRegion: false, notice: '' }) }))
}

export function setDestPoi(poi) {
  const area = areaOfPoint(poi, 3)
  if (area) {
    const stop = poi.stopId ? stopById(poi.stopId) : nearestStopOf(poi)
    setState((s) => ({ ...s, trip: pickTrip(s.trip, { toId: stop.id, outOfRegion: false, notice: '' }) }))
    return
  }
  // 终点超出服务范围：推荐区域内最近的落客点
  const nearest = nearestStopOf(poi)
  setState((s) => ({
    ...s,
    trip: pickTrip(s.trip, { toId: nearest.id, outOfRegion: true, notice: '终点超出服务范围，已为您推荐最近下车点' }),
  }))
}

function nearestStopOf(p) {
  let best = null
  let bd = Infinity
  for (const s of STOPS) {
    if (s.hidden) continue
    const d = Math.hypot(s.x - p.x, s.y - p.y)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}

// ---- 匹配 ----
// 选择运营模式（专属 / 效率）——在匹配页的服务类型面板里确认
export function setService(service) {
  setState((s) => ({ ...s, trip: { ...s.trip, service } }))
}

export function requestMatch(service, legs) {
  const { trip } = getState()
  const segs = legs || trip.legs || []
  const leg0 = segs[0]
  const fromId = leg0?.fromId || trip.fromId
  const toId = leg0?.toId || trip.toId
  if (!fromId || !toId) return null
  const mode = service || trip.service || 'standard'
  const quote = api.requestMatch({ fromId, toId, service: mode, legs: segs })
  setState((s) => ({
    ...s,
    trip: { ...s.trip, service: mode, legs: segs },
    match: { quoteId: quote.id, status: quote.status, quote: { ...quote }, exclude: [] },
  }))
  return quote
}

export function cancelMatch() {
  const { match } = getState()
  if (match.quoteId) api.cancelMatch(match.quoteId)
  setState((s) => ({ ...s, match: { quoteId: null, status: 'idle', quote: null, exclude: [] } }))
}

// 换一辆：不改变派单规则，只是把当前这辆车加进「不再派给它」的列表后重新匹配。
// 排除列表把车队试遍时 sim 会自动回到全车队重算（quote.exhausted），排列表随之清空。
export function rematch() {
  const { match, trip } = getState()
  const segs = trip.legs || []
  const leg0 = segs[0]
  const fromId = leg0?.fromId || trip.fromId
  const toId = leg0?.toId || trip.toId
  if (!fromId || !toId) return null
  const cur = match.quote?.match?.vehicleId
  const exclude = [...new Set([...(match.exclude || []), ...(cur ? [cur] : [])])]
  const mode = trip.service || 'standard'
  if (match.quoteId) api.cancelMatch(match.quoteId)
  const quote = api.requestMatch({ fromId, toId, service: mode, legs: segs, exclude })
  setState((s) => ({
    ...s,
    match: { quoteId: quote.id, status: quote.status, quote: { ...quote }, exclude },
  }))
  return quote
}

// ---- 呼叫 / 支付 / 取消 ----
// 呼叫即派单：本平台改为「行程结束后统一支付」，创建订单不再跳支付页
export function callVehicle() {
  const { match } = getState()
  if (!match.quote || match.quote.status !== 'matched') return null
  const order = api.createOrder(match.quote.id)
  if (!order) return null
  setState((s) => ({
    ...s,
    activeOrder: order,
    activeRoute: { pickup: null, dest: null },
    // sim 在 createOrder 里已经推过一次 trip 事件，这里去重，避免同一个订单出现两条
    orders: [order, ...s.orders.filter((o) => o.id !== order.id)],
    match: { quoteId: null, status: 'idle', quote: null },
    // 呼叫成功后立刻清掉终点：回到首页时只剩「上车点」（定位匹配的那一站），
    // 否则下次回来两个框都还带着上一单的终点，选完新终点也不会再自动跳确认页。
    trip: { ...s.trip, toId: null, legs: null, outOfRegion: false, notice: '' },
  }))
  // 目的地明确后就把「当前段上车点 → 本段下车点」的真实路线取好
  lockDest(order)
  lockPickup(order)
  return order
}

// 行程结束后的统一支付
export async function payOrder(method) {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.payOrder(activeOrder.id, method)
  if (!snap) return null
  setState((s) => ({
    ...s,
    activeOrder: { ...s.activeOrder, ...snap },
    orders: s.orders.map((o) => (o.id === snap.id ? { ...o, ...snap } : o)),
  }))
  return snap
}

export function cancelOrder() {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.cancelOrder(activeOrder.id)
  if (!snap) return null
  setState((s) => ({
    ...s,
    activeOrder: null,
    activeRoute: null,
    orders: s.orders.map((o) => (o.id === snap.id ? { ...o, ...snap } : o)),
  }))
  return snap
}

// ---- 核销 / 改站 / 提前下车 ----
// 返回 null 表示核销被拒（如车辆还没到站），调用方据此提示用户
export function verifyBoard() {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const before = activeOrder.legIdx || 0
  const snap = api.verifyBoard(activeOrder.id)
  if (!snap) return null
  patchOrder(snap)
  // 换乘成功（进入第二程）：重新锁定第二段的真实路线
  if ((snap.legIdx || 0) !== before) {
    setState((s) => ({ ...s, activeRoute: { pickup: null, dest: null } }))
    lockDest(snap)
  }
  return snap
}

export function verifyAlight() {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.verifyAlight(activeOrder.id)
  patchOrder(snap)
  return snap
}

// 专属服务：在车辆当前位置就近下车（不受预设站点约束）
// 与「刷码下车」同一口径：只把订单补成 completed，activeOrder 交给评价页提交后再清空，
// 否则行程页守卫会先看到 activeOrder=null 而把人弹回首页。
export function alightHereNow() {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.alightHere(activeOrder.id)
  patchOrder(snap)
  return snap
}

export function changeDest(toId, opts) {
  const { activeOrder } = getState()
  if (!activeOrder) return
  patchOrder(api.changeDest(activeOrder.id, toId, opts))
  relockDest(activeOrder.id)
}

export function earlyAlight(stopId, opts) {
  const { activeOrder } = getState()
  if (!activeOrder) return
  patchOrder(api.earlyAlight(activeOrder.id, stopId, opts))
  relockDest(activeOrder.id)
}

// 还来得及走到马路对面：改上车站台（规则 1 的提示落地为一次点击）
export function changePickup(stopId) {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.changePickup(activeOrder.id, stopId)
  patchOrder(snap)
  const o = getState().activeOrder
  if (o) lockPickup(o)
  return snap
}

// 换乘前取消已自动呼叫的第二程（距边界站点 2:00–1:20 之间可取消）
export function cancelNextLeg() {
  const { activeOrder } = getState()
  if (!activeOrder) return null
  const snap = api.cancelNextLeg(activeOrder.id)
  patchOrder(snap)
  return snap
}

export function ackPopup(which) {
  const { activeOrder } = getState()
  if (activeOrder) api.ackPopup(activeOrder.id, which)
}

function patchOrder(snap) {
  if (!snap) return
  setState((s) => ({
    ...s,
    activeOrder: s.activeOrder && s.activeOrder.id === snap.id ? { ...s.activeOrder, ...snap } : s.activeOrder,
    orders: s.orders.map((o) => (o.id === snap.id ? { ...o, ...snap } : o)),
  }))
}

// ---- 路线锁定（高德真实驾车导航）----
// 目的：地图上的预估路线一旦算出就不再变化，且严格遵守单行线 / 禁转，
// 不再使用站间路网的双向 Dijkstra（那条路会拼出逆行单行段的折线）。
// 跨区分段行程只锁「当前这一段」：第一程到边界站点，换乘后再锁第二程。
function currentLeg(order) {
  return order?.legs?.[order.legIdx || 0] || null
}

function lockDest(order) {
  const leg = currentLeg(order)
  const a = stopById(leg?.fromId || order.fromId)
  const b = stopById(leg?.toId || order.toId)
  if (!a || !b) return
  drivingRouteStops(a, b).then((r) => {
    if (r?.pts?.length) api.setDestRoute(order.id, r.pts)
  })
}

// 第二程路线：边界站点 → 最终目的地（换乘等待期间画在地图上）
function lockNextDest(order) {
  const leg = order?.legs?.[(order.legIdx || 0) + 1]
  if (!leg) return
  const a = stopById(leg.fromId)
  const b = stopById(leg.toId)
  if (!a || !b) return
  drivingRouteStops(a, b).then((r) => {
    if (r?.pts?.length) api.setNextRoute(order.id, r.pts)
  })
}

function lockPickup(order) {
  const a = stopById(order.fromId)
  const pos = order.vehiclePos
  if (!a || !pos) return
  drivingRoute(toLngLat(pos), toLngLat(a)).then((r) => {
    if (r?.pts?.length) api.setPickupRoute(order.id, r.pts)
  })
}

// 改站 / 提前下车：目的地变了，需要以车辆当前位置为起点重新取一次真实导航
function relockDest(orderId) {
  const st = getState()
  const o = st.activeOrder?.id === orderId ? st.activeOrder : st.orders.find((x) => x.id === orderId)
  if (!o?.vehiclePos) return
  const b = stopById(o.toId)
  if (!b) return
  drivingRoute(toLngLat(o.vehiclePos), toLngLat(b)).then((r) => {
    if (r?.pts?.length) api.setDestRoute(orderId, r.pts)
  })
}

// 进入行程页时补齐已锁定的路线（事件早于页面挂载的情况）
export function ensureRoute() {
  const { activeOrder, activeRoute } = getState()
  if (!activeOrder || activeRoute?.dest || activeRoute?.pickup) return
  const r = api.getRoute(activeOrder.id)
  if (r?.dest || r?.pickup) setState((s) => ({ ...s, activeRoute: { ...r } }))
  else if (activeOrder.vehiclePos) lockPickup(activeOrder)
}

// ---- 评价 ----
export async function submitRating(rating) {
  const { activeOrder } = getState()
  if (!activeOrder) return
  await api.submitRating(activeOrder.id, rating)
  setState((s) => ({
    ...s,
    activeOrder: null,
    activeRoute: null,
    orders: s.orders.map((o) => (o.id === activeOrder.id ? { ...o, rating } : o)),
    user: { ...s.user, prefs: { ...s.user.prefs, rides: s.user.prefs.rides + 1 } },
  }))
}

// ---- 发票 ----
export async function requestInvoice(orderId, email) {
  const res = await api.requestInvoice(orderId, email)
  setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, invoiceEmail: email } : o)) }))
  return res
}

// ---- 客服（AI 智能客服，流式）----
let supportAbort = null
let supportSeq = 0

const uid = () => `s${Date.now().toString(36)}${(supportSeq++).toString(36)}`

function patchMsg(id, patch) {
  setState((s) => ({
    ...s,
    service: { ...s.service, msgs: s.service.msgs.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) },
  }))
}

export function openService(orderId) {
  const s = getState()
  const o = orderId ? s.orders.find((x) => x.id === orderId) : null
  setState((st) => ({
    ...st,
    service: {
      msgs: [
        {
          id: uid(),
          role: 'bot',
          text: o
            ? `我是小云朵，云乘见的智能客服。已经看到你要咨询的订单 ${o.id}（${stopById(o.fromId)?.name || ''} → ${stopById(o.actualAlightId || o.toId)?.name || ''}），说说你遇到的问题，我会按平台规则解释给你听。`
            : '我是小云朵，云乘见的智能客服。关于计价、取消退款、改站、乘车码、发票、失物招领这些平台规则，或者你某一笔订单的疑问，都可以问我。',
          refs: [],
          quotes: [],
        },
      ],
      human: false,
      orderId: orderId || null,
      staff: false,
      pending: false,
    },
  }))
}

// 切换「正在咨询哪一笔订单」：不动对话，只换上下文
export function setServiceOrder(orderId) {
  const s = getState()
  const o = orderId ? s.orders.find((x) => x.id === orderId) : null
  setState((st) => ({
    ...st,
    service: {
      ...st.service,
      orderId: orderId || null,
      msgs: [
        ...st.service.msgs,
        {
          id: uid(),
          role: 'sys',
          text: o ? `已切换咨询订单：${o.id}（${stopById(o.fromId)?.name || ''} → ${stopById(o.actualAlightId || o.toId)?.name || ''}）` : '已取消订单关联，接下来按通用规则回答',
        },
      ],
    },
  }))
}

export function stopSupport() {
  if (supportAbort) {
    supportAbort.abort()
    supportAbort = null
  }
  setState((s) => ({
    ...s,
    service: {
      ...s.service,
      pending: false,
      msgs: s.service.msgs.map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m)),
    },
  }))
}

export async function serviceSend(text) {
  const s0 = getState()
  const q = String(text || '').trim()
  if (!q || s0.service.pending) return
  const orderId = s0.service.orderId
  const botId = uid()

  // 人工模式：不再走模型，只把消息记进工单
  if (s0.service.human) {
    setState((s) => ({
      ...s,
      service: {
        ...s.service,
        msgs: [
          ...s.service.msgs,
          { id: uid(), role: 'me', text: q },
          { id: botId, role: 'bot', text: '已补充到人工工单里。人工客服接入后会看到这段对话与订单上下文，请稍候。', refs: [], quotes: [], human: true },
        ],
      },
    }))
    return
  }

  const history = s0.service.msgs
    .filter((m) => m.role === 'me' || (m.role === 'bot' && !m.streaming))
    .map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }))

  setState((s) => ({
    ...s,
    service: {
      ...s.service,
      pending: true,
      msgs: [
        ...s.service.msgs,
        { id: uid(), role: 'me', text: q },
        { id: botId, role: 'bot', text: '', streaming: true, refs: [], quotes: [], model: null },
      ],
    },
  }))

  const ac = new AbortController()
  supportAbort = ac
  let acc = ''
  let refs = []
  let quotes = []

  try {
    const fin = await chatStream({
      question: q,
      orderId,
      orders: buildOrderContext(getState().orders, orderId),
      history,
      signal: ac.signal,
      onMeta: (m) => {
        refs = m.refs || []
        quotes = m.orderCards || []
        patchMsg(botId, { refs, quotes })
      },
      onModel: (model) => patchMsg(botId, { model }),
      onDelta: (t) => {
        acc += t
        patchMsg(botId, { text: acc.replace(/\[\[HUMAN\]\]/g, '').trimEnd() })
      },
    })

    const needsHuman = /\[\[HUMAN\]\]/.test(acc) || /(转人工|人工核实|需要人工)/.test(acc) && !!fin?.degraded
    const clean = acc.replace(/\[\[HUMAN\]\]/g, '').trim()
    // 有没有真的引用过依据：没引用就打个"仅参考"标记，并给一键转人工
    const cited = /【(K|O)\d+】/.test(clean)
    patchMsg(botId, {
      text: clean || '（没有拿到回复，请重试或转人工）',
      streaming: false,
      refs,
      quotes,
      cited,
      degraded: !!fin?.degraded,
      model: fin?.model || getState().service.msgs.find((m) => m.id === botId)?.model || null,
      escalate: needsHuman || !cited,
    })

    if (needsHuman) registerHuman()
  } catch (e) {
    const aborted = e?.name === 'AbortError'
    patchMsg(botId, {
      text: aborted ? acc.replace(/\[\[HUMAN\]\]/g, '').trim() || '（已停止生成）' : `客服服务暂时不可用：${e.message}。你可以稍后重试，或点右上角转人工。`,
      streaming: false,
      error: !aborted,
    })
  } finally {
    supportAbort = null
    setState((s) => ({ ...s, service: { ...s.service, pending: false } }))
  }
}

function registerHuman() {
  const s = getState()
  if (s.service.human) return
  const no = `GS${Date.now().toString().slice(-8)}`
  setState((st) => ({
    ...st,
    service: {
      ...st.service,
      human: true,
      msgs: [
        ...st.service.msgs,
        {
          id: uid(),
          role: 'sys',
          text: `已登记人工工单 ${no}，工作时间 09:00–21:00 内由人工客服接入，工单里带上了本次对话与订单上下文。演示环境不会真实派单，仅供流程展示。`,
        },
      ],
    },
  }))
}

export function escalateSupport() {
  const s = getState()
  setState((st) => ({
    ...st,
    service: {
      ...st.service,
      msgs: [...st.service.msgs, { id: uid(), role: 'sys', text: '正在为你转接人工客服…' }],
    },
  }))
  if (!s.service.human) registerHuman()
}

export function feedbackSupport(msgId, ok) {
  patchMsg(msgId, { feedback: ok ? 'up' : 'down' })
  if (!ok) {
    toast('已记录，点右上角「转人工」可让客服复核这条回答', 'warn')
  }
}

export function resetSupport() {
  if (supportAbort) supportAbort.abort()
  openService(null)
}

export function contactStaff() {
  openService(null)
  setTimeout(() => escalateSupport(), 60)
}

