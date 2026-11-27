// AI 在线客服「小云朵」
// - 回答由服务端分级 RAG（平台规则库 + 订单事实）驱动，流式返回
// - 订单上下文可切换：模型能看到你名下最近几笔订单，并结合当前咨询的那一笔解释
// - 涉及退款/账务/投诉由服务端判定后自动登记人工工单，也可点右上角「转人工」
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/store.js'
import {
  escalateSupport,
  feedbackSupport,
  openService,
  serviceSend,
  setServiceOrder,
  stopSupport,
} from '../store/actions.js'
import { quickAsks } from '../services/support.js'
import { stopById } from '../data/config.js'
import Icon from '../components/Icon.jsx'
import CloudAvatar from '../components/CloudAvatar.jsx'

// 轻量渲染：只处理换行、列表符、**加粗**；依据编号（【K1】/【O1】）只作模型内部标记，不展示
function Line({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

function Body({ text }) {
  const clean = String(text).replace(/【[KOT]\d+】/g, '')
  const lines = clean.split('\n')
  return (
    <div className="cs-text">
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} className="cs-gap" />
        const li = /^[·•-]\s*/.test(ln)
        return (
          <div key={i} className={li ? 'cs-li' : 'cs-p'}>
            <Line text={li ? ln.replace(/^[·•-]\s*/, '') : ln} />
          </div>
        )
      })}
    </div>
  )
}

export default function Service() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const orderId = params.get('order')
  const service = useStore((s) => s.service)
  const orders = useStore((s) => s.orders)
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  // 首次进入开新会话；之后只切换「咨询哪一笔订单」，不把前面的对话清掉
  useEffect(() => {
    const want = orderId || null
    const cur = service.orderId || null
    if (want === cur && service.msgs.length) return
    if (!service.msgs.length) openService(want)
    else setServiceOrder(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  // 新消息滚到底
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [service.msgs, service.pending])

  const order = orderId ? orders.find((o) => o.id === orderId) : null
  const recent = useMemo(
    () => [...orders].sort((a, b) => String(b.orderTime || '').localeCompare(String(a.orderTime || ''))).slice(0, 8),
    [orders],
  )

  function send(text) {
    const q = (text ?? input).trim()
    if (!q) return
    setInput('')
    serviceSend(q)
  }

  const asks = quickAsks(order)

  return (
    <div className="page cs-page">
      <div className="nav">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h2>在线客服</h2>
        <button className="cs-nav-act" onClick={escalateSupport} disabled={service.human}>
          {service.human ? '已转人工' : '转人工'}
        </button>
      </div>

      <div className="cs-head">
        <div className="cs-who">
          <CloudAvatar size={30} className="cs-avatar" />
          <div>
            <b>小云朵</b>
            <div className="cs-sub">
              <i className="cs-live" /> AI 客服 · 依据平台规则库与你的订单作答
            </div>
          </div>
        </div>
        <select
          className="cs-select"
          value={service.orderId || ''}
          onChange={(e) => setServiceOrder(e.target.value || null)}
        >
          <option value="">不关联订单</option>
          {recent.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} · {stopById(o.fromId)?.name || ''}→{stopById(o.actualAlightId || o.toId)?.name || ''}
            </option>
          ))}
        </select>
      </div>

      <div className="chat cs-chat" ref={listRef}>
        {service.msgs.map((m, mi) => {
          if (m.role === 'sys') {
            return (
              <div key={m.id} className="cs-sys">
                {m.text}
              </div>
            )
          }
          if (m.role === 'me') {
            return (
              <div key={m.id} className="cs-row me">
                <div className="bubble me">{m.text}</div>
              </div>
            )
          }
          return (
            <div key={m.id} className="cs-row bot">
              <CloudAvatar size={26} className="cs-avatar sm" />
              <div className="cs-bot-wrap">
                <div className={`bubble bot cs-bubble ${m.error ? 'err' : ''}`}>
                  {m.text ? <Body text={m.text} /> : <span className="cs-typing"><i /><i /><i /></span>}
                  {m.streaming && m.text && <span className="cs-cursor" />}
                  {m.stopped && <div className="cs-meta-line">已停止生成</div>}
                </div>

                {m.degraded && <div className="cs-meta-line">模型繁忙，已按规则库原文答复</div>}

                {!m.streaming && !m.error && mi > 0 && (
                  <div className="cs-acts">
                    <button className={m.feedback === 'up' ? 'on' : ''} onClick={() => feedbackSupport(m.id, true)}>
                      <Icon name="thumbUp" size={13} /> 有用
                    </button>
                    <button className={m.feedback === 'down' ? 'on' : ''} onClick={() => feedbackSupport(m.id, false)}>
                      <Icon name="thumbUp" size={13} className="cs-thumb-down" /> 没解决
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="cs-compose">
        {service.msgs.length <= 1 && (
          <div className="cs-asks">
            {asks.map((a) => (
              <button key={a} className="chip teal" onClick={() => send(a)}>
                {a}
              </button>
            ))}
          </div>
        )}
        <div className="cs-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
            }}
            placeholder={service.human ? '补充说明，会记录到人工工单' : '描述你的问题，小云朵按平台规则答复'}
          />
          {service.pending ? (
            <button className="cs-send stop" onClick={stopSupport}>
              停止
            </button>
          ) : (
            <button className="cs-send" onClick={() => send()} disabled={!input.trim()}>
              发送
            </button>
          )}
        </div>
        <p className="cs-note">AI 按平台规则作答，退款与账务以人工复核为准</p>
      </div>
    </div>
  )
}
