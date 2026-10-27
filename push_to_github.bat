@echo off
title Push TGBPASS to GitHub
cd /d "%~dp0"
echo ========================================================
echo  Pushing TGBPASS repository to GitHub (origin/main)
echo ========================================================
echo.
"C:\Program Files\Git\cmd\git.exe" push -u origin main
echo.
echo Exit code: %ERRORLEVEL%
pause
