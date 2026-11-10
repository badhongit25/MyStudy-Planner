@echo off
title Stop MyStudy Server
echo ===================================================
echo   Stopping MyStudy Planner Server on Port 5000...
echo ===================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo Server stopped successfully.
timeout /t 2 >nul
