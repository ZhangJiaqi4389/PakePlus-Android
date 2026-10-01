@echo off
chcp 65001 >nul
title 看谱Pro - 本地服务
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo 正在通过 Node.js 启动...
  node server.mjs
  goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo 正在通过 Python 启动...
  start "" http://127.0.0.1:5173/index.html
  py -m http.server 5173 --bind 127.0.0.1
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo 正在通过 Python 启动...
  start "" http://127.0.0.1:5173/index.html
  python -m http.server 5173 --bind 127.0.0.1
  goto :end
)

echo.
echo   没有找到 Node.js 或 Python。
echo   液态玻璃需要通过 http:// 打开页面（浏览器安全策略限制，
echo   直接双击 index.html 会导致玻璃效果失效）。
echo.
echo   解决办法（任选其一）:
echo     1. 安装 Node.js: https://nodejs.org/
echo     2. 安装 Python:  https://www.python.org/
echo.
pause

:end
