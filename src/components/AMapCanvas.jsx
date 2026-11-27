// 高德地图引擎：大连真实底图 + 运营区边界 + 真实公交站 / 地铁站（全部可乘降）
// 抽象坐标经 data/geo.js 投影为经纬度，业务算法无需改动。
// 若 key 不可用（类型不符 / 未配安全密钥 / 网络异常），回调 onFail 由 MapView 提示。
//
// 图层分成三组独立重绘，避免"车辆每动一下就把整张图层推倒重建"：
//   ① 静态层（边界 / 站点 / 标签 / 用户定位）—— 只在数据变化时重建
//   ② 路线层（接驾 / 行程）—— 只在高德真实路线锁定后重建一次
//   ③ 车辆标记 —— 只 setPosition，不重建
// 早期版本把三者放在同一个 effect 里并依赖 vehicle，结果每秒重绘、每秒重新请求
// 路径规划，地图上的预估路线会在"站间路网折线"和"高德真实路线"之间来回跳。
import { useEffect, useRef, useState } from 'react'
import { AREAS, STOPS, stopById } from '../data/config.js'
import { mapBounds, toLngLat } from '../data/geo.js'
import { loadAMap } from '../services/amapLoader.js'
import { streetPath } from '../services/routing.js'

const BLUE = '#2d6cdf'
const TEAL = '#0f7a62'
const METRO = '#d92b2b'
// 每条线路一种边界色：X1 青绿、X2 紫罗兰（避开站点蓝 / 地铁红）
const LINE_COLOR = { X1: TEAL, X2: '#7c5cd6' }

// 站点标签在哪些缩放级别显示（地铁站不挂站名，只留红点）
const LABEL_ZOOM = { bus: 15 }

