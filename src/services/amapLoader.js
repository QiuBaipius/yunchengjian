// 高德地图 JS API 动态加载（单例 + 失败缓存，避免每次进页面都重试一个不可用的 key）
import { getAmapKey, getAmapSecurityCode } from '../data/mapConfig.js'

let promise = null
const FAIL_KEY = 'ycx.amap.error'

const WHY = {
  USERKEY_PLAT_NOMATCH: '该 key 的服务平台不是「Web端(JS API)」（当前多为微信小程序类型）',
  INVALID_USER_KEY: 'key 无效或已被删除',
  USERKEY_PLAT_NOMATCH_SECURITY: '未配置安全密钥或安全密钥不匹配',
  INVALID_USER_SCODE: '安全密钥（securityJsCode）不正确',
  USER_KEY_RESTRICT: '该 key 的域名白名单不允许当前域名调用',
  DAILY_QUERY_OVER_LIMIT: '该 key 今日配额已用尽',
}

// 高德 key 出错时会返回 JSON（不是 JS），借它读出具体原因，给用户可执行的提示
async function sniffReason(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    const text = await r.text()
    const m = /"info"\s*:\s*"([A-Z_]+)"/.exec(text)
    if (!m) return null
    return WHY[m[1]] || `高德返回 ${m[1]}`
  } catch {
    return null
  }
}

export function loadAMap() {
  if (typeof window === 'undefined') return Promise.reject(new Error('浏览器环境不可用'))
  if (window.AMap) return Promise.resolve(window.AMap)

  const cached = sessionStorage.getItem(FAIL_KEY)
  if (cached) return Promise.reject(new Error(cached))
  if (promise) return promise

  const key = getAmapKey()
  if (!key) return Promise.reject(new Error('尚未配置高德 key'))

  const securityCode = getAmapSecurityCode()
  if (securityCode) {
    window._AMapSecurityConfig = { securityJsCode: securityCode }
  }

  const url = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Scale,AMap.ToolBar,AMap.Driving,AMap.Walking,AMap.Transfer,AMap.PlaceSearch,AMap.Geocoder,AMap.Geolocation`

  promise = new Promise((resolve, reject) => {
    const fail = (msg) => {
      sessionStorage.setItem(FAIL_KEY, msg)
      promise = null
      reject(new Error(msg))
    }
    const s = document.createElement('script')
    s.src = url
    s.async = true
    s.onload = async () => {
      if (window.AMap) return resolve(window.AMap)
      const reason = await sniffReason(url)
      fail(reason || '高德返回的不是地图脚本：该 key 可能不是「Web端(JS API)」类型')
    }
    s.onerror = async () => {
      // 浏览器可能因返回 JSON（key 类型不符）而判定脚本加载失败，先问清楚原因再报错
      const reason = await sniffReason(url)
      fail(reason || '高德地图脚本加载失败：请检查网络连通性（或浏览器拦截了 webapi.amap.com）')
    }
    document.head.appendChild(s)
    setTimeout(() => {
      if (!window.AMap) fail('高德地图加载超时，请检查网络')
    }, 12000)
  })
  return promise
}

// 手动重试（换上新 key 后调用）
export function resetAMap() {
  sessionStorage.removeItem(FAIL_KEY)
  promise = null
}
