@echo off
REM ============================================================
REM  أرض اللغة — تشغيل الموقع بضغطة واحدة
REM  يفتح نافذتين مصغرتين (السيرفر + الموقع) ثم يفتح المتصفح
REM ============================================================
cd /d C:\Users\HSG\Downloads\arabic-main\arabic-main

echo Starting API server (port 5000)...
start "ArdLughah API" /min node artifacts\api-server\dist\index.mjs

echo Starting website (port 3000)...
set PORT=3000
start "ArdLughah Web" /min pnpm --filter @workspace/ard-al-lughah run dev

echo Waiting for startup...
timeout /t 30 /nobreak >nul
start http://localhost:3000
echo.
echo Done! Keep both mini windows open while using the site.
echo To stop everything, double-click stop-site.bat
pause
