// API 接口层：前端与后端的唯一通道。
// 当前由内置模拟引擎（sim.js）提供数据；每个方法注释标注了对应生产后端端点，
// 接入真实后端时仅需将方法体替换为 fetch 调用，页面与状态层无需改动。
import { POIS, SEED_MESSAGES, STOPS, LINES, stopById } from '../data/config.js'
import { AREAS } from '../data/config.js'
import { toXY } from '../data/geo.js'
import { loadAMap } from './amapLoader.js'
import { sim } from './sim.js'
import { wgs84ToGcj02 } from './coords.js'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// 模拟用户默认位置（万达广场附近）
// 默认定位：大连高新园区 · 万达广场一带（运营区内）
export const DEFAULT_LOCATION = { x: 121.3, y: 205 }

// 浏览器原生高精度定位（GPS/Wi-Fi/基站融合，精度最高，返回 WGS-84）
// 注意：navigator.geolocation 只在 secure context（https 或 localhost/127.0.0.1）下可用
function browserGeolocate() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'gps' }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
    setTimeout(() => finish(null), 9000)
  })
}

// 高德 IP 定位兜底（精度约城市级，用于原生定位失败时保证流程不断）
async function amapGeolocate() {
  try {
    const AMap = await loadAMap()
    const geo = await new Promise((res) => AMap.plugin('AMap.Geolocation', () => res(new AMap.Geolocation({ enableHighAccuracy: true, timeout: 6000 }))))
    const pos = await new Promise((resolve) => {
      let done = false
      const finish = (v) => {
        if (!done) {
          done = true
          resolve(v)
        }
      }
      geo.getCurrentPosition((status, result) => {
        if (status === 'complete' && result?.position) {
          finish({ lng: +(+result.position.lng).toFixed(6), lat: +(+result.position.lat).toFixed(6) })
        } else finish(null)
      })
      setTimeout(() => finish(null), 7000)
    })
    if (pos && Number.isFinite(pos.lng) && Number.isFinite(pos.lat)) return { ...pos, source: 'ip' }
  } catch {
    /* 忽略，走最终回退 */
  }
  return null
}

// 真实定位：优先浏览器原生 GPS/Wi-Fi 定位（WGS-84 → GCJ-02 → 内部坐标）；
// 拿不到再回退高德 IP 定位；再不行才回退默认位置，保证流程不断。
async function locateNow() {
  // ① 浏览器原生精确定位（最准）
  try {
    const gps = await browserGeolocate()
    if (gps && Number.isFinite(gps.lng) && Number.isFinite(gps.lat)) {
      const [glng, glat] = wgs84ToGcj02(gps.lng, gps.lat)
      const xy = toXY(glng, glat)
      return { ...xy, lng: glng, lat: glat, precise: true, source: gps.source }
    }
  } catch {
    /* 继续回退 */
  }
  // ② 高德 IP 定位
  const ip = await amapGeolocate()
  if (ip) {
    const xy = toXY(ip.lng, ip.lat)
    return { ...xy, lng: ip.lng, lat: ip.lat, precise: false, source: 'ip' }
  }
  // ③ 默认位置
  return { ...DEFAULT_LOCATION, precise: false, source: 'default' }
}

