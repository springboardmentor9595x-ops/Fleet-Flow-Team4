@echo off
title FleetFlow Backend Server

echo Starting FleetFlow Backend...
echo.

:: Kill anything on port 8000 first
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "C:\Users\S R\OneDrive\Desktop\fleet_logistic\backend"
call ..\venv\Scripts\activate.bat

echo Backend running at http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.

"%~dp0venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
