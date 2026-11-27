// 改站 / 提前下车选择面板：仅限车辆预计运行轨迹中的站点（PRD 规则 9）
import { stopById } from '../data/config.js'

export default function ChangeDestSheet({ mode, routeStopIds, currentToId, onClose, onConfirm }) {
  if (!routeStopIds) return null
  const stops = routeStopIds.map((id) => stopById(id)).filter(Boolean)
  return (
    <div className="popup">
      <div className="box" style={{ textAlign: 'left', maxHeight: '76%', overflow: 'auto' }}>
        <h3>{mode === 'change' ? '更改目的地' : '提前下车'}</h3>
        <p>
          {mode === 'change'
            ? '可将站点更改至车辆预计运行轨迹中的任何一站，改站后按新站点重新计价，行程结束时统一支付。'
            : '在车辆预计运行轨迹中选择一站提前下车，车费按实际乘到该站重新计价，行程结束时统一支付。'}
        </p>
        <ul className="route-stop-list">
          {stops.map((s) => (
            <li key={s.id}>
              <button className={s.id === currentToId ? 'on' : ''} onClick={() => onConfirm(s.id)}>
                <span>
                  {s.name}
                  <div className="meta">
                    {s.hub ? '可乘降 · 枢纽' : '可乘降'}
                  </div>
                </span>
                {s.id === currentToId && <span className="chip teal">当前</span>}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>取消</button>
      </div>
    </div>
  )
}
