@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "Media SCM inventory" /min "%~dp0runtime\node.exe" --experimental-strip-types "%~dp0scripts\ecount-pc.mjs"
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "for($i=0;$i -lt 20;$i++){try{$null=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3112/status' -TimeoutSec 1;break}catch{Start-Sleep -Milliseconds 500}}"
start "" "http://127.0.0.1:3112/"
