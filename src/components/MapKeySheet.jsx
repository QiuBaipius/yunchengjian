// 高德地图 key 配置面板
//
// 背景：高德 key 按「服务平台」区分类型，Web 页面只能使用「Web端(JS API)」类型的 key。
// 微信小程序类型（amap-wx / 微信原生 map 组件用）的 key 在网页里会返回
// USERKEY_PLAT_NOMATCH，因此这里提供一个运行期替换入口，改完立即生效、无需重新构建。
import { useState } from 'react'
import { getAmapKey, getAmapSecurityCode } from '../data/mapConfig.js'

export default function MapKeySheet({ reason, onSave, onClose }) {
  const [key, setKey] = useState(getAmapKey())
  const [sec, setSec] = useState(getAmapSecurityCode())

  return (
    <div className="key-mask" onClick={onClose}>
      <div className="key-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>启用高德真实地图</h3>
        {reason && <p className="warn-box">{reason}</p>}
        <ol className="key-steps">
          <li>登录高德开放平台控制台 →「应用管理 / 我的应用」→ 添加 Key</li>
          <li>服务平台选择「<b>Web端(JS API)</b>」，绑定你的域名（本机调试可先留空）</li>
          <li>把生成的 Key 粘贴到下面；若控制台同时给出「安全密钥 jscode」，一并粘贴</li>
        </ol>
        <label className="key-field">
          <span>Web端(JS API) Key</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="32 位十六进制字符串" />
        </label>
        <label className="key-field">
          <span>安全密钥 jscode（可选；2021-12 之后申请的 key 必填）</span>
          <input value={sec} onChange={(e) => setSec(e.target.value)} placeholder="32 位十六进制字符串" />
        </label>
        <p className="hint">
          说明：你提供的 <b>ea54…52db</b> 属于「微信小程序」平台类型，只能在小程序里配合 amap-wx SDK 使用；
          网页端需要另建一个 Web 端 key。填写的 key 仅保存在本机浏览器，不会上传。
        </p>
        <div className="key-actions">
          <button className="btn ghost" onClick={onClose}>关闭</button>
          <button className="btn" onClick={() => onSave(key, sec)} disabled={!key.trim()}>保存并加载</button>
        </div>
      </div>
    </div>
  )
}
