// 功能介绍：参考滴滴小巴的图文说明风格
// 渐变天蓝头图 + 手绘黄色标记 + 卡通小巴吉祥物 + 三列卖点 + 两种出行模式 + 四步流程 + 规则卡
import { Link, useNavigate } from 'react-router-dom'
import { LINES, STOPS } from '../data/config.js'
import Icon from '../components/Icon.jsx'

const STOP_COUNT = STOPS.length
const LINE_TEXT = LINES.map((l) => `${l.id} ${l.name}`).join(' / ')

const T = {
  points: [
    { icon: 'pin', title: '站点上下车', line1: '就近匹配乘降点', line2: '步行 1–3 分钟' },
    { icon: 'card', title: '一口价', line1: '确认时锁定价格', line2: '行程结束再付' },
    { icon: 'train', title: '小车接驳', line1: '接驳 + 地铁联运', line2: '跨区也能一程走' },
  ],
  steps: [
    { n: '1', title: '输入目的地', desc: '直接打字或选历史地点，系统自动匹配最近乘降点', art: 'type' },
    { n: '2', title: '确认行程', desc: '同屏给出预计路径、一口价与接驾时间，再选服务类型', art: 'match' },
    { n: '3', title: '扫码上下车', desc: '确认呼叫即派单，不用先付款；上下车各刷一次乘车码', art: 'code' },
    { n: '4', title: '行程结束统一支付', desc: '全部行程走完再一次性付款，跨区两条线路合并成一张账单', art: 'pay' },
  ],
  rules: [
    { icon: 'ticket', title: '乘车码', text: '每 60 秒自动刷新，请勿截图外传；上下车各核销一次。' },
    { icon: 'card', title: '后付费', text: '确认行程时只锁定一口价，车辆出发不扣款；全部行程结束后统一支付，跨区两张车费合并结算。' },
    { icon: 'back', title: '取消', text: '派单后 40 秒内免费取消；超过 40 秒按车辆是否因你改变轨迹判断。因为不预付，正常取消不涉及退款。' },
    { icon: 'route', title: '改站与提前下车', text: '可改到本程预计轨迹上的任意一站。跨区订单在换乘前改站或提前下车，需先取消已自动呼叫的下一程。' },
    { icon: 'receipt', title: '发票', text: '行程结束后在订单详情开电子发票，支持按行程合并开具。' },
  ],
}

