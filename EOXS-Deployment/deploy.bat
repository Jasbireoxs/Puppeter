@echo off
echo 🚀 EOXS Automation - Render Deployment Helper
echo ==============================================
echo.

echo 📁 Current directory: %CD%
echo.

echo 🔧 Checking prerequisites...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo    Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js found

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not available
    pause
    exit /b 1
)
echo ✅ npm found

echo.
echo 📦 Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed

echo.
echo 🧪 Testing local server...
echo    Starting server in background...
start /B node server.js
timeout /t 3 /nobreak >nul

REM Test if server is running
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Server is running locally
    echo    Web interface: http://localhost:3000
    echo.
    echo 🛑 Stopping local server...
    taskkill /f /im node.exe >nul 2>&1
) else (
    echo ❌ Server test failed
    echo    Stopping server...
    taskkill /f /im node.exe >nul 2>&1
    pause
    exit /b 1
)

echo.
echo 🌐 Ready for Render deployment!
echo.
echo 📋 Next steps:
echo    1. Create a Git repository and push your code
echo    2. Go to https://dashboard.render.com/
echo    3. Create a new Web Service
echo    4. Connect your Git repository
echo    5. Use Docker deployment for better Puppeteer support
echo.
echo 📁 Files ready for deployment:
echo    ✅ package.json
echo    ✅ server.js
echo    ✅ pup1.js (automation script)
echo    ✅ public/index.html (web interface)
echo    ✅ Dockerfile
echo    ✅ render.yaml
echo    ✅ .gitignore
echo.
echo 🎯 Recommended Render settings:
echo    - Environment: Docker
echo    - Plan: Starter (for better Puppeteer support)
echo    - Build Command: (auto-detected from Dockerfile)
echo    - Start Command: (auto-detected from Dockerfile)
echo.
echo 💡 Tips:
echo    - Use the Starter plan for better memory allocation
echo    - Monitor logs for any Puppeteer issues
echo    - Consider setting up environment variables for credentials
echo.
pause
