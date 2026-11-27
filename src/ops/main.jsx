// 更新系统入口：独立于乘客端小程序的运营后台
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import OpsApp from './OpsApp.jsx'
import './ops.css'

createRoot(document.getElementById('ops-root')).render(
  <StrictMode>
    <OpsApp />
  </StrictMode>,
)
