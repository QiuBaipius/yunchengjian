// 规划页地图：运营边界 + 起终点 + 多条候选方案折线
// 选中方案按交通方式分段上色（步行 / 接驳公交 / 各地铁线各一色），并在每段中点标注
import { useEffect, useRef, useState } from 'react'
import { BOUNDARY_LNGLAT } from '../data/dalian.js'
import { mapBounds } from '../data/geo.js'
import { loadAMap } from '../services/amapLoader.js'
import { segColor, segLabel } from '../services/planColors.js'

const TEAL = '#0f7a62'
const DIM = '#94a3b8'

function pinHtml(kind, text) {
  const bg = kind === 'from' ? TEAL : kind === 'via' ? '#e07a2f' : '#d92b2b'
  // 名字太长会把气泡撑到屏幕外（顶部条里有全名），这里截断到 9 个字
  const short = String(text || '').length > 9 ? String(text).slice(0, 9) + '…' : text
  return `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,.3)">${kind === 'from' ? '起' : kind === 'via' ? '经' : '终'} ${short}</div>`
}

// 段标注：白底 + 该段颜色的描边，点一下显示该段详情
function labelHtml(text, color) {
  return `<div style="background:rgba(255,255,255,.96);border:2px solid ${color};color:#0f172a;font-size:11px;font-weight:700;line-height:1;padding:4px 7px;border-radius:11px;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,.18);cursor:pointer">${text}</div>`
}

// 按「累计里程的中点」取点，并给出该处方向 —— 折线点疏密不均时，点的中点并不在线段中间
function midpointOf(path) {
  if (!Array.isArray(path) || path.length < 2) return null
  const cos = Math.cos((path[0][1] * Math.PI) / 180) || 1
  const segLen = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const dx = (path[i][0] - path[i - 1][0]) * cos
    const dy = path[i][1] - path[i - 1][1]
    const d = Math.hypot(dx, dy)
    segLen.push(d)
    total += d
  }
  if (!total) return null
  const half = total / 2
  let acc = 0
  let idx = 1
  for (let i = 0; i < segLen.length; i++) {
    if (acc + segLen[i] >= half) {
      idx = i + 1
      break
    }
    acc += segLen[i]
  }
  const a = path[idx - 1]
  const b = path[idx]
  const seg = segLen[idx - 1] || 0
  const t = seg > 0 ? (half - acc) / seg : 0.5
  return {
    at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    dir: [b[0] - a[0], b[1] - a[1]],
  }
}

