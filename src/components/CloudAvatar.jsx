// 客服 IP「小云朵」头像：一朵会笑的云，纯 SVG，跟着尺寸缩放。
export default function CloudAvatar({ size = 30, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="小云朵"
    >
      <circle cx="32" cy="32" r="32" fill="#E8F7FF" />
      <path
        d="M16.5 41.5a9.8 9.8 0 0 1 2.2-19.2 12.4 12.4 0 0 1 23.2-1.3 10.2 10.2 0 0 1 5.3 20.5Z"
        fill="#fff"
        stroke="#B9DDEB"
        strokeWidth="1.4"
      />
      <circle cx="26" cy="31" r="3.2" fill="#2B4A5A" />
      <circle cx="39" cy="31" r="3.2" fill="#2B4A5A" />
      <circle cx="27.2" cy="29.8" r="1.2" fill="#fff" />
      <circle cx="40.2" cy="29.8" r="1.2" fill="#fff" />
      <ellipse cx="20.5" cy="36" rx="4" ry="2.2" fill="#FFAF9E" opacity="0.85" />
      <ellipse cx="44.5" cy="36" rx="4" ry="2.2" fill="#FFAF9E" opacity="0.85" />
      <path d="M29 36q3.5 4.5 7 0" stroke="#2B4A5A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}
