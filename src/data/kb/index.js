// 分级 RAG 知识库入口
//
// 结构（三级）：
//   L1 分类导览 —— 一个主题「是什么 / 归谁管」，用于先定位到分类（召回路径的第一跳）
//   L2 规则条文 —— 用户真正会问到的规则口径，含适用条件与例外
//   L3 参数细节 —— 具体数字、阈值、计算公式、示例，回答里有数字时必须有它兜底
//
// 每条记录都必须带 src（出处）：PRD 章节 / 变更轮次 / 实现文件。
// 客服回答里的每个结论都要能回指到某条记录，模型不允许使用库外知识。
import account from './account.js'
import area from './area.js'
import cancel from './cancel.js'
import dispatch from './dispatch.js'
import invoice from './invoice.js'
import lost from './lost.js'
import plan from './plan.js'
import pricing from './pricing.js'
import service from './service.js'
import ticket from './ticket.js'
import trip from './trip.js'

// 分类先验：命中这些词时，该分类下的记录整体加权（比纯词法更稳）
export const CATS = [
  { id: 'price', name: '计价与支付', icon: '💰', keywords: ['价格', '价钱', '钱', '贵', '便宜', '计费', '计价', '多少钱', '车费', '收费', '扣费', '金额', '支付', '付款', '溢价', '涨价'] },
  { id: 'match', name: '派单与等待', icon: '🚐', keywords: ['派单', '匹配', '接单', '车辆', '司机', '座位', '拥挤', '没车', '等多久', '还要等', '什么时候来', '拒单'] },
  { id: 'trip', name: '行程与改站', icon: '🛣️', keywords: ['行程', '改站', '改目的地', '提前下车', '路线', '绕路', '到站', '错过', '没赶上', '落下', '开错'] },
  { id: 'cancel', name: '取消与退款', icon: '↩️', keywords: ['取消', '退单', '退款', '退钱', '罚金', '违约金', '申诉', '扣钱'] },
  { id: 'ticket', name: '乘车码', icon: '🎫', keywords: ['乘车码', '扫码', '核销', '二维码', '刷码', '码'] },
  { id: 'invoice', name: '发票', icon: '🧾', keywords: ['发票', '开票', '报销', '抬头', '邮箱'] },
  { id: 'lost', name: '失物招领', icon: '🔍', keywords: ['失物', '丢了', '遗失', '捡到', '招领', '忘拿', '物品'] },
  { id: 'area', name: '范围与站点', icon: '🗺️', keywords: ['范围', '站点', '区域', '边界', '线路', '时段', '覆盖', '校区', '乘降点'] },
  { id: 'plan', name: '规划与换乘', icon: '🧭', keywords: ['规划', '换乘', '地铁几号线', '方案', '怎么走', '公交', '步行'] },
  { id: 'account', name: '账户与评价', icon: '👤', keywords: ['评价', '评分', '星级', '历史订单', '定位', '隐私', '投诉', '反馈'] },
  { id: 'service', name: '客服与人工', icon: '🎧', keywords: ['客服', '人工', '机器人', '你是谁', '转接'] },
]

export const KB = [...pricing, ...dispatch, ...trip, ...cancel, ...ticket, ...invoice, ...lost, ...area, ...plan, ...account, ...service]

export const KB_BY_ID = new Map(KB.map((d) => [d.id, d]))

export const KB_STATS = {
  total: KB.length,
  cats: CATS.length,
  levels: KB.reduce((acc, d) => ({ ...acc, [d.level]: (acc[d.level] || 0) + 1 }), {}),
  updatedAt: '2026-11-16',
}

export function catOf(id) {
  return CATS.find((c) => c.id === id) || null
}
