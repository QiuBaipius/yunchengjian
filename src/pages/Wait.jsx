// 等待页：派单成功后车辆赶来，实时显示 ETA / 位置 / 路线 / 拥挤度 / 乘车码 / 1分钟弹窗 / 取消
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import RideCodeModal from '../components/RideCodeModal.jsx'
import CancelSheet from '../components/CancelSheet.jsx'
import CrowdingBadge from '../components/CrowdingBadge.jsx'
import { useStore } from '../store/store.js'
import { ackPopup, cancelOrder, ensureRoute, toast, verifyBoard } from '../store/actions.js'
import { flowRoute } from '../services/flow.js'
import { serviceMode } from '../data/config.js'

export default function Wait() {
  const nav = useNavigate()
  const order = useStore((s) => s.activeOrder)
  const route = useStore((s) => s.activeRoute)
  const [code, setCode] = useState(false)
  const [cancel, setCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  // 路线在派单时已锁定，这里只做一次兜底拉取（事件可能早于本页挂载）
  useEffect(() => {
    ensureRoute()
  }, [])

  // 守卫按「当前状态该在的页」分流：刚刷码上车时状态已变 riding，
  // 若一律回首页会把紧随其后的 nav('/ride') 挤掉（刷码后无后续页面的根因）
  if (!order) return <Navigate to="/" replace />
  const next = flowRoute(order.status)
  if (next !== '/wait') return <Navigate to={next || '/'} replace />

  const v = order.vehiclePos
  const legs = order.legs || []
  const leg = legs[0] || null
  const mode = serviceMode(leg?.service || order.service)
  const cross = legs.length > 1
  const showPopup = order.flags?.pickupSoon && !order.flags?.pickupDone
  const freeCancelLeft = order.cancelCountdownSec || 0
  // 规则 1：这辆车按来向停不了你选的这一侧站台 → 只提示走到马路对面，不提供换侧按钮
  const sideHint = order.pickupSide || null

  async function onCancelConfirm() {
    setBusy(true)
    const snap = cancelOrder()
    setBusy(false)
    setCancel(false)
    if (snap) {
      nav('/')
    }
  }

  async function onBoard() {
    setCode(false)
    // 车辆还没到站时核销会被拒，避免「点了没反应又弹回本页」的困惑
    if (!verifyBoard()) {
      toast(`车辆还有 ${order.etaPickupMin} 分钟到达，请稍候再刷码`, 'warn')
      return
    }
    nav('/ride')
  }

  return (
    <div className="page">
      <div className="nav">
        <button className="back" onClick={() => nav('/')}>‹</button>
        <h2>车辆赶来中</h2>
      </div>
      <MapView
        vehicle={v ? { x: v.x, y: v.y, plate: order.plate } : null}
        fromId={order.fromId}
        toId={order.toId}
        destPath={route?.dest || null}
        pickupPath={route?.pickup || null}
        showPickupRoute
        showDestRoute
      />
      <div className="sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="meta">
              {cross ? '第 1 程 · ' : '匹配车辆'}
              {cross && <span className="bk-line sm">{leg?.line}</span>}
              {mode.id !== 'standard' && (
                <span className={`ride-mode-tag ${mode.id === 'exclusive' ? 'exc' : ''}`}>{mode.name}</span>
              )}
            </div>
            <b style={{ fontSize: 20 }}>{leg?.plate || order.plate}</b>
          </div>
          {mode.id === 'exclusive' ? (
            <span className="meta">一人一车 · 不拼载</span>
          ) : (
            <CrowdingBadge onboard={order.onboard} seats={order.seats} capacity={order.capacity} />
          )}
        </div>
        <div className="kpi">
          <div className="cell">
            <div className="k">车辆到达上车点</div>
            <div className="v">{order.status === 'arrived' ? '已到达' : `${order.etaPickupMin} 分钟`}</div>
          </div>
          <div className="cell">
            <div className="k">{cross ? '到换乘站' : '预计到达目的地'}</div>
            <div className="v">{order.etaDestMin} 分钟</div>
          </div>
        </div>
        {sideHint && (
          <div className="side-hint">
            <b>上车站台不在车辆这一侧</b>
            <p>{sideHint.text}</p>
            <p className="side-hint-note">车辆按行驶方向只停靠对侧，本侧无法上车，请过街到对面站台候车。</p>
          </div>
        )}
        {order.status === 'arrived' ? (
          <button className="btn" onClick={() => setCode(true)}>车辆已到达，刷乘车码上车</button>
        ) : (
          <div className="row-btns">
            <button className="btn ghost" onClick={() => setCode(true)}>乘车码</button>
            <button className="btn outline" onClick={() => setCancel(true)}>
              {freeCancelLeft > 0 ? `免费取消（${freeCancelLeft}s）` : '取消订单'}
            </button>
          </div>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          {freeCancelLeft > 0
            ? `派单成功 ${freeCancelLeft} 秒内可免费取消。车还有 1 分钟到达时会弹窗提醒。`
            : '已超过 40 秒免费取消时限，取消可能产生绕路罚金。'}
        </p>
      </div>

      {showPopup && (
        <div className="popup">
          <div className="box">
            <h3>车辆即将到达</h3>
            <p>
              请留意车牌 <b>{order.plate}</b>，车辆约 1 分钟后到达上车点，请准备上车并出示乘车码。
            </p>
            <button className="btn" onClick={() => ackPopup('pickup')}>知道了</button>
          </div>
        </div>
      )}
      {code && <RideCodeModal mode="board" onClose={() => setCode(false)} onVerify={onBoard} />}
      {cancel && <CancelSheet order={order} busy={busy} onClose={() => setCancel(false)} onConfirm={onCancelConfirm} />}
    </div>
  )
}
