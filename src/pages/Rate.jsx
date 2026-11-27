// 评价页：费用结算 + 三维度 5 星评价 + 问题反馈
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Stars from '../components/Stars.jsx'
import SettlementCard from '../components/SettlementCard.jsx'
import { useStore } from '../store/store.js'
import { submitRating, toast } from '../store/actions.js'
import { flowRoute } from '../services/flow.js'

export default function Rate() {
  const nav = useNavigate()
  const order = useStore((s) => s.activeOrder)
  const [env, setEnv] = useState(5)
  const [drive, setDrive] = useState(5)
  const [eta, setEta] = useState(5)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // 订单未完成时按状态回到对应流程页；已完成且已提交（activeOrder 清空）则回订单列表
  if (!order) return <Navigate to="/mine/orders" replace />
  const next = flowRoute(order.status)
  if (next !== '/rate') return <Navigate to={next || '/mine/orders'} replace />

  async function submit() {
    setBusy(true)
    await submitRating({ env, drive, eta, text })
    setBusy(false)
    toast('评价已提交，感谢你的反馈')
    nav('/mine/orders')
  }

  return (
    <div className="page scroll">
      <div className="nav"><h2>评价本次行程</h2></div>
      <div style={{ padding: 16 }}>
        <SettlementCard order={order} />
        {[
          ['车辆环境', env, setEnv],
          ['司机驾驶娴熟度', drive, setDrive],
          ['时间预估准确度', eta, setEta],
        ].map(([label, v, set]) => (
          <div className="card" key={label} style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 8 }}>{label}</div>
            <Stars value={v} onChange={set} />
          </div>
        ))}
        <textarea className="feedback" placeholder="如有问题可在此反馈…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>
          {busy ? '提交中…' : '提交评价'}
        </button>
      </div>
    </div>
  )
}
