// 首页：品牌栏 + 全屏地图 + 起终点面板
// 参考滴滴的首页信息架构：顶部品牌与快捷入口、中间地图、底部起终点输入卡。
// 定位授权后由 store 自动把最近的乘降点填进「上车」框；两个框点开都是同一个地点选择页。
//
// 交互约定（第十六轮之后）：
//   · 打开首页不预填终点（起终点不跨会话保留），
//   · 定位成功后地图直接收到当前位置，并画出「当前位置 → 匹配上车点」的引导线，
//   · 起终点都填好后立刻跳到车辆匹配页，不再有「查看可呼叫车辆」这一步。
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import ODPanel from '../components/ODPanel.jsx'
import PlacePicker from '../components/PlacePicker.jsx'
import { addHistory } from '../services/places.js'
import StopCard from '../components/StopCard.jsx'
import LineCard from '../components/LineCard.jsx'
import AreaCard from '../components/AreaCard.jsx'
import LocationAuthSheet from '../components/LocationAuthSheet.jsx'
import TabBar from '../components/TabBar.jsx'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/store.js'
import { STOPS, stopById } from '../data/config.js'
import { toLngLat, toXY } from '../data/geo.js'
import { drivingRoute } from '../services/roadRoute.js'
import { clearTripDest, denyLocation, grantLocation, setDestPoi, setFrom, toast } from '../store/actions.js'

// 任意坐标 → 最近的乘降点（上车点必须是站，终点也落到站）
function nearestStop(xy) {
  let best = STOPS[0]
  let bd = Infinity
  for (const s of STOPS) {
    if (s.hidden) continue
    const d = Math.hypot(s.x - xy.x, s.y - xy.y)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}

export default function Home() {
  const nav = useNavigate()
  const trip = useStore((s) => s.trip)
  const activeOrder = useStore((s) => s.activeOrder)
  const permission = useStore((s) => s.user.locationPermission)
  const location = useStore((s) => s.user.location)
  const [picked, setPicked] = useState(null)
  const [lineCard, setLineCard] = useState(null)
  const [areaCard, setAreaCard] = useState(null)
  const [pickFor, setPickFor] = useState(null) // 'origin' | 'dest'
  const [userPath, setUserPath] = useState(null)
  const armed = useRef(false) // 用户刚选完地点：起终点齐了就立即跳转

  // 已授权定位（含刷新后恢复的会话）而还没填上车点时，自动填最近一站
  useEffect(() => {
    if (permission === 'granted' && location && !trip.fromId) {
      setFrom(nearestStop(location).id)
    }
  }, [permission, location, trip.fromId])

  // 回到首页：上一次没下单的终点必须清空。
  // 否则用户「选了终点 → 退出 → 回来」会看到终点框里还留着旧站点，
  // 再选同一个终点时看不出任何变化，误以为按钮失灵。
  // 只在进入首页时判断一次：picker 是首页内的浮层，不会触发这里。
  useEffect(() => {
    if (!activeOrder && trip.toId) clearTripDest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 定位 → 匹配上车点的引导路线（高德驾车，失败则退化为直线）
  useEffect(() => {
    const from = trip.fromId ? stopById(trip.fromId) : null
    if (!location || !from) {
      // 依赖失效时清掉旧引导线（值相同就不触发重渲染）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPath((p) => (p === null ? p : null))
      return
    }
    let alive = true
    const a = toLngLat(location)
    const b = toLngLat(from)
    drivingRoute(a, b).then((r) => {
      if (alive) setUserPath(r?.pts?.length > 1 ? r.pts : [a, b])
    })
    return () => {
      alive = false
    }
  }, [location, trip.fromId])

  // 起终点齐了就跳转匹配页（只在用户主动选点之后触发，避免取消返回时又弹回去）
  // 依赖里带 pickSeq：即使这次选的是同一个终点，也要再跳一次
  useEffect(() => {
    if (armed.current && trip.fromId && trip.toId) {
      armed.current = false
      nav('/match')
    }
  }, [trip.pickSeq, trip.fromId, trip.toId, nav])

  function applyPick(p) {
    const xy = toXY(p.lng, p.lat)
    const which = pickFor
    setPickFor(null)
    // 起终点都记进「历史地点」：呼叫流程与规划页共用同一个搜索面板，
    // 以前只有规划页写历史，呼叫完再回来搜索框里还是那几条种子示例。
    addHistory({ lng: p.lng, lat: p.lat, name: p.name, sub: p.sub || p.addr || '', stopId: p.stopId })
    if (which === 'origin') {
      // 从站台列表里直接点的（带 stopId）就用那个站台，别再按坐标兜一圈
      const s = (p.stopId && stopById(p.stopId)) || nearestStop(xy)
      armed.current = true
      setFrom(s.id)
      if (s.name !== p.name) toast(`上车点已落到最近乘降点「${s.name}」`)
      return
    }
    armed.current = true
    // 终点同样保留站台 id：否则「轻工学校（路南）」会被 nearestStop 重新算一次，
    // 遇到对侧站台只差 22 m 时可能落到另一侧
    setDestPoi({ id: `pick-${p.lng}-${p.lat}`, name: p.name, x: xy.x, y: xy.y, stopId: p.stopId })
  }

  return (
    <div className="page">
      {/* 顶部品牌栏 */}
      <div className="nav map-nav home-nav">
        <div className="home-brand">
          <span className="home-logo">云</span>
          <div className="home-brand-t">
            <b>云乘见</b>
            <span>响应型接驳公交 · 大连</span>
          </div>
        </div>
        <div className="home-nav-acts">
          <button className="chip home-chip" onClick={() => nav('/guide')}>
            <Icon name="info" size={13} /> 功能介绍
          </button>
          <button className="chip blue home-chip" onClick={() => nav('/map')}>
            <Icon name="expand" size={13} /> 全屏地图
          </button>
        </div>
      </div>

      <MapView
        fromId={trip.fromId}
        toId={trip.toId}
        onStop={setPicked}
        onArea={setAreaCard}
        userLocation={location}
        userPath={userPath}
        focusUser={!!location}
      />

      {picked && (
        <StopCard
          stop={picked}
          onClose={() => setPicked(null)}
          onSetFrom={(s) => {
            armed.current = true
            setFrom(s.id)
            setPicked(null)
          }}
          onSetTo={(s) => {
            armed.current = true
            setDestPoi({ id: s.id, name: s.name, x: s.x, y: s.y, stopId: s.id })
            setPicked(null)
          }}
        />
      )}
      {lineCard && <LineCard line={lineCard} onClose={() => setLineCard(null)} />}
      {areaCard && (
        <AreaCard
          area={areaCard}
          onClose={() => setAreaCard(null)}
          onSelectArea={(a) => setAreaCard(a)}
          onSelectLine={(l) => {
            setAreaCard(null)
            setLineCard(l)
          }}
        />
      )}

      <ODPanel
        trip={trip}
        notice={trip.notice}
        onOpenFrom={() => setPickFor('origin')}
        onOpenTo={() => setPickFor('dest')}
      />

      {pickFor && (
        <PlacePicker
          which={pickFor}
          onClose={() => setPickFor(null)}
          onPick={applyPick}
          onMapPick={() => {
            setPickFor(null)
            toast('在全屏地图里点选站点即可设为起终点', 'warn')
            nav('/map')
          }}
        />
      )}

      {permission === 'unknown' && (
        <LocationAuthSheet onGrant={grantLocation} onDeny={denyLocation} />
      )}
      <TabBar />
    </div>
  )
}
