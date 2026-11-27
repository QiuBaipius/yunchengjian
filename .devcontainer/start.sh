#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# 后端 API（8790）：检索 + GLM，SSE 流式
if ! curl -sf http://127.0.0.1:8790/api/health >/dev/null 2>&1; then
  nohup node server/index.mjs --api-only > /tmp/yunchengjian-api.log 2>&1 &
fi

# 前端（5173）：Vite 开发服务器
if ! curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
  nohup npm run dev -- --host 0.0.0.0 > /tmp/yunchengjian-web.log 2>&1 &
fi

echo "云乘见已启动："
echo "  前端  http://localhost:5173"
echo "  API   http://localhost:8790/api/health"
echo "日志：/tmp/yunchengjian-api.log , /tmp/yunchengjian-web.log"
