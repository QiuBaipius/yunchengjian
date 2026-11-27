// 确认行程弹窗（价格 + 预计路径 + 模式选择）
//
// 这一个窗口同时承担三件事：
//   ① 预计路径：同区一程；跨区两程，中间在「边界站点」换乘，可点「更换」换一个共站
//   ② 价格：一口价，合计显示；行程结束后统一支付
//   ③ 模式：标准 / 效率 / 专属 三选一；跨区可以按每程分别选
import { useMemo, useState } from 'react'
import { SERVICE_MODES, stopById } from '../data/config.js'
import { api } from '../services/api.js'
import { idleCount, pickupEtaMin, totalMin } from '../services/itinerary.js'

const LINE_COLOR = { X1: '#0f7a62', X2: '#7c5cd6' }

export default function BookingSheet({ itinerary, fleet, onChangeTransfer, onConfirm, busy }) {
  const legs = useMemo(() => itinerary?.legs || [], [itinerary])
  const [transfersOpen, setTransfersOpen] = useState(false)
  const [services, setServices] = useState(() => legs.map(() => 'standard'))

  const rows = useMemo(
    () =>
      legs.map((l, i) => {
        const svc = services[i] || 'standard'
        const price = api.pricePreview(l.km || 0.5, svc)
        return {
          ...l,
          service: svc,
          price,
          eta: pickupEtaMin(l.fromId, l.line, fleet, svc),
          empty: idleCount(fleet, l.line),
        }
      }),
    [legs, services, fleet],
  )

  const total = Math.round(rows.reduce((n, r) => n + (r.price?.total || 0), 0) * 100) / 100
  const totalKm = Math.round(rows.reduce((n, r) => n + (r.km || 0), 0) * 10) / 10
  const cross = !!itinerary?.cross
  // 预计总用时 = 各段行驶时间 + 换乘步行/候车（跨区才有）
  const totalMinutes = totalMin(rows, cross ? itinerary.transferMin : 0)

  if (!rows.length) return null

  function pick(i, id) {
    setServices((prev) => {
      const next = [...prev]
      next[i] = id
      return next
    })
  }

  return (
    <div className="sheet bk-sheet">
      <div className="handle" />

      <div className="bk-head">
        <div className="bk-head-t">
          <b>{cross ? '跨区域行程确认' : '确认行程'}</b>
          <span>
            {stopById(itinerary.legs[0].fromId)?.name} → {stopById(itinerary.legs[rows.length - 1].toId)?.name}
          </span>
        </div>
        <span className="bk-km">约 {totalMinutes} 分钟 · {totalKm} km</span>
      </div>

      {cross && (
        <div className="bk-cross">
          <div className="bk-cross-t">
            <span className="bk-cross-ico">⇄</span>
            <span>
              本次为<b>跨区域行程</b>：需在「{itinerary.transferName}」换乘 {rows[1]?.line || 'X2'} 线，
              两段票价合计结算。
            </span>
          </div>
          {!!itinerary.candidates?.length && (
            <button className="bk-cross-act" onClick={() => setTransfersOpen((v) => !v)}>
              {transfersOpen ? '收起' : '更换边界站点'}
            </button>
          )}
        </div>
      )}

      {cross && transfersOpen && (
        <ul className="bk-transfers">
          {itinerary.candidates.map((c) => (
            <li key={c.id}>
              <button
                className={`bk-transfer ${c.id === itinerary.transferId ? 'on' : ''}`}
                onClick={() => {
                  onChangeTransfer?.(c.id)
                  setTransfersOpen(false)
                }}
              >
                <span className="bk-transfer-n">
                  <b>{c.name}</b>
                  <i>
                    {c.line1} {c.km1} km + {c.line2} {c.km2} km
                  </i>
                  <i className="bk-transfer-total">
                    全程 {c.km} km · 约 {c.min} 分钟
                  </i>
                </span>
                <span className={`sv-radio ${c.id === itinerary.transferId ? 'on' : ''}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bk-path">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="bk-leg">
              <span className="bk-line" style={{ color: LINE_COLOR[r.line], borderColor: LINE_COLOR[r.line] }}>
                {r.line}
              </span>
              <span className="bk-leg-t">
                <b>
                  {stopById(r.fromId)?.name} → {stopById(r.toId)?.name}
                </b>
                <i>
                  约 {Math.max(2, Math.round((r.km || 0) / 0.5))} 分钟 · {r.km} km
                </i>
              </span>
            </div>
            {i < rows.length - 1 && (
              <div className="bk-hop">
                <span className="bk-hop-dot" />
                换乘 · 同站上车，约 2 分钟
              </div>
            )}
          </div>
        ))}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="bk-modes">
          <div className="bk-modes-head">
            <b>{rows.length > 1 ? `第 ${i + 1} 程 · ${r.line} 线服务模式` : '选择服务模式'}</b>
            <span>接驾约 {r.eta ?? '—'} 分钟（实时）</span>
          </div>
          <div className="bk-mode-row">
            {SERVICE_MODES.map((m) => {
              const p = api.pricePreview(r.km || 0.5, m.id)
              const on = r.service === m.id
              return (
                <button
                  key={m.id}
                  className={`bk-mode ${on ? 'on' : ''}`}
                  onClick={() => pick(i, m.id)}
                  aria-pressed={on}
                >
                  <span className="bk-mode-ico">{m.icon}</span>
                  <b>{m.name}</b>
                  <i>¥{p.total.toFixed(2)}</i>
                  {m.id === 'exclusive' && r.empty === 0 && <em>暂无空车</em>}
                </button>
              )
            })}
          </div>
          <p className="bk-mode-tip">{SERVICE_MODES.find((m) => m.id === r.service)?.tagline}</p>
        </div>
      ))}

      <div className="bk-stats">
        <span>
          <i>里程</i>
          <b>{totalKm} km</b>
        </span>
        <span>
          <i>预计总用时</i>
          <b>约 {totalMinutes} 分钟</b>
        </span>
        {cross && (
          <span>
            <i>含换乘</i>
            <b>{itinerary.transferMin} 分钟</b>
          </span>
        )}
      </div>

      <div className="bk-total">
        <span>一口价合计</span>
        <b>¥{total.toFixed(2)}</b>
      </div>
      <p className="bk-note">行程结束后统一支付；一口价，途中不因堵车另行加价。</p>

      <button className="btn bk-cta" disabled={busy} onClick={() => onConfirm(rows)}>
        {busy ? '正在匹配…' : cross ? `确认呼叫 · 两程合计 ¥${total.toFixed(2)}` : `确认呼叫 · ¥${total.toFixed(2)}`}
      </button>
    </div>
  )
}
