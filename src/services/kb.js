// 知识库读写客户端：与本地服务 /api/kb 通信
// 管理页的所有增删改查都走这里，保存后服务端立即热重载，AI 客服下一次提问即生效。
const API = '/api/kb'

async function req(path, opts) {
  const res = await fetch(path, opts)
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg ? `${res.status} ${msg.slice(0, 160)}` : `请求失败（${res.status}）`)
  }
  return res.json()
}

export async function fetchKB() {
  return req(API)
}

export async function saveKB(payload) {
  return req(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function upsertEntry(entry) {
  return req(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry }),
  })
}

export async function deleteEntry(id) {
  return req(`${API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// 检索测试台：把问题丢回服务端的同一套检索管线，拿回四路名次与最终 prompt
export async function searchKB(question) {
  return req(`${API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
}
