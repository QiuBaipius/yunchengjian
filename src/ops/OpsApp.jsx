// 云乘见 · 更新系统
// 独立运营后台：维护 AI 客服知识库（唯一数据源），保存即热更新检索索引。
// 与乘客端完全分离：不挂任何客户端入口，独立页面 /ops，独立视觉与信息架构。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteEntry, fetchKB, searchKB, upsertEntry } from '../services/kb.js'

const LEVELS = {
  L1: { label: '分类导览', color: '#2f6fed', soft: '#e8f0fe' },
  L2: { label: '规则条文', color: '#0f7a62', soft: '#e3f4ee' },
  L3: { label: '参数细节', color: '#b4620a', soft: '#fdf0dd' },
}

const EMPTY = { id: '', cat: 'price', level: 'L2', title: '', tags: [], q: [], text: '', src: '' }
const LOG_KEY = 'ycj-ops-log-v1'
const CHANNEL_NAME = { lexical: '词法 BM25', vector: '语义向量', cat: '分类路由', phrase: '典型问法' }

function readLog() {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function pushLog(item) {
  const next = [item, ...readLog()].slice(0, 60)
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next))
  } catch {
    /* 忽略配额错误 */
  }
  return next
}

const fmt = (t) =>
  t
    ? new Date(t).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

