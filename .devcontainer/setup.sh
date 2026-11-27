#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "==> 安装前端依赖"
npm ci || npm install

echo "==> 生成后端本地配置（如不存在）"
if [ ! -f server/config.local.json ]; then
  cat > server/config.local.json <<'JSON'
{
  "apiKey": "",
  "models": ["glm-4.7-flash", "glm-4.5-flash", "glm-4-flash"],
  "maxTokens": 520,
  "temperature": 0.3
}
JSON
fi

echo "==> 完成。AI 客服已内置公开可用的 GLM Key，可直接使用；如需换成自己的 key，在 Codespaces Secrets 中配置 GLM_API_KEY"
