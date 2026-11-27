// 车辆运行页：实时显示车牌 / ETA / 路线；跨区在边界站点换乘；乘车码核销下车；改站；提前下车
//
// 第十八轮两处变化：
//   ① 到换乘站后地图切成「第二程」：显示第二程的车与第二程路线，不再显示刚坐完的第一程。
//   ② 跨区两程都支持「改站 / 提前下车」。距本程下车 2:00–1:20 之间，第二程已经被自动
//      呼叫但还能取消，必须先取消第二程再改；不足 1:20 时第二程的车已无法取消，可以改，
//      但第二程车费会在结算时一并支付。
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import RideCodeModal from '../components/RideCodeModal.jsx'
import ChangeDestSheet from '../components/ChangeDestSheet.jsx'
import { useStore } from '../store/store.js'
import { ackPopup, alightHereNow, changeDest, earlyAlight, ensureRoute, toast, verifyAlight, verifyBoard } from '../store/actions.js'
import { api } from '../services/api.js'
import { flowRoute } from '../services/flow.js'
import { NEXT_CANCEL_MIN } from '../services/sim.js'
import { stopById, serviceMode } from '../data/config.js'

const LINE_COLOR = { X1: '#0f7a62', X2: '#7c5cd6' }

export default function Ride() {
  const nav = useNavigate()
  const order = useStore((s) => s.activeOrder)
  const route = useStore((s) => s.activeRoute)
  const [code, setCode] = useState(false)
  const [sheet, setSheet] = useState(null) // 'change' | 'early'
  const [gate, setGate] = useState(null) // 跨区改站前的提示：{ kind, canCancel }
  const [routeStops, setRouteStops] = useState(null)
  const dropNextRef = useRef(true)

  // 上车后路线已锁定，兜底拉一次（正常在派单时就已经拿到）
  useEffect(() => {
    ensureRoute()
  }, [])

  // 刷码下车会立刻把状态改为 settled（待支付），守卫需把用户送到支付页
  if (!order) return <Navigate to="/" replace />
  const next = flowRoute(order.status)
  if (next !== '/ride') return <Navigate to={next || '/'} replace />

  const v = order.vehiclePos
  const legs = order.legs || []
  const legIdx = order.legIdx || 0
  const leg = legs[legIdx] || null
  const dest = stopById(leg?.toId || order.toId)
  const mode = serviceMode(leg?.service || order.service)
  const exclusive = mode.id === 'exclusive'
  const cross = legs.length > 1
  const hasNext = legIdx < legs.length - 1 // 本程后面还有一程（跨区第一程）
  const atTransfer = order.status === 'transfer_wait'
  const showPopup = order.flags?.destSoon && !order.flags?.destDone && !cross

  // 换乘等待期：地图显示第二程的车（和它的车牌），不再显示第一程
  const nextV = atTransfer ? order.nextVehiclePos : null
  const veh = atTransfer
    ? nextV
      ? { x: nextV.x, y: nextV.y, plate: order.nextPlate || '第二程车辆' }
      : null
    : v
      ? { x: v.x, y: v.y, plate: order.plate }
      : null
  const destPath = atTransfer ? route?.next || null : route?.dest || null

  function openSheet(m) {
    setRouteStops(api.getRouteStops(order.id))
    setSheet(m)
  }

  // 改站 / 提前下车前的判断：
  //   还有下一程时，若第二程已被自动呼叫 →
  //     距本程下车 > 1:20：必须先取消第二程（不收费）
  //     距本程下车 ≤ 1:20：第二程已无法取消，改站后照样收费
  function askAction(kind) {
    const remainMin = order.remainMin ?? 99
    const nextCalled = !!order.flags?.nextCalled
    if (!hasNext || !nextCalled) {
      dropNextRef.current = true
      openSheet(kind)
      return
    }
    const canCancel = remainMin > NEXT_CANCEL_MIN
    setGate({ kind, canCancel })
  }

  function continueAfterGate() {
    const kind = gate?.kind
    dropNextRef.current = !!gate?.canCancel
    setGate(null)
    openSheet(kind)
  }

  // 专属服务：在当前位置就近下车，按已行驶里程结算
  function onAlightHere() {
    if (!alightHereNow()) {
      toast('当前无法就近下车', 'warn')
      return
    }
    nav('/pay')
  }

  async function onAlight() {
    setCode(false)
    if (!verifyAlight()) {
      toast('还没到下车点，请等车辆到站后再刷码', 'warn')
      return
    }
    nav('/pay')
  }

  // 换乘站上第二程的车
  function onBoardNext() {
    setCode(false)
    if (!verifyBoard()) {
      toast('下一程车辆还没到站，请稍候', 'warn')
      return
    }
    toast(`已上 ${legs[legIdx + 1]?.line || 'X2'} 线，继续前往 ${stopById(legs[legIdx + 1]?.toId)?.name || '目的地'}`)
  }

  return (
    <div className="page">
      <div className="nav">
        <h2>{atTransfer ? '换乘中' : '行程中'}</h2>
      </div>
      <MapView
        vehicle={veh}
        fromId={atTransfer ? legs[legIdx + 1]?.fromId : leg?.fromId || order.fromId}
        toId={atTransfer ? legs[legIdx + 1]?.toId : leg?.toId || order.toId}
        destPath={destPath}
        approachPath={atTransfer ? order.nextApproach || null : null}
        approachColor={LINE_COLOR[atTransfer ? legs[legIdx + 1]?.line : leg?.line]}
        showDestRoute
      />
      <div className="sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="meta">
              {cross ? `第 ${(atTransfer ? legIdx + 2 : legIdx + 1)}/${legs.length} 程 · ` : '当前车辆'}
              <span
                className="bk-line sm"
                style={{
                  color: LINE_COLOR[atTransfer ? legs[legIdx + 1]?.line : leg?.line],
                  borderColor: LINE_COLOR[atTransfer ? legs[legIdx + 1]?.line : leg?.line],
                }}
              >
                {atTransfer ? legs[legIdx + 1]?.line || 'X2' : leg?.line || 'X1'}
              </span>
              {mode.id !== 'standard' && !atTransfer && (
                <span className={`ride-mode-tag ${exclusive ? 'exc' : ''}`}>{mode.name}</span>
              )}
              {atTransfer && <span className="ride-mode-tag">下一程</span>}
            </div>
            <b style={{ fontSize: 20 }}>
              {atTransfer ? order.nextPlate || '第二程车辆' : leg?.plate || order.plate}
            </b>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="meta">{atTransfer ? '等待换乘' : hasNext ? '到换乘站' : '到达目的地'}</div>
            <b style={{ fontSize: 20 }}>
              {atTransfer
                ? order.etaPickupMin > 0
                  ? `${order.etaPickupMin} 分钟`
                  : '车辆已到'
                : order.status === 'await_alight'
                  ? '即将到达'
                  : `${order.etaDestMin} 分钟`}
            </b>
          </div>
        </div>

        {atTransfer ? (
          <>
            <div className="bk-hop-card">
              <b>已到达换乘站「{dest?.name}」</b>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                {order.etaPickupMin > 0
                  ? `${legs[legIdx + 1]?.line} 线车辆正在赶来，约 ${order.etaPickupMin} 分钟到站；到站后刷乘车码上第二程。`
                  : `${legs[legIdx + 1]?.line} 线车辆已到站，请刷乘车码上第二程。`}
              </p>
              <button className="btn" style={{ marginTop: 10 }} onClick={() => setCode(true)}>
                刷乘车码上第二程
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              前往 {dest?.name}（可乘降点
              {dest?.hub ? ' · 关键干线接驳枢纽' : ''}）。
              {hasNext
                ? `本程为 ${leg?.line} 线，在「${dest?.name}」换乘 ${legs[legIdx + 1]?.line || 'X2'} 线；第二程车辆会在到站前 2 分钟自动呼叫。`
                : exclusive
                  ? '本次为专属服务：全程不接其他乘客，可随时就近下车。'
                  : mode.id === 'efficiency'
                    ? '本次为效率服务：全程沿最优路径行驶，途中最多停 4 站；可随时改站。'
                    : '可随时更改站点至车辆预计运行轨迹中的任何一站。'}
            </p>
            {order.status === 'await_alight' ? (
              <button className="btn" onClick={() => setCode(true)}>已到达下车点，刷乘车码下车</button>
            ) : (
              <div className="row-btns">
                {exclusive ? (
                  <button className="btn ghost" onClick={onAlightHere}>就近下车</button>
                ) : (
                  <>
                    <button className="btn ghost" onClick={() => askAction('change')}>改站</button>
                    <button className="btn outline" onClick={() => askAction('early')}>提前下车</button>
                  </>
                )}
                <button className="btn" onClick={() => setCode(true)}>乘车码</button>
              </div>
            )}
          </>
        )}
      </div>

      {showPopup && (
        <div className="popup">
          <div className="box">
            <h3>即将到达下车点</h3>
            <p>
              约 1 分钟后到达 <b>{dest?.name}</b>，请准备下车并再次刷乘车码核销。
            </p>
            <button className="btn" onClick={() => ackPopup('dest')}>知道了</button>
          </div>
        </div>
      )}

      {gate && (
        <div className="popup">
          <div className="box">
            <h3>{gate.canCancel ? '第二程已自动呼叫' : '第二程车辆已出发'}</h3>
            <p>
              {gate.canCancel ? (
                <>
                  现在离换乘站不到 2 分钟，第二程的车已经叫上了。改站或提前下车会
                  <b>同时取消第二程</b>，这一程不再计费。
                </>
              ) : (
                <>
                  现在离换乘站不到 1 分 20 秒，第二程的车<b>已经无法取消</b>。你可以直接改站或提前下车，
                  但第二程车费会在行程结束时一并支付。
                </>
              )}
            </p>
            <button className="btn" onClick={continueAfterGate}>
              {gate.canCancel ? '取消第二程并继续' : '继续'}
            </button>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setGate(null)}>放弃</button>
          </div>
        </div>
      )}

      {code && (
        <RideCodeModal
          mode={atTransfer ? 'board' : 'alight'}
          onClose={() => setCode(false)}
          onVerify={atTransfer ? onBoardNext : onAlight}
        />
      )}
      {sheet && (
        <ChangeDestSheet
          mode={sheet}
          routeStopIds={routeStops}
          currentToId={order.toId}
          onClose={() => setSheet(null)}
          onConfirm={(stopId) => {
            const opts = { dropNext: dropNextRef.current }
            if (sheet === 'change') {
              changeDest(stopId, opts)
              toast(`目的地已更改为「${stopById(stopId)?.name}」`)
            } else {
              earlyAlight(stopId, opts)
              toast(`将在「${stopById(stopId)?.name}」提前下车`)
            }
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}
