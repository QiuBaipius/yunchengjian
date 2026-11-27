// 结算页：全部行程结束后统一支付（一口价，呼叫前已在确认窗口议定）
//
// 为什么不预付费：用户下单时看到的就是最终价（确认窗口里选模式），
// 中途换乘、车辆绕最优路径接送都不再加价，下车后一次结清。
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/store.js'
import { payOrder, toast } from '../store/actions.js'
import { stopById, serviceMode } from '../data/config.js'
import { fare } from '../services/pricing.js'
import { flowRoute } from '../services/flow.js'

export default function Pay() {
  const nav = useNavigate()
  const order = useStore((s) => s.activeOrder)
  const [method, setMethod] = useState('wechat')
  const [paying, setPaying] = useState(false)

  if (!order) return <Navigate to="/match" replace />
  const next = flowRoute(order.status)
  if (next !== '/pay') return <Navigate to={next || '/match'} replace />

  const legs = order.legs?.length ? order.legs : null
  const from = stopById(order.fromId)
  const to = stopById(order.toId)
  const due = order.amountDue ?? order.price?.total ?? 0
  const mode = serviceMode(order.service)

  async function confirm() {
    setPaying(true)
    const snap = await payOrder(method)
    setPaying(false)
    if (!snap) return
    toast('支付成功，感谢乘坐云乘见')
    nav('/rate')
  }

  return (
    <div className="page scroll">
      <div className="nav">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h2>行程结算</h2>
      </div>
      <div style={{ padding: 16 }}>
        <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="meta">行程已结束 · 一口价</div>
          <div style={{ fontSize: 36, fontWeight: 750, margin: '6px 0' }}>¥{due}</div>
          <div className="meta">
            {from?.name} → {to?.name}
          </div>
          <div className="meta" style={{ marginTop: 4 }}>
            {legs
              ? legs.length > 1
                ? `共 ${legs.length} 程 · 边界站换乘`
                : `一程直达 · ${mode.name}`
              : `${mode.name} · ${mode.desc}`}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          {legs ? (
            legs.map((l, i) => {
              const a = stopById(l.fromId)
              const b = stopById(l.toId)
              const m = serviceMode(l.service || order.service)
              return (
                <div key={i} className="settle-leg">
                  <div className="settle-leg-head">
                    <span className={`ln ${l.line === 'X2' ? 'ln2' : ''}`}>{l.line}</span>
                    <b>
                      {a?.name} → {b?.name}
                    </b>
                    <span className="meta">{m.name}</span>
                  </div>
                  <div className="settle-row">
                    <span>
                      第 {i + 1} 程 · {l.km} km · 一口价
                    </span>
                    <b>¥{(l.price?.total || 0).toFixed(2)}</b>
                  </div>
                </div>
              )
            })
          ) : (
            <>
              <div className="settle-row">
                <span>起步价（1km 内）</span>
                <span>¥1.00</span>
              </div>
              <div className="settle-row">
                <span>里程费（{order.km} km × ¥0.75）</span>
                <span>¥{fare(order.km || 0).toFixed(2)}</span>
              </div>
            </>
          )}
          {(order.carriedLegs || []).map((l, i) => (
            <div key={`c${i}`} className="settle-leg">
              <div className="settle-leg-head">
                <span className={`ln ${l.line === 'X2' ? 'ln2' : ''}`}>{l.line}</span>
                <b>换乘段（车辆已出发）</b>
                <span className="meta">照付</span>
              </div>
              <div className="settle-row">
                <span>{l.line} 线 · {l.km} km · 下一程已呼叫且无法取消</span>
                <b>¥{(l.price?.total || 0).toFixed(2)}</b>
              </div>
            </div>
          ))}
          {!!order.droppedLegs?.length && (
            <p className="hint" style={{ margin: '2px 0 6px' }}>
              已取消的换乘段（{order.droppedLegs.map((l) => l.line).join('、')} 线）不再计费。
            </p>
          )}
          {order.sideDrop?.note && (
            <div className="side-note">
              <b>下车位置说明：</b>
              {order.sideDrop.note}
            </div>
          )}
          <div className="settle-row total">
            <span>合计（一口价）</span>
            <b>¥{due}</b>
          </div>
        </div>

        {[['wechat', '微信支付'], ['alipay', '支付宝']].map(([id, name]) => (
          <button key={id} className={`pay-opt ${method === id ? 'on' : ''}`} onClick={() => setMethod(id)}>
            <span className="radio" />
            <b>{name}</b>
          </button>
        ))}
        <p className="hint">
          全程结束后统一支付，中途换乘与车辆接送最优路径不另计费。如需发票，可在「我的 → 行程」中开具。
        </p>
        <button className="btn" disabled={paying} onClick={confirm}>
          {paying ? '支付中…' : `确认支付 ¥${due}`}
        </button>
      </div>
    </div>
  )
}
