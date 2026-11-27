// 运营范围卡片：点击地图边界弹出，介绍「这条线路」——名称、运营时间、运行范围、可乘降点
// 需求来源：点击运营范围边界需要能看到当前线路介绍（线路名称、运营时间等）
import { AREAS, LINES } from '../data/config.js'

const LINE_COLOR = { X1: '#0f7a62', X2: '#7c5cd6' }

export default function AreaCard({ area, onClose, onSelectLine, onSelectArea }) {
  if (!area) return null
  const line = LINES.find((l) => l.id === area.line)
  const color = LINE_COLOR[area.line] || '#0f7a62'
  const stopCount = line?.stops?.length || 0
  const extra = (area.extra || '').replace(/^延伸段：/, '')

  return (
    <div className="stop-card area-card">
      <div className="ac-head">
        <span className="ac-badge" style={{ background: color }}>
          {area.line}
        </span>
        <div className="ac-title">
          <b>{line?.name || area.name}</b>
          <span>{area.name} · 响应型接驳公交</span>
        </div>
        <button className="ac-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>

      <div className="ac-kpi">
        <div className="ac-kpi-cell">
          <span>运营时间</span>
          <b>{line?.hours || area.hours}</b>
        </div>
        <div className="ac-kpi-cell">
          <span>发车间隔</span>
          <b>{line?.interval || '高峰 10 分钟'}</b>
        </div>
        <div className="ac-kpi-cell">
          <span>可乘降点</span>
          <b>{stopCount} 个</b>
        </div>
      </div>

      {line?.desc && <p className="ac-line-desc">{line.desc}</p>}

      <div className="ac-sect">
        <div className="ac-sect-h">运行范围</div>
        <p className="ac-text">{area.desc}</p>
        {extra && (
          <>
            <div className="ac-sect-h" style={{ marginTop: 10 }}>
              延伸覆盖
            </div>
            <p className="ac-text">{extra}</p>
          </>
        )}
      </div>

      <div className="ac-note">
        边界均沿真实道路，与相邻线路不重叠；终点超出范围时会推荐最近落客点。点击地图上的
        <b>「{area.line} 运营范围」</b>标签同样可以打开本卡片。
      </div>

      <div className="ac-acts">
        <button className="btn outline" onClick={() => onSelectLine?.(line)}>
          查看 {area.line} 线路详情
        </button>
      </div>

      {AREAS.length > 1 && (
        <div className="ac-switch">
          {AREAS.filter((a) => a.id !== area.id).map((a) => (
            <button key={a.id} className="chip" onClick={() => onSelectArea?.(a)}>
              查看 {a.line} · {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
