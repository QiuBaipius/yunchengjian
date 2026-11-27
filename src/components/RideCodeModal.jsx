// 乘车码弹窗：上车 / 下车均需刷码核销
// 二维码是按 QR 规范（byte 模式 / 纠错 M / 自动选版本与掩码）真实生成的，
// 载荷是一段与业务无关的演示串，扫出来只是一串编号，不对应任何可核销凭证。
import { useEffect, useMemo, useState } from 'react'
import { demoTicketPayload, qrMatrix } from '../lib/qr.js'

export default function RideCodeModal({ mode, onClose, onVerify, verifying }) {
  const [round, setRound] = useState(1)

  useEffect(() => {
    const t = setInterval(() => setRound((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const payload = useMemo(() => demoTicketPayload(round), [round])

  const { matrix, path, size } = useMemo(() => {
    try {
      const m = qrMatrix(payload)
      const n = m.length
      // 4 个模块的静区（QR 规范要求），否则扫码器找不到边
      const d = []
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (m[r][c]) d.push(`M${c + 4} ${r + 4}h1v1h-1z`)
        }
      }
      return { matrix: m, path: d.join(''), size: n + 8 }
    } catch {
      return { matrix: null, path: '', size: 29 }
    }
  }, [payload])

  return (
    <div className="popup">
      <div className="box">
        <h3>乘车码</h3>
        <p>{mode === 'board' ? '上车请向司机出示乘车码核销' : '下车请再次刷乘车码核销'}</p>

        <div className="qr">
          {matrix ? (
            <svg
              viewBox={`0 0 ${size} ${size}`}
              width="100%"
              height="100%"
              shapeRendering="crispEdges"
              role="img"
              aria-label="乘车码二维码"
            >
              <rect width={size} height={size} fill="#ffffff" />
              <path d={path} fill="#0b1412" />
            </svg>
          ) : (
            <div className="qr-fallback">乘车码生成失败</div>
          )}
        </div>

        <p className="qr-code-txt">{payload}</p>
        <p className="meta">码每 60 秒自动刷新 · 请勿截图外传</p>
        <button className="btn" disabled={verifying} onClick={onVerify}>
          {verifying ? '核销中…' : mode === 'board' ? '扫码上车' : '扫码下车'}
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}
