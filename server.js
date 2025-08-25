const express = require('express');
const cors = require('cors');
const path = require('path');
const EOXSAutomation = require('./pup1.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store automation instances
const automations = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/automation/start', async (req, res) => {
    try {
        const { email, password, ticketTitle, customer, assignedTo } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        // Create unique ID for this automation session
        const sessionId = Date.now().toString();
        
        // Create automation instance with provided credentials
        const automation = new EOXSAutomation();
        
        // Override config with provided values
        automation.CONFIG = {
            ...automation.CONFIG,
            credentials: { email, password },
            ticketDetails: {
                title: ticketTitle || 'Sample',
                customer: customer || 'Discount Pipe & Steel',
                assignedTo: assignedTo || 'Yash Motghare'
            }
        };
        
        // Store automation instance
        automations.set(sessionId, automation);
        
        // Start automation in background
        automation.run().then(result => {
            console.log(`Automation ${sessionId} completed:`, result);
        }).catch(error => {
            console.error(`Automation ${sessionId} failed:`, error);
        });
        
        res.json({ 
            success: true, 
            sessionId,
            message: 'Automation started successfully' 
        });
        
    } catch (error) {
        console.error('Error starting automation:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/api/automation/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const automation = automations.get(sessionId);
    
    if (!automation) {
        return res.status(404).json({ 
            success: false, 
            error: 'Automation session not found' 
        });
    }
    
    // Return basic status info
    res.json({
        success: true,
        sessionId,
        status: 'running', // You could add more detailed status tracking
        timestamp: Date.now()
    });
});

app.delete('/api/automation/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const automation = automations.get(sessionId);
    
    if (!automation) {
        return res.status(404).json({ 
            success: false, 
            error: 'Automation session not found' 
        });
    }
    
    // Clean up automation
    if (automation.browser) {
        automation.browser.close().catch(console.error);
    }
    automations.delete(sessionId);
    
    res.json({ 
        success: true, 
        message: 'Automation session terminated' 
    });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 EOXS Automation Server running on port ${PORT}`);
    console.log(`📱 Web interface available at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    
    // Close all automation sessions
    for (const [sessionId, automation] of automations) {
        if (automation.browser) {
            automation.browser.close().catch(console.error);
        }
    }
    automations.clear();
    
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});
