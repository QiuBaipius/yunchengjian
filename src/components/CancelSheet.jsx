// 取消订单确认面板（PRD 规则 8：40s 免费取消 / 绕路罚金 / 退款时效）
export default function CancelSheet({ order, onClose, onConfirm, busy }) {
  if (!order) return null
  const within40s = (order.cancelCountdownSec || 0) > 0
  const free = within40s || !order.deviated
  const countdown = order.cancelCountdownSec || 0

  let title = '免费取消'
  let desc = ''
  if (within40s) {
    title = '免费取消'
    desc = `派单成功 ${countdown} 秒内可免费取消（剩余 ${countdown}s），车费全额原路退回，1-3 个工作日到账。`
  } else if (order.deviated) {
    title = '取消将收取罚金'
    desc = '车辆已因你的订单改变轨迹，需支付轨迹改变导致的里程增多部分作为罚金，余额原路退回，1-3 个工作日到账。'
  } else {
    title = '免费取消'
    desc = '车辆未因你的订单改变轨迹，取消不收取费用，车费原路退回，1-3 个工作日到账。'
  }

  return (
    <div className="popup">
      <div className="box" style={{ textAlign: 'left' }}>
        <h3>{title}</h3>
        <p style={{ marginBottom: 10 }}>{desc}</p>
        {order.paidAmount > 0 && (
          <div className="card" style={{ background: 'var(--paper)', marginBottom: 12 }}>
            <div className="meta">已支付金额</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>¥{order.paidAmount}</div>
          </div>
        )}
        <button className="btn" disabled={busy} onClick={onConfirm}>
          {busy ? '处理中…' : free ? '确认免费取消' : '确认取消并支付罚金'}
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>继续行程</button>
      </div>
    </div>
  )
}
