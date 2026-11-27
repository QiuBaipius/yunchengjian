// 地点选择页：起点 / 途经点 / 终点 / 家 / 公司 共用
//
// 结构与参考图一致：
//   顶栏  返回 + 搜索框（可输入）+ 右上「＋ 途经点」（仅规划页终点时出现）
//   快捷  家 / 公司 / 收藏夹 / 地图选点（四个等宽，内容居中）
//   列表  「我的位置」+「历史记录」（第十八轮：去掉「为你推荐」「大连市」两个分组）
// 每一行右侧显示距离与 ☆（加入 / 取消收藏）。
import { useEffect, useMemo, useRef, useState } from 'react'
import { toLngLat } from '../data/geo.js'
import { STOPS } from '../data/config.js'
import { inArea, searchPlaces } from '../services/planner.js'
import {
  getFavs,
  getHistory,
  getPinned,
  keyOf,
  removeFav,
  setPinned,
  toggleFav,
} from '../services/places.js'
import { useStore } from '../store/store.js'
import { toast } from '../store/actions.js'

const TITLE = { origin: '起点', via: '途经点', dest: '终点', home: '家', company: '公司' }
const PH = { origin: '请输入起点', via: '请输入途经点', dest: '请输入终点', home: '请输入家庭地址', company: '请输入公司地址' }

const M_PER_DEG_LAT = 110540
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

