// 始发与到达地填写面板（首页）
// 两个框都是按钮：点击后进入统一的地点选择页（家/公司/收藏夹/地图选点/为你推荐/历史记录），
// 起终点齐了由首页直接跳到车辆匹配页，因此这里不再有「查看可呼叫车辆」按钮。
import { stopById } from '../data/config.js'

export default function ODPanel({ trip, notice, onOpenFrom, onOpenTo }) {
  const from = trip.fromId ? stopById(trip.fromId) : null
  const to = trip.toId ? stopById(trip.toId) : null

  return (
    <div className="od-sheet">
      <div className="od-sheet-head">
        <span className="od-brand">去哪儿</span>
      </div>

      <div className="od-fields">
        <div className="pin-col">
          <span className="pin-from" />
          <span className="pin-line" />
          <span className="pin-to" />
        </div>
        <div className="od-fields-main">
          <button className="od-field od-pick" onClick={onOpenFrom}>
            <span className="od-tag from">上车</span>
            <span className="od-pick-txt">
              <b className={from ? '' : 'ph'}>{from ? from.name : '选择上车点'}</b>
              <i>{from ? (from.hub ? '地铁站 · 接驳枢纽' : '乘降点 · 已按定位匹配最近一站') : '点击选择或重新定位'}</i>
            </span>
            <span className="od-pick-go">›</span>
          </button>

          <button className="od-field od-pick" onClick={onOpenTo}>
            <span className="od-tag to">下车</span>
            <span className="od-pick-txt">
              <b className={to ? '' : 'ph'}>{to ? to.name : '选择下车点'}</b>
              <i>{to ? (to.hub ? '地铁站 · 接驳枢纽' : '乘降点') : '搜索地点、公交站、地铁站'}</i>
            </span>
            <span className="od-pick-go">›</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="notice warn">
          <span>⚠</span>
          {notice}
        </div>
      )}
    </div>
  )
}
