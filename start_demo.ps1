# Starts the Flask backend, opens a free Cloudflare quick tunnel, and points the deployed Worker at it.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$cf = @("C:\Program Files (x86)\cloudflared\cloudflared.exe", "C:\Program Files\cloudflared\cloudflared.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cf) { throw 'cloudflared not found. Install: winget install Cloudflare.cloudflared' }

Start-Process python -ArgumentList 'run.py', '--port', '8000' -WindowStyle Minimized
Start-Sleep 12
$log = Join-Path $env:TEMP 'tgbpass-tunnel.log'
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process $cf -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://localhost:8000' -RedirectStandardError $log -WindowStyle Minimized
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
    Start-Sleep 2
    if (Test-Path $log) { $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $url = $m.Matches[0].Value } }
}
if (-not $url) { throw 'Tunnel URL not found in log.' }
Write-Host "Tunnel: $url"
$url | npx -y wrangler@4 secret put API_ORIGIN --name tgbpass
Write-Host "Done. Site: https://tgbpass.tgbpass-portal.workers.dev/  (keep this PC and the minimized windows running)"
