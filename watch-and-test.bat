@echo off
REM Docker Auto-Test Watcher - Windows Batch Wrapper
REM This bypasses PowerShell execution policy for convenience

echo ======================================
echo PANfm Docker Auto-Test Watcher
echo ======================================
echo.

REM Check if PowerShell script exists
if not exist "%~dp0watch-and-test.ps1" (
    echo Error: watch-and-test.ps1 not found!
    pause
    exit /b 1
)

REM Parse arguments
set MODE=
if "%1"=="-BuildOnly" set MODE=-BuildOnly
if "%1"=="-FullTest" set MODE=-FullTest
if "%1"=="--build-only" set MODE=-BuildOnly
if "%1"=="--full-test" set MODE=-FullTest

REM Run PowerShell script with bypass
if "%MODE%"=="" (
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0watch-and-test.ps1"
) else (
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0watch-and-test.ps1" %MODE%
)

pause
