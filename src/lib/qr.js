// 极简 QR 编码器（零依赖）：byte 模式 / 纠错等级 M / 版本 1–10 自动选择
//
// 用途：乘车码需要一个"看起来、扫起来都是真二维码"的图形。
// 内容是一段与业务无关的演示串，不承载任何可核销凭证。
//
// 实现要点（都是 QR 规范里的硬要求，缺一个就扫不出来）：
//   · GF(256) 上的 Reed–Solomon 纠错，按版本分块并交织
//   · 三个定位图形 + 分隔符 + 定时图形 + 校正图形 + 暗模块
//   · 15 位格式信息 / 18 位版本信息（BCH 编码 + 固定掩码 0x5412）
//   · 8 种掩码按惩罚分选优，避免大面积同色或伪定位图形

// version -> { ec: 每块纠错码字数, groups: [[块数, 每块数据码字数], ...] }
const BLOCKS_M = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
}

// 校正图形中心坐标
const ALIGN = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

const MAX_VERSION = 10

// ---- GF(256) ----
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

function rsGenPoly(deg) {
  let poly = [1]
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gmul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen)
  const res = new Array(data.length + gen.length - 1).fill(0)
  for (let i = 0; i < data.length; i++) res[i] = data[i]
  for (let i = 0; i < data.length; i++) {
    const coef = res[i]
    if (!coef) continue
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef)
  }
  return res.slice(data.length)
}

// ---- 版本与容量 ----
const dataCodewords = (v) => BLOCKS_M[v].groups.reduce((s, [n, d]) => s + n * d, 0)
const countBits = (v) => (v <= 9 ? 8 : 16)

function pickVersion(byteLen) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const capBits = dataCodewords(v) * 8
    if (4 + countBits(v) + byteLen * 8 <= capBits) return v
  }
  return 0
}

function bitLength(v) {
  let n = 0
  while (v) {
    n++
    v >>= 1
  }
  return n
}

// 15 位格式信息（纠错等级 M = 0b00）
function bch15_5(mask) {
  const data = (0 << 3) | mask
  let v = data << 10
  while (bitLength(v) - 1 >= 10) v ^= 0x537 << (bitLength(v) - 11)
  return ((data << 10) | v) ^ 0x5412
}

// 18 位版本信息
function bch18_6(version) {
  let v = version << 12
  while (bitLength(v) - 1 >= 12) v ^= 0x1f25 << (bitLength(v) - 13)
  return (version << 12) | v
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function placeFinder(mods, size, row, col) {
  for (let i = -1; i <= 7; i++) {
    for (let j = -1; j <= 7; j++) {
      const r = row + i
      const c = col + j
      if (r < 0 || r >= size || c < 0 || c >= size) continue
      const on =
        (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
        (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
        (i >= 2 && i <= 4 && j >= 2 && j <= 4)
      mods[r][c] = on
    }
  }
}

function setFormat(mods, size, mask) {
  const bits = bch15_5(mask)
  for (let i = 0; i < 15; i++) {
    const on = ((bits >> i) & 1) === 1
    if (i < 6) mods[i][8] = on
    else if (i < 8) mods[i + 1][8] = on
    else mods[size - 15 + i][8] = on

    if (i < 8) mods[8][size - i - 1] = on
    else if (i < 9) mods[8][15 - i] = on
    else mods[8][15 - i - 1] = on
  }
  // 固定暗模块（位置恒为深色）
  mods[size - 8][8] = true
}

function setVersionInfo(mods, size, version) {
  if (version < 7) return
  const bits = bch18_6(version)
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1
    const a = size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    mods[b][a] = on
    mods[a][b] = on
  }
}

// 惩罚分：连续同色 / 2x2 色块 / 伪定位图形 / 深浅比例
function penalty(m) {
  const n = m.length
  let score = 0

  for (let i = 0; i < n; i++) {
    for (const vertical of [false, true]) {
      let run = 1
      for (let j = 1; j < n; j++) {
        const cur = vertical ? m[j][i] : m[i][j]
        const prev = vertical ? m[j - 1][i] : m[i][j - 1]
        if (cur === prev) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c]
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3
    }
  }

  const finderLike = [true, false, true, true, true, false, true]
  const scan = (vertical) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j + 7 <= n; j++) {
        let ok = true
        for (let k = 0; k < 7; k++) {
          const v = vertical ? m[j + k][i] : m[i][j + k]
          if (v !== finderLike[k]) {
            ok = false
            break
          }
        }
        if (!ok) continue
        let blankBefore = true
        let blankAfter = true
        for (let k = 1; k <= 4; k++) {
          if (j - k >= 0 && (vertical ? m[j - k][i] : m[i][j - k])) blankBefore = false
          if (j + 6 + k < n && (vertical ? m[j + 6 + k][i] : m[i][j + 6 + k])) blankAfter = false
        }
        if (blankBefore || blankAfter) score += 40
      }
    }
  }
  scan(false)
  scan(true)

  let dark = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++
  const ratio = (dark * 100) / (n * n)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return score
}

