@echo off
title MyStudy Planner Server
cd /d "%~dp0"
echo ===================================================
echo   Starting MyStudy Planner Backend Server (Port 5000)
echo ===================================================
node server.js
pause
