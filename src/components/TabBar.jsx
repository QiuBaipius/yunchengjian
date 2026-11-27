import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'

const HOME_MATCH = (p) =>
  p === '/' ||
  p.startsWith('/match') ||
  p.startsWith('/pay') ||
  p.startsWith('/wait') ||
  p.startsWith('/ride') ||
  p.startsWith('/rate') ||
  p.startsWith('/map')

export default function TabBar() {
  const { pathname } = useLocation()
  const items = [
    { to: '/', label: '首页', icon: 'home', match: HOME_MATCH },
    { to: '/plan', label: '规划', icon: 'plan' },
    { to: '/mine', label: '我的', icon: 'user' },
  ]
  return (
    <nav className="tabbar">
      {items.map((it) => {
        const on = it.match ? it.match(pathname) : pathname.startsWith(it.to)
        return (
          <Link key={it.to} to={it.to} className={on ? 'on' : ''}>
            <span className="tab-ico">
              <Icon name={it.icon} size={21} strokeWidth={on ? 1.9 : 1.6} />
            </span>
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
