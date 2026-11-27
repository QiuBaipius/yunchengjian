// 车辆匹配信息页：确认行程（价格 + 预计路径 + 模式）→ 匹配（搜索中 / 超 20 分钟不匹配 / 成功）→ 呼叫
//
// 跨区域订单在这里体现为「两程 + 一个边界站点」：确认窗口里能看到换乘点和两段票价，
// 也可以换一个边界站点；用户确认后先匹配第一程的车，呼叫即派单（行程结束后统一支付）。
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import MatchPanel from '../components/MatchPanel.jsx'
import BookingSheet from '../components/BookingSheet.jsx'
import { useStore } from '../store/store.js'
import { callVehicle, cancelMatch, rematch, requestMatch } from '../store/actions.js'
import { flowRoute } from '../services/flow.js'
import { buildItinerary } from '../services/itinerary.js'
import { drivingRouteStops } from '../services/roadRoute.js'
import { stopById } from '../data/config.js'
import { toLngLat } from '../data/geo.js'

const LINE_COLOR = { X1: '#0f7a62', X2: '#7c5cd6' }

export default function Match() {
  const nav = useNavigate()
  const trip = useStore((s) => s.trip)
  const match = useStore((s) => s.match)
  const activeOrder = useStore((s) => s.activeOrder)
  const fleet = useStore((s) => s.fleet)
  const route = useStore((s) => s.activeRoute)
  const [transferId, setTransferId] = useState(null)
  const [planRoutes, setPlanRoutes] = useState([])

  // hooks 必须在任何 return 之前调用，所以先把行程算出来（缺 OD 时给空行程占位）
  const itinerary = useMemo(
    () =>
      trip.fromId && trip.toId
        ? buildItinerary({ fromId: trip.fromId, toId: trip.toId, transferId })
        : { cross: false, legs: [], candidates: [] },
    [trip.fromId, trip.toId, transferId],
  )

  // 确认行程阶段就要在地图上画出预计线路（同区一条、跨区两段），
  // 用高德真实驾车路线取路，同一 OD 有缓存，换边界站点会重算。
  const legKey = itinerary.legs.map((l) => `${l.fromId}>${l.toId}`).join('|')
  useEffect(() => {
    const legs = itinerary.legs
    if (!legs.length) {
      setPlanRoutes([])
      return
    }
    let alive = true
    Promise.all(legs.map((l) => drivingRouteStops(stopById(l.fromId), stopById(l.toId)))).then((list) => {
      if (!alive) return
      setPlanRoutes(
        legs.map((l, i) => {
          const a = stopById(l.fromId)
          const b = stopById(l.toId)
          return {
            path: list[i]?.pts?.length > 1 ? list[i].pts : [toLngLat(a), toLngLat(b)],
            color: LINE_COLOR[l.line] || LINE_COLOR.X1,
            nodes: [{ pt: toLngLat(a) }, { pt: toLngLat(b) }],
          }
        }),
      )
    })
    return () => {
      alive = false
    }
    // 依赖用「分段的起终站」字符串，避免 itinerary 每次重建都重新取路
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey])

  // 已产生进行中订单时不再拦截（呼叫后订单已创建，避免守卫竞态把用户弹回首页）
  if (!activeOrder && (!trip.fromId || !trip.toId)) return <Navigate to="/" replace />
  // 存在进行中订单且匹配已结束时，按订单状态分流到对应页面
  if (activeOrder && match.status === 'idle') {
    const next = flowRoute(activeOrder.status)
    if (next) return <Navigate to={next} replace />
  }

  const m = match.quote?.match
  const v = m ? fleet.find((f) => f.id === m.vehicleId) : null
  const selecting = match.status === 'idle'
  const leg0 = itinerary.legs[0]

  function onCall() {
    const order = callVehicle()
    if (order) nav('/wait')
  }

  function onConfirm(rows) {
    requestMatch(
      rows[0]?.service,
      rows.map((r) => ({ line: r.line, fromId: r.fromId, toId: r.toId, km: r.km, service: r.service })),
    )
  }

  return (
    <div className="page">
      <div className="nav">
        <button
          className="back"
          onClick={() => {
            cancelMatch()
            nav('/')
          }}
        >
          ‹
        </button>
        <h2>{selecting ? '确认行程' : '车辆匹配'}</h2>
      </div>
      <MapView
        fleet={fleet}
        vehicle={v ? { x: v.x, y: v.y, plate: v.plate } : null}
        fromId={leg0?.fromId || trip.fromId}
        toId={leg0?.toId || trip.toId}
        destPath={route?.dest || null}
        pickupPath={route?.pickup || null}
        planRoutes={m ? [] : planRoutes}
        showPickupRoute={!!m}
        showDestRoute={!!m}
      />
      {selecting ? (
        <BookingSheet
          itinerary={itinerary}
          fleet={fleet}
          busy={false}
          onChangeTransfer={(id) => setTransferId(id)}
          onConfirm={onConfirm}
        />
      ) : (
        <MatchPanel
          match={match}
          itinerary={itinerary}
          onCall={onCall}
          onRematch={rematch}
          onModify={() => {
            cancelMatch()
            nav('/')
          }}
          onCancelMatch={() => {
            cancelMatch()
            nav('/')
          }}
        />
      )}
    </div>
  )
}
