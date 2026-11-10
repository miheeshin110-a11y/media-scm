@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$p=[IO.Path]::Combine([Environment]::GetFolderPath('Startup'),'Media SCM Inventory.lnk');if(Test-Path $p){Remove-Item -LiteralPath $p}"
echo Automatic start removed. In SCM, revoke this PC connection.
echo Open http://127.0.0.1:3112/ and delete the locally saved connection.
echo Program files remain in LOCALAPPDATA\MediaSCMBridge for manual review.
pause
