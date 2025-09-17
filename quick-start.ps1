# Quick Start Script for Productivity App
Write-Host "=== PERSONAL PRODUCTIVITY APP QUICK START ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "🚀 Your productivity app has been created successfully!" -ForegroundColor Green
Write-Host ""

Write-Host "📁 Project Location:" -ForegroundColor Yellow
Write-Host "   C:\Users\leona\projects\productivity-app" -ForegroundColor White
Write-Host ""

Write-Host "🏗️  Architecture:" -ForegroundColor Yellow
Write-Host "   ├── api/          (Node.js + Express + MongoDB)" -ForegroundColor White
Write-Host "   └── frontend/     (React + TypeScript + Material-UI)" -ForegroundColor White
Write-Host ""

Write-Host "🎯 Features Already Working:" -ForegroundColor Yellow
Write-Host "   ✅ Pomodoro Timer with activity selection" -ForegroundColor Green
Write-Host "   ✅ Real-time time tracking" -ForegroundColor Green
Write-Host "   ✅ Activity management with Eisenhower Matrix" -ForegroundColor Green
Write-Host "   ✅ Dashboard with daily progress overview" -ForegroundColor Green
Write-Host "   ✅ MongoDB Atlas integration with sample data" -ForegroundColor Green
Write-Host "   ✅ Modern responsive UI with Material Design" -ForegroundColor Green
Write-Host ""

Write-Host "🗄️  Database Info:" -ForegroundColor Yellow
Write-Host "   📍 MongoDB Atlas Cluster: clusterselfproductivity.ograklw.mongodb.net" -ForegroundColor White
Write-Host "   📊 Database: self-productivity" -ForegroundColor White
Write-Host "   📚 Collections: categories, activities, timeentries, tasks, dailyplannings" -ForegroundColor White
Write-Host "   🌱 Sample data: 7 categories, 16 activities pre-loaded" -ForegroundColor White
Write-Host ""

Write-Host "🚀 TO START THE APP:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1 - Use the automated script:" -ForegroundColor Yellow
Write-Host "   .\start-dev.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Option 2 - Start manually (2 terminals):" -ForegroundColor Yellow
Write-Host "   Terminal 1: cd api && npm run dev" -ForegroundColor White
Write-Host "   Terminal 2: cd frontend && npm run dev" -ForegroundColor White
Write-Host ""

Write-Host "🌐 Access URLs:" -ForegroundColor Yellow
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "   API:      http://localhost:5000" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Next Development Steps:" -ForegroundColor Yellow
Write-Host "   1. Complete Task Manager page with backlog management" -ForegroundColor White
Write-Host "   2. Implement Daily Planning workflow" -ForegroundColor White  
Write-Host "   3. Add comprehensive productivity reports" -ForegroundColor White
Write-Host "   4. Enhance UI with additional features" -ForegroundColor White
Write-Host ""

Write-Host "📖 For detailed information, see README.md" -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Would you like to start the development servers now? (y/n)"
if ($response -eq 'y' -or $response -eq 'Y' -or $response -eq 'yes') {
    Write-Host "Starting servers..." -ForegroundColor Green
    & "$PSScriptRoot\start-dev.ps1"
} else {
    Write-Host "You can start the servers later by running: .\start-dev.ps1" -ForegroundColor Yellow
}
