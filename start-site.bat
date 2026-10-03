@echo off
REM ============================================================
REM  أرض اللغة — تشغيل الموقع بضغطة واحدة
REM  يفتح نافذتين مصغرتين (السيرفر + الموقع) ثم يفتح المتصفح
REM  يعمل من أي مكان: ينتقل تلقائياً لمجلد هذا الملف (%~dp0)
REM ============================================================
cd /d "%~dp0"

if not exist ".env" (
  echo [تحذير] ملف .env غير موجود في الجذر!
  echo انسخ .env.example الى .env وعبّئ القيم ثم أعد التشغيل.
  pause
  exit /b 1
)

echo [1/2] Building API server (dist) so node loads latest env code...
call pnpm --filter @workspace/api-server run build
if errorlevel 1 (
  echo [خطأ] فشل بناء السيرفر. أوقف هنا.
  pause
  exit /b 1
)

echo [2/2] Starting API server (port 5000)...
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
