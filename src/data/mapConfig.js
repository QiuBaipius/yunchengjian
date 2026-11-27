// 地图与平台配置
//
// 安全说明：
// - 高德 JS API 的 key 与「安全密钥(securityJsCode)」在前端可见，必须在高德控制台为该 key
//   配置「域名白名单」，否则任何人拿到 key 都能盗刷配额；生产环境建议由后端签发/代理。
// - 微信小程序若走原生 map 组件，需改用「微信小程序」平台类型的 key + amap-wx SDK，
//   与 Web 端（JS API）的 key 不通用。
//
// key 的三级来源（优先级从高到低）：
//   1. 运行期在「地图设置」里填写的 key（存 localStorage，改完即生效，无需重新构建）
//   2. 构建期环境变量 VITE_AMAP_KEY / VITE_AMAP_SECURITY_CODE（.env.local）
//   3. 内置默认值（下方这份是「Web端(JS API)」类型的 key，可直接用于本工程）
const LS_KEY = 'ycx.amap.key'
const LS_SEC = 'ycx.amap.security'

// 高德 Web端(JS API) key —— 仅供本工程调试，生产环境请改为后端签发
const DEFAULT_KEY = 'afd9ed5287f22a90a7bbef3d09c40935'
// 2021-12 之后申请的 Web 端 key 必须配套「安全密钥 jscode」
const DEFAULT_SECURITY = 'f066ef7799e32e2c66e69f775fb57a9a'

function readLS(name) {
  try {
    return localStorage.getItem(name) || ''
  } catch {
    return ''
  }
}

export const MAP_CONFIG = {
  // 本工程固定使用高德真实地图（大连）
  provider: 'amap',
  // 微信小程序 AppID（发布小程序版本时使用）
  wxaAppId: import.meta.env.VITE_WXA_APPID || 'wx154e3a06e9882518',
}

// 当前生效的 key（运行期配置优先）
export function getAmapKey() {
  return readLS(LS_KEY) || import.meta.env.VITE_AMAP_KEY || DEFAULT_KEY
}

// 当前生效的安全密钥（2021-12 之后申请的 Web 端 key 必须配套）
export function getAmapSecurityCode() {
  return readLS(LS_SEC) || import.meta.env.VITE_AMAP_SECURITY_CODE || DEFAULT_SECURITY
}

// 是否使用了运行期临时配置
export function isRuntimeAmapKey() {
  return !!readLS(LS_KEY)
}

export function saveAmapConfig(key, securityCode) {
  try {
    if (key) localStorage.setItem(LS_KEY, key.trim())
    else localStorage.removeItem(LS_KEY)
    if (securityCode) localStorage.setItem(LS_SEC, securityCode.trim())
    else localStorage.removeItem(LS_SEC)
    return true
  } catch {
    return false
  }
}

// 是否具备启用高德的条件
export const AMAP_ENABLED = MAP_CONFIG.provider === 'amap' && !!getAmapKey()
