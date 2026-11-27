// 演示机外框：桌面端呈现手机形态，窄屏自动全屏
export default function PhoneFrame({ children, bar = 'dark' }) {
  return (
    <div className="stage">
      <div className="stage-note">
        <h1>云乘见</h1>
        <p>响应型接驳公交小程序。完整流程：定位授权 → 选 OD → 匹配 → 呼叫 → 支付 → 候车 → 核销上车 → 行程中（改站/提前下车）→ 下车结算 → 评价。</p>
        <p>地图为高德真实底图（JS API），运营范围与站点取自辽宁省大连市高新园区软件园一带的真实公交站与地铁站。</p>
      </div>
      <div className="phone">
        <div className="phone-screen">
          <div className={`status-bar ${bar}`}>
            <span>9:41</span>
            <span className="capsule" />
          </div>
          <div className="app">{children}</div>
        </div>
      </div>
    </div>
  )
}
