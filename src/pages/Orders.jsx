// 我的订单：按时间从晚到早，含已取消订单
import { Link } from 'react-router-dom'
import { useStore } from '../store/store.js'
import { stopById, serviceMode } from '../data/config.js'

const STATUS = {
  completed: { text: '已完成', cls: 'green' },
  cancelled: { text: '已取消', cls: 'gold' },
  settled: { text: '待支付', cls: 'blue' },
  unpaid: { text: '待支付', cls: 'blue' },
  dispatched: { text: '车辆赶来中', cls: 'blue' },
  arrived: { text: '等待上车', cls: 'blue' },
  riding: { text: '行程中', cls: 'blue' },
  transfer_wait: { text: '换乘等待', cls: 'blue' },
  await_alight: { text: '即将到达', cls: 'blue' },
}

export default function Orders() {
  const orders = useStore((s) => s.orders)
  const sorted = [...orders].sort((a, b) => (a.orderTime < b.orderTime ? 1 : -1))
  return (
    <div className="page scroll">
      <div className="nav"><Link className="back" to="/mine">‹</Link><h2>我的订单</h2></div>
      <div className="list">
        {sorted.map((o) => {
          const st = STATUS[o.status] || { text: o.status, cls: 'blue' }
          return (
            <Link className="order" key={o.id} to={`/mine/orders/${o.id}`}>
              <div className="top">
                <span>下单 {o.orderTime}</span>
                <span className={`chip ${st.cls}`}>{st.text}</span>
              </div>
              <div className="od">
                {stopById(o.fromId)?.name} → {stopById(o.toId)?.name}
              </div>
              <div className="meta">
                {o.plate || o.legs?.[0]?.plate || '—'} · {serviceMode(o.service).name} · ¥
                {o.status === 'cancelled'
                  ? (o.penalty || 0).toFixed(2)
                  : (o.paidAmount || o.amountDue || o.price?.total || 0).toFixed(2)}
                {o.extraFee > 0 && ` + 补 ¥${o.extraFee.toFixed(2)}`}
                {o.legs?.length > 1 && ` · ${o.legs.length} 程`}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