export default function AMapCanvas({
  vehicle,
  fromId,
  toId,
  showPickupRoute,
  showDestRoute,
  destPath, // 已锁定的真实导航路线（上车点 → 目的地），[[lng,lat]]
  pickupPath, // 已锁定的真实导航路线（车辆 → 上车点），[[lng,lat]]
  onStop,
  onArea,
  userLocation,
  userPath, // 当前定位 → 匹配上车点的引导路线，[[lng,lat]]
  planRoutes, // 确认行程阶段的预计线路：[{ path: [[lng,lat]], color }]，跨区两段各一条
  approachPath, // 换乘等待期：第二程车当前位置 → 换乘站的接近路线，[[lng,lat]]
  approachColor, // 接近路线的颜色（跟第二程线路色一致）
  focusUser, // true 时把地图放大到用户位置（首页定位成功后）
  onFail,
  className = '',
}) {
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const baseRef = useRef([]) // 静态层覆盖物
  const routeRef = useRef([]) // 路线层覆盖物
  const vehRef = useRef(null) // 车辆标记
  const shownRef = useRef(new Set())
  const labelsRef = useRef([])
  const sizedRef = useRef([]) // 站点圆点（随缩放改半径）
  const fittedRef = useRef(false)
  const focusRef = useRef(false)
  const [ready, setReady] = useState(false)

  // 回调与最新车辆位置都走 ref：避免父组件内联函数 / 每秒位置变化触发图层重建
  const cbRef = useRef({ onStop, onArea, onFail })
  useEffect(() => {
    cbRef.current = { onStop, onArea, onFail }
  }, [onStop, onArea, onFail])
  const vehPosRef = useRef(vehicle)
  useEffect(() => {
    vehPosRef.current = vehicle
  })

  // 拆成基本类型再进依赖，避免「每秒新对象」把 effect 打成高频
  const vx = vehicle?.x
  const vy = vehicle?.y
  const vPlate = vehicle?.plate
  const hasVehicle = vx != null && vy != null
  const vehKey = hasVehicle ? 'v' : 'n'

  // ① 初始化地图（只做一次）
  useEffect(() => {
    let alive = true
    loadAMap()
      .then((AMap) => {
        if (!alive || !hostRef.current) return
        const b = mapBounds()
        const map = new AMap.Map(hostRef.current, {
          zoom: 14,
          center: [(b.southWest[0] + b.northEast[0]) / 2, (b.southWest[1] + b.northEast[1]) / 2],
          viewMode: '2D',
          resizeEnable: true,
          mapStyle: 'amap://styles/normal',
          features: ['bg', 'road', 'building', 'point'],
        })
        map.addControl(new AMap.Scale({ position: 'LB' }))

        // 标签与站点尺寸都随缩放变化：
        //   远景（≤ 12.6 级）站点缩到几乎看不见，避免 150 多个圆点把边界和线路盖住；
        //   放大到 16 级及以上恢复完整尺寸（此时需要逐站辨认）。
        const syncLabels = () => {
          const z = map.getZoom()
          const shown = shownRef.current
          for (const { text, minZoom } of labelsRef.current) {
            if (z >= minZoom && !shown.has(text)) {
              map.add(text)
              shown.add(text)
            } else if (z < minZoom && shown.has(text)) {
              map.remove(text)
              shown.delete(text)
            }
          }
          const k = markerScale(z)
          for (const { marker, base, weight } of sizedRef.current) {
            marker.setRadius(Math.max(0.6, base * k))
            if (marker.setOptions) {
              marker.setOptions({ strokeWeight: k < 0.45 ? 0 : weight })
            }
          }
        }
        map.on('zoomend', syncLabels)
        mapRef.current = map
        map._syncLabels = syncLabels
        setReady(true)
      })
      .catch((e) => {
        if (!alive) return
        cbRef.current.onFail?.(e.message)
      })
    return () => {
      alive = false
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [])

  // ② 静态层：运营边界 + 站点 + 标签 + 用户定位
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current

    if (baseRef.current.length) map.remove(baseRef.current)
    shownRef.current.clear()
    labelsRef.current = []
    sizedRef.current = []
    const list = []
    const sized = []

    // 运营区域：每条线路的每个环都画一条边界（点击任一环 → 打开该线路介绍）
    for (const area of AREAS) {
      const color = LINE_COLOR[area.line] || TEAL
      for (const ring of area.ringsLngLat || []) {
        const poly = new AMap.Polygon({
          path: ring,
          strokeColor: color,
          strokeWeight: area.ringsLngLat.length > 1 ? 2.5 : 3,
          strokeStyle: 'dashed',
          fillColor: color,
          fillOpacity: 0.06,
          cursor: 'pointer',
          zIndex: 20,
          lineJoin: 'round',
          bubble: true,
        })
        poly.on('click', () => cbRef.current.onArea?.(area))
        list.push(poly)
      }
      // 线路名标签：放在环的形心附近，便于在地图上直接认出哪条线
      const anchor = ringCenter(area.ringsLngLat)
      if (anchor) {
        const tag = new AMap.Text({
          text: `${area.line} 运营范围`,
          position: anchor,
          anchor: 'center',
          zIndex: 150,
          bubble: true,
          style: {
            'font-size': '11px',
            'font-weight': '700',
            color,
            'background-color': 'rgba(255,255,255,0.92)',
            border: `1px solid ${color}55`,
            padding: '2px 7px',
            'border-radius': '999px',
            'white-space': 'nowrap',
            cursor: 'pointer',
          },
        })
        tag.on('click', () => cbRef.current.onArea?.(area))
        list.push(tag)
      }
    }

    // 站点：地铁站（重点标注）/ 普通公交站（全部可乘降）
    const labels = []
    for (const s of STOPS) {
      if (s.hidden) continue // 同名近距的重复 POI：不画，避免标签叠在一起
      const isMetro = !!s.hub
      const color = isMetro ? METRO : BLUE
      const r = isMetro ? 8 : 5

      if (isMetro) {
        const halo = new AMap.CircleMarker({
          center: toLngLat(s),
          radius: 15,
          strokeWeight: 0,
          fillColor: METRO,
          fillOpacity: 0.18,
          zIndex: 110,
        })
        sized.push({ marker: halo, base: 15, weight: 0 })
        list.push(halo)
      }
      const dot = new AMap.CircleMarker({
        center: toLngLat(s),
        radius: r,
        strokeColor: '#ffffff',
        strokeWeight: isMetro ? 2.5 : 1.8,
        fillColor: color,
        fillOpacity: 1,
        cursor: 'pointer',
        zIndex: isMetro ? 130 : 120,
        extData: { stopId: s.id },
      })
      dot.on('click', () => cbRef.current.onStop?.(s))
      sized.push({ marker: dot, base: r, weight: isMetro ? 2.5 : 1.8 })
      list.push(dot)

      // 地铁站只留红点，不再挂站名标签；公交站随缩放出现站名
      if (!isMetro) {
        const text = new AMap.Text({
          text: s.name,
          position: toLngLat(s),
          anchor: 'top-center',
          offset: new AMap.Pixel(0, 7),
          zIndex: 135,
          bubble: true,
          style: {
            'font-size': '10px',
            color: '#1f2937',
            'background-color': 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(148,163,184,0.35)',
            padding: '1px 4px',
            'border-radius': '4px',
            'white-space': 'nowrap',
          },
        })
        labels.push({ text, minZoom: LABEL_ZOOM.bus })
      }
    }
    labelsRef.current = labels
    sizedRef.current = sized

    // 用户定位
    if (userLocation) {
      list.push(
        new AMap.CircleMarker({
          center: toLngLat(userLocation),
          radius: 12,
          strokeWeight: 0,
          fillColor: BLUE,
          fillOpacity: 0.18,
          zIndex: 90,
        }),
        new AMap.CircleMarker({
          center: toLngLat(userLocation),
          radius: 4.5,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          fillColor: BLUE,
          fillOpacity: 1,
          zIndex: 91,
        }),
      )
    }

    map.add(list)
    baseRef.current = list

    if (!fittedRef.current) {
      // 定位已就绪：直接把视野收到用户所在位置（首屏就看清「我在哪、去哪儿上车」），
      // 否则按两条线路的整体范围铺满视野。
      // 首屏容器可能还没完成布局，setBounds / setZoomAndCenter 会按错误像素计算，
      // 因此在首帧后再补两次。
      const focus = focusUser && userLocation ? toLngLat(userLocation) : null
      const fit = () => {
        if (focus) map.setZoomAndCenter(16, focus, false)
        else {
          const nb = mapBounds()
          map.setBounds(new AMap.Bounds(nb.southWest, nb.northEast), false)
        }
      }
      fit()
      setTimeout(fit, 350)
      setTimeout(fit, 1200)
      fittedRef.current = true
      focusRef.current = !!focus
    } else if (focusUser && userLocation && !focusRef.current) {
      // 定位是异步到的：首帧只能先铺满全局范围，定位一就绪就把视野收到当前位置（只做一次）
      const focus = toLngLat(userLocation)
      const zoomIn = () => map.setZoomAndCenter(16, focus, false)
      zoomIn()
      setTimeout(zoomIn, 350)
      focusRef.current = true
    }
    map._syncLabels?.()
    if (import.meta.env.DEV) window.__amap = map
    // focusUser 只在首帧生效（fittedRef 守卫），不放进依赖以免重建静态层
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation])

  // ③ 路线层：接驾 + 行程。
  // 只用「已锁定的高德真实路线」；尚未锁定时不画（几百毫秒的空档好过一条会跳变的线）。
  // 依赖里刻意不含 vehicle.x/y —— 车辆位置变化不该重绘路线。
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current
    if (routeRef.current.length) map.remove(routeRef.current)
    const list = []

    const v = vehPosRef.current
    const fromStop = fromId ? stopById(fromId) : null
    const toStop = toId ? stopById(toId) : null

    // 接驾路线（车辆 → 上车点）
    if (showPickupRoute) {
      let path = Array.isArray(pickupPath) && pickupPath.length > 1 ? pickupPath : null
      // 兜底：匹配阶段尚未派单、还没有真实路线时，用站间路网画一条（此时车辆不动，不会跳）
      if (!path && v && fromStop) path = streetPath({ x: v.x, y: v.y }, fromStop).map(toLngLat)
      if (path && path.length > 1) {
        list.push(
          ...casing(path, 9, 36),
          new AMap.Polyline({
            path,
            strokeColor: TEAL,
            strokeWeight: 5,
            strokeOpacity: 0.85,
            strokeStyle: 'dashed',
            lineJoin: 'round',
            zIndex: 38,
          }),
        )
      }
    }

    // 行程路线（上车点 → 目的地）
    if (showDestRoute && fromStop && toStop) {
      const path =
        Array.isArray(destPath) && destPath.length > 1
          ? destPath
          : streetPath(fromStop, toStop).map(toLngLat)
      if (path.length > 1) {
        list.push(
          // 白色描边：整条线在城区视野里只有 ~180 px，直接压在底图快速路（黄色）
          // 和 200 多个蓝色站点圆点中间几乎看不出走向，垫一层白底才拎得出来。
          ...casing(path, 12, 44),
          new AMap.Polyline({
            path,
            strokeColor: BLUE,
            strokeWeight: 7,
            strokeOpacity: 1,
            strokeStyle: 'solid',
            lineJoin: 'round',
            showDir: true,
            zIndex: 46,
          }),
        )
      }
    }

    if (list.length) map.add(list)
    routeRef.current = list
  }, [
    ready,
    showPickupRoute,
    showDestRoute,
    fromId,
    toId,
    destPath,
    pickupPath,
    vehKey,
  ])

  // ③c 确认行程阶段的「预计线路」：还没派单，但地图上要先看清会怎么走。
  //     同区一条；跨区两条（X1 青绿 / X2 紫罗兰），在边界站点相接。
  const planRef = useRef([])
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current
    if (planRef.current.length) map.remove(planRef.current)
    const list = []
    for (const r of planRoutes || []) {
      if (!Array.isArray(r?.path) || r.path.length < 2) continue
      list.push(...casing(r.path, 11, 42))
      list.push(
        new AMap.Polyline({
          path: r.path,
          strokeColor: r.color || BLUE,
          strokeWeight: 6,
          strokeOpacity: 1,
          strokeStyle: 'solid',
          lineJoin: 'round',
          showDir: true,
          zIndex: 44,
        }),
      )
      // 起终点各加一个小圆点，让「从哪上车、在哪下车」一眼看到
      if (r.nodes) {
        for (const n of r.nodes) {
          if (!n?.pt) continue
          list.push(
            new AMap.CircleMarker({
              center: n.pt,
              radius: 5,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              fillColor: r.color || BLUE,
              fillOpacity: 1,
              zIndex: 45,
            }),
          )
        }
      }
    }
    if (list.length) map.add(list)
    // 预计线路出来时把视野收到这条线上（下方弹窗占了半屏，底部多留一些）
    if (list.length) {
      try {
        map.setFitView(list, false, [70, 36, 330, 36])
      } catch {
        /* 容器尺寸异常时忽略 */
      }
    }
    planRef.current = list
  }, [ready, planRoutes])

  // ③b 定位 → 上车点的引导线（首页定位成功后出现，只有一条，不影响行程路线）
  const userLineRef = useRef([])
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current
    if (userLineRef.current.length) map.remove(userLineRef.current)
    if (!Array.isArray(userPath) || userPath.length < 2) {
      userLineRef.current = []
      return
    }
    const line = new AMap.Polyline({
      path: userPath,
      strokeColor: BLUE,
      strokeWeight: 5,
      strokeOpacity: 0.9,
      strokeStyle: 'dashed',
      strokeDasharray: [8, 6],
      lineJoin: 'round',
      showDir: false,
      zIndex: 34,
    })
    map.add(line)
    userLineRef.current = [line]
  }, [ready, userPath])

  // ③c 换乘等待期：第二程车「当前位置 → 换乘站」的接近路线（虚线，颜色跟第二程线路一致）
  const approachRef = useRef([])
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current
    if (approachRef.current.length) map.remove(approachRef.current)
    if (!Array.isArray(approachPath) || approachPath.length < 2) {
      approachRef.current = []
      return
    }
    const line = new AMap.Polyline({
      path: approachPath,
      strokeColor: approachColor || '#7c5cd6',
      strokeWeight: 4,
      strokeOpacity: 0.85,
      strokeStyle: 'dashed',
      strokeDasharray: [6, 6],
      lineJoin: 'round',
      showDir: true,
      zIndex: 43,
    })
    map.add(line)
    approachRef.current = [line]
  }, [ready, approachPath, approachColor])

  // ④ 车辆标记：只更新位置，不重建图层
  useEffect(() => {
    if (!ready || !mapRef.current || !hasVehicle) return
    const AMap = window.AMap
    const map = mapRef.current
    if (!vehRef.current) {
      vehRef.current = new AMap.Marker({
        position: toLngLat({ x: vx, y: vy }),
        anchor: 'center',
        zIndex: 200,
        content: vehicleHtml(vPlate),
      })
      map.add(vehRef.current)
    } else {
      vehRef.current.setPosition(toLngLat({ x: vx, y: vy }))
    }
  }, [ready, vx, vy, hasVehicle, vPlate])

  // 车牌变化时只换内容
  useEffect(() => {
    if (vehRef.current && hasVehicle) vehRef.current.setContent(vehicleHtml(vPlate))
  }, [vPlate, hasVehicle])

  // 车辆消失（到达 / 取消）时移除标记
  useEffect(() => {
    if (hasVehicle || !vehRef.current) return
    if (mapRef.current) mapRef.current.remove(vehRef.current)
    vehRef.current = null
  }, [hasVehicle])

  return (
    <div className={`map-canvas amap-canvas ${className}`}>
      <div ref={hostRef} className="amap-host" />
      {!ready && <div className="amap-loading">正在加载大连真实地图…</div>}
    </div>
  )
}

