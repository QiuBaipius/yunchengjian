// AI 客服客户端：只负责把问题与订单上下文发给本地服务，并解析 SSE 流式回复。
// 检索、提示词与模型密钥都在服务端（server/），浏览器拿不到 key。
import { stopById } from '../data/config.js'

const API = '/api/chat'
const HEALTH = '/api/health'

function orderPayload(o) {
  if (!o) return null
  return {
    id: o.id,
    status: o.status,
    fromName: stopById(o.fromId)?.name || '',
    toName: stopById(o.toId)?.name || '',
    actualAlightName: o.actualAlightId ? stopById(o.actualAlightId)?.name || '' : '',
    plate: o.plate || '',
    km: Number(o.km) || 0,
    surge: Number(o.surge) || 1,
    amount: Number(o.amount) || 0,
    paidAmount: o.paidAmount != null ? Number(o.paidAmount) : Number(o.amount) || 0,
    extraFee: Number(o.extraFee) || 0,
    penalty: Number(o.penalty) || 0,
    refund: Number(o.refund) || 0,
    orderTime: o.orderTime || '',
    boardTime: o.boardTime || '',
    alightTime: o.alightTime || '',
    duration: o.duration || '',
    rating: o.rating || null,
    invoiceEmail: o.invoiceEmail || '',
  }
}

// 热门/焦点订单排前面，最多带 5 笔，避免上下文过长
export function buildOrderContext(orders = [], focusId = null) {
  const list = [...orders]
  list.sort((a, b) => {
    if (a.id === focusId) return -1
    if (b.id === focusId) return 1
    return String(b.orderTime || '').localeCompare(String(a.orderTime || ''))
  })
  return list.slice(0, 5).map(orderPayload).filter(Boolean)
}

function parseBlock(block) {
  let event = 'message'
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return null
  try {
    return { event, data: JSON.parse(data) }
  } catch {
    return null
  }
}

/**
 * @returns {Promise<{model,degraded,error}>}
 */
export async function chatStream({ question, orderId, orders, history, onMeta, onDelta, onModel, signal }) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, orderId, orders, history }),
    signal,
  })
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg ? `${res.status} ${msg.slice(0, 120)}` : `客服服务不可用（${res.status}）`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let fin = null
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const blocks = buf.split('\n\n')
    buf = blocks.pop() || ''
    for (const block of blocks) {
      const p = parseBlock(block)
      if (!p) continue
      if (p.event === 'meta') onMeta?.(p.data)
      else if (p.event === 'model') onModel?.(p.data.model)
      else if (p.event === 'delta') onDelta?.(p.data.t)
      else if (p.event === 'done') fin = p.data
      else if (p.event === 'error') throw new Error(p.data?.message || '生成失败')
    }
  }
  return fin || { degraded: false }
}

export async function supportHealth() {
  try {
    const r = await fetch(HEALTH)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// 页面上的快捷问题：有关联订单时给"这一单"的问法，没有就给通用问法
export function quickAsks(order) {
  if (order) {
    const done = order.status === 'completed'
    return [
      '这一单为什么收这些钱？',
      done ? '这一单能开发票吗？' : '这一单是怎么算钱的？',
      order.status === 'cancelled' ? '为什么取消后没有退款？' : '我中途改站要补钱吗？',
    ]
  }
  return ['云乘见怎么收费？', '乘车码怎么用？', '我能问什么？']
}
