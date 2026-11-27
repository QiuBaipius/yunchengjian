// 开发票页：输入邮箱，系统自动发送电子发票
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/store.js'
import { requestInvoice, toast } from '../store/actions.js'
import { stopById } from '../data/config.js'

export default function Invoice() {
  const { id } = useParams()
  const nav = useNavigate()
  const orders = useStore((s) => s.orders)
  const o = orders.find((x) => x.id === id)
  const [email, setEmail] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!o) return <Navigate to="/mine/orders" replace />

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('请输入正确的邮箱地址', 'warn')
      return
    }
    setBusy(true)
    await requestInvoice(o.id, email)
    setBusy(false)
    setOk(true)
    toast('电子发票开具成功')
  }

  return (
    <div className="page scroll">
      <div className="nav"><button className="back" onClick={() => nav(-1)}>‹</button><h2>开发票</h2></div>
      <div style={{ padding: 16 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="meta">订单 {o.id}</div>
          <div style={{ margin: '6px 0' }}>
            {stopById(o.fromId)?.name} → {stopById(o.actualAlightId || o.toId)?.name}
          </div>
          <div className="meta">
            金额 ¥{Number(o.paidAmount || o.amountDue || o.price?.total || 0).toFixed(2)}
            {o.extraFee > 0 && ` + 补差价 ¥${o.extraFee.toFixed(2)}`} · 乘车时间 {o.boardTime || '—'}
          </div>
        </div>
        <div className="field">
          <label>邮箱</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="发票将发送至此邮箱" />
        </div>
        <p className="hint">电子发票将在提交后自动发送至填写邮箱，如未收到请检查垃圾邮件。</p>
        <button className="btn" disabled={busy || ok} onClick={submit}>
          {ok ? '已发送' : busy ? '开具中…' : '发送电子发票'}
        </button>
        {ok && <p className="hint">已提交，发票将发送至 {email}。</p>}
      </div>
    </div>
  )
}
