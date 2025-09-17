# PowerShell script to start both API and Frontend servers
Write-Host "Starting Productivity App Development Servers..." -ForegroundColor Green

# Start API server in background
Write-Host "Starting API server on port 5000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\api'; npm run dev" -WindowStyle Normal

# Wait a moment for API to start
Start-Sleep -Seconds 3

# Start Frontend server in background
Write-Host "Starting Frontend server on port 5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

Write-Host "Both servers are starting..." -ForegroundColor Green
Write-Host "API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
