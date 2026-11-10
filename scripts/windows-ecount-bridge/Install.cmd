@echo off
chcp 65001 >nul
set "SCM_BRIDGE_HOME=%LOCALAPPDATA%\MediaSCMBridge\app"
if not exist "%SCM_BRIDGE_HOME%" mkdir "%SCM_BRIDGE_HOME%"
xcopy "%~dp0*" "%SCM_BRIDGE_HOME%\" /E /I /Y >nul
if errorlevel 1 (echo Install failed. Please check folder permissions. & pause & exit /b 1)
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$s=New-Object -ComObject WScript.Shell;$p=$s.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Startup'),'Media SCM Inventory.lnk'));$p.TargetPath=[IO.Path]::Combine($env:SCM_BRIDGE_HOME,'runtime','node.exe');$p.Arguments='--experimental-strip-types '+[char]34+[IO.Path]::Combine($env:SCM_BRIDGE_HOME,'scripts','ecount-pc.mjs')+[char]34;$p.WorkingDirectory=$env:SCM_BRIDGE_HOME;$p.WindowStyle=7;$p.Save()"
if errorlevel 1 echo Automatic start was not registered. Use Start.cmd after login.
call "%SCM_BRIDGE_HOME%\Start.cmd"
