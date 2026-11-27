import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 两个入口：
//   index.html —— 乘客端小程序
//   ops.html   —— 运营侧「更新系统」（独立后台，不出现在乘客端任何入口）
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        ops: 'ops.html',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    // AI 客服的检索与模型调用都在本地服务（server/index.mjs）里完成，
    // dev 时把 /api 转发过去，模型密钥不会进前端产物。
    proxy: {
      '/api': { target: 'http://127.0.0.1:8790', changeOrigin: false },
    },
  },
})