export default function OpsApp() {
  const [view, setView] = useState('kb')
  const [data, setData] = useState(null)
  const [health, setHealth] = useState(null)
  const [misses, setMisses] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cat, setCat] = useState('')
  const [kw, setKw] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [log, setLog] = useState(readLog)
  const [probe, setProbe] = useState('')
  const [probeRes, setProbeRes] = useState(null)
  const [probing, setProbing] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [kb, h, ms] = await Promise.all([
        fetchKB(),
        fetch('/api/health')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch('/api/kb/misses')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
      setData(kb)
      setHealth(h)
      setMisses(ms)
      setError('')
    } catch (e) {
      setError(e.message || '加载失败，请确认本地服务已启动')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    reload()
  }, [reload])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const rows = useMemo(() => {
    if (!data) return []
    let list = data.KB
    if (cat) list = list.filter((d) => d.cat === cat)
    const k = kw.trim()
    if (k) {
      list = list.filter(
        (d) => d.title.includes(k) || d.text.includes(k) || d.id.includes(k) || (d.tags || []).some((t) => t.includes(k)),
      )
    }
    return list
  }, [data, cat, kw])

  const catOf = (id) => data?.CATS.find((c) => c.id === id)

  async function submitEntry(entry, isNew) {
    setSaving(true)
    try {
      await upsertEntry(entry)
      const next = pushLog({
        at: Date.now(),
        action: isNew ? '新增' : '修改',
        id: entry.id,
        title: entry.title,
        total: (data?.KB.length || 0) + (isNew ? 1 : 0),
      })
      setLog(next)
      setToast(isNew ? '已新增并发布，客服即时生效' : '已保存并发布，客服即时生效')
      await reload()
      setEditing(null)
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function runProbe() {
    const q = probe.trim()
    if (!q) return
    setProbing(true)
    try {
      setProbeRes(await searchKB(q))
      setError('')
    } catch (e) {
      setError(e.message || '检索失败')
    } finally {
      setProbing(false)
    }
  }

  async function remove(id) {    if (!window.confirm(`确认删除「${id}」？删除后 AI 客服将不再检索到该条规则。`)) return
    try {
      await deleteEntry(id)
      setLog(pushLog({ at: Date.now(), action: '删除', id, title: id, total: Math.max(0, (data?.KB.length || 1) - 1) }))
      setToast('已删除并发布')
      await reload()
    } catch (e) {
      setError(e.message || '删除失败')
    }
  }

  const counts = data?.stats
  const levelCount = data?.KB.reduce((m, d) => ({ ...m, [d.level]: (m[d.level] || 0) + 1 }), {}) || {}

  return (
    <div className="ops">
      <aside className="ops-side">
        <div className="ops-brand">
          <span className="ops-logo">云</span>
          <div>
            <b>云乘见</b>
            <i>更新系统</i>
          </div>
        </div>

        <nav className="ops-nav">
          <button className={view === 'kb' ? 'on' : ''} onClick={() => setView('kb')}>
            <span>知识库</span>
            <em>{counts?.total ?? '—'}</em>
          </button>
          <button className={view === 'log' ? 'on' : ''} onClick={() => setView('log')}>
            <span>发布记录</span>
            <em>{log.length}</em>
          </button>
          <button className={view === 'status' ? 'on' : ''} onClick={() => setView('status')}>
            <span>服务状态</span>
          </button>
        </nav>

        <div className="ops-side-foot">
          <span className="ops-env">测试环境</span>
          <p>客服端不展示任何管理功能，所有维护动作在此完成。</p>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-top">
          <div className="ops-top-t">
            <h1>{view === 'kb' ? '知识库' : view === 'log' ? '发布记录' : '服务状态'}</h1>
            <p>
              {view === 'kb'
                ? '维护 AI 客服的唯一事实来源。保存后检索索引立即重建，无需重启服务。'
                : view === 'log'
                  ? '最近 60 次变更。每次发布都会写入本地记录，便于回溯。'
                  : '本地检索服务与模型链的实时状态。'}
            </p>
          </div>
          <div className="ops-top-acts">
            <span className={`ops-pill ${health?.ok ? 'on' : ''}`}>
              <i /> {health?.ok ? '服务已连接' : '服务未连接'}
            </span>
            <button className="ops-btn ghost" onClick={reload} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
            {view === 'kb' && (
              <button className="ops-btn" onClick={() => setEditing({ ...EMPTY })}>
                新增条目
              </button>
            )}
          </div>
        </header>

        <div className="ops-body">
          {toast && <div className="ops-toast">{toast}</div>}
          {error && <div className="ops-error">{error}</div>}

          {view === 'kb' && (
            <>
              <section className="ops-stats">
                <div className="ops-stat">
                  <span>规则条目</span>
                  <b>{counts?.total ?? '—'}</b>
                  <i>L1 {levelCount.L1 || 0} · L2 {levelCount.L2 || 0} · L3 {levelCount.L3 || 0}</i>
                </div>
                <div className="ops-stat">
                  <span>分类</span>
                  <b>{counts?.cats?.length ?? '—'}</b>
                  <i>覆盖计价、派单、行程、售后等场景</i>
                </div>
                <div className="ops-stat">
                  <span>最后发布</span>
                  <b className="sm">{fmt(counts?.updatedAt)}</b>
                  <i>保存即生效，无需重启</i>
                </div>
                <div className="ops-stat">
                  <span>检索方式</span>
                  <b className="sm">四路召回 + RRF 重排</b>
                  <i>词法 · 语义 · 分类 · 短语</i>
                </div>
              </section>

              <section className="ops-card ops-bench">
                <div className="ops-bench-head">
                  <div>
                    <b>检索测试台</b>
                    <span>输入真实问法，看四路召回、融合名次与最终交给模型的规则</span>
                  </div>
                  <span className={`ops-bench-flag ${probeRes?.covered ? 'on' : ''}`}>
                    {probeRes ? (probeRes.covered ? '规则库已覆盖' : '未覆盖 · 会转人工') : '待测试'}
                  </span>
                </div>
                <div className="ops-bench-input">
                  <input
                    value={probe}
                    onChange={(e) => setProbe(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) runProbe()
                    }}
                    placeholder="例如：取消订单会扣钱吗 / 轻工学校在运营范围内吗"
                  />
                  <button className="ops-btn" onClick={runProbe} disabled={probing || !probe.trim()}>
                    {probing ? '检索中…' : '检索'}
                  </button>
                </div>

                {probeRes && (
                  <div className="ops-bench-body">
                    <div className="ops-bench-meta">
                      <span>概念命中：{probeRes.concepts?.length ? probeRes.concepts.join('、') : '无'}</span>
                      <span>证据分 {Number(probeRes.evidence || 0).toFixed(2)} · 阈值 {probeRes.threshold}</span>
                    </div>
                    <table className="ops-table ops-bench-table">
                      <thead>
                        <tr>
                          <th style={{ width: 54 }}>名次</th>
                          <th>条目 / 标题</th>
                          <th style={{ width: 92 }}>分类</th>
                          <th style={{ width: 78 }}>重排分</th>
                          <th style={{ width: 210 }}>特征</th>
                        </tr>
                      </thead>
                      <tbody>
                        {probeRes.reranked?.slice(0, 6).map((d, i) => (
                          <tr key={d.id}>
                            <td>{i + 1}</td>
                            <td>
                              <div className="ops-row-title">{d.title}</div>
                              <code className="ops-bench-id">{d.id}</code>
                            </td>
                            <td>{d.cat}</td>
                            <td>{Number(d.score).toFixed(2)}</td>
                            <td className="ops-bench-why">
                              概念 {Number(d.why?.conceptCover || 0).toFixed(2)} · 标题 {Number(d.why?.titleCover || 0).toFixed(2)} · 正文{' '}
                              {Number(d.why?.bodyCover || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {!probeRes.reranked?.length && (
                          <tr>
                            <td colSpan={5} className="ops-empty">没有任何条目被召回</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <details className="ops-bench-more">
                      <summary>各通道名次（词法 / 语义 / 分类 / 短语）</summary>
                      <div className="ops-bench-channels">
                        {['lexical', 'vector', 'cat', 'phrase'].map((k) => (
                          <div key={k}>
                            <b>{CHANNEL_NAME[k]}</b>
                            <span>
                              {(probeRes.channels?.[k] || []).slice(0, 6).map((x) => `${x.id}`).join(' → ') || '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                    <details className="ops-bench-more">
                      <summary>拼装给模型的 prompt</summary>
                      <pre className="ops-bench-prompt">{probeRes.prompt}</pre>
                    </details>
                  </div>
                )}
              </section>

              <section className="ops-card">
                <div className="ops-toolbar">
                  <div className="ops-cats">
                    <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>
                      全部 <em>{counts?.total ?? 0}</em>
                    </button>
                    {(counts?.cats || []).map((c) => (
                      <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                        {c.name} <em>{c.count}</em>
                      </button>
                    ))}
                  </div>
                  <div className="ops-search">
                    <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索标题 / 正文 / 标签 / 编号" />
                    {kw && <button onClick={() => setKw('')}>✕</button>}
                  </div>
                </div>

                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th style={{ width: 168 }}>编号</th>
                        <th>标题</th>
                        <th style={{ width: 132 }}>分类</th>
                        <th style={{ width: 96 }}>层级</th>
                        <th style={{ width: 168 }}>出处</th>
                        <th style={{ width: 116 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => {
                        const lm = LEVELS[d.level] || LEVELS.L2
                        const c = catOf(d.cat)
                        return (
                          <tr key={d.id}>
                            <td><code>{d.id}</code></td>
                            <td>
                              <div className="ops-row-title">{d.title}</div>
                              <div className="ops-row-text">{d.text}</div>
                            </td>
                            <td>{c ? `${c.name}` : d.cat}</td>
                            <td>
                              <span className="ops-level" style={{ color: lm.color, background: lm.soft }}>
                                {lm.label}
                              </span>
                            </td>
                            <td className="ops-src">{d.src || '—'}</td>
                            <td>
                              <button className="ops-link" onClick={() => setEditing({ ...d, tags: [...(d.tags || [])], q: [...(d.q || [])] })}>
                                编辑
                              </button>
                              <button className="ops-link danger" onClick={() => remove(d.id)}>
                                删除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {rows.length === 0 && !loading && (
                        <tr>
                          <td colSpan={6} className="ops-empty">没有匹配的条目</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="ops-foot-note">共 {rows.length} 条 · 保存后立即生效，客服下一次提问即按新内容回答</div>
              </section>
            </>
          )}

          {view === 'log' && (
            <section className="ops-card">
              {log.length === 0 ? (
                <div className="ops-empty pad">还没有发布记录。新增或修改条目后，这里会留下痕迹。</div>
              ) : (
                <ul className="ops-log">
                  {log.map((l, i) => (
                    <li key={`${l.at}-${i}`}>
                      <span className={`ops-log-tag ${l.action === '删除' ? 'danger' : ''}`}>{l.action}</span>
                      <div className="ops-log-main">
                        <b>{l.title || l.id}</b>
                        <i>{l.id}</i>
                      </div>
                      <span className="ops-log-at">{fmt(l.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {view === 'status' && (
            <section className="ops-card pad">
              <div className="ops-kv">
                <span>接口服务</span>
                <b>{health?.ok ? '正常' : '未连接'}</b>
              </div>
              <div className="ops-kv">
                <span>模型密钥</span>
                <b>{health?.key || '—'}</b>
              </div>
              <div className="ops-kv">
                <span>模型降级链</span>
                <b>{(health?.models || []).join(' → ') || '—'}</b>
              </div>
              <div className="ops-kv">
                <span>知识库条目</span>
                <b>{health?.kb?.total ?? '—'} 条</b>
              </div>
              <div className="ops-kv">
                <span>最近索引更新</span>
                <b>{fmt(health?.kb?.updatedAt)}</b>
              </div>
              <div className="ops-miss">
                <div className="ops-miss-head">
                  <b>未命中问题</b>
                  <span>{misses?.total ? `近 ${misses.total} 次咨询里有 ${misses.list.length} 类未命中` : ''}</span>
                </div>
                {misses?.list?.length ? (
                  <ul>
                    {misses.list.map((m) => (
                      <li key={m.q}>
                        <span>{m.q}</span>
                        <em>{m.n} 次</em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ops-miss-empty">还没有未命中记录。客服遇到规则库覆盖不到的问题时会记在这里，直接按这些问法补条目即可。</p>
                )}
              </div>
              <p className="ops-tip">
                说明：知识库保存在服务端 <code>server/kb.json</code>，是本系统与 AI 客服的唯一数据源。
                任何保存动作都会写盘并重建检索索引，因此不存在「发布」按钮——保存即发布。
              </p>
            </section>
          )}
        </div>
      </main>

      {editing && (
        <Editor
          entry={editing}
          cats={data?.CATS || []}
          isNew={!data?.KB.some((d) => d.id === editing.id)}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={submitEntry}
        />
      )}
    </div>
  )
}

// ---- 右侧编辑抽屉 ----
function Editor({ entry, cats, isNew, saving, onClose, onSave }) {
  const [e, setE] = useState(entry)
  const [tagsText, setTagsText] = useState((entry.tags || []).join('、'))
  const [qText, setQText] = useState((entry.q || []).join('\n'))
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    const id = e.id.trim()
    const title = e.title.trim()
    const text = e.text.trim()
    if (!id) return setErr('请填写条目编号，例如 price.formula')
    if (!title) return setErr('请填写标题')
    if (!text) return setErr('请填写正文内容')
    const tags = tagsText.split(/[、,，\s]+/).map((t) => t.trim()).filter(Boolean)
    const q = qText.split('\n').map((t) => t.trim()).filter(Boolean)
    onSave({ ...e, id, title, text, tags, q }, isNew)
  }

  return (
    <div className="ops-drawer-mask" onClick={onClose}>
      <div className="ops-drawer" onClick={(ev) => ev.stopPropagation()}>
        <div className="ops-drawer-head">
          <div>
            <b>{isNew ? '新增知识条目' : '编辑知识条目'}</b>
            <span>{isNew ? '保存后立即进入检索索引' : e.id}</span>
          </div>
          <button className="ops-x" onClick={onClose}>✕</button>
        </div>

        <div className="ops-drawer-body">
          <label className="ops-f">
            <span>条目编号 *</span>
            <input value={e.id} disabled={!isNew} onChange={(ev) => setE({ ...e, id: ev.target.value })} placeholder="price.formula" />
          </label>

          <div className="ops-f-row">
            <label className="ops-f">
              <span>分类</span>
              <select value={e.cat} onChange={(ev) => setE({ ...e, cat: ev.target.value })}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="ops-f">
              <span>层级</span>
              <div className="ops-seg">
                {Object.entries(LEVELS).map(([k, m]) => (
                  <button
                    key={k}
                    className={e.level === k ? 'on' : ''}
                    style={e.level === k ? { color: m.color, background: m.soft } : undefined}
                    onClick={() => setE({ ...e, level: k })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label className="ops-f">
            <span>标题 *</span>
            <input value={e.title} onChange={(ev) => setE({ ...e, title: ev.target.value })} placeholder="一句话概括这条规则" />
          </label>

          <label className="ops-f">
            <span>标签（顿号分隔）</span>
            <input value={tagsText} onChange={(ev) => setTagsText(ev.target.value)} placeholder="计价、一口价、多少钱" />
          </label>

          <label className="ops-f">
            <span>典型问法（每行一条）</span>
            <textarea rows={3} value={qText} onChange={(ev) => setQText(ev.target.value)} placeholder={'云乘见怎么收费\n一口价是什么意思'} />
          </label>

          <label className="ops-f">
            <span>正文内容 *</span>
            <textarea rows={9} value={e.text} onChange={(ev) => setE({ ...e, text: ev.target.value })} placeholder="写清楚对外口径：只讲机制，不写内部费率。" />
          </label>

          <label className="ops-f">
            <span>出处</span>
            <input value={e.src} onChange={(ev) => setE({ ...e, src: ev.target.value })} placeholder="PRD 章节 / 实现文件" />
          </label>

          <div className="ops-hint">
            提示：正文会直接进入模型上下文，请写对客口径；同一问题只保留一条规则，避免口径冲突。
          </div>
          {err && <div className="ops-err">{err}</div>}
        </div>

        <div className="ops-drawer-foot">
          <button className="ops-btn ghost" onClick={onClose}>取消</button>
          <button className="ops-btn" disabled={saving} onClick={submit}>
            {saving ? '发布中…' : '保存并发布'}
          </button>
        </div>
      </div>
    </div>
  )
}
