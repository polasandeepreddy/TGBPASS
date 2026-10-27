@echo off
title Cloudflare Tunnel for TGBPASS
color 0B
cd /d "%~dp0"
echo ========================================================
echo   TG-bPASS - Cloudflare Secure Tunnel
echo   Exposing http://localhost:8000 to Cloudflare Edge
echo ========================================================
echo.
echo [INFO] Ensure your TGBPASS server is running (via run.bat).
echo [INFO] Generating secure public HTTPS tunnel URL...
echo.
"C:\ProgramData\chocolatey\bin\cloudflared.exe" tunnel --url http://localhost:8000
echo.
pause
