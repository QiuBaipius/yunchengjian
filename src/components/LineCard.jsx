// 线路详情卡片：线路名称、运营时间、发车间隔、运营区域、途经可乘降点
import { AREAS, stopById } from '../data/config.js'

const LINE_COLOR = { X1: '#0f7a62', X2: '#7c5cd6' }

export default function LineCard({ line, onClose }) {
  if (!line) return null
  const area = AREAS.find((a) => a.id === line.areaId)
  const color = LINE_COLOR[line.id] || '#0f7a62'
  return (
    <div className="stop-card">
      <div className="lc-head">
        <span className="ac-badge" style={{ background: color }}>
          {line.id}
        </span>
        <div className="ac-title">
          <b>{line.name}</b>
          <span>
            {area?.name || '接驳区'} · 共 {line.drawOrder.length} 个可乘降点
          </span>
        </div>
        <button className="ac-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>

      <div className="ac-kpi">
        <div className="ac-kpi-cell">
          <span>运营时间</span>
          <b>{line.hours}</b>
        </div>
        <div className="ac-kpi-cell">
          <span>发车间隔</span>
          <b>{line.interval || '高峰 10 分钟'}</b>
        </div>
        <div className="ac-kpi-cell">
          <span>运营区域</span>
          <b style={{ fontSize: 12 }}>{area?.name || '—'}</b>
        </div>
      </div>

      {line.desc && <p className="ac-line-desc">{line.desc}</p>}

      <div className="ac-sect-h" style={{ margin: '10px 0 6px' }}>
        途经可乘降点
      </div>
      <div className="lc-stops">
        {line.drawOrder.map((id, i) => {
          const s = stopById(id)
          return (
            <span key={id + i} className={`chip ${s?.hub ? 'gold' : 'blue'}`}>
              {s?.name || id}
            </span>
          )
        })}
      </div>
      <p className="ac-note" style={{ marginTop: 8 }}>
        车辆不按预设顺序行驶：同线路内上车站与下车站之间按最优路径接送，站点仅代表可乘降位置。
      </p>
    </div>
  )
}