export default function PlanMap({
  origin,
  dest,
  via = null,
  plans = [],
  activeId = null,
  detail = false,
  compact = false,
  bottomPad = 0, // 底部面板的实际高度（由页面测量后传入，保证路线不被盖住）
  picking = null,
  onPick,
  onSegClick,
  className = '',
  onFail,
}) {
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const overlaysRef = useRef([])
  const fittedRef = useRef('')
  const effectCleanupRef = useRef(null)
  const [ready, setReady] = useState(false)
  // 地图初始化只跑一次，点击回调要读到最新的 picking / onPick，改由 effect 同步到 ref
  const pickRef = useRef(picking)
  const onPickRef = useRef(onPick)
  // onFail 是父组件写的内联箭头函数，每次渲染都是新引用；
  // 若直接放进初始化 effect 的依赖里，地图会被反复 destroy / 重建（表现为缩放永远停在初始级别、折线不显示）
  const onFailRef = useRef(onFail)
  const onSegRef = useRef(onSegClick)
  useEffect(() => {
    pickRef.current = picking
    onPickRef.current = onPick
    onFailRef.current = onFail
    onSegRef.current = onSegClick
  }, [picking, onPick, onFail, onSegClick])

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
        map.on('click', (e) => {
          if (!pickRef.current) return
          onPickRef.current?.([+e.lnglat.getLng().toFixed(6), +e.lnglat.getLat().toFixed(6)])
        })
        mapRef.current = map
        if (import.meta.env.DEV) window.__planMap = map
        setReady(true)
      })
      .catch((e) => {
        if (alive) onFailRef.current?.(e.message)
      })
    return () => {
      alive = false
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [])

  // 图层重绘
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const AMap = window.AMap
    const map = mapRef.current
    if (effectCleanupRef.current) {
      effectCleanupRef.current()
      effectCleanupRef.current = null
    }
    if (overlaysRef.current.length) map.remove(overlaysRef.current)
    const list = []
    const segState = new Map() // 段索引 → { sg, color, text, at, dir, mk }
    let pinned = -1 // 被点开的段（点空白处取消）

    // 标注位置：按「累计里程的中点」取点，再沿该处法线把气泡推到线的一侧。
    // 原来取的是 path[floor(len/2)]（点的中点），折线点疏密不均时经常落在线段外，
    // 看起来就"不在对应的段旁边"。
    function placeLabel(st) {
      const p1 = map.lngLatToContainer(st.at)
      const p2 = map.lngLatToContainer([st.at[0] + st.dir[0] * 1e-4, st.at[1] + st.dir[1] * 1e-4])
      if (!p1 || !p2) return
      const vx = p2.getX() - p1.getX()
      const vy = p2.getY() - p1.getY()
      const L = Math.hypot(vx, vy) || 1
      let nx = -vy / L
      let ny = vx / L
      if (ny > 0.3) {
        nx = -nx
        ny = -ny
      } // 横向为主的段优先往上放
      const w = Math.min(184, String(st.text).length * 11 + 28)
      const h = 24
      const size = map.getSize ? map.getSize() : { width: 400, height: 700 }
      // 气泡宽/高的一半再加一点缝，正好卡在线边上，不会压住线
      let x = p1.getX() + nx * (w / 2 + 7)
      let y = p1.getY() + ny * (h / 2 + 7)
      x = Math.max(w / 2 + 8, Math.min(size.width - w / 2 - 8, x))
      y = Math.max(h / 2 + 34, Math.min(size.height - h / 2 - 10, y))
      const ll = map.containerToLngLat(new window.AMap.Pixel(Math.round(x), Math.round(y)))
      if (!ll) return
      st.mk.setOffset(new AMap.Pixel(0, 0))
      st.mk.setPosition([ll.getLng(), ll.getLat()])
    }

    // 点空白处 / 缩放后：收起标注、重新贴合
    const onMapClick = () => {
      pinned = -1
      for (const st of segState.values()) if (st.mk) st.mk.hide()
    }
    const onZoom = () => {
      for (const st of segState.values()) if (st.mk && st.mk.getVisible && st.mk.getVisible()) placeLabel(st)
    }
    map.on('click', onMapClick)
    map.on('zoomend', onZoom)
    effectCleanupRef.current = () => {
      map.off('click', onMapClick)
      map.off('zoomend', onZoom)
    }

    // 运营范围（弱化，只做参照）
    list.push(
      new AMap.Polygon({
        path: BOUNDARY_LNGLAT,
        strokeColor: TEAL,
        strokeWeight: 2,
        strokeStyle: 'dashed',
        strokeOpacity: 0.55,
        fillColor: TEAL,
        fillOpacity: 0.04,
        zIndex: 20,
        bubble: true,
      }),
    )

    // 候选方案
    if (activeId) {
      // 未选中的方案：淡灰细线，只作参照
      for (const p of plans) {
        if (p.id === activeId || !p.path?.length) continue
        list.push(
          new AMap.Polyline({
            path: p.path,
            strokeColor: DIM,
            strokeWeight: 4,
            strokeOpacity: 0.3,
            lineJoin: 'round',
            zIndex: 90,
            bubble: true,
          }),
        )
      }

      // 选中方案：按交通方式分段上色（步行虚线、接驳绿、各地铁线一色一色）
      const act = plans.find((p) => p.id === activeId)
      const segs = act?.segments?.length
        ? act.segments
        : act?.path?.length
          ? [{ mode: 'shuttle', line: act.title, path: act.path, min: act.totalMin }]
          : []

      // 浮出某一段的文字标注（懒创建：第一次悬停/点击时才建 marker）
      const showLabel = (i) => {
        const st = segState.get(i)
        if (!st) return
        if (!st.mk) {
          st.mk = new AMap.Marker({
            position: st.at,
            anchor: 'center',
            zIndex: 300,
            content: labelHtml(st.text, st.color),
            visible: false,
          })
          st.mk.on('click', () => {
            pinned = pinned === i ? -1 : i
            if (pinned === i) showLabel(i)
            else st.mk.hide()
            onSegRef.current?.(st.sg, st.color)
          })
          map.add(st.mk)
        }
        placeLabel(st)
        for (const [j, other] of segState) {
          if (j !== i && other.mk && pinned !== j) other.mk.hide()
        }
        st.mk.show()
      }

      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i]
        if (!Array.isArray(sg.path) || sg.path.length < 2) continue
        const color = segColor(sg)
        const isWalk = sg.mode === 'walk'
        const pl = new AMap.Polyline({
          path: sg.path,
          strokeColor: color,
          strokeWeight: isWalk ? 4 : 7,
          strokeOpacity: isWalk ? 0.85 : 0.95,
          strokeStyle: isWalk ? 'dashed' : 'solid',
          lineJoin: 'round',
          showDir: !isWalk,
          zIndex: 120,
          bubble: true,
          cursor: 'pointer',
        })
        list.push(pl)

        // 标注默认不显示：多条方案叠在一起时满屏文字反而看不清。
        // 鼠标移上去 / 点一下这一段，才在「这一段的里程中点旁边」浮出文字。
        const text = segLabel(sg)
        const mid = text ? midpointOf(sg.path) : null
        if (!mid) continue
        segState.set(i, { sg, color, text, at: mid.at, dir: mid.dir, mk: null })

        pl.on('mouseover', () => showLabel(i))
        pl.on('mouseout', () => {
          if (pinned !== i && segState.get(i)?.mk) segState.get(i).mk.hide()
        })
        pl.on('click', () => {
          if (pickRef.current) return // 选点状态下不拦截
          pinned = i
          showLabel(i)
          onSegRef.current?.(sg, color)
        })
      }
    } else {
      for (const p of plans) {
        if (!p.path?.length) continue
        list.push(
          new AMap.Polyline({
            path: p.path,
            strokeColor: DIM,
            strokeWeight: 4,
            strokeOpacity: 0.55,
            lineJoin: 'round',
            zIndex: 100,
            bubble: true,
          }),
        )
      }
    }

    const pin = (ll, kind, text) =>
      new AMap.Marker({
        position: ll,
        // 气泡朝内侧展开：起点向右、终点向左，避免被屏幕边缘裁掉
        anchor: kind === 'via' ? 'center' : kind === 'from' ? 'left-center' : 'right-center',
        zIndex: 200,
        content: pinHtml(kind, text),
      })

    if (origin) list.push(pin([origin.lng, origin.lat], 'from', origin.name || '起点'))
    if (via) list.push(pin([via.lng, via.lat], 'via', via.name || '途经点'))
    if (dest) list.push(pin([dest.lng, dest.lat], 'to', dest.name || '终点'))

    map.add(list)
    overlaysRef.current = list

    // 视野：把整条路线塞进"顶部起终点卡"与"底部方案面板"之间的可视条带里。
    // 不用 map.setBounds —— 它内部会走多级缩放动画，无头浏览器里容易留下半张空白画布，
    // 这里自己按可视条带的像素尺寸算出目标等级，再 setZoomAndCenter 一步到位。
    const sig =
      (activeId || '') +
      '|' +
      (detail ? 'd' : 'l') +
      (compact ? 'c' : '') +
      '|' +
      bottomPad +
      '|' +
      plans.length +
      '|' +
      (origin?.lng ?? '') +
      '|' +
      (dest?.lng ?? '') +
      '|' +
      (via?.lng ?? '')
    if (sig !== fittedRef.current) {
      fittedRef.current = sig
      const active = plans.find((p) => p.id === activeId)
      const path = active?.path?.length ? active.path : plans.flatMap((p) => p.path || [])
      const pts = [...path]
      if (origin) pts.push([origin.lng, origin.lat])
      if (via) pts.push([via.lng, via.lat])
      if (dest) pts.push([dest.lng, dest.lat])
      // 只保留合法经纬度，避免个别脏点把包围盒算成 NaN 导致地图白屏
      const ok = pts.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      if (ok.length > 1) {
        let minLng = Infinity
        let maxLng = -Infinity
        let minLat = Infinity
        let maxLat = -Infinity
        for (const [lng, lat] of ok) {
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        }
        const spanLng = maxLng - minLng
        const spanLat = maxLat - minLat
        const cLng = (minLng + maxLng) / 2
        const cLat = (minLat + maxLat) / 2
        if (spanLng < 0.002 && spanLat < 0.002) {
          map.setZoomAndCenter(16, [cLng, cLat], false)
        } else {
          const size = map.getSize()
          const W = size?.width ?? size?.getWidth?.() ?? 400
          const H = size?.height ?? size?.getHeight?.() ?? 700
          const TOP_PAD = compact ? 84 : 236 // 顶部起终点卡（出结果后收成一行）
          const BOTTOM_PAD = bottomPad > 0 ? bottomPad + 14 : detail ? 392 : 250
          // 起终点气泡朝画面内侧展开（见下方 anchor），这里只需少量几何边距
          const usableW = Math.max(160, W - 56)
          const usableH = Math.max(130, H - TOP_PAD - BOTTOM_PAD)
          const cosLat = Math.cos((cLat * Math.PI) / 180)
          const zLng = Math.log2((360 * usableW) / (256 * Math.max(spanLng, 1e-5)))
          const zLat = Math.log2((360 * usableH * cosLat) / (256 * Math.max(spanLat, 1e-5)))
          const zoom = Math.max(10.5, Math.min(17, Math.min(zLng, zLat)))
          // 条带中心比地图中心高一截：把中心点往南挪，让路线落在条带里
          const bandCenterY = TOP_PAD + usableH / 2
          const shiftPx = H / 2 - bandCenterY // 正数表示条带在上方
          const degPerPx = 360 / (256 * 2 ** zoom)
          const centerLat = cLat - shiftPx * degPerPx * cosLat
          map.setZoomAndCenter(zoom, [cLng, centerLat], false)
        }
      } else if (ok.length === 1) {
        map.setZoomAndCenter(16, ok[0], false)
      }
    }

    // 段标注已改成"悬停/点击才显示"，且位置在 showLabel 里按屏幕像素实时计算，
    // 这里不再需要预先贴边修正。
  }, [ready, origin, dest, via, plans, activeId, detail, compact, bottomPad])

  return (
    <div className={`plan-map ${className}`}>
      <div ref={hostRef} className="amap-host" />
      {!ready && <div className="amap-loading">正在加载大连真实地图…</div>}
      {picking && (
        <div className="plan-pick-tip">
          点击地图选择{picking === 'origin' ? '起点' : picking === 'via' ? '途经点' : '终点'}
          <button onClick={() => onPick?.(null)}>取消</button>
        </div>
      )}
    </div>
  )
}
