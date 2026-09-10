@echo off
setlocal enabledelayedexpansion

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
git status --porcelain 2>nul | findstr /i "\.env"
if %errorlevel% equ 0 (
    echo.
    echo [WARNING] Detected .env file in git status!
    echo Removing .env files from git staging area...
    git rm --cached -f .env 2>nul
    git rm --cached -f finance-backend\.env 2>nul
    git rm --cached -f finance-frontend\.env 2>nul
    git rm --cached -f *.env 2>nul
) else (
    echo [OK] No .env files tracked or staged.
)

echo.
echo [2/4] Staging changes...
git add .

echo.
echo [3/4] Ensuring no .env files are staged...
git rm --cached -r --quiet *.env .env finance-backend/.env finance-frontend/.env 2>nul

echo.
echo Current staged files:
git status --short

echo.
echo [4/4] Committing and pushing to origin main...
git commit -m "Update financial management features, workflow sorting, GL sentence case, and table layouts"
git push origin main

echo.
echo ===================================================
echo   Push completed successfully without any .env files!
echo ===================================================
pause
