@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Missing bundled runtime\node.exe. Extract the full ZIP first.
  pause
  exit /b 1
)
"runtime\node.exe" "scripts\phone-doctor.mjs"
set "LAB_CHECK_EXIT=%ERRORLEVEL%"
echo.
echo Offline check only. No phone operation or model call was performed.
echo Bundled video checks include file hashes, Java and SDK class loading.
echo Report: .runtime\phone-doctor.json
pause
exit /b %LAB_CHECK_EXIT%
