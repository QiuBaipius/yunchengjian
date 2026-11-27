// 订单状态 ↔ 流程页 的唯一映射
//
// 为什么需要它：页面守卫如果只写「当前状态不在本页允许的集合里 → 回首页」，
// 那么动作（如刷码上车 verifyBoard）先改状态、导航紧接着执行时，本页会先重渲染、
// 守卫抢先 Navigate 回首页，把用户从正确的下一页挤掉。
// 统一改为「按当前状态跳到它该在的页」，即使竞态发生，落点也一定是正确的页面。
//
// 对应流程：确认行程（价格+模式）→ 呼叫即派单 → 候车 → 刷码上车 →
//           行程中（跨区在边界站点换乘）→ 下车 → 行程结束统一支付 → 评价
export const FLOW_ROUTE = {
  dispatched: '/wait',
  arrived: '/wait',
  riding: '/ride',
  transfer_wait: '/ride',
  await_alight: '/ride',
  settled: '/pay', // 行程结束，待支付
  completed: '/rate',
}

// 返回该状态应在的流程页；未知/终态返回 null
export function flowRoute(status) {
  return FLOW_ROUTE[status] || null
}
