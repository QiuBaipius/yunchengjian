// 统一图标：全部手绘 SVG，24×24，1.7 描边、圆头圆角，颜色跟随 currentColor。
// 不混用 emoji / Unicode 符号——同一个界面里换了字重的图标，比没有图标更显廉价。
const PATHS = {
  home: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6.6 10.2V19a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1v-8.8" />
      <path d="M10.4 20v-4.6h3.2V20" />
    </>
  ),
  plan: (
    <>
      <path d="M4 8.5h11.5" />
      <path d="m12.8 5.6 3 2.9-3 2.9" />
      <path d="M20 15.5H8.5" />
      <path d="m11.2 12.6-3 2.9 3 2.9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.6 19.6a6.6 6.6 0 0 1 12.8 0" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 4h10v16l-2.5-1.6L12 20l-2.5-1.6L7 20V4Z" />
      <path d="M9.6 8.4h4.8M9.6 11.8h4.8" />
    </>
  ),
  bell: (
    <>
      <path d="M12 4.2a5 5 0 0 1 5 5v3.6l1.4 2.8H5.6L7 12.8V9.2a5 5 0 0 1 5-5Z" />
      <path d="M10.2 18.8a2 2 0 0 0 3.6 0" />
    </>
  ),
  support: (
    <>
      <path d="M5 13.2v-1.4a7 7 0 0 1 14 0v1.4" />
      <rect x="3.6" y="13" width="3.6" height="5" rx="1.6" />
      <rect x="16.8" y="13" width="3.6" height="5" rx="1.6" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.6A2.6 2.6 0 0 1 7.6 3H19v18H7.6A2.6 2.6 0 0 1 5 18.4V5.6Z" />
      <path d="M5 17.6h14" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.6s6.4-6.1 6.4-10.8a6.4 6.4 0 1 0-12.8 0C5.6 14.5 12 20.6 12 20.6Z" />
      <circle cx="12" cy="9.6" r="2.4" />
    </>
  ),
  thumbUp: (
    <>
      <path d="M7 20V10.4l4-6c1.5 0 2.3 1 2.1 2.5L12.5 10.4H18a1.9 1.9 0 0 1 1.8 2.5l-1.9 5.9A1.9 1.9 0 0 1 16.1 20H7Z" />
      <path d="M7 10.4H4v9.6h3" />
    </>
  ),
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  star: (
    <path d="m12 4.4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10l5.4-.8L12 4.4Z" />
  ),
  building: (
    <>
      <path d="M5 20V6.4A1.4 1.4 0 0 1 6.4 5h6.2A1.4 1.4 0 0 1 14 6.4V20" />
      <path d="M14 10h3.6A1.4 1.4 0 0 1 19 11.4V20" />
      <path d="M3.6 20h16.8" />
      <path d="M8 9h3M8 13h3M8 17h3M16 14h1M16 17h1" />
    </>
  ),
  card: (
    <>
      <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.4" />
      <path d="M3.4 9.6h17.2" />
      <path d="M6.6 14.4h3.2" />
    </>
  ),
  train: (
    <>
      <rect x="5.6" y="3.8" width="12.8" height="12.6" rx="3" />
      <path d="M5.6 9.6h12.8" />
      <path d="M9 16.4l-2 3.4M15 16.4l2 3.4" />
      <circle cx="9.2" cy="12.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="12.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  ticket: (
    <>
      <path d="M3.8 8.4V6.6a1 1 0 0 1 1-1h14.4a1 1 0 0 1 1 1v1.8a3.4 3.4 0 0 0 0 7.2v1.8a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1v-1.8a3.4 3.4 0 0 0 0-7.2Z" />
      <path d="M9.6 8v1.6M9.6 12.2v1.6M9.6 16.4V18" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.2" r="2.1" />
      <circle cx="18" cy="5.8" r="2.1" />
      <path d="M8.1 18.2h4.4a3.2 3.2 0 0 0 0-6.4h-1a3.2 3.2 0 0 1 0-6.4H16" />
    </>
  ),
  bus: (
    <>
      <rect x="4.2" y="4.2" width="15.6" height="13" rx="2.6" />
      <path d="M4.2 10.4h15.6" />
      <path d="M7.4 17.2v1.6M16.6 17.2v1.6" />
      <circle cx="8.2" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  van: (
    <>
      <path d="M3.6 16.6V9.2a1.6 1.6 0 0 1 1.6-1.6h6.4l4.6 4v5h-1.4" />
      <path d="M12.4 7.6v4h4" />
      <circle cx="7.2" cy="17.4" r="1.7" />
      <circle cx="16.4" cy="17.4" r="1.7" />
      <path d="M8.9 17.4h5.8" />
      <path d="M3.6 17.4H5.5M18.1 17.4h1.5" />
    </>
  ),
  car: (
    <>
      <path d="M4.4 16.2v-2.4l1.8-4.2A1.6 1.6 0 0 1 7.6 8.6h8.8a1.6 1.6 0 0 1 1.4.9l1.8 4.3v2.4" />
      <path d="M4.4 13.8h15.2" />
      <circle cx="7.6" cy="17.2" r="1.7" />
      <circle cx="16.4" cy="17.2" r="1.7" />
      <path d="M9.3 17.2h5.4" />
    </>
  ),
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  check: <path d="m5.5 12.6 4.2 4.2 8.8-9.4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11.2v5.2" />
      <circle cx="12" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  expand: (
    <>
      <path d="M9.4 4.4H4.4v5" />
      <path d="M4.4 4.4 10.2 10.2" />
      <path d="M14.6 19.6h5v-5" />
      <path d="M19.6 19.6 13.8 13.8" />
    </>
  ),
  swap: (
    <>
      <path d="M7.6 4.2v13.2M7.6 4.2 4.8 7M7.6 4.2 10.4 7" />
      <path d="M16.4 19.8V6.6M16.4 19.8l-2.8-2.8M16.4 19.8l2.8-2.8" />
    </>
  ),
}

export default function Icon({ name, size = 22, strokeWidth = 1.7, className = '' }) {
  const body = PATHS[name]
  if (!body) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  )
}
