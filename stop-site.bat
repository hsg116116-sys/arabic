@echo off
REM ============================================================
REM  أرض اللغة — إيقاف الموقع والسيرفر
REM ============================================================
echo Stopping site (3000) and API (5000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo Done. Ports are free.
pause
