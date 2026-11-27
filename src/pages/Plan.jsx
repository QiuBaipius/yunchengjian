// 规划：只做「干线（地铁）+ 响应型接驳公交」这一套运营模式
//
//   · OD 同区：直接坐响应型接驳公交直达，不做换乘规划
//   · OD 跨区：接驳到地铁 → 地铁 → 换乘 → 下车 → 再接驳
//   · 途经点：可选，至多 1 个；按「起点 → 途经点 → 终点」两段规划后拼回一个方案
//     —— 起点/终点/途经点都点开同一个「地点选择页」，途经点由右上角「＋ 途经点」添加
//   · 不出电动车 / 汽车 / 打车方案
import { useEffect, useMemo, useRef, useState } from 'react'
import PlanMap from '../components/PlanMap.jsx'
import PlacePicker from '../components/PlacePicker.jsx'
import TabBar from '../components/TabBar.jsx'
import { useStore } from '../store/store.js'
import { toast } from '../store/actions.js'
import { planTrip, reverseGeocode } from '../services/planner.js'
import { lineName, segColor } from '../services/planColors.js'
import { addHistory } from '../services/places.js'

const MODE_ICON = { shuttle: '🚐', walk: '🚶', subway: '🚇', bus: '🚌' }
const MODE_NAME = { shuttle: '接驳', walk: '步行', subway: '地铁', bus: '公交' }
const MODE_CHIP = {
  intra: '同区域内',
  cross: '跨区域',
  'out-of-scope': '不在服务范围',
  unsupported: '跨城不支持',
}

