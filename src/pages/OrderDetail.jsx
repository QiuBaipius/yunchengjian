// 订单详情：金额 / 车牌 / 上下车地点与时间 / 下单时间 / 公里数 / 用时 / 我的评分 / 地图路线 / 消息 / 客服 / 发票
import { Link, Navigate, useParams } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import { useStore } from '../store/store.js'
import { stopById, serviceMode } from '../data/config.js'

export default function OrderDetail() {
  const { id } = useParams()
  const orders = useStore((s) => s.orders)
  const o = orders.find((x) => x.id === id)
  if (!o) return <Navigate to="/mine/orders" replace />

  const from = stopById(o.fromId)
  const to = stopById(o.actualAlightId || o.toId)
  const mode = serviceMode(o.service)
  const legs = o.legs?.length ? o.legs : null
  const due = o.paidAmount || o.amountDue || o.price?.total || 0

  return (
    <div className="page scroll">
      <div className="nav"><Link className="back" to="/mine/orders">‹</Link><h2>订单详情</h2></div>
      <div style={{ padding: 16 }}>
        <div className="card">
          <b>
            {from?.name} → {to?.name}
          </b>
          <div className="meta" style={{ marginTop: 8, lineHeight: 2 }}>
            订单金额：¥{Number(due).toFixed(2)}
            {o.status === 'settled' && '（待支付）'}
            {o.penalty > 0 && `（含罚金 ¥${o.penalty.toFixed(2)}）`}
            {o.extraFee > 0 && ` + 补差价 ¥${o.extraFee.toFixed(2)}`}
            <br />
            车牌号：{o.plate || legs?.[0]?.plate || '—'}
            <br />
            服务类型：{mode.name} · {mode.desc}
            {legs && (
              <>
                <br />
                行程分段：
                {legs
                  .map((l) => `${l.line} ${stopById(l.fromId)?.name}→${stopById(l.toId)?.name}`)
                  .join(' / ')}
              </>
            )}
            {o.alightMode === 'here' && (
              <>
                <br />
                下车方式：就近下车（当前位置）
              </>
            )}
            <br />
            上车时间：{o.boardTime || '—'} · 下车时间：{o.alightTime || '—'}
            <br />
            下单时间：{o.orderTime}
            <br />
            全程：{o.actualKm ?? o.km} km · 用时：{o.durationMin ? `${o.durationMin} 分钟` : o.duration}
            <br />
            我的评价：
            {o.rating
              ? `环境 ${o.rating.env} 星 / 驾驶 ${o.rating.drive} 星 / 准时 ${o.rating.eta} 星`
              : '未评价'}
            {o.rating?.text && (
              <>
                <br />
                反馈内容：{o.rating.text}
              </>
            )}
            {o.refund && (
              <>
                <br />
                退款金额：¥{o.refund.amount.toFixed(2)}（{o.refund.note}，{o.refund.eta}）
              </>
            )}
            {o.invoiceEmail && (
              <>
                <br />
                发票邮箱：{o.invoiceEmail}
              </>
            )}
          </div>
        </div>
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <MapView
            fromId={o.fromId}
            toId={o.actualAlightId || o.toId}
            showDestRoute
            interactive={false}
            className="compact-map"
          />
        </div>
        <div className="menu" style={{ margin: '12px 0' }}>
          <Link to={`/messages?order=${o.id}`}>失物招领消息 <span>›</span></Link>
          <Link to={`/service?order=${o.id}`}>本单客服 <span>›</span></Link>
          <Link to={`/mine/orders/${o.id}/invoice`}>开发票 <span>›</span></Link>
        </div>
      </div>
    </div>
  )
}
