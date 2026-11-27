// 下车费用卡片（行程结束后统一支付：下单议定的一口价即最终价）
import { priceForService } from '../services/pricing.js'

export default function SettlementCard({ order }) {
  if (!order) return null
  const { actualKm, extraFee = 0, km } = order
  const due = order.amountDue ?? order.price?.total ?? 0
  // 与服务端结算同口径：按服务类型计价；本平台一口价，实际里程变动不改变应付金额
  const should = priceForService(actualKm ?? km ?? 0, order.service || 'standard').total
  const here = order.alightMode === 'here'
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b>费用结算</b>
        {here ? (
          <span className="chip gold">就近下车</span>
        ) : (
          order.earlyAlight && <span className="chip gold">提前下车</span>
        )}
      </div>
      <div className="settle-row">
        <span>一口价（下单议定 · {km} km）</span>
        <b>¥{due}</b>
      </div>
      <div className="settle-row">
        <span>
          实际乘车（{actualKm} km{here ? ' · 当前位置' : ''}）
        </span>
        <span>¥{should.toFixed(2)}</span>
      </div>
      <div className="settle-row total">
        <span>{extraFee > 0 ? '需补差价' : '应付合计'}</span>
        <b style={{ color: extraFee > 0 ? 'var(--red)' : 'var(--teal)' }}>
          ¥{(due + extraFee).toFixed(2)}
        </b>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        {extraFee > 0
          ? '实际下车地比下单终点更远，额外里程需补齐差价。'
          : '一口价已包含全程，实际里程缩短的部分不退还、堵车也不再加价。'}
      </p>
    </div>
  )
}
