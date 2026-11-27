// 全屏地图页：完整地图交互 + 底部 OD 快捷入口
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import StopCard from '../components/StopCard.jsx'
import LineCard from '../components/LineCard.jsx'
import AreaCard from '../components/AreaCard.jsx'
import { useStore } from '../store/store.js'
import { setDestStop, setFrom } from '../store/actions.js'
import { stopById } from '../data/config.js'

export default function FullMap() {
  const nav = useNavigate()
  const trip = useStore((s) => s.trip)
  const [picked, setPicked] = useState(null)
  const [lineCard, setLineCard] = useState(null)
  const [areaCard, setAreaCard] = useState(null)

  const from = trip.fromId ? stopById(trip.fromId) : null
  const to = trip.toId ? stopById(trip.toId) : null

  return (
    <div className="page">
      <div className="nav map-nav">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h2 style={{ paddingRight: 44 }}>全部线路与乘降点</h2>
      </div>
      <MapView
        fromId={trip.fromId}
        toId={trip.toId}
        onStop={setPicked}
        onArea={setAreaCard}
      />
      {picked && (
        <StopCard
          stop={picked}
          onClose={() => setPicked(null)}
          onSetFrom={(s) => {
            setFrom(s.id)
            setPicked(null)
          }}
          onSetTo={(s) => {
            setDestStop(s.id)
            setPicked(null)
          }}
        />
      )}
      {lineCard && <LineCard line={lineCard} onClose={() => setLineCard(null)} />}
      {areaCard && (
        <AreaCard
          area={areaCard}
          onClose={() => setAreaCard(null)}
          onSelectLine={(l) => {
            setAreaCard(null)
            setLineCard(l)
          }}
        />
      )}
      <div className="sheet">
        <div className="od-mini">
          <div>
            <div className="meta">上车点</div>
            <b>{from?.name || '未选择'}</b>
          </div>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <div>
            <div className="meta">下车点</div>
            <b>{to?.name || '未选择'}</b>
          </div>
          <button className="btn" style={{ width: 108, height: 38 }} disabled={!trip.fromId || !trip.toId} onClick={() => nav('/match')}>
            呼叫车辆
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>地图上蓝色为公交站（可乘降）、红色为地铁站；可点击站点、线路与运营区域查看详情。</p>
      </div>
    </div>
  )
}
