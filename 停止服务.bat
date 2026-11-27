@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 停止云乘见服务
node "tools\launch.mjs" stop
ping -n 3 127.0.0.1 >nul
