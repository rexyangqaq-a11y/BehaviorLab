@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Extract the full private ZIP first.
  pause
  exit /b 1
)
"runtime\node.exe" "scripts\import-migration-keys.mjs"
set "LAB_IMPORT_EXIT=%ERRORLEVEL%"
pause
exit /b %LAB_IMPORT_EXIT%
