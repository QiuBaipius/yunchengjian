// 全局状态：基于 useSyncExternalStore 的轻量外部存储 + localStorage 持久化
import { useSyncExternalStore } from 'react'
import { SEED_MESSAGES, SEED_ORDERS } from '../data/config.js'
import { sim } from '../services/sim.js'

const STORAGE_KEY = 'ycx.store.v1'

const initialState = {
  user: {
    nickname: '大连乘客',
    prefs: { rides: 0 }, // 乘车次数等个人统计
    locationPermission: 'unknown', // unknown | granted | denied
    location: null,
  },
  trip: { fromId: null, toId: null, outOfRegion: false, notice: '', service: 'standard' },
  match: { quoteId: null, status: 'idle', quote: null }, // idle | searching | matched | no_match
  activeOrder: null,
  activeRoute: null, // 已锁定的真实导航路线 { pickup, dest }（不进 localStorage，仅内存）
  orders: [],
  messages: [],
  toasts: [],
  fleet: [],
  service: {
    // AI 客服会话：msgs 里每条都带引用（refs 规则条文 / quotes 订单事实），
    // 消息结构 { id, role: 'me'|'bot'|'sys', text, refs, quotes, streaming, cited, escalate }
    msgs: [],
    human: false,
    orderId: null,
    staff: false,
    pending: false,
  },
}

let state = initialState
const listeners = new Set()
let hydrated = false

function persist() {
  try {
    const { user, orders, messages, trip } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, orders, messages, trip }))
  } catch {
    /* 忽略存储失败 */
  }
}

function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      state = {
        ...state,
        user: { ...state.user, ...saved.user },
        orders: saved.orders?.length ? saved.orders : [...SEED_ORDERS],
        messages: saved.messages?.length ? saved.messages : SEED_MESSAGES.map((m) => ({ ...m })),
        // 每次打开都是新的出行：起终点不跨会话保留（历史地点在 places 里单独存）
        trip: { ...state.trip, service: saved.trip?.service || state.trip.service },
      }
      // 刷新页面时未完成的行程无法继续模拟，标记取消
      if (saved.activeOrder && !['completed', 'cancelled'].includes(saved.activeOrder.status)) {
        const stale = {
          ...saved.activeOrder,
          status: 'cancelled',
          refund: { amount: saved.activeOrder.paidAmount || 0, note: '页面刷新导致行程中断，车费原路退回' },
        }
        state.orders = state.orders.map((o) => (o.id === stale.id ? stale : o))
      }
    } else {
      state = {
        ...state,
        orders: SEED_ORDERS.map((o) => ({ ...o })),
        messages: SEED_MESSAGES.map((m) => ({ ...m })),
      }
    }
  } catch {
    state = { ...state, orders: SEED_ORDERS.map((o) => ({ ...o })), messages: SEED_MESSAGES.map((m) => ({ ...m })) }
  }
  state.fleet = sim.fleetSnapshot()
}

export function getState() {
  // 调试钩子：验收脚本要读「第二程车实时位置」这类内部状态，生产构建里不存在
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__store = state
    // 站点/站台数据也挂一份，验收脚本要核对「停靠线路」「路侧后缀」与站台配对
    if (!window.__ycx) {
      import('../data/config.js').then((c) => {
        window.__ycx = { STOPS: c.STOPS, INTERCHANGES: c.INTERCHANGES, stopById: c.stopById }
      })
    }
  }
  return state
}

export function setState(updater) {
  const next = typeof updater === 'function' ? updater(state) : updater
  if (next !== state) {
    state = next
    persist()
    listeners.forEach((l) => l())
  }
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getState()),
  )
}

// 供 actions 使用的内部工具
export const internal = { hydrate, setState, getState }
