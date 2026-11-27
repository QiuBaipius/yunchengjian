// 消息页：司机收车失物招领，可联系招领处工作人员
// 从订单进入时仅展示该订单车牌对应的失物招领信息
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/store.js'
import { contactStaff } from '../store/actions.js'

export default function Messages() {
  const nav = useNavigate()
  const messages = useStore((s) => s.messages)
  const orders = useStore((s) => s.orders)
  const params = new URLSearchParams(window.location.search)
  const orderId = params.get('order')
  const order = orderId ? orders.find((o) => o.id === orderId) : null
  const plate = order?.plate && order.plate !== '—' ? order.plate : null
  const list = plate ? messages.filter((m) => m.plate === plate) : messages

  function contact() {
    contactStaff()
    nav('/service')
  }

  return (
    <div className="page scroll">
      <div className="nav"><button className="back" onClick={() => nav(-1)}>‹</button><h2>消息</h2></div>
      <div className="list">
        {orderId && (
          <div className="order" style={{ background: 'var(--teal-soft)' }}>
            <div className="meta">来自订单 {orderId} 的消息入口</div>
            {plate ? (
              <div className="meta" style={{ marginTop: 4 }}>仅显示车牌 <b>{plate}</b> 的失物招领信息</div>
            ) : (
              <div className="meta" style={{ marginTop: 4 }}>该订单未关联车辆车牌，展示全部失物招领信息</div>
            )}
          </div>
        )}
        {list.length === 0 && (
          <div className="order">
            <div className="meta">暂无车牌 {plate || ''} 的失物招领信息。司机收车发现遗失物品后会在此发布。</div>
          </div>
        )}
        {list.map((m) => (
          <div className="order" key={m.id}>
            <div className="top">
              <span>{m.time}</span>
              <span className="chip gold">失物招领</span>
            </div>
            <div style={{ margin: '8px 0 4px', fontWeight: 650 }}>{m.title}</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>{m.body}</p>
            <div className="meta">
              {m.line} 线 · {m.plate}
            </div>
          </div>
        ))}
        <button className="btn" onClick={contact}>联系招领处工作人员</button>
      </div>
    </div>
  )
}