function fmtDist(m) {
  if (!Number.isFinite(m)) return ''
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1)} km`
}

export default function PlacePicker({ which = 'dest', onClose, onPick, onAddVia, onMapPick, onManagePinned }) {
  const userLoc = useStore((s) => s.user.location)
  const [kw, setKw] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('list') // list | favs | setHome | setCompany
  const [favs, setFavs] = useState(() => getFavs())
  const [history, setHistory] = useState(() => getHistory())
  const [homePin, setHomePin] = useState(() => getPinned('home'))
  const [compPin, setCompPin] = useState(() => getPinned('company'))
  const timer = useRef(null)

  const placeOnly = which === 'home' || which === 'company'
  const setting = mode === 'setHome' || mode === 'setCompany'
  const isHome = mode === 'setHome'

  const myPos = useMemo(() => {
    if (!userLoc) return null
    try {
      return toLngLat(userLoc)
    } catch {
      return null
    }
  }, [userLoc])

  function refresh() {
    setFavs(getFavs())
    setHistory(getHistory())
    setHomePin(getPinned('home'))
    setCompPin(getPinned('company'))
  }

  // 用函数声明而非 const：下面几个 useMemo 在渲染期就会调用，const 会有暂时性死区
  function dist(lng, lat) {
    if (!myPos) return NaN
    const dx = (lng - myPos[0]) * mPerDegLng(myPos[1])
    const dy = (lat - myPos[1]) * M_PER_DEG_LAT
    return Math.hypot(dx, dy)
  }

  // 默认列表：只保留「我的位置」与「历史记录」（第十八轮去掉「为你推荐」）

  useEffect(() => () => timer.current && clearTimeout(timer.current), [])

  function onChange(v) {
    setKw(v)
    if (timer.current) clearTimeout(timer.current)
    if (!v.trim()) {
      setRows([])
      setBusy(false)
      return
    }
    setBusy(true)
    timer.current = setTimeout(async () => {
      const list = await searchPlaces(v)
      // 本系统的站台先排在前面：高德 POI 只给「轻工学校」，
      // 但上车/下车要精确到「轻工学校（路北）」，所以站台必须能被直接搜到
      const q = v.trim()
      const local = STOPS.filter((s) => !s.hidden && s.name.includes(q))
        .slice(0, 8)
        .map((s) => {
          const [lng, lat] = toLngLat(s)
          return { name: s.name, lng, lat, addr: '本站站台 · 可直接设为起终点', stopId: s.id, local: true }
        })
      setRows([...local, ...list.filter((r) => !local.some((l) => l.name === r.name))])
      setBusy(false)
    }, 320)
  }

  function choose(p) {
    if (setting) {
      setPinned(isHome ? 'home' : 'company', p)
      toast(`已设为${isHome ? '家' : '公司'}「${p.name}」`)
      refresh()
      setMode('list')
      return
    }
    onPick?.(p)
  }

  function tapPinned(kind) {
    const p = kind === 'home' ? homePin : compPin
    if (!p) {
      setMode(kind === 'home' ? 'setHome' : 'setCompany')
      setKw('')
      setRows([])
      return
    }
    if (onManagePinned) {
      // 规划页：家 / 公司 直接当终点用
      choose({ lng: p.lng, lat: p.lat, name: p.name, sub: p.sub, stopId: p.stopId })
      return
    }
    choose({ lng: p.lng, lat: p.lat, name: kind === 'home' ? '家' : '公司', sub: p.name })
  }

  const star = (p) => {
    const has = favs.some((f) => f.id === keyOf(p))
    return (
      <button
        className={`pk-star ${has ? 'on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleFav(p)
          refresh()
          toast(has ? '已取消收藏' : '已加入收藏夹')
        }}
        aria-label={has ? '取消收藏' : '加入收藏'}
      >
        {has ? '★' : '☆'}
        <i>收藏</i>
      </button>
    )
  }

  const head = setting ? `设置${isHome ? '家庭' : '公司'}地址` : `选择${TITLE[which] || '地点'}`

  return (
    <div className="plan-search pk">
      <div className="pk-nav">
        <button className="pk-back" onClick={onClose} aria-label="返回">‹</button>
        <div className="pk-search">
          <span className="pk-ico">◎</span>
          <input
            autoFocus={!placeOnly}
            value={kw}
            onChange={(e) => onChange(e.target.value)}
            placeholder={setting ? `搜索${isHome ? '家庭' : '公司'}地址` : PH[which] || '请输入地点'}
            aria-label={head}
          />
          {kw && (
            <button className="pk-clear" onClick={() => onChange('')} aria-label="清空">✕</button>
          )}
        </div>
        {onAddVia && !placeOnly && (
          <button className="pk-via-btn" onClick={onAddVia}>
            ＋ 途经点
          </button>
        )}
      </div>

      {!setting && (
        <div className="pk-quick">
          <button className={`pk-q ${homePin ? 'has' : ''}`} onClick={() => tapPinned('home')}>
            <span className="pk-q-ico">🏠</span>
            <span className="pk-q-t">家</span>
          </button>
          <button className={`pk-q ${compPin ? 'has' : ''}`} onClick={() => tapPinned('company')}>
            <span className="pk-q-ico">🏢</span>
            <span className="pk-q-t">公司</span>
          </button>
          <button className={`pk-q ${mode === 'favs' ? 'on' : ''}`} onClick={() => setMode(mode === 'favs' ? 'list' : 'favs')}>
            <span className="pk-q-ico">★</span>
            <span className="pk-q-t">收藏夹</span>
          </button>
          <button
            className="pk-q"
            onClick={() => {
              if (onMapPick) onMapPick()
              else toast('地图选点请从规划页使用', 'warn')
            }}
          >
            <span className="pk-q-ico">📍</span>
            <span className="pk-q-t">地图选点</span>
          </button>
        </div>
      )}

      {setting && (
        <div className="pk-setting">
          <span>为「{isHome ? '家' : '公司'}」选择一个地址，可从下面搜索或从历史里挑</span>
          <button
            className="link"
            onClick={() => {
              setMode('list')
              setKw('')
            }}
          >
            取消
          </button>
        </div>
      )}

      <div className="pk-body">
        {/* 搜索中 / 搜索结果 */}
        {!!kw.trim() && (
          <ul className="pk-list">
            {busy && <li className="pk-tip">搜索中…</li>}
            {!busy && !rows.length && <li className="pk-tip">没有找到匹配地点，可换个关键词或用地圈选点</li>}
            {rows.map((r, i) => (
              <li
                key={i}
                className="pk-row"
                onClick={() =>
                  choose({ lng: r.lng, lat: r.lat, name: r.name, sub: r.addr || r.district, stopId: r.stopId })
                }
              >
                <span className="pk-row-ico">📍</span>
                <span className="pk-row-t">
                  <b>{r.name}</b>
                  <i>
                    {(r.addr || r.district || '大连市') + (inArea(r.lng, r.lat) ? ' · 在接驳区内' : ' · 接驳区外')}
                  </i>
                </span>
                <span className="pk-row-r">
                  <span className="pk-dist">{fmtDist(dist(r.lng, r.lat))}</span>
                  {star({ name: r.name, lng: r.lng, lat: r.lat, sub: r.addr, stopId: r.stopId })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 收藏夹 */}
        {!kw.trim() && mode === 'favs' && (
          <ul className="pk-list">
            <li className="pk-sec">收藏夹（{favs.length}）</li>
            {!favs.length && <li className="pk-tip">还没有收藏。列表里点☆即可收藏常用地点。</li>}
            {favs.map((f) => (
              <li key={f.id} className="pk-row" onClick={() => choose({ lng: f.lng, lat: f.lat, name: f.name, sub: f.sub, stopId: f.stopId })}>
                <span className="pk-row-ico">★</span>
                <span className="pk-row-t">
                  <b>{f.name}</b>
                  <i>{f.sub || '大连市'}</i>
                </span>
                <span className="pk-row-r">
                  <span className="pk-dist">{fmtDist(dist(f.lng, f.lat))}</span>
                  <button
                    className="pk-del"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFav(f.id)
                      refresh()
                      toast('已移出收藏夹')
                    }}
                  >
                    移除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 默认：我的位置 + 历史记录 */}
        {!kw.trim() && mode !== 'favs' && (
          <>
            <ul className="pk-list">
              <li className="pk-sec">我的位置</li>
              {myPos ? (
                <li
                  className="pk-row"
                  onClick={() => choose({ lng: myPos[0], lat: myPos[1], name: '我的位置', sub: '当前定位' })}
                >
                  <span className="pk-row-ico me">◎</span>
                  <span className="pk-row-t">
                    <b>我的位置</b>
                    <i>使用当前定位</i>
                  </span>
                  <span className="pk-row-r">
                    <span className="pk-dist">0 m</span>
                  </span>
                </li>
              ) : (
                <li className="pk-tip">还没有拿到定位，可直接搜索地点名称</li>
              )}
            </ul>

            <ul className="pk-list">
              <li className="pk-sec">历史记录</li>
              {!history.length && <li className="pk-tip">还没有历史记录，规划一次路线后会自动记在这里</li>}
              {history.slice(0, 12).map((h) => (
                <li key={h.id} className="pk-row" onClick={() => choose({ lng: h.lng, lat: h.lat, name: h.name, sub: h.sub, stopId: h.stopId })}>
                  <span className="pk-row-ico">📍</span>
                  <span className="pk-row-t">
                    <b>{h.name}</b>
                    <i>{h.sub || '大连市'}</i>
                  </span>
                  <span className="pk-row-r">
                    <span className="pk-dist">{fmtDist(dist(h.lng, h.lat))}</span>
                    {star(h)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
