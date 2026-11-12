@echo off
chcp 65001 >nul
setlocal
echo ============================================
echo  dsh-purge 一键安装
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