export default function Guide() {
  const nav = useNavigate()
  return (
    <div className="page scroll g2">
      <div className="nav g2-nav">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h2>一分钟了解云乘见</h2>
        <span className="g2-nav-dots">···</span>
      </div>

      {/* 头图 */}
      <div className="g2-hero">
        <div className="g2-hero-in">
          <h1>
            一分钟了解
            <br />
            <span className="g2-mark">云乘见</span>
          </h1>
          <p>网约车的便利 · 公交的实惠 · 地铁的衔接</p>
        </div>
        <BusMascot />
        <span className="g2-spark s1" />
        <span className="g2-spark s2" />
        <span className="g2-spark s3" />
      </div>

      <div className="g2-body">
        {/* 三个卖点 */}
        <div className="g2-points">
          {T.points.map((p) => (
            <div key={p.title} className="g2-point">
              <span className="g2-point-ico">
                <Icon name={p.icon} size={20} />
              </span>
              <b>{p.title}</b>
              <i>{p.line1}</i>
              <i>{p.line2}</i>
            </div>
          ))}
        </div>

        <h2 className="g2-h">
          <span>两种出行方式 任选</span>
        </h2>

        {/* 模式 1 */}
        <section className="g2-mode">
          <div className="g2-mode-head">
            <b>模式 1 社区快车</b>
          </div>
          <p className="g2-sub">
            <i />
            一次呼叫，区内直达
            <span>（不用换乘、不用等固定班次）</span>
          </p>

          <div className="g2-figure">
            <div className="g2-map">
              <svg viewBox="0 0 300 132" aria-hidden="true">
                <rect x="0" y="0" width="300" height="132" rx="12" fill="#EAF6FB" />
                <path d="M0 34 H300 M0 82 H300 M64 0 V132 M168 0 V132 M238 0 V132" stroke="#D6E9F1" strokeWidth="6" />
                <path d="M0 58 H300" stroke="#CFE6F0" strokeWidth="10" />
                <path
                  d="M36 104 C 70 104, 76 58, 112 58 S 168 58, 186 40 S 232 30, 258 30"
                  fill="none"
                  stroke="#2FB37A"
                  strokeWidth="3.5"
                  strokeDasharray="7 6"
                  strokeLinecap="round"
                />
                <circle cx="36" cy="104" r="7" fill="#fff" stroke="#2FB37A" strokeWidth="3" />
                <circle cx="258" cy="30" r="8" fill="#FF7A3D" stroke="#fff" strokeWidth="3" />
                <text x="46" y="122" fontSize="9" fill="#6B8A96">你</text>
                <text x="216" y="22" fontSize="9" fill="#6B8A96">下车点</text>
              </svg>
              <span className="g2-map-pill">步行 2 分钟 · 180 m</span>
            </div>
            <p className="g2-cap">从最近乘降点上车，一路直达你的下车站点</p>
          </div>

          <p className="g2-desc">
            传统公交在同一个区域内跑的是<b>固定线路</b>：两点不落在一条线上就得换乘，班次固定、等车久，
            站点还分散在几条街上。云乘见把整个运营区当成一张可呼叫的网——
            <b>一次呼叫，车辆按你的起终点直接规划路线、中途不换线</b>，
            上下车点都从 {LINE_TEXT} 两条线共 <b>{STOP_COUNT} 个乘降点</b> 里就近匹配，
            通常步行 1–3 分钟就到，站点跟着人走而不是人跟着站牌走。
          </p>
        </section>

        {/* 模式 2 */}
        <section className="g2-mode">
          <div className="g2-mode-head alt">
            
            <b>模式 2 跨区联运</b>
          </div>
          <p className="g2-sub">
            <i />
            接驳 + 地铁 + 接驳
            <span>（规划页一程搞定）</span>
          </p>

          <div className="g2-figure">
            <div className="g2-metro">
              <div className="g2-metro-row">
                <span className="g2-seg walk">步行 3 分</span>
                <span className="g2-seg bus">接驳 6 分</span>
                <span className="g2-seg metro">地铁 14 分</span>
                <span className="g2-seg bus2">接驳 5 分</span>
              </div>
              <div className="g2-metro-dots">
                <i className="on" />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="g2-metro-meta">
                <span>全程约 41 分钟</span>
                <span>换乘 1 次</span>
              </div>
            </div>
            <p className="g2-cap">各段用不同颜色标注，一眼看清在哪换乘</p>
          </div>

          <p className="g2-desc">
            目的地超出接驳区时，去「规划」页输入起终点，系统会把
            <b> 步行 → 接驳公交 → 地铁 → 接驳公交 </b>
            拼成一条完整路线，标注每一段的用时与下车站。
          </p>
        </section>

        <h2 className="g2-h">
          <span>三种服务类型 按需选</span>
        </h2>

        <div className="g2-svc">
          <div className="g2-svc-card">
            <div className="g2-svc-top">
              <span className="g2-svc-ico"><Icon name="bus" size={18} /></span>
              <b>标准模式</b>
              <em>默认 · 最省</em>
            </div>
            <p>
              整个运营区是一张可呼叫的网。上下车点均为预设站点，系统把你的订单插进最顺路的车辆行程，
              从你的上车站点直达下车站点，区内不需要换乘、也不用等固定班次；
              沿途可能接送同向乘客，因此价格最低。
            </p>
            <div className="g2-svc-tags">
              <span>区内直达</span>
              <span>无需换乘</span>
              <span>站点就近</span>
            </div>
          </div>
          <div className="g2-svc-card eff">
            <div className="g2-svc-top">
              <span className="g2-svc-ico"><Icon name="van" size={18} /></span>
              <b>效率服务</b>
              <em>沿最优路径</em>
            </div>
            <p>
              上下车点同样是预设站点，全程沿你的最优路径行驶，不存在「绕路」这一说。
              空车来接时，车沿你起点到终点的最优道路走，中途最多停 4 站接同向乘客；
              如果来接你的不是空车，说明你的起点、终点与最优路线都落在车上已有乘客的最优路线上。
            </p>
            <div className="g2-svc-tags">
              <span>沿最优路径</span>
              <span>最多停 4 站</span>
              <span>空车优享</span>
            </div>
          </div>
          <div className="g2-svc-card exc">
            <div className="g2-svc-top">
              <span className="g2-svc-ico"><Icon name="car" size={18} /></span>
              <b>专属服务</b>
              <em>一人一车</em>
            </div>
            <p>
              类似出租车，只为你一名乘客服务。途中不接其他人，上下车不受预设站点约束，
              可在运营范围内的道路旁就近上下车，行程中还能「就近下车」按当前位置结算。
            </p>
            <div className="g2-svc-tags">
              <span>不拼载</span>
              <span>可就近下车</span>
              <span>优享直达</span>
            </div>
          </div>
        </div>

        <h2 className="g2-h">
          <span>四步完成一次乘车</span>
        </h2>

        <div className="g2-steps">
          {T.steps.map((s) => (
            <div key={s.n} className="g2-step">
              <span className="g2-step-n">{s.n}</span>
              <div className="g2-step-t">
                <b>{s.title}</b>
                <p>{s.desc}</p>
              </div>
              <StepArt kind={s.art} />
            </div>
          ))}
        </div>

        <h2 className="g2-h">
          <span>这些规则要先知道</span>
        </h2>

        <div className="g2-rules">
          {T.rules.map((r) => (
            <div key={r.title} className="g2-rule">
              <span className="g2-rule-ico">
                <Icon name={r.icon} size={17} />
              </span>
              <b>{r.title}</b>
              <p>{r.text}</p>
            </div>
          ))}
        </div>

        <div className="g2-cta">
          <Link to="/" className="g2-btn">立即叫车</Link>
          <Link to="/plan" className="g2-btn ghost">先规划一条路线</Link>
        </div>

        <p className="g2-note">图示为流程示意，实际站距、用时与金额以页面展示为准</p>
      </div>
    </div>
  )
}

