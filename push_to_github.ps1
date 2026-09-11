# ===================================================
#   Financial Management System - Safe GitHub Push (PowerShell)
# ===================================================

$ErrorActionPreference = "Continue"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Financial Management System - Safe GitHub Push" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# Check index file health
if (Test-Path ".git\index") {
    $item = Get-Item ".git\index"
    if ($item.Length -lt 100) {
        Write-Host "[FIX] Detected corrupted 0-byte .git\index file. Rebuilding from HEAD..." -ForegroundColor Yellow
        Remove-Item ".git\index" -Force
        git reset
    }
}

Write-Host "[1/4] Checking .env safety..." -ForegroundColor Green
$envStatus = git status --porcelain | Where-Object { $_ -match "\.env" }
if ($envStatus) {
    Write-Host "[WARNING] Detected .env file in git status! Removing from staging..." -ForegroundColor Yellow
    git rm --cached -f .env 2>$null
    git rm --cached -f finance-backend/.env 2>$null
    git rm --cached -f finance-frontend/.env 2>$null
    git rm --cached -f finance-aiservice/.env 2>$null
    git rm --cached -f finance-forecasting/.env 2>$null
} else {
    Write-Host "[OK] No .env files tracked or staged." -ForegroundColor Green
}

Write-Host "`n[2/4] Staging changes..." -ForegroundColor Green
git add .

Write-Host "`n[3/4] Ensuring no .env files are staged..." -ForegroundColor Green
git rm --cached -r --quiet *.env .env finance-backend/.env finance-frontend/.env finance-aiservice/.env finance-forecasting/.env 2>$null

Write-Host "`nCurrent staged files:" -ForegroundColor Cyan
git status --short

Write-Host "`n[4/4] Committing local changes..." -ForegroundColor Green
git commit -m "Make DB connection env-driven in docker-compose and add super admin env vars"

Write-Host "`nSyncing with remote repository..." -ForegroundColor Green
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Rebase had conflicts, attempting standard merge..." -ForegroundColor Yellow
    git rebase --abort 2>$null
    git pull origin main --no-rebase -m "Merge remote changes"
}

Write-Host "`nPushing to origin main..." -ForegroundColor Green
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n===================================================" -ForegroundColor Green
    Write-Host "  Push completed successfully without any .env files!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host "`n[NOTICE] Push failed or was rejected. Check git output above." -ForegroundColor Red
}

