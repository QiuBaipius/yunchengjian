// 站点详情卡片：停靠线路标号、可乘降、枢纽地铁信息
export default function StopCard({ stop, onClose, onSetFrom, onSetTo, readOnly }) {
  if (!stop) return null
  return (
    <div className="stop-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <b style={{ fontSize: 16 }}>{stop.name}</b>
        <button onClick={onClose} style={{ fontSize: 14, color: 'var(--muted)' }}>✕</button>
      </div>
      <p className="hint" style={{ margin: '6px 0 10px' }}>
        线路 {stop.lines.join('、')} · 可乘降点
        {stop.hub ? ' · 关键干线接驳枢纽' : ''}
      </p>
      {stop.metro && (
        <div className="card" style={{ background: 'var(--paper)', padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 4 }}>地铁到站信息</div>
          {stop.metro.map((m) => (
            <div key={m.dir} className="meta">
              {m.dir} · 还剩 {m.left} 站 · 约 {m.min} 分钟
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="row-btns">
          {stop.type === 'both' && (
            <button className="btn ghost" onClick={() => onSetFrom?.(stop)}>设为上车点</button>
          )}
          <button className="btn" onClick={() => onSetTo?.(stop)}>设为下车点</button>
        </div>
      )}
    </div>
  )
}
