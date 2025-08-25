# 🚀 EOXS Automation - Render Deployment

This is a Puppeteer-based automation tool for creating tickets in the EOXS system, now with a web interface for easy deployment on Render.

## 🌟 Features

- **Web Dashboard**: Beautiful, responsive web interface
- **Automated Ticket Creation**: Creates tickets with specified details
- **Real-time Logs**: Monitor automation progress in real-time
- **Session Management**: Track multiple automation sessions
- **Cloud Ready**: Optimized for Render deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Git repository
- Render account

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 🌐 Deploy to Render

### Step 1: Prepare Your Repository

1. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: EOXS Automation"
   ```

2. **Push to GitHub/GitLab:**
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

### Step 2: Deploy on Render

1. **Go to [Render Dashboard](https://dashboard.render.com/)**
2. **Click "New +" → "Web Service"**
3. **Connect your repository**
4. **Configure the service:**

   - **Name**: `eoxs-automation`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Starter` (or your preferred plan)

5. **Environment Variables** (optional):
   ```
   NODE_ENV=production
   PORT=10000
   ```

6. **Click "Create Web Service"**

### Step 3: Access Your App

Once deployed, Render will provide you with a URL like:
```
https://your-app-name.onrender.com
```

## ⚙️ Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (production/development)

### Customization

Edit the `CONFIG` object in `pup1.js` to modify:
- Base URL
- Default ticket details
- Selectors
- Wait times

## 📁 Project Structure

```
├── server.js              # Express web server
├── pup1.js               # Main automation logic
├── public/
│   └── index.html        # Web dashboard
├── package.json           # Dependencies
├── render.yaml            # Render configuration
└── README.md             # This file
```

## 🔧 API Endpoints

- `GET /` - Web dashboard
- `POST /api/automation/start` - Start automation
- `GET /api/automation/status/:id` - Check status
- `DELETE /api/automation/:id` - Stop automation
- `GET /health` - Health check

## 🚨 Important Notes for Render

### Puppeteer on Render

Render's free tier has limitations for Puppeteer:
- **Memory**: Limited to 512MB RAM
- **CPU**: Limited processing power
- **Browser**: Chrome/Chromium installation required

### Recommendations

1. **Use Starter Plan**: Better resources for Puppeteer
2. **Monitor Usage**: Check logs for memory issues
3. **Optimize**: Consider headless mode and resource limits

### Alternative: Use Render's Docker Support

For better Puppeteer support, consider using Docker:

```dockerfile
FROM node:18-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🐛 Troubleshooting

### Common Issues

1. **Build Failures**: Check Node.js version compatibility
2. **Memory Issues**: Upgrade to Starter plan
3. **Chrome Issues**: Ensure proper Chrome installation
4. **Port Issues**: Verify PORT environment variable

### Debug Commands

```bash
# Check logs
npm run dev

# Test locally
curl http://localhost:3000/health

# Check dependencies
npm audit
```

## 📞 Support

If you encounter issues:
1. Check Render logs in dashboard
2. Verify all dependencies are installed
3. Ensure proper environment variables
4. Check browser compatibility

## 🔒 Security Notes

- **Never commit credentials** to version control
- **Use environment variables** for sensitive data
- **Implement rate limiting** for production use
- **Add authentication** for public deployments

## 📈 Performance Tips

1. **Use headless mode** for production
2. **Implement timeouts** for long operations
3. **Add error handling** for network issues
4. **Monitor resource usage** on Render

---

**Happy Automating! 🎉**
