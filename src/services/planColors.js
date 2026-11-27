// 规划结果的分方式配色与标注文案
//
// 目标：一条方案里如果混了「步行 / 响应型接驳公交 / 地铁 / 普通公交」，
// 地图上必须一眼分得清，而且同一条地铁线在任何方案里都是同一个颜色。
export const MODE_COLOR = {
  walk: '#7a8699', // 步行：石板灰 + 虚线
  shuttle: '#0f7a62', // 响应型接驳公交：品牌绿
  bus: '#e08b1a', // 常规公交（我们不出售，仅兜底显示）
}

// 大连在营地铁线路的官方色（1 号线红、2 号线蓝、3 号线黄…），
// 未收录的线路按下表顺序稳定分配，保证同名线路永远同色。
const METRO_LINE_COLOR = {
  1: '#e4002b',
  2: '#0072ce',
  3: '#f5a623',
  5: '#0e9f6e',
  12: '#00a0a0',
  13: '#7b3fa0',
}
const FALLBACK = ['#8a4fbe', '#c2410c', '#0e7490', '#4d7c0f', '#be185d']
const assigned = new Map()
let seq = 0

// "地铁2号线(海之韵--辛寨子)" → "地铁2号线"
export function lineName(line) {
  return (line || '').split('(')[0].trim()
}

export function segColor(seg) {
  if (!seg) return MODE_COLOR.shuttle
  if (seg.mode === 'walk') return MODE_COLOR.walk
  if (seg.mode === 'bus') return MODE_COLOR.bus
  if (seg.mode === 'subway') {
    const nm = lineName(seg.line)
    const m = /地铁\s*(\d+)\s*号线/.exec(nm)
    if (m && METRO_LINE_COLOR[Number(m[1])]) return METRO_LINE_COLOR[Number(m[1])]
    const key = nm || '地铁'
    if (!assigned.has(key)) assigned.set(key, FALLBACK[seq++ % FALLBACK.length])
    return assigned.get(key)
  }
  return MODE_COLOR.shuttle
}

const ICON = { walk: '🚶', shuttle: '🚐', subway: '🚇', bus: '🚌' }

// 地图上的文字标注：步行给距离，乘车给线路 + 时间
export function segLabel(seg) {
  if (!seg) return ''
  const ico = ICON[seg.mode] || ''
  if (seg.mode === 'walk') {
    const m = seg.m ?? Math.round((seg.km || 0) * 1000)
    if (m < 15) return ''
    return `${ico} 步行 ${m} 米`
  }
  const nm = lineName(seg.line)
  if (!nm) return `${ico} ${seg.mode === 'subway' ? '地铁' : '接驳'}`
  const tail = seg.min ? ` · ${seg.min} 分` : ''
  return `${ico} ${nm}${tail}`
}
