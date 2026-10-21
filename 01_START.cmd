@echo off
setlocal
cd /d "%~dp0"
set "BEHAVIORLAB_NODE=%~dp0runtime\node.exe"
if exist "%BEHAVIORLAB_NODE%" goto run
set "BEHAVIORLAB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BEHAVIORLAB_NODE%" goto run
set "BEHAVIORLAB_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Runtime missing. Fully extract the portable ZIP first.
  pause
  exit /b 1
)
:run
"%BEHAVIORLAB_NODE%" -e "if(process.versions.node.split('.')[0]!=='24'){console.error('Node.js 24 is required. Use the runtime included in the portable ZIP.');process.exit(1)}"
if errorlevel 1 goto failure
"%BEHAVIORLAB_NODE%" scripts\desktop-launcher.mjs start %*
if errorlevel 1 goto failure
exit /b 0
:failure
echo Please read .runtime\server.log and 00_README.txt.
pause
exit /b 1
