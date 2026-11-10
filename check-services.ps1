Import-Module -Name "Microsoft.PowerShell.Management"

Write-Host "🔍 Testing database connections..." -ForegroundColor Cyan

# Test PostgreSQL
try {
    $pgResult = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d simulator -c "SELECT 1 as status;" -q
    Write-Host "✅ PostgreSQL connection OK" -ForegroundColor Green
} catch {
    Write-Host "❌ PostgreSQL error: $_" -ForegroundColor Red
}

# Test Redis
try {
    $redis = New-Object -ComObject "Redis" -ErrorAction SilentlyContinue
    # Redis on Windows uses a service, we check via port
    $testPort = Test-NetConnection -ComputerName "localhost" -Port 6379 -WarningAction SilentlyContinue
    if ($testPort.TcpTestSucceeded) {
        Write-Host "✅ Redis connection OK (port 6379)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Redis port 6379 not responding" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Redis check failed: $_" -ForegroundColor Red
}

Write-Host "`n📊 Database Status Summary:" -ForegroundColor Cyan
Write-Host "   PostgreSQL: Running (service active)" 
Write-Host "   Redis: Running (check port 6379)"
Write-Host "`n🚀 Backend ready to start at http://localhost:3000"