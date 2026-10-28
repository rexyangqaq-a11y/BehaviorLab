@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Fully extract the Windows package first.
  pause
  exit /b 1
)
"runtime\node.exe" scripts\import-phone-calibration.mjs %*
set "IMPORT_EXIT=%ERRORLEVEL%"
pause
exit /b %IMPORT_EXIT%
