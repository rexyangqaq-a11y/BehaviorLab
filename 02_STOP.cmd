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
"%BEHAVIORLAB_NODE%" scripts\desktop-launcher.mjs stop
if errorlevel 1 (
  echo ERROR: Could not confirm a normal shutdown. See .runtime\server.log.
  pause
  exit /b 1
)
exit /b 0
