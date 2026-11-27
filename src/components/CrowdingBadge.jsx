// 拥挤度徽标：车上人数 / 最大载客量；低于座位数绿色「有座」，否则红色「无座」
export default function CrowdingBadge({ onboard, seats, capacity, showRatio = true }) {
  const ratio = capacity ? onboard / capacity : 0
  const seated = onboard < seats
  return (
    <span className={`chip ${seated ? 'green' : 'red'}`}>
      {seated ? '有座' : '无座'}
      {showRatio && ` · 拥挤度 ${Math.round(ratio * 100)}%`}
    </span>
  )
}