/**
 * 生成二维码矩阵。
 * @param {string} text 要编码的文本（UTF-8）
 * @param {{mask?: number}} [opts] 可选：强制指定掩码（调试/校验用，默认按惩罚分自动择优）
 * @returns {boolean[][]} 行优先的二维布尔矩阵（true = 深色）
 */
export function qrMatrix(text, opts = {}) {
  const bytes = new TextEncoder().encode(String(text ?? ''))
  const version = pickVersion(bytes.length)
  if (!version) throw new Error('二维码内容过长')

  const size = 17 + version * 4
  const { ec: ecLen, groups } = BLOCKS_M[version]
  const totalData = dataCodewords(version)

  // ① 位流：模式 0100 + 字符计数 + 数据
  const bits = []
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  push(4, 4)
  push(bytes.length, countBits(version))
  for (const b of bytes) push(b, 8)

  // ② 终止符 + 字节对齐 + 填充码字
  const capBits = totalData * 8
  for (let i = 0; i < Math.min(4, capBits - bits.length); i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataWords = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    dataWords.push(v)
  }
  let pad = 0xec
  while (dataWords.length < totalData) {
    dataWords.push(pad)
    pad = pad === 0xec ? 0x11 : 0xec
  }

  // ③ 分块纠错 + 交织
  const blocks = []
  let at = 0
  for (const [count, dlen] of groups) {
    for (let i = 0; i < count; i++) {
      const data = dataWords.slice(at, at + dlen)
      at += dlen
      blocks.push({ data, ec: rsEncode(data, ecLen) })
    }
  }
  const final = []
  const maxData = Math.max(...blocks.map((b) => b.data.length))
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) final.push(b.data[i])
  for (let i = 0; i < ecLen; i++) for (const b of blocks) final.push(b.ec[i])

  // ④ 功能图形（先用 mask 0 写一遍格式信息占位，保证数据区避开它们）
  const mods = Array.from({ length: size }, () => new Array(size).fill(null))
  placeFinder(mods, size, 0, 0)
  placeFinder(mods, size, 0, size - 7)
  placeFinder(mods, size, size - 7, 0)

  // 校正图形必须在定时图形之前：中心的 (6,22)/(22,6) 正好落在定时线上，
  // 顺序反了会被定时线挡住，导致少画两个校正图形、数据位整体错位。
  for (const r of ALIGN[version]) {
    for (const c of ALIGN[version]) {
      if (mods[r][c] !== null) continue
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          // 外框一圈深色 + 内圈 3×3 空心 + 正中一个深点
          mods[r + i][c + j] = Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    const on = i % 2 === 0
    if (mods[6][i] === null) mods[6][i] = on
    if (mods[i][6] === null) mods[i][6] = on
  }

  setFormat(mods, size, 0)
  setVersionInfo(mods, size, version)

  const isFunc = mods.map((row) => row.map((v) => v !== null))

  // ⑤ 数据按两列一组蛇形填入
  let bi = 0
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (let k = 0; k < 2; k++) {
        const c = col - k
        if (mods[row][c] !== null) continue
        const bit = bi < final.length * 8 ? (final[bi >> 3] >> (7 - (bi & 7))) & 1 : 0
        mods[row][c] = bit === 1
        bi++
      }
    }
    upward = !upward
  }

  // ⑥ 八种掩码择优
  const force = opts.mask
  let best = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    if (force != null && mask !== force) continue
    const fn = MASKS[mask]
    const m = mods.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : v !== fn(r, c))))
    setFormat(m, size, mask)
    const s = penalty(m)
    if (s < bestScore) {
      bestScore = s
      best = m
    }
  }
  return best
}

// 演示用载荷：一段无业务含义的字符串，扫出来也只是一串编号
export function demoTicketPayload(seed = 0) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
  return `YUNCHENGJIAN-DEMO/TICKET/${stamp}/${String(seed % 10000).padStart(4, '0')}`
}