// 站点圆点的缩放系数：
//   ≤ 12.6 级 → 0.16（宏观视角几乎看不出圆点，只留边界与线路）
//   15.2 级及以上 → 1（回到逐站可辨认的尺寸，初始定位就是这一级）
//   中间用 1.8 次曲线过渡：14 级约 0.6（看得出能点），13 级只剩一点点
function markerScale(z) {
  const t = Math.min(1, Math.max(0, (z - 12.6) / (15.2 - 12.6)))
  return 0.16 + 0.84 * Math.pow(t, 1.8)
}

function vehicleHtml(plate) {
  return `<div style="display:flex;align-items:center;gap:4px;background:#0f7b6c;color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,.25)">🚐 ${plate || '车辆'}</div>`
}

// 环的标签锚点：取点数最多的环，用其外接框中心；若中心落在环外则退回顶点均值
function ringCenter(rings) {
  if (!Array.isArray(rings) || !rings.length) return null
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0])
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const c = [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  if (pointIn(c[0], c[1], ring)) return c
  const avg = ring.reduce((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0])
  return avg
}

function pointIn(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// 路线白色描边（casing）：先画一条更宽的白线垫底，再画彩色主线。
// 城区视野下路线只有一两百像素，直接压在黄色快速路和密集站点圆点上很难辨认。
function casing(path, weight, zIndex) {
  return [
    new window.AMap.Polyline({
      path,
      strokeColor: '#ffffff',
      strokeWeight: weight,
      strokeOpacity: 0.95,
      strokeStyle: 'solid',
      lineJoin: 'round',
      zIndex,
    }),
  ]
}
