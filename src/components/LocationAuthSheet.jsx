// 定位授权弹窗（模拟小程序 scope.userLocation 授权流程）
export default function LocationAuthSheet({ onGrant, onDeny }) {
  return (
    <div className="popup">
      <div className="box" style={{ textAlign: 'left' }}>
        <h3 style={{ textAlign: 'center' }}>云乘见 申请获取你的位置</h3>
        <p style={{ textAlign: 'center' }}>用于自动匹配距离你最近的上车点，并估算车辆到达时间</p>
        <div className="card" style={{ background: 'var(--paper)', marginBottom: 14 }}>
          <div className="meta">授权范围</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>当前位置（仅在呼叫车辆时使用）</div>
        </div>
        <button className="btn" onClick={onGrant}>允许</button>
        <button className="btn outline" style={{ marginTop: 8 }} onClick={onDeny}>拒绝</button>
      </div>
    </div>
  )
}
