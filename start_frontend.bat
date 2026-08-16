@echo off
title FleetFlow Frontend Dev Server

echo Starting FleetFlow Frontend...
echo.

cd /d "%~dp0frontend"
npm run dev
