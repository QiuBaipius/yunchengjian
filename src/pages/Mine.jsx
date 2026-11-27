// 我的页：只保留「个人中心」应有的内容
// 原则：凡是在首页 / 规划 / 底部 TabBar 已出现过的功能，这里不再重复入口。
import { Link, useNavigate } from 'react-router-dom'
import TabBar from '../components/TabBar.jsx'
import Icon from '../components/Icon.jsx'
import { getState, useStore } from '../store/store.js'
import { setDestStop } from '../store/actions.js'
import { stopById } from '../data/config.js'

// 我的服务：四项均不在首页与 TabBar 中出现
const SERVICES = [
  { to: '/mine/orders', icon: 'receipt', label: '我的订单', desc: '历史行程与发票' },
  { to: '/messages', icon: 'bell', label: '消息中心', desc: '失物与退款通知' },
  { to: '/service', icon: 'support', label: '在线客服', desc: '小云朵 7×24 在线' },
  { to: '/guide', icon: 'book', label: '功能介绍', desc: '一分钟了解玩法' },
]

// 碳积分：与累计公里数成正比（1 km 约合 120 碳积分，按接驳公交替代私家车的减排量折算）
const CARBON_PER_KM = 120

export default function Mine() {
  const nav = useNavigate()
  const rides = useStore((s) => s.user.prefs.rides)
  const orders = useStore((s) => s.orders)
  // 已完成（含已结算待支付）的行程都算「坐过」
  const done = orders.filter((o) => o.status === 'completed' || o.status === 'settled')
  const totalKm = done.reduce((n, o) => n + (Number(o.km) || 0), 0)
  const totalFare = done.reduce((n, o) => n + (Number(o.paidAmount || o.amountDue || o.amount) || 0), 0)
  const carbon = Math.round(totalKm * CARBON_PER_KM)
  const myRides = 11 + rides

  // 常去地点：直接按历史订单的终点聚合（按站点 id 归并，同名站不会拆成两条）
  const places = (() => {
    const m = new Map()
    done.forEach((o) => {
      if (!o.toId) return
      const name = o.toName || stopById(o.toId)?.name || '未知地点'
      const cur = m.get(o.toId) || { id: o.toId, name, n: 0 }
      cur.name = name
      cur.n += 1
      m.set(o.toId, cur)
    })
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 3)
  })()

  // 点常去地点：直接把它设成终点；有上车点就顺手跳到匹配页
  function goPlace(id) {
    setDestStop(id)
    nav(getState().trip.fromId ? '/match' : '/')
  }

  return (
    <div className="page">
      <div className="page-body mine-body">
        {/* 会员卡头 */}
        <div className="mine-card">
          <div className="mine-card-bg" />
          <div className="mine-card-row">
            <div className="avatar lg">云</div>
            <div className="mine-card-id">
              <b>大连乘客</b>
              <span className="mine-level">响应式公交 · 常乘客</span>
            </div>
          </div>
          <div className="mine-stats four">
            <div className="mine-stat">
              <b>{myRides}</b>
              <span>累计行程</span>
            </div>
            <div className="mine-stat">
              <b>{totalKm.toFixed(1)}</b>
              <span>累计公里</span>
            </div>
            <div className="mine-stat">
              <b>{carbon}</b>
              <span>碳积分</span>
            </div>
            <div className="mine-stat">
              <b>¥{totalFare.toFixed(1)}</b>
              <span>累计消费</span>
            </div>
          </div>
        </div>

        {/* 我的服务 */}
        <div className="mine-sect">
          <h3 className="mine-h">我的服务</h3>
          <div className="mine-svc">
            {SERVICES.map((s) => (
              <Link key={s.to} to={s.to} className="mine-svc-item">
                <span className="mine-svc-ico">
                  <Icon name={s.icon} size={19} />
                </span>
                <b>{s.label}</b>
                <span className="mine-svc-desc">{s.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 常去地点（按历史订单统计，不重复任何页面入口） */}
        <div className="mine-sect">
          <h3 className="mine-h">
            常去地点
            <span className="mine-h-r">按历史订单生成</span>
          </h3>
          {places.length ? (
            <div className="mine-places">
              {places.map((p) => (
                <button key={p.id} className="mine-place" onClick={() => goPlace(p.id)}>
                  <span className="mine-place-ico">
                    <Icon name="pin" size={17} />
                  </span>
                  <span className="mine-place-t">
                    <b>{p.name}</b>
                    <i>去过 {p.n} 次</i>
                  </span>
                  <span className="mine-place-go">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mine-empty">还没有完成的行程，坐一次车后这里会自动生成常去地点</div>
          )}
        </div>
      </div>
      <TabBar />
    </div>
  )
}