// ---- 卡通小巴吉祥物 ----
function BusMascot() {
  return (
    <svg className="g2-bus" viewBox="0 0 180 150" aria-hidden="true">
      <ellipse cx="92" cy="136" rx="56" ry="7" fill="#0E7FA8" opacity="0.14" />
      {/* 站牌 */}
      <rect x="140" y="52" width="6" height="66" rx="3" fill="#C9A227" />
      <rect x="126" y="30" width="34" height="26" rx="5" fill="#FF7A3D" />
      <text x="143" y="47" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="600">云乘见</text>
      {/* 车身 */}
      <rect x="18" y="44" width="112" height="66" rx="20" fill="#FFC83D" />
      <rect x="18" y="44" width="112" height="66" rx="20" fill="none" stroke="#E9A400" strokeWidth="2" />
      {/* 车窗（脸） */}
      <rect x="28" y="54" width="92" height="30" rx="12" fill="#BFE9F7" />
      <circle cx="55" cy="68" r="6.5" fill="#fff" />
      <circle cx="93" cy="68" r="6.5" fill="#fff" />
      <circle cx="56.5" cy="69" r="3.4" fill="#12232E" />
      <circle cx="94.5" cy="69" r="3.4" fill="#12232E" />
      <path d="M66 78 Q74 84 82 78" stroke="#12232E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="76" r="3.6" fill="#FF9C8A" opacity="0.75" />
      <circle cx="108" cy="76" r="3.6" fill="#FF9C8A" opacity="0.75" />
      {/* 下裙 + 灯 */}
      <rect x="18" y="90" width="112" height="14" rx="7" fill="#F2A93B" />
      <circle cx="122" cy="97" r="4.5" fill="#FFF3C4" stroke="#E9A400" strokeWidth="1.5" />
      <rect x="26" y="96" width="20" height="4" rx="2" fill="#FFE9A8" />
      {/* 轮子 */}
      <circle cx="48" cy="114" r="11" fill="#2A3B45" />
      <circle cx="48" cy="114" r="4.5" fill="#8FA3AD" />
      <circle cx="104" cy="114" r="11" fill="#2A3B45" />
      <circle cx="104" cy="114" r="4.5" fill="#8FA3AD" />
      {/* 小装饰 */}
      <circle cx="150" cy="104" r="4" fill="#FFD84D" />
    </svg>
  )
}

// ---- 步骤小插画（纯 CSS/HTML，避免外部图片） ----
function StepArt({ kind }) {
  if (kind === 'type') {
    return (
      <div className="g2-art">
        <span className="g2-art-pin"><Icon name="pin" size={16} /></span>
        <span className="g2-art-line">学苑广场</span>
        <span className="g2-art-caret">|</span>
      </div>
    )
  }
  if (kind === 'match') {
    return (
      <div className="g2-art">
        <span className="g2-art-car"><Icon name="van" size={18} /></span>
        <span className="g2-art-price">¥3.1</span>
        <span className="g2-art-eta">3 分钟</span>
      </div>
    )
  }
  if (kind === 'pay') {
    return (
      <div className="g2-art">
        <span className="g2-art-pay">微信支付</span>
        <span className="g2-art-ok"><Icon name="check" size={10} strokeWidth={2.6} /></span>
      </div>
    )
  }
  return (
    <div className="g2-art">
      <QrArt />
      <span className="g2-art-qr-t">乘车码</span>
    </div>
  )
}


// ---- 真实感二维码插画（静态示意，非可扫码）----
function QrArt() {
  const finders = [[3, 3], [17, 3], [3, 17]]
  const bits = [
    [10,3],[12,3],[14,4],[11,5],[13,5],[10,7],[12,7],[15,7],
    [4,10],[6,10],[8,11],[5,12],[7,13],[9,12],[11,10],[13,11],[15,10],[18,12],[20,10],
    [3,20],[5,21],[7,20],[9,22],[11,20],[13,21],[15,20],[18,21],[20,20],
    [10,17],[12,18],[14,17],[16,19],[18,17],[20,18],[10,20],[12,21],
  ]
  return (
    <svg className="g2-art-qr" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="0" y="0" width="24" height="24" rx="2" fill="#fff" />
      {finders.map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 0.5} y={y - 0.5} width="5" height="5" rx="0.6" fill="#12262f" />
          <rect x={x + 0.6} y={y + 0.6} width="2.8" height="2.8" rx="0.3" fill="#fff" />
          <rect x={x + 1.3} y={y + 1.3} width="1.4" height="1.4" rx="0.2" fill="#12262f" />
        </g>
      ))}
      {bits.map(([x, y], i) => <rect key={i} x={x} y={y} width="1.2" height="1.2" rx="0.2" fill="#12262f" />)}
    </svg>
  )
}