export const api = {
  // POST /v1/location/authorize —— 请求定位授权（小程序 scope.userLocation）
  async authorizeLocation() {
    const loc = await locateNow()
    return { granted: true, location: loc }
  },

  // GET /v1/places?query= —— 地点搜索（预设站点 + POI）
  async searchPlaces(query) {
    await delay(200)
    const q = (query || '').trim()
    if (!q) return []
    const stops = STOPS.filter((s) => !s.hidden && s.name.includes(q)).map((s) => ({
      kind: 'stop', id: s.id, name: s.name, type: s.type, hub: !!s.hub, lines: s.lines, inside: true,
    }))
    const pois = POIS.filter((p) => p.name.includes(q)).map((p) => ({
      kind: 'poi', id: p.id, name: p.name, inside: p.inside, stopId: p.stopId, x: p.x, y: p.y,
    }))
    return [...stops, ...pois]
  },

  // POST /v1/match —— 请求匹配车辆（返回 quote，轮询 match 事件）
  requestMatch(payload) {
    return sim.requestMatch(payload)
  },
  // GET /v1/price-preview —— 与服务端下单同口径的报价（含当前供需调节、按服务类型）
  pricePreview(km, service) {
    return sim.pricePreview(km, service)
  },
  getQuote(quoteId) {
    return sim.getQuote(quoteId)
  },
  cancelMatch(quoteId) {
    sim.cancelQuote(quoteId)
  },

  // POST /v1/orders —— 呼叫车辆
  createOrder(quoteId) {
    return sim.createOrder(quoteId)
  },

  // POST /v1/orders/:id/pay
  payOrder(orderId, method) {
    return sim.payOrder(orderId, method)
  },

  // DELETE /v1/orders/:id
  cancelOrder(orderId) {
    return sim.cancelOrder(orderId)
  },

  // GET /v1/orders/:id/trip —— 实时行程快照（模拟引擎通过事件推送，此处兜底）
  getTrip(orderId) {
    return sim.snapshot(orderId)
  },

  // POST /v1/orders/:id/board —— 上车核销
  verifyBoard(orderId) {
    return sim.verifyBoard(orderId)
  },

  // POST /v1/orders/:id/alight —— 下车核销
  verifyAlight(orderId) {
    return sim.verifyAlight(orderId)
  },

  // POST /v1/orders/:id/alight-here —— 专属服务：就近下车
  alightHere(orderId) {
    return sim.alightHere(orderId)
  },

  // GET /v1/orders/:id/route-stops —— 预计轨迹上的站点
  getRouteStops(orderId) {
    return sim.getRouteStops(orderId)
  },

  // GET /v1/orders/:id/route —— 已锁定的真实导航路线（高德驾车规划）
  getRoute(orderId) {
    return sim.getRoute(orderId)
  },

  // POST /v1/orders/:id/route —— 回填高德真实导航路线（进入即锁定，行程内不再变化）
  setPickupRoute(orderId, pts) {
    return sim.setPickupRoute(orderId, pts)
  },
  setDestRoute(orderId, pts) {
    return sim.setDestRoute(orderId, pts)
  },
  // 换乘等待期间的第二程路线
  setNextRoute(orderId, pts) {
    return sim.setNextRoute(orderId, pts)
  },

  // PATCH /v1/orders/:id/destination
  changeDest(orderId, toId, opts) {
    return sim.changeDest(orderId, toId, opts)
  },

  // POST /v1/orders/:id/early-alight
  earlyAlight(orderId, stopId, opts) {
    return sim.earlyAlight(orderId, stopId, opts)
  },

  // 换乘前取消已自动呼叫的第二程
  cancelNextLeg(orderId) {
    return sim.cancelNextLeg(orderId)
  },

  // PATCH /v1/orders/:id/pickup —— 改上车站台（走到马路对面）
  changePickup(orderId, stopId) {
    return sim.changePickup(orderId, stopId)
  },

  // POST /v1/orders/:id/popup-ack
  ackPopup(orderId, which) {
    sim.ackPopup(orderId, which)
  },

  // GET /v1/fleet —— 首页地图车队位置（每隔 10s 刷新）
  getFleet() {
    return sim.fleetSnapshot()
  },

  // GET /v1/areas/:id / GET /v1/lines/:id —— 运营区域与线路详情
  async getArea(areaId) {
    await delay(150)
    const area = AREAS.find((a) => a.id === areaId)
    return area ? { ...area } : null
  },
  async getLine(lineId) {
    await delay(150)
    const line = LINES.find((l) => l.id === lineId)
    if (!line) return null
    return {
      ...line,
      stops: line.drawOrder.map((id) => stopById(id)).filter(Boolean),
    }
  },

  // POST /v1/orders/:id/rating —— 提交评价
  async submitRating(orderId, rating) {
    await delay(400)
    return { ok: true, orderId, rating }
  },

  // POST /v1/orders/:id/invoice —— 开发票（邮箱接收）
  async requestInvoice(orderId, email) {
    await delay(600)
    return { ok: true, orderId, email }
  },

  // GET /v1/messages —— 失物招领消息
  async listMessages() {
    await delay(200)
    return SEED_MESSAGES.map((m) => ({ ...m }))
  },
}