export default function Plan() {
  const userLoc = useStore((s) => s.user.location)
  void userLoc
  const [origin, setOrigin] = useState(null)
  const [via, setVia] = useState(null)
  const [dest, setDest] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [picking, setPicking] = useState(null) // 'origin' | 'via' | 'dest'
  const [pickFor, setPickFor] = useState(null) // 打开地点选择页时填哪个
  const [detail, setDetail] = useState(false)
  const [segPickState, setSegPick] = useState({ key: '', i: -1 })
  const mapFail = useRef(false)

  // 底部结果面板实际高度：传给地图，让它只把路线铺在"顶部卡片到面板之间"的可见条带里
  const sheetRef = useRef(null)
  const [sheetH, setSheetH] = useState(0)

  useEffect(() => {
    const el = sheetRef.current
    if (!el) {
      setSheetH(0)
      return
    }
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight))
    ro.observe(el)
    setSheetH(el.offsetHeight)
    return () => ro.disconnect()
  }, [result, loading])

  const plans = useMemo(() => result?.plans || [], [result])
  const active = plans.find((p) => p.id === activeId) || plans[0] || null

  const segKey = `${activeId || ''}|${result?.plans?.length || 0}`
  const segPick = segPickState.key === segKey ? segPickState.i : -1

  async function run(next = {}) {
    const from = next.origin ?? origin
    const through = next.via ?? via
    const to = next.dest ?? dest
    if (!from || !to) return
    setLoading(true)
    setDetail(false)
    setResult(null)
    setActiveId(null)
    try {
      const r = await planTrip({ origin: from, dest: to, via: through })
      setResult(r)
      if (r.plans?.length) {
        setActiveId(r.plans[0].id)
        if (r.plans.length === 1) setDetail(true)
        addHistory(to)
      }
    } catch (e) {
      toast(e.message || '规划失败，请稍后重试', 'warn')
      setResult({ ok: false, mode: 'error', notice: '规划失败：' + (e.message || '未知错误'), plans: [] })
    } finally {
      setLoading(false)
    }
  }

  function setPoint(which, p) {
    setPickFor(null)
    setResult(null)
    setDetail(false)
    setActiveId(null)
    if (which === 'origin') setOrigin({ ...p })
    else if (which === 'via') setVia({ ...p })
    else setDest({ ...p })
  }

  async function pickOnMap(ll) {
    if (!ll) {
      setPicking(null)
      return
    }
    const which = picking
    setPicking(null)
    const name = await reverseGeocode(ll[0], ll[1])
    setPoint(which, { lng: ll[0], lat: ll[1], name: name.length > 16 ? name.slice(0, 16) + '…' : name, sub: name })
  }

  function swap() {
    setOrigin(dest)
    setDest(origin)
    setResult(null)
    setDetail(false)
  }

  const canRun = !!origin && !!dest && !loading
  const showSheet = !!result || loading

  return (
    <div className="page plan-page">
      <div className="plan-body">
        <PlanMap
          origin={origin}
          via={via}
          dest={dest}
          plans={result?.plans || []}
          activeId={active?.id ?? null}
          detail={detail}
          compact={!!result && !loading}
          bottomPad={sheetH}
          picking={picking}
          onPick={pickOnMap}
          onSegClick={(sg) => {
            const list = result?.plans?.find((p) => p.id === activeId)?.legs || []
            const i = list.findIndex(
              (l) => l.mode === sg.mode && (l.line || '') === (sg.line || '') && (l.min || 0) === (sg.min || 0),
            )
            setSegPick({ key: segKey, i })
          }}
          onFail={() => {
            if (!mapFail.current) {
              mapFail.current = true
              toast('地图加载失败，路线数据仍可查看', 'warn')
            }
          }}
        />

        {/* 顶部起终点卡片：出结果后收成一行，把地图让出来 */}
        {result && !loading ? (
          <button
            className="plan-od-mini"
            onClick={() => {
              setResult(null)
              setDetail(false)
              setActiveId(null)
            }}
          >
            <span className="plan-od-mini-txt">
              <b>{origin?.name}</b>
              <i>→</i>
              {via && (
                <>
                  <b className="via">经 {via.name}</b>
                  <i>→</i>
                </>
              )}
              <b>{dest?.name}</b>
            </span>
            <span className="plan-od-mini-act">修改</span>
          </button>
        ) : (
          <div className="plan-od">
            <div className="plan-od-head">
              <b>规划</b>
              {via ? (
                <button
                  className="plan-via-chip on"
                  onClick={() => {
                    setVia(null)
                    setResult(null)
                    setDetail(false)
                  }}
                  title="清除途经点"
                >
                  经 {via.name} <i>✕</i>
                </button>
              ) : (
                <button className="plan-via-chip" onClick={() => setPickFor('via')}>
                  ＋ 途经点
                </button>
              )}
            </div>

            <button className="plan-od-row" onClick={() => setPickFor('origin')}>
              <span className="pin-from" />
              <span className="plan-od-txt">
                <b className={origin ? '' : 'ph'}>{origin ? origin.name : '选择起点'}</b>
                {origin?.sub && origin.sub !== origin.name && <i>{origin.sub}</i>}
              </span>
              <span className="plan-od-act">›</span>
            </button>

            {via && (
              <button className="plan-od-row has-via" onClick={() => setPickFor('via')}>
                <span className="pin-via on" />
                <span className="plan-od-txt">
                  <b>{via.name}</b>
                  {via?.sub && via.sub !== via.name && <i>{via.sub}</i>}
                </span>
                <span className="plan-od-act">›</span>
              </button>
            )}

            <button className="plan-od-row" onClick={() => setPickFor('dest')}>
              <span className="pin-to" />
              <span className="plan-od-txt">
                <b className={dest ? '' : 'ph'}>{dest ? dest.name : '选择终点'}</b>
                {dest?.sub && dest.sub !== dest.name && <i>{dest.sub}</i>}
              </span>
              <span className="plan-od-act">›</span>
            </button>

            <div className="plan-od-btns">
              <button className="plan-swap" onClick={swap} title="交换起终点">⇅</button>
              <button className="btn" disabled={!canRun} onClick={() => run()}>
                {loading ? '规划中…' : '查询路线'}
              </button>
            </div>
          </div>
        )}

        {/* 底部面板：只有「计算中」和「有结果」时才出现 */}
        {showSheet && (
          <div className={`plan-sheet ${detail ? 'tall' : ''}`} ref={sheetRef}>
            <div className="handle" />

            {loading && (
              <div className="plan-empty">
                <p className="plan-empty-title">正在计算换乘方案…</p>
              </div>
            )}

            {result && (
              <>
                <div className="plan-notice">
                  <span className={`chip ${result.ok ? 'teal' : 'red'}`}>
                    {MODE_CHIP[result.mode] || '无法规划'}
                  </span>
                  <span>{result.notice}</span>
                </div>

                {!detail && result.plans.length > 1 && (
                  <div className="plan-list">
                    {result.plans.map((p, i) => (
                      <button
                        key={p.id}
                        className={`plan-card ${active?.id === p.id ? 'on' : ''}`}
                        onClick={() => {
                          setActiveId(p.id)
                          setDetail(true)
                        }}
                      >
                        <div className="plan-card-top">
                          <b className="plan-min">{p.totalMin}<i>分钟</i></b>
                          <span className="plan-card-tags">
                            {i === 0 && <span className="chip green">最快</span>}
                            <span className="chip">{p.tag}</span>
                          </span>
                        </div>
                        <div className="plan-card-sub">{p.title}</div>
                        <div className="plan-pills">
                          {(p.segments?.length ? p.segments : p.legs).map((l, k) => {
                            const c = segColor(l)
                            const txt =
                              l.mode === 'walk'
                                ? `${MODE_ICON.walk} ${l.m ?? Math.round((l.km || 0) * 1000)} 米`
                                : `${MODE_ICON[l.mode] || ''} ${lineName(l.line) || MODE_NAME[l.mode]}`
                            return (
                              <span
                                key={k}
                                className={`plan-pill ${l.mode}`}
                                style={{ color: c, borderColor: c }}
                              >
                                {txt}
                              </span>
                            )
                          })}
                        </div>
                        <div className="plan-card-foot">
                          <span>步行 {p.walkM} 米</span>
                          <span>{p.transfers} 次换乘</span>
                          <span>约 ¥{p.fare}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {detail && active && (
                  <div className="plan-detail">
                    <div className="plan-detail-head">
                      <div>
                        <b className="plan-min">{active.totalMin}<i>分钟</i></b>
                        <div className="meta">
                          步行 {active.walkM} 米 · {active.transfers} 次换乘 · 约 ¥{active.fare}
                        </div>
                      </div>
                      {result.plans.length > 1 && (
                        <button className="chip blue" onClick={() => setDetail(false)}>
                          全部方案
                        </button>
                      )}
                    </div>
                    <ol className="plan-steps">
                      {active.legs.map((l, i) => (
                        <li key={i} className={`${l.mode} ${segPick === i ? 'on' : ''}`} style={{ '--seg': segColor(l) }}>
                          <span className="step-ico">{MODE_ICON[l.mode]}</span>
                          <div className="step-body">
                            <div className="step-title">
                              <b>{lineName(l.line) || MODE_NAME[l.mode]}</b>
                              <span className="step-min">{l.min} 分钟</span>
                            </div>
                            <div className="step-text">{l.text}</div>
                            <div className="step-meta">
                              {l.stops ? `${l.stops} 站` : null}
                              {l.km ? `${l.stops ? ' · ' : ''}${l.km} km` : null}
                              {l.note ? ` · ${l.note}` : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {result.plans.length > 1 && (
                      <div className="plan-alt">
                        {result.plans
                          .filter((p) => p.id !== active.id)
                          .map((p) => (
                            <button
                              key={p.id}
                              className="plan-alt-item"
                              onClick={() => setActiveId(p.id)}
                            >
                              <span>{p.totalMin} 分钟 · {p.tag}</span>
                              <span className="meta">{p.legs.map((l) => lineName(l.line) || MODE_NAME[l.mode]).join(' → ')}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {pickFor && (
        <PlacePicker
          which={pickFor}
          onClose={() => setPickFor(null)}
          onPick={(p) => setPoint(pickFor, p)}
          onManagePinned
          onMapPick={() => {
            const w = pickFor
            setPickFor(null)
            setPicking(w)
          }}
        />
      )}

      <TabBar />
    </div>
  )
}
