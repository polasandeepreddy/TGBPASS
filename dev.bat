@echo off
title TG-bPASS Data Intelligence Platform (Dev Mode)
cd /d "%~dp0"

echo ===================================================
echo   TG-bPASS Data Intelligence Platform - DEV MODE
echo   Running Flask API + Vite Dev Server
echo ===================================================
echo.

python run.py --dev

pause
