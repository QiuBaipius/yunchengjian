// 车辆匹配面板：匹配中 / 等待超20分钟不匹配 / 匹配成功三种状态
import CrowdingBadge from './CrowdingBadge.jsx'
import { stopById, serviceMode } from '../data/config.js'

export default function MatchPanel({ match, itinerary, onCall, onModify, onCancelMatch, onRematch, busy }) {
  const from = match.quote ? stopById(match.quote.fromId) : null
  const to = match.quote ? stopById(match.quote.toId) : null
  const cross = !!itinerary?.cross

  if (match.status === 'searching') {
    return (
      <div className="sheet">
        <div className="handle" />
        <div className="matching">
          <div className="spinner" />
          <div>
            <b>{cross ? '正在匹配第一程车辆…' : '正在匹配最合适的车辆…'}</b>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              高峰期可能需要等待。等待过程中可取消匹配或修改目的地；若预估等待超过 20 分钟将不会派单。
            </p>
          </div>
        </div>
        <div className="row-btns" style={{ marginTop: 12 }}>
          <button className="btn outline" onClick={onModify}>修改目的地</button>
          <button className="btn ghost" onClick={onCancelMatch}>取消匹配</button>
        </div>
      </div>
    )
  }

  if (match.status === 'no_match') {
    return (
      <div className="sheet">
        <div className="handle" />
        <b>暂无可派单车辆</b>
        <p className="hint">
          {match.quote?.reason === 'wait_too_long'
            ? `附近顺路车辆预估需要等待 ${match.quote?.maxEtaPickupMin || 20} 分钟，超过 20 分钟，系统不会匹配。`
            : '当前附近没有符合顺路与容量要求的车辆，请稍后再试。'}
        </p>
        <div className="row-btns">
          <button className="btn outline" onClick={onModify}>修改目的地</button>
          <button className="btn ghost" onClick={onCancelMatch}>返回</button>
        </div>
      </div>
    )
  }

  const m = match.quote?.match
  if (!m) return null
  const mode = serviceMode(match.quote?.service)
  const exclusive = mode.id === 'exclusive'
  return (
    <div className="sheet">
      <div className="handle" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="meta">
            匹配车辆
            {mode.id !== 'standard' && (
              <span className={`ride-mode-tag ${exclusive ? 'exc' : ''}`}>{mode.name}</span>
            )}
          </div>
          <b style={{ fontSize: 20 }}>{m.plate}</b>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="meta">{cross ? '两程合计（一口价）' : '一口价'}</div>
          <b style={{ fontSize: 22, color: 'var(--teal)' }}>¥{match.quote?.total ?? match.quote?.price?.total ?? '—'}</b>
        </div>
      </div>
      <p className="hint">
        {from?.name} → {to?.name} · {cross ? `第一程 ${match.quote?.odKm} km` : `最优路线 ${match.quote?.odKm} km`} ·
        一口价，行程结束后统一支付
        <br />
        {cross
          ? `跨区域行程：本程到「${itinerary.transferName}」后换乘 ${itinerary.legs[1]?.line || 'X2'} 线，第二程车辆会在到站前 2 分钟自动呼叫。`
          : exclusive
            ? '只服务你一名乘客，途中不会偏离去往你目的地的最优路径。'
            : mode.id === 'efficiency'
              ? '效率拼载：沿你与同车乘客共同的最优路径行驶，中途最多停 4 站。'
              : '顺路拼载：把你的订单插进最顺路的车辆行程，沿途可能接送其他乘客。'}
      </p>
      <div className="kpi">
        <div className="cell">
          <div className="k">车辆到达你</div>
          <div className="v">{m.etaPickupMin} 分钟</div>
        </div>
        <div className="cell">
          <div className="k">{cross ? '到换乘站' : '到达目的地'}</div>
          <div className="v">{m.etaDestMin} 分钟</div>
        </div>
        {exclusive ? (
          <div className="cell">
            <div className="k">服务类型</div>
            <div className="v">一人一车</div>
          </div>
        ) : (
          <>
            <div className="cell">
              <div className="k">拥挤度</div>
              <div className="v">
                <CrowdingBadge onboard={m.onboard} seats={m.seats} capacity={m.capacity} />
              </div>
            </div>
            <div className="cell">
              <div className="k">车上人数</div>
              <div className="v">
                {m.onboard}/{m.capacity}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="row-btns">
        <button className="btn outline" onClick={onModify}>修改目的地</button>
        <button className="btn ghost" onClick={onRematch}>换一辆</button>
        <button className="btn" disabled={busy} onClick={onCall}>
          {busy ? '正在呼叫…' : '呼叫'}
        </button>
      </div>
    </div>
  )
}
