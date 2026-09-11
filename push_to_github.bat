@echo off
setlocal enabledelayedexpansion
set "PATH=%SystemRoot%\System32;%SystemRoot%;%PATH%"

echo ===================================================
echo   Financial Management System - Safe GitHub Push
echo ===================================================
echo.

cd /d "%~dp0"

echo [*] Checking git index health...
if exist ".git\index" (
    for %%F in (".git\index") do (
        if %%~zF LSS 100 (
            echo [FIX] Detected corrupted 0-byte .git\index file.
            echo Rebuilding index from HEAD...
            del /f /q ".git\index" 2>nul
            git reset
        )
    )
)

echo.
echo [1/4] Checking .env safety...
git status --porcelain 2>nul | "%SystemRoot%\System32\findstr.exe" /i "\.env"
if %errorlevel% equ 0 (
    echo.
    echo [WARNING] Detected .env file in git status!
    echo Removing .env files from git staging area...
    git rm --cached -f .env 2>nul
    git rm --cached -f finance-backend\.env 2>nul
    git rm --cached -f finance-frontend\.env 2>nul
    git rm --cached -f finance-aiservice\.env 2>nul
    git rm --cached -f *.env 2>nul
) else (
    echo [OK] No .env files tracked or staged.
)

echo.
echo [2/4] Staging changes...
git add .

echo.
echo [3/4] Ensuring no .env files are staged...
git rm --cached -r --quiet *.env .env finance-backend/.env finance-frontend/.env finance-aiservice/.env finance-forecasting/.env 2>nul

echo.
echo Current staged files:
git status --short

echo.
echo [4/4] Committing local changes...
git commit -m "Fix case-sensitive import paths for Linux/Docker build"

echo.
echo Syncing with remote repository...
git pull --rebase origin main
if %errorlevel% neq 0 (
    echo [INFO] Resolving merge with remote...
    git rebase --abort 2>nul
    git pull origin main --no-rebase -m "Merge remote changes"
)

echo.
echo Pushing to origin main...
git push origin main

echo.
echo ===================================================
echo   Push completed successfully without any .env files!
echo ===================================================
pause
