@echo off
title TG-bPASS Data Intelligence Platform
cd /d "%~dp0"

echo ===================================================
echo   TG-bPASS Data Intelligence Platform
echo   Telangana Building Approval System Inspector
echo ===================================================
echo.

:: Check for node_modules in frontend
if not exist "frontend\node_modules\" (
    echo [1/3] Installing React frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

:: Check for frontend build
if not exist "frontend\dist\index.html" (
    echo [2/3] Building React application...
    cd frontend
    call npm run build
    cd ..
)

echo [3/3] Starting Python Flask backend server...
python run.py

pause
