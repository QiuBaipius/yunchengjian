// 计价服务：一口价（起步 1 元 / 1km，之后 0.75 元/km）× 运营模式系数
//
// 已下线「特别高峰溢价」：确认窗口里看到的价格就是最终价格，
// 三种模式只按系数区分 —— 标准 1.0、效率 1.4、专属 1.9。
import { PRICING } from '../data/config.js'

export function fare(kmVal) {
  if (kmVal <= PRICING.baseKm) return PRICING.baseFare
  return round2(PRICING.baseFare + (kmVal - PRICING.baseKm) * PRICING.perKm)
}

export function round2(n) {
  return Math.round(n * 100) / 100
}

// 兼容旧接口：溢价已下线，恒为 1
export function surgeFactor() {
  return 1
}

export function priceFor(kmVal) {
  const base = fare(kmVal)
  return { base, surge: 1, total: base }
}

// 按运营模式计价
//   标准模式：里程一口价
//   效率服务：里程一口价 × 1.4
//   专属服务：里程一口价 × 1.9
export function priceForService(kmVal, service = 'standard', _date, _demandRatio) {
  const factor = service === 'efficiency' ? PRICING.efficiencyFactor : service === 'exclusive' ? PRICING.exclusiveFactor : 1
  const base = round2(fare(kmVal) * factor)
  return { base, surge: 1, total: base, service, factor }
}

// 兼容：界面已不再展示溢价文案
export function surgeText() {
  return ''
}
