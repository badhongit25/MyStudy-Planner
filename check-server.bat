@echo off
title Check MyStudy Server Status
cd /d "%~dp0"
echo ===================================================
echo   Checking MyStudy Planner Server (Port 5000)...
echo ===================================================
node -e "
fetch('http://localhost:5000/api/health')
  .then(r => r.json())
  .then(d => console.log('Status: [ONLINE]', d.message))
  .catch(e => console.log('Status: [OFFLINE] Backend server is not running. Double-click start-server.bat'));
"
pause
