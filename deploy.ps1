# 🚀 EOXS Automation - Render Deployment Helper
# ==============================================

Write-Host "🚀 EOXS Automation - Render Deployment Helper" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📁 Current directory: $PWD" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔧 Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to continue"
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
    } else {
        throw "npm not found"
    }
} catch {
    Write-Host "❌ npm is not available" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed" -ForegroundColor Green
    } else {
        throw "npm install failed"
    }
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
Write-Host "🧪 Testing local server..." -ForegroundColor Yellow
Write-Host "   Starting server in background..."

# Start server in background
$serverJob = Start-Job -ScriptBlock { 
    Set-Location $using:PWD
    node server.js 
}

# Wait a moment for server to start
Start-Sleep -Seconds 3

# Test if server is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Server is running locally" -ForegroundColor Green
        Write-Host "   Web interface: http://localhost:3000" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "🛑 Stopping local server..." -ForegroundColor Yellow
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -ErrorAction SilentlyContinue
    } else {
        throw "Server returned status $($response.StatusCode)"
    }
} catch {
    Write-Host "❌ Server test failed" -ForegroundColor Red
    Write-Host "   Stopping server..." -ForegroundColor Yellow
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
Write-Host "🌐 Ready for Render deployment!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Create a Git repository and push your code" -ForegroundColor White
Write-Host "   2. Go to https://dashboard.render.com/" -ForegroundColor White
Write-Host "   3. Create a new Web Service" -ForegroundColor White
Write-Host "   4. Connect your Git repository" -ForegroundColor White
Write-Host "   5. Use Docker deployment for better Puppeteer support" -ForegroundColor White
Write-Host ""
Write-Host "📁 Files ready for deployment:" -ForegroundColor Cyan
Write-Host "   ✅ package.json" -ForegroundColor Green
Write-Host "   ✅ server.js" -ForegroundColor Green
Write-Host "   ✅ pup1.js (automation script)" -ForegroundColor Green
Write-Host "   ✅ public/index.html (web interface)" -ForegroundColor Green
Write-Host "   ✅ Dockerfile" -ForegroundColor Green
Write-Host "   ✅ render.yaml" -ForegroundColor Green
Write-Host "   ✅ .gitignore" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Recommended Render settings:" -ForegroundColor Cyan
Write-Host "   - Environment: Docker" -ForegroundColor White
Write-Host "   - Plan: Starter (for better Puppeteer support)" -ForegroundColor White
Write-Host "   - Build Command: (auto-detected from Dockerfile)" -ForegroundColor White
Write-Host "   - Start Command: (auto-detected from Dockerfile)" -ForegroundColor White
Write-Host ""
Write-Host "💡 Tips:" -ForegroundColor Cyan
Write-Host "   - Use the Starter plan for better memory allocation" -ForegroundColor White
Write-Host "   - Monitor logs for any Puppeteer issues" -ForegroundColor White
Write-Host "   - Consider setting up environment variables for credentials" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to continue"
