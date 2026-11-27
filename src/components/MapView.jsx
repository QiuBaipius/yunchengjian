// 地图容器：高德真实地图（大连）
// key 不可用时不再回退虚拟地图，而是给出可操作的提示条（点击可重新配置 key）。
// 第十八轮：右下角图例整体下线（线路名称已经直接标在地图上，图例只会挡住地图）。
import { useCallback, useRef, useState } from 'react'
import AMapCanvas from './AMapCanvas.jsx'
import MapKeySheet from './MapKeySheet.jsx'
import { saveAmapConfig } from '../data/mapConfig.js'
import { resetAMap } from '../services/amapLoader.js'
import { toast } from '../store/actions.js'

export default function MapView({ ...props }) {
  const [failMsg, setFailMsg] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [attempt, setAttempt] = useState(0) // 换 key 后重新挂载画布
  const failedRef = useRef(false)

  const onFail = useCallback((msg) => {
    if (failedRef.current) return
    failedRef.current = true
    setFailMsg(msg)
  }, [])

  const handleSave = (key, sec) => {
    saveAmapConfig(key, sec)
    resetAMap()
    setSheetOpen(false)
    failedRef.current = false
    setFailMsg('')
    setAttempt((a) => a + 1)
    toast('已保存 key，正在加载高德地图…')
  }

  return (
    <div className="map-host">
      <AMapCanvas key={attempt} {...props} onFail={onFail} />

      {failMsg && (
        <button className="map-engine-bar" onClick={() => setSheetOpen(true)}>
          高德地图未就绪 · 点击检查 key
        </button>
      )}

      {sheetOpen && (
        <MapKeySheet reason={failMsg} onSave={handleSave} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}
