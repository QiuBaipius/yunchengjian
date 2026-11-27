// 抽象坐标系 ↔ 真实经纬度 的线性投影（大连运营区）
//
// 业务算法（派单、计价、绕路判断）一直使用 0–320 的抽象坐标，这套坐标简单、无地理依赖。
// 接入真实地图时不必改动算法：只要把抽象坐标线性投影到真实地理范围即可，
// 地图上看到的是大连的真实道路，算法仍然在抽象坐标里工作。
//
// 刻度：UNITS_PER_KM = 40，即 1 单位 = 25 米。
// 参考点 (160,150) 对齐到运营区中心（大连高新园区 · 软件园一带），x 向东、y 向南。
import { UNITS_PER_KM } from './config.js'
import { BOUNDARY_LNGLAT, RINGS_LNGLAT } from './dalian.js'

const METERS_PER_UNIT = 1000 / UNITS_PER_KM // 25 m

// 运营区中心：辽宁省大连市甘井子区 · 高新园区软件园一带
export const GEO_ORIGIN = { x: 160, y: 150, lng: 121.5434, lat: 38.8768 }

const M_PER_DEG_LAT = 110540
const M_PER_DEG_LNG = 111320 * Math.cos((GEO_ORIGIN.lat * Math.PI) / 180)

// 抽象坐标 → [lng, lat]（高德 JS API 使用 [经度, 纬度]）
export function toLngLat(p) {
  return [
    GEO_ORIGIN.lng + ((p.x - GEO_ORIGIN.x) * METERS_PER_UNIT) / M_PER_DEG_LNG,
    GEO_ORIGIN.lat - ((p.y - GEO_ORIGIN.y) * METERS_PER_UNIT) / M_PER_DEG_LAT,
  ]
}

// [lng, lat] → 抽象坐标
export function toXY(lng, lat) {
  return {
    x: GEO_ORIGIN.x + ((lng - GEO_ORIGIN.lng) * M_PER_DEG_LNG) / METERS_PER_UNIT,
    y: GEO_ORIGIN.y - ((lat - GEO_ORIGIN.lat) * M_PER_DEG_LAT) / METERS_PER_UNIT,
  }
}

// 点位数组批量转换
export function pathToLngLat(points) {
  return points.map(toLngLat)
}

// 区域多边形（'x,y x,y ...'）→ 经纬度数组
export function polygonToLngLat(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return toLngLat({ x, y })
    })
}

// 运营区边界（真实道路折线，经纬度）——地图直接使用这份
export function boundaryLngLat(areaId) {
  if (areaId && RINGS_LNGLAT[areaId]) return RINGS_LNGLAT[areaId]
  return [BOUNDARY_LNGLAT]
}

// 地图初始视野：覆盖全部运营区（含少量留白）
export function mapBounds(areaId) {
  const rings = areaId ? boundaryLngLat(areaId) : Object.values(RINGS_LNGLAT).flat()
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  const padLng = (maxLng - minLng) * 0.06
  const padLat = (maxLat - minLat) * 0.06
  return {
    southWest: [minLng - padLng, minLat - padLat],
    northEast: [maxLng + padLng, maxLat + padLat],
  }
}
