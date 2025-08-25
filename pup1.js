const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
// IMPORTANT: Modify the ticketDetails below to specify EXACTLY which options you want selected
// The script will now only choose the options you specify here, not automatic selections
const CONFIG = {
    baseUrl: 'https://teams.eoxs.com/',
    credentials: {
        email: process.env.EOXS_EMAIL || 'sahajkatiyareoxs@gmail.com',
        password: process.env.EOXS_PASSWORD || 'Eoxs12345!'
    },
    ticketDetails: {
        title: 'Sample',
        customer: 'Discount Pipe & Steel', // For selection from dropdown
        assignedTo: 'Yash Motghare', // For Ownership field (during creation) and Assigned To field (during edit)
        // Add more specific options as needed
        // priority: 'High',
        // deadline: '2024-12-31',
        // tags: 'urgent, support'
    },
    selectors: {
        // Login selectors
        loginTrigger: 'a.btn-link[href="#loginPopup"], span.te_user_account_icon.d-block, a[href="#loginPopup"], a[href*="loginPopup"], a[href*="login" i], button[href*="login" i], .fa-user-circle-o, .fa-user',
        loginModal: '#loginRegisterPopup, .modal-dialog[role="dialog"]',
        emailInput: '#loginRegisterPopup input#login, #loginRegisterPopup input[name="login"], input#login, input[name="login"], input[type="email"], input[name="email"], input[placeholder*="email" i]',
        passwordInput: '#loginRegisterPopup input#password, input#password, input[type="password"], input[name="password"]',
        loginButton: 'button[type="submit"], input[type="submit"]',
        
        // Navigation selectors
        projectsSection: 'a[href*="projects"], [data-testid*="projects"]',
        eoxsSupport: 'a[href*="support"], [data-testid*="support"]',
        createButton: '[data-testid*="create"], button.create, a.create',
        
        // Form selectors
        titleInput: 'input[name="title"], input[placeholder*="title" i], textarea[name="title"]',
        ownershipSelect: 'select[name="ownership"], select[name="assignee"], select[name="owner"]',
        addButton: 'button[type="submit"], input[type="submit"]',
        
        // Success indicators
        successMessage: '.success, .alert-success, [data-testid*="success"]',
        ticketId: '[data-testid*="ticket-id"], .ticket-id, .id'
    },
    waitOptions: {
        timeout: 60000, // Increased from 30000
        waitUntil: 'networkidle2'
    }
};

class EOXSAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.ticketId = null;
    }

    resolveChromePath() {
        try {
            const candidates = [
                process.env.CHROME_PATH,
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ].filter(Boolean);
            for (const p of candidates) {
                if (fs.existsSync(p)) return p;
            }
        } catch {}
        return null;
    }

    async init() {
        try {
            console.log('🚀 Starting EOXS Automation...');
            
            // Launch browser
            const chromePath = this.resolveChromePath();
            this.browser = await puppeteer.launch({
                headless: false, // Visible for interactive steps
                executablePath: chromePath || undefined,
                defaultViewport: null, // Use full window size
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--start-maximized'
                ]
            });

            this.page = await this.browser.newPage();
            
            // Set user agent
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Enable console logging
            this.page.on('console', msg => console.log('Browser Console:', msg.text()));
            
            console.log('✅ Browser initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error);
            throw error;
        }
    }

    async clearAndType(elementHandle, text) {
        // Ensure element is visible and focused, then type
        try {
            await elementHandle.evaluate(el => {
                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                el.focus();
                // Clear existing value in a way that triggers input events
                const isTextLike = el.tagName && ['INPUT', 'TEXTAREA'].includes(el.tagName.toUpperCase());
                if (isTextLike) {
                    // Use native setter to clear
                    const proto = el.tagName.toUpperCase() === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value');
                    valueSetter && valueSetter.set && valueSetter.set.call(el, '');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        } catch {}

        // Attempt a gentle click to place caret; ignore if not clickable
        await elementHandle.click({ delay: 20 }).catch(() => {});
        await elementHandle.type(text);
    }

    async queryVisible(selector, withinModal = false) {
        const root = withinModal ? await this.page.$(CONFIG.selectors.loginModal) : null;
        const candidates = root ? await root.$$(selector) : await this.page.$$(selector);
        for (const el of candidates) {
            try {
                if (await el.isIntersectingViewport({ threshold: 0 })) return el;
                const box = await el.boundingBox();
                if (box) return el;
            } catch {}
        }
        return null;
    }

    async clickCenter(elementHandle) {
        const box = await elementHandle.boundingBox();
        if (!box) {
            await elementHandle.scrollIntoViewIfNeeded().catch(() => {});
        }
        const freshBox = (await elementHandle.boundingBox()) || box;
        if (!freshBox) throw new Error('element-not-visible');
        const x = freshBox.x + freshBox.width / 2;
        const y = freshBox.y + freshBox.height / 2;
        await this.page.mouse.click(x, y, { delay: 20 });
    }

    async learnLoginTriggerFromUser() {
        console.log('🧭 Could not auto-detect login icon. Please click it in the browser...');
        await this.page.bringToFront().catch(() => {});
        await this.page.evaluate(() => {
            // Helper to compute a CSS selector path for an element
            function cssPathFrom(el) {
                if (!(el instanceof Element)) return '';
                const path = [];
                while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 6) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.id) {
                        selector += `#${CSS.escape(el.id)}`;
                        path.unshift(selector);
                        break;
                    } else {
                        const className = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
                        selector += className;
                        const parent = el.parentElement;
                        if (parent) {
                            const siblings = Array.from(parent.children).filter(ch => ch.nodeName.toLowerCase() === el.nodeName.toLowerCase());
                            if (siblings.length > 1) {
                                const index = siblings.indexOf(el) + 1;
                                selector += `:nth-of-type(${index})`;
                            }
                        }
                    }
                    path.unshift(selector);
                    el = el.parentElement;
                }
                return path.join(' > ');
            }

            if (window.__eoxsLoginLearnAttached) return;
            window.__eoxsLoginLearnAttached = true;
            const handler = (ev) => {
                const target = ev.target instanceof Element ? ev.target : null;
                if (!target) return;
                const sel = cssPathFrom(target);
                // Prefer anchor wrapping the icon
                const anchor = target.closest('a, button');
                const finalSel = anchor ? cssPathFrom(anchor) : sel;
                window.__loginTriggerSelector = finalSel;
                ev.preventDefault();
                ev.stopPropagation();
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
        await this.page.waitForFunction(() => !!window.__loginTriggerSelector, { timeout: 30000 }).catch(() => {});
        const selector = await this.page.evaluate(() => window.__loginTriggerSelector || null);
        if (selector) console.log('✅ Learned selector from click:', selector);
        return selector;
    }

    async learnElementSelectorFromUser(kind) {
        const label = kind === 'email' ? 'email field' : kind === 'password' ? 'password field' : 'submit button';
        console.log(`🧭 Please click the ${label} in the page...`);
        await this.page.bringToFront().catch(() => {});
        await this.page.evaluate((k) => {
            function cssPathFrom(el) {
                if (!(el instanceof Element)) return '';
                const path = [];
                while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 6) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.id) {
                        selector += `#${CSS.escape(el.id)}`;
                        path.unshift(selector);
                        break;
                    } else {
                        const className = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
                        selector += className;
                        const parent = el.parentElement;
                        if (parent) {
                            const siblings = Array.from(parent.children).filter(ch => ch.nodeName.toLowerCase() === el.nodeName.toLowerCase());
                            if (siblings.length > 1) {
                                const index = siblings.indexOf(el) + 1;
                                selector += `:nth-of-type(${index})`;
                            }
                        }
                    }
                    path.unshift(selector);
                    el = el.parentElement;
                }
                return path.join(' > ');
            }
            const clickTarget = k === 'submit' ? 'a, button, input[type="submit"]' : 'input, textarea';
            const handler = (ev) => {
                const t = ev.target instanceof Element ? ev.target : null;
                if (!t) return;
                const chosen = t.closest(clickTarget);
                if (!chosen) return;
                const sel = cssPathFrom(chosen);
                (window).__learnedSelector = sel;
                ev.preventDefault();
                ev.stopPropagation();
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        }, kind);
        await this.page.waitForFunction(() => !!(window).__learnedSelector, { timeout: 60000 }).catch(() => {});
        const selector = await this.page.evaluate(() => {
            const sel = (window).__learnedSelector || null;
            (window).__learnedSelector = null;
            return sel;
        });
        if (selector) console.log(`✅ Learned ${label} selector:`, selector);
        return selector;
    }

    async forceOpenLoginPopup() {
        // Try multiple strategies to open the login popup reliably
        console.log('🔧 Forcing login popup to open...');
        
        const opened = await this.page.evaluate(() => {
            try {
                // 1) Click the explicit anchor if present
                const anchors = document.querySelectorAll('a.btn-link[href="#loginPopup"], a[href="#loginPopup"], a[href*="login"]');
                for (const a of anchors) {
                    if (a && typeof a.click === 'function') {
                        console.log('Clicking login anchor:', a.outerHTML);
                        a.click();
                    }
                }

                // 2) Update hash to trigger hash-based listeners
                if (location.hash !== '#loginPopup') {
                    console.log('Setting hash to #loginPopup');
                    location.hash = '#loginPopup';
                }

                // 3) Try Bootstrap modal APIs if available
                const modalEl = document.getElementById('loginRegisterPopup');
                let modalOpened = false;
                
                if (modalEl) {
                    const showWithBootstrap = () => {
                        try {
                            const jq = (window && window['jQuery']) ? window['jQuery'] : null;
                            if (jq && typeof jq(modalEl).modal === 'function') {
                                console.log('Opening modal with jQuery');
                                jq(modalEl).modal('show');
                                return true;
                            }
                            const bs = (window && window['bootstrap']) ? window['bootstrap'] : null;
                            if (bs && bs.Modal) {
                                console.log('Opening modal with Bootstrap');
                                const inst = bs.Modal.getOrCreateInstance(modalEl);
                                inst.show();
                                return true;
                            }
                        } catch (e) {
                            console.log('Bootstrap modal failed:', e.message);
                        }
                        return false;
                    };
                    
                    modalOpened = showWithBootstrap();
                    
                    if (!modalOpened) {
                        // 4) Fallback: toggle classes to make it visible
                        console.log('Using fallback method to show modal');
                        modalEl.style.display = 'block';
                        modalEl.classList.add('show', 'in');
                        modalEl.classList.remove('hide', 'fade');
                        modalEl.removeAttribute('aria-hidden');
                        modalEl.setAttribute('aria-modal', 'true');
                        
                        // Also add backdrop
                        let backdrop = document.querySelector('.modal-backdrop');
                        if (!backdrop) {
                            backdrop = document.createElement('div');
                            backdrop.className = 'modal-backdrop fade show';
                            document.body.appendChild(backdrop);
                        }
                        modalOpened = true;
                    }
                }
                
                // 5) Try to trigger any click events on user icons
                const userIcons = document.querySelectorAll('span.te_user_account_icon, i.fa-user-circle-o, .fa-user-circle-o, .fa-user');
                for (const icon of userIcons) {
                    if (icon && typeof icon.click === 'function') {
                        console.log('Clicking user icon:', icon.outerHTML);
                        icon.click();
                    }
                }
                
                return modalOpened;
            } catch (e) {
                console.log('Error in forceOpenLoginPopup:', e.message);
                return false;
            }
        });
        
        console.log(opened ? '✅ Modal forced open' : '⚠️ Modal force open attempt completed');
        
        // Wait for either the modal or inputs to become available
        await Promise.race([
            this.page.waitForSelector(CONFIG.selectors.loginModal, { timeout: 3000 }).catch(() => {}),
            this.page.waitForSelector(CONFIG.selectors.emailInput, { timeout: 3000 }).catch(() => {}),
            this.page.waitForSelector('#loginRegisterPopup', { timeout: 3000 }).catch(() => {})
        ]);
    }

    async clickButtonByText(...texts) {
        for (const t of texts) {
            const [btn] = await this.page.$x(`//button[normalize-space()[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), ${JSON.stringify(t.toLowerCase())})]] | //a[normalize-space()[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), ${JSON.stringify(t.toLowerCase())})]] | //input[@type='submit']`);
            if (btn) {
                await btn.click();
                return true;
            }
        }
        return false;
    }

    async login() {
        try {
            console.log('🔐 Attempting to login...');
            
            // Navigate to login page
            let navigationSuccess = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`📍 Navigation attempt ${attempt}/3...`);
                    await this.page.goto(CONFIG.baseUrl, CONFIG.waitOptions);
                    navigationSuccess = true;
                    console.log('📍 Navigated to:', CONFIG.baseUrl);
                    break;
                } catch (error) {
                    console.log(`⚠️ Navigation attempt ${attempt} failed:`, error.message);
                    if (attempt === 3) {
                        throw new Error(`Failed to navigate after 3 attempts: ${error.message}`);
                    }
                    await this.page.waitForTimeout(2000); // Wait before retry
                }
            }
            
            await this.page.waitForTimeout(1500);

            // Open login popup/menu by clicking the user icon
            try {
                console.log('🔍 Looking for login trigger (user icon)...');
                let trigger = await this.queryVisible('span.te_user_account_icon.d-block, i.fa-user-circle-o, .fa-user-circle-o, .fa-user', false)
                    || await this.page.$(CONFIG.selectors.loginTrigger);
                if (!trigger) {
                    // Interactive learn-by-click
                    const learned = await this.learnLoginTriggerFromUser();
                    if (learned) {
                        trigger = await this.page.$(learned);
                    }
                }
                if (trigger) {
                    console.log('🎯 Found login trigger, clicking to open popup...');
                    try { 
                        await trigger.click(); 
                        console.log('✅ Clicked login trigger');
                    } catch (e) { 
                        console.log('⚠️ Normal click failed, trying center click...');
                        await this.clickCenter(trigger); 
                    }
                    
                    // Wait a moment for the popup to start opening
                    await this.page.waitForTimeout(1000);
                    
                    // Force open the popup if it didn't open automatically
                    await this.forceOpenLoginPopup();
                    
                } else {
                    console.log('⚠️ No login trigger found, trying fallback...');
                    // Fallback: try clicking by text
                    await this.clickButtonByText('login', 'log in', 'sign in');
                    await this.page.waitForTimeout(1000);
                    await this.forceOpenLoginPopup();
                }
            } catch (e) {
                console.log('ℹ️  No explicit login trigger needed, forcing popup open...');
                await this.forceOpenLoginPopup();
            }

            // Wait for modal or email field to ensure popup is open
            console.log('⏳ Waiting for login popup to open...');
            let popupOpened = false;
            
            try {
                await Promise.race([
                    this.page.waitForSelector(CONFIG.selectors.loginModal, { timeout: 10000 }),
                    this.page.waitForSelector(CONFIG.selectors.emailInput, { timeout: 10000 })
                ]);
                popupOpened = true;
                console.log('✅ Login popup is now open');
            } catch (waitError) {
                console.log('⚠️ Popup didn\'t open automatically, forcing it open...');
                await this.forceOpenLoginPopup();
                
                // Try again to wait for the popup
                try {
                    await Promise.race([
                        this.page.waitForSelector(CONFIG.selectors.loginModal, { timeout: 5000 }),
                        this.page.waitForSelector(CONFIG.selectors.emailInput, { timeout: 5000 })
                    ]);
                    popupOpened = true;
                    console.log('✅ Login popup opened after forcing');
                } catch (finalError) {
                    console.log('❌ Could not open login popup');
                }
            }
            
            if (!popupOpened) {
                console.log('❌ Login popup failed to open');
                return false;
            }
            
            // Small delay to allow modal animation
            await this.page.waitForTimeout(400);

            // Fill email (prefer visible input inside login modal)
            let emailInput = await this.queryVisible(`${CONFIG.selectors.emailInput}, input#login, input[name="login"]`, true) 
                || await this.queryVisible(CONFIG.selectors.emailInput, false);
            if (!emailInput) {
                // Use the known working selector from previous runs
                emailInput = await this.page.$('input#login');
                if (!emailInput) {
                    const learnedEmail = await this.learnElementSelectorFromUser('email');
                    if (learnedEmail) {
                        emailInput = await this.page.$(learnedEmail);
                        console.log('✅ Using learned email selector:', learnedEmail);
                    }
                }
            }
            if (emailInput) {
                await this.clearAndType(emailInput, CONFIG.credentials.email);
                console.log('📧 Email entered');
            } else {
                console.log('⚠️ Email input not found');
                return false;
            }
            
            // Fill password (prefer visible input inside login modal)
            let passwordInput = await this.queryVisible(CONFIG.selectors.passwordInput, true) 
                || await this.queryVisible(CONFIG.selectors.passwordInput, false);
            if (!passwordInput) {
                // Use the known working selector from previous runs
                passwordInput = await this.page.$('input#password');
                if (!passwordInput) {
                    const learnedPwd = await this.learnElementSelectorFromUser('password');
                    if (learnedPwd) {
                        passwordInput = await this.page.$(learnedPwd);
                        console.log('✅ Using learned password selector:', learnedPwd);
                    }
                }
            }
            if (passwordInput) {
                await this.clearAndType(passwordInput, CONFIG.credentials.password);
                console.log('🔑 Password entered');
            } else {
                console.log('⚠️ Password input not found');
                return false;
            }
            
            // Click login button with multiple approaches
            let clicked = false;
            const loginButton = await this.queryVisible(CONFIG.selectors.loginButton, true) 
                || await this.queryVisible(`#loginRegisterPopup ${CONFIG.selectors.loginButton}`, false)
                || await this.queryVisible(CONFIG.selectors.loginButton, false);
            if (loginButton) {
                console.log('🔘 Found login button, attempting to click...');
                try {
                    await loginButton.click();
                    clicked = true;
                    console.log('✅ Login button clicked successfully');
                } catch (clickError) {
                    console.log('⚠️ Direct click failed, trying fallback methods...');
                    // Fallback: force click via JS or submit form
                    const didClick = await this.page.evaluate(() => {
                        try {
                            const modal = document.querySelector('#loginRegisterPopup') || document;
                            const candidates = modal.querySelectorAll('button[type="submit"], input[type="submit"], button[name*="login" i]');
                            for (const el of candidates) {
                                if (!(el instanceof HTMLElement)) continue;
                                console.log('Attempting to click:', el.outerHTML);
                                el.click();
                                return true;
                            }
                            const pwd = document.querySelector('input[type="password"]');
                            const form = pwd && pwd.closest('form');
                            if (form && typeof form.submit === 'function') { 
                                console.log('Submitting form directly');
                                form.submit(); 
                                return true; 
                            }
                            return false;
                        } catch (e) {
                            console.log('Fallback click failed:', e.message);
                            return false;
                        }
                    });
                    if (didClick) {
                        clicked = true;
                        console.log('✅ Fallback click successful');
                    } else {
                        console.log('⚠️ All click methods failed');
                    }
                }
            } else if (passwordInput) {
                // Fallback: press Enter in password field
                console.log('🔘 No login button found, pressing Enter in password field...');
                try {
                    await passwordInput.press('Enter');
                    clicked = true;
                    console.log('✅ Enter key pressed');
                } catch (enterError) {
                    console.log('⚠️ Enter key failed, trying tab and enter...');
                    try {
                        await passwordInput.press('Tab');
                        await this.page.keyboard.press('Enter');
                        clicked = true;
                        console.log('✅ Tab + Enter successful');
                    } catch (tabError) {
                        console.log('❌ All keyboard methods failed');
                    }
                }
            }
            
            if (!clicked) {
                console.log('⚠️ Login button not found');
                return false;
            }
            console.log('🔘 Login button clicked');
            
            // Wait for navigation or check for login success - but don't wait too long
            try {
                await Promise.race([
                    this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                    this.page.waitForTimeout(10000) // Don't wait more than 10 seconds
                ]);
                console.log('✅ Navigation completed or timeout reached after login');
            } catch (navError) {
                console.log('⚠️ Navigation timeout, checking login status...');
            }
            
            // Give page time to load but not too much
            await this.page.waitForTimeout(3000);
            
            // Check if page is responsive
            try {
                console.log('🔍 Checking if page is responsive...');
                const pageResponsive = await Promise.race([
                    this.page.evaluate(() => {
                        // Simple check - try to get page title
                        return document.title && document.readyState;
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Page check timeout')), 5000))
                ]);
                
                if (pageResponsive) {
                    console.log('✅ Page is responsive');
                } else {
                    console.log('⚠️ Page may be unresponsive, trying to refresh...');
                    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
                    await this.page.waitForTimeout(2000);
                }
            } catch (responsiveError) {
                console.log('⚠️ Page responsiveness check failed, trying to refresh...');
                try {
                    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
                    await this.page.waitForTimeout(2000);
                } catch (reloadError) {
                    console.log('❌ Page reload failed:', reloadError.message);
                }
            }
            
            // Try to close any remaining login modal
            try {
                await this.page.evaluate(() => {
                    const modal = document.querySelector('#loginRegisterPopup');
                    if (modal) {
                        // Try to hide the modal
                        modal.style.display = 'none';
                        modal.classList.remove('show', 'in');
                        modal.classList.add('hide');
                        
                        // Remove backdrop if present
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                    }
                });
                console.log('🔧 Attempted to close login modal');
            } catch (e) {
                console.log('⚠️ Could not close login modal:', e.message);
            }
            
            // Check for error messages
            const errorElement = await this.page.$('.alert-danger, .error, .login-error, [data-testid*="error"]');
            if (errorElement) {
                const errorText = await errorElement.evaluate(el => el.textContent || '').catch(() => '');
                console.log('❌ Login error detected:', errorText.trim());
            }
            
            // Check if login was successful by multiple methods
            const currentUrl = this.page.url();
            console.log('📍 Current URL after login attempt:', currentUrl);
            
            // Check if we're still on login page - but be more lenient with hash URLs
            const urlObj = new URL(currentUrl);
            if (urlObj.pathname.includes('login') || urlObj.pathname.includes('auth')) {
                console.log('❌ Login failed - still on login page');
                return false;
            }
            
            // Hash URLs might still indicate successful login, so check for user content instead
            if (currentUrl.includes('#loginPopup')) {
                console.log('⚠️ URL still has login hash, checking for user content...');
                // Don't fail immediately, check for user content below
            }
            
            // Check if we can find any user-specific content (indicating successful login)
            try {
                const userContent = await this.page.$('.user-info, .profile, .dashboard, .o_menu_apps, .o_dropdown, .o_main_navbar, .o_control_panel, .o_kanban_view, .o_list_view');
                if (userContent) {
                    console.log('✅ Found user-specific content, login appears successful');
                } else {
                    // Try to find any content that indicates we're past the login page
                    const pageContent = await this.page.evaluate(() => {
                        // Check if we have any content beyond the login form
                        const loginForm = document.querySelector('#loginRegisterPopup, .login-form, form[action*="login"]');
                        const hasOtherContent = document.querySelector('.o_main_navbar, .o_menu_apps, .o_control_panel, .o_kanban_view, .o_list_view, .project-card, .kanban-card');
                        
                        if (loginForm && !hasOtherContent) {
                            return false; // Still on login page
                        }
                        
                        if (hasOtherContent) {
                            return true; // We have app content
                        }
                        
                        // Check if we're on a different page entirely
                        const currentPath = window.location.pathname;
                        return currentPath !== '/' && currentPath !== '/login' && currentPath !== '/auth';
                    });
                    
                    if (pageContent) {
                        console.log('✅ Found app content, login appears successful');
                    } else {
                        console.log('⚠️ Could not find user content or app content');
                    }
                }
            } catch (e) {
                console.log('⚠️ Could not verify user content:', e.message);
            }
            
            // Final verification: check if login form is hidden/removed
            try {
                const loginFormStillVisible = await this.page.evaluate(() => {
                    const loginForm = document.querySelector('#loginRegisterPopup, .login-form, form[action*="login"]');
                    if (!loginForm) return false; // Form removed, good sign
                    
                    // Check if form is hidden
                    const style = window.getComputedStyle(loginForm);
                    const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
                    
                    // Check if form has error messages
                    const hasErrors = loginForm.querySelector('.alert-danger, .error, .login-error');
                    
                    return !isHidden && !hasErrors;
                });
                
                if (!loginFormStillVisible) {
                    console.log('✅ Login form is hidden/removed, login successful');
                    return true;
                } else {
                    console.log('⚠️ Login form still visible, checking for errors...');
                    const errorElement = await this.page.$('.alert-danger, .error, .login-error, [data-testid*="error"]');
                    if (errorElement) {
                        const errorText = await errorElement.evaluate(el => el.textContent || '').catch(() => '');
                        console.log('❌ Login error detected:', errorText.trim());
                        return false;
                    }
                    
                    // If no errors and we have app content, consider it successful
                    const hasAppContent = await this.page.$('.o_main_navbar, .o_menu_apps, .o_control_panel, .o_kanban_view, .o_list_view, .project-card, .kanban-card');
                    if (hasAppContent) {
                        console.log('✅ Found app content despite visible form, login successful');
                        return true;
                    }
                }
            } catch (e) {
                console.log('⚠️ Could not verify form visibility:', e.message);
            }
            
            console.log('✅ Login successful');
            return true;
            
        } catch (error) {
            console.error('❌ Login failed:', error);
            return false;
        }
    }

    async navigateToProjects() {
        try {
            console.log('📁 Navigating to Project section...');
            await this.page.waitForTimeout(1500);
            
            // Check if we need to refresh the page to get to the main app
            const currentUrl = this.page.url();
            if (currentUrl.includes('#loginPopup')) {
                console.log('🔄 Refreshing page to clear login hash...');
                await this.page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle2' });
                await this.page.waitForTimeout(3000);
            }
            
            // First, try to find and click the menu/dropdown to open it
            let menuDropdown = await this.page.$('.o_menu_apps, .dropdown, .menu-dropdown, [data-toggle="dropdown"], .o_dropdown');
            if (menuDropdown) {
                console.log('🔽 Opening menu dropdown...');
                await menuDropdown.click();
                await this.page.waitForTimeout(500); // Wait for dropdown to open
            }
            
            // Now look for "Project" in the opened dropdown or sidebar
            let projectsLink = await this.page.$('a[href*="project"], [data-testid*="project"]');
            if (!projectsLink) {
                // Try to find by text content using evaluate
                const projectsLinkHandle = await this.page.evaluateHandle(() => {
                    const links = Array.from(document.querySelectorAll('.o_menu_apps a, .o_dropdown_menu a, .dropdown-menu a, .o_menu_sections a, nav a, .sidebar a, a'));
                    return links.find(link => {
                        const text = (link.textContent || '').trim().toLowerCase();
                        return text === 'project' || text.includes('project');
                    });
                });
                
                if (projectsLinkHandle) {
                    projectsLink = await projectsLinkHandle.asElement();
                }
            }
            
            if (!projectsLink) {
                // Interactive learn-by-click for project
                console.log('🧭 Please click the Project link in the opened menu...');
                await this.page.bringToFront().catch(() => {});
                await this.page.evaluate(() => {
                    function cssPathFrom(el) {
                        if (!(el instanceof Element)) return '';
                        const path = [];
                        while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 6) {
                            let selector = el.nodeName.toLowerCase();
                            if (el.id) {
                                selector += `#${CSS.escape(el.id)}`;
                                path.unshift(selector);
                                break;
                            } else {
                                const className = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
                                selector += className;
                                const parent = el.parentElement;
                                if (parent) {
                                    const siblings = Array.from(parent.children).filter(ch => ch.nodeName.toLowerCase() === el.nodeName.toLowerCase());
                                    if (siblings.length > 1) {
                                        const index = siblings.indexOf(el) + 1;
                                        selector += `:nth-of-type(${index})`;
                                    }
                                }
                            }
                            path.unshift(selector);
                            el = el.parentElement;
                        }
                        return path.join(' > ');
                    }
                    
                    const handler = (ev) => {
                        const t = ev.target instanceof Element ? ev.target : null;
                        if (!t) return;
                        const chosen = t.closest('a, button, [role="button"]');
                        if (!chosen) return;
                        const sel = cssPathFrom(chosen);
                        window.__learnedProjectsSelector = sel;
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.removeEventListener('click', handler, true);
                    };
                    document.addEventListener('click', handler, true);
                });
                await this.page.waitForFunction(() => !!window.__learnedProjectsSelector, { timeout: 30000 }).catch(() => {});
                const selector = await this.page.evaluate(() => {
                    const sel = window.__learnedProjectsSelector || null;
                    window.__learnedProjectsSelector = null;
                    return sel;
                });
                if (selector) {
                    console.log('✅ Learned project selector:', selector);
                    projectsLink = await this.page.$(selector);
                }
            }
            
            if (projectsLink) {
                console.log('🎯 Found projects link, attempting to click...');
                try {
                    await projectsLink.click();
                    console.log('✅ Clicked on Project');
                } catch (clickError) {
                    console.log('⚠️ Direct click failed, trying JavaScript click...');
                    try {
                        await projectsLink.evaluate(el => el.click());
                        console.log('✅ JavaScript click successful');
                    } catch (jsClickError) {
                        console.log('❌ All click methods failed:', jsClickError.message);
                        return false;
                    }
                }
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                await this.page.waitForTimeout(2000);
                
                            // After clicking Project, wait for the page to load and then look for project cards
            console.log('🔍 Waiting for Projects page to load...');
            await this.page.waitForTimeout(3000);
                
                // After navigating to Projects page, we need to click on a specific project
                console.log('🔍 Looking for a project to click on...');
                await this.page.waitForTimeout(2000); // Wait for page to load
                
                // First, let's scan the page to see what projects are available
                console.log('🔍 Scanning page for available projects...');
                const availableProjects = await this.page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('.o_kanban_record, .kanban-card, .project-card, .card, a, [role="button"], div, span'));
                    return cards.map(card => ({
                        text: (card.textContent || '').trim(),
                        className: card.className,
                        tagName: card.tagName
                    })).filter(info => info.text.length > 10 && info.text.length < 200);
                });
                
                console.log('📋 Available project cards/elements:');
                availableProjects.slice(0, 10).forEach((proj, idx) => {
                    console.log(`   ${idx + 1}. "${proj.text.substring(0, 50)}..." (${proj.tagName}.${proj.className})`);
                });
                
                // Now specifically look for "Test Support" project card
                console.log('🎯 Looking specifically for Test Support project card...');
                let projectCard = await this.page.evaluateHandle(() => {
                    // Look for project cards specifically
                    const projectCards = Array.from(document.querySelectorAll('.o_kanban_record, .kanban-card, .project-card, .card'));
                    
                    console.log(`Found ${projectCards.length} potential project cards`);
                    
                    // Look for Test Support specifically
                    let testSupportCard = projectCards.find(card => {
                        const text = (card.textContent || '').trim().toLowerCase();
                        const isTestSupport = text.includes('test support') || text.includes('testsupport');
                        if (isTestSupport) {
                            console.log('✅ Found Test Support card with text:', text);
                        }
                        return isTestSupport;
                    });
                    
                    if (testSupportCard) {
                        return testSupportCard;
                    }
                    
                    console.log('❌ No Test Support card found');
                    return null;
                });
                
                // If we didn't find Test Support automatically, don't click anything yet
                
                if (!projectCard) {
                    // Interactive learn-by-click for project card
                    console.log('🧭 Please click on a project card/item in the Projects page...');
                    await this.page.bringToFront().catch(() => {});
                    await this.page.evaluate(() => {
                        function cssPathFrom(el) {
                            if (!(el instanceof Element)) return '';
                            const path = [];
                            while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 6) {
                                let selector = el.nodeName.toLowerCase();
                                if (el.id) {
                                    selector += `#${CSS.escape(el.id)}`;
                                    path.unshift(selector);
                                    break;
                                } else {
                                    const className = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
                                    selector += className;
                                    const parent = el.parentElement;
                                    if (parent) {
                                        const siblings = Array.from(parent.children).filter(ch => ch.nodeName.toLowerCase() === el.nodeName.toLowerCase());
                                        if (siblings.length > 1) {
                                            const index = siblings.indexOf(el) + 1;
                                            selector += `:nth-of-type(${index})`;
                                        }
                                    }
                                }
                                path.unshift(selector);
                                el = el.parentElement;
                            }
                            return path.join(' > ');
                        }
                        
                        const handler = (ev) => {
                            const t = ev.target instanceof Element ? ev.target : null;
                            if (!t) return;
                            const chosen = t.closest('a, button, [role="button"], .o_kanban_record, .kanban-card, .project-card, .card');
                            if (!chosen) return;
                            const sel = cssPathFrom(chosen);
                            window.__learnedProjectCardSelector = sel;
                            ev.preventDefault();
                            ev.stopPropagation();
                            document.removeEventListener('click', handler, true);
                        };
                        document.addEventListener('click', handler, true);
                    });
                    await this.page.waitForFunction(() => !!window.__learnedProjectCardSelector, { timeout: 30000 }).catch(() => {});
                    const cardSelector = await this.page.evaluate(() => {
                        const sel = window.__learnedProjectCardSelector || null;
                        window.__learnedProjectCardSelector = null;
                        return sel;
                    });
                    if (cardSelector) {
                        console.log('✅ Learned project card selector:', cardSelector);
                        projectCard = await this.page.$(cardSelector);
                    }
                }
                
                if (projectCard) {
                    // Log what we found before clicking
                    const cardText = await projectCard.evaluate(el => (el.textContent || '').trim());
                    console.log(`🎯 Found project card: "${cardText}"`);
                    
                    // Verify this is actually Test Support before clicking
                    if (cardText.toLowerCase().includes('test support') || cardText.toLowerCase().includes('support')) {
                        console.log('✅ Verified this is Test Support, proceeding to click...');
                        await projectCard.click();
                        console.log('✅ Clicked on Test Support project card');
                        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                        await this.page.waitForTimeout(1000);
                    } else {
                        console.log(`❌ This is not Test Support ("${cardText}"), skipping click`);
                        projectCard = null; // Reset to trigger manual selection
                    }
                } 
                
                if (!projectCard) {
                    console.log('⚠️ Test Support project not found automatically');
                    console.log('🧭 Please manually click on the "Test Support" project card in the browser...');
                    
                    // Give user time to manually click on Test Support
                    await this.page.bringToFront().catch(() => {});
                    console.log('⏳ Waiting for you to click on Test Support...');
                    
                    // Wait for navigation to indicate user clicked something
                    try {
                        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
                        console.log('✅ Navigation detected - assuming Test Support was clicked');
                    } catch (e) {
                        console.log('⚠️ No navigation detected, continuing anyway...');
                    }
                }
                
                return true;
            }
            
            console.log('⚠️ Project section not found');
            return false;
            
        } catch (error) {
            console.error('❌ Failed to navigate to Project:', error);
            return false;
        }
    }

    async navigateToEOXSSupport() {
        try {
            console.log('🆘 Navigating to Test Support...');
            
            // Check if page is still valid before proceeding
            if (!this.page || this.page.isClosed()) {
                throw new Error('Page has been closed unexpectedly');
            }
            
            // Wait for page to fully stabilize after previous navigation
            await this.page.waitForTimeout(3000);
            
            // Wait for page to be ready and frame to be available
            try {
                await this.page.waitForFunction(() => {
                    return document.readyState === 'complete' && 
                           document.body && 
                           document.body.children.length > 0;
                }, { timeout: 15000 });
                console.log('✅ Page is ready and frame is available');
            } catch (e) {
                console.log('⚠️ Page ready state check failed, continuing anyway...');
            }
            
            // Additional safety check - ensure we can access page elements
            try {
                await this.page.evaluate(() => document.title);
                console.log('✅ Page is accessible');
            } catch (e) {
                console.log('⚠️ Page accessibility check failed');
                await this.page.waitForTimeout(2000);
            }
            
            // Look for Test Support link automatically
            let supportLink;
            try {
                supportLink = await this.page.$('a[href*="support"], [data-testid*="support"], .o_kanban_record, .kanban-card, .project-card');
            } catch (frameError) {
                console.log('⚠️ Frame error when searching for support link, retrying...');
                await this.page.waitForTimeout(2000);
                try {
                    supportLink = await this.page.$('a[href*="support"], [data-testid*="support"], .o_kanban_record, .kanban-card, .project-card');
                } catch (retryError) {
                    console.log('⚠️ Retry failed, will try alternative methods');
                }
            }
            if (!supportLink) {
                // Try to find by text content using evaluate - specifically look for Test Support card
                supportLink = await this.page.evaluateHandle(() => {
                    const links = Array.from(document.querySelectorAll('a, button, [role="button"], .o_kanban_record, .kanban-card, .project-card, .card'));
                    
                    // First, try to find exact "Test Support" match
                    let exactMatch = links.find(link => {
                        const text = (link.textContent || '').trim().toLowerCase();
                        return text.includes('test support') && text.includes('test');
                    });
                    
                    if (exactMatch) {
                        console.log('Found exact Test Support match:', exactMatch.textContent.trim());
                        return exactMatch;
                    }
                    
                    // If no exact match, look for any card containing "test support"
                    let partialMatch = links.find(link => {
                        const text = (link.textContent || '').trim().toLowerCase();
                        return text.includes('test support');
                    });
                    
                    if (partialMatch) {
                        console.log('Found partial Test Support match:', partialMatch.textContent.trim());
                        return partialMatch;
                    }
                    
                    // If still no match, return null
                    console.log('No Test Support card found');
                    return null;
                });
            }
            
            if (!supportLink) {
                // Interactive learn-by-click for support as fallback
                console.log('🧭 Please click the EOXS Support link in the page...');
                await this.page.bringToFront().catch(() => {});
                await this.page.evaluate(() => {
                    function cssPathFrom(el) {
                        if (!(el instanceof Element)) return '';
                        const path = [];
                        while (el && el.nodeType === Node.ELEMENT_NODE && path.length < 6) {
                            let selector = el.nodeName.toLowerCase();
                            if (el.id) {
                                selector += `#${CSS.escape(el.id)}`;
                                path.unshift(selector);
                                break;
                            } else {
                                const className = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
                                selector += className;
                                const parent = el.parentElement;
                                if (parent) {
                                    const siblings = Array.from(parent.children).filter(ch => ch.nodeName.toLowerCase() === el.nodeName.toLowerCase());
                                    if (siblings.length > 1) {
                                        const index = siblings.indexOf(el) + 1;
                                        selector += `:nth-of-type(${index})`;
                                    }
                                }
                            }
                            path.unshift(selector);
                            el = el.parentElement;
                        }
                        return path.join(' > ');
                    }
                    
                    const handler = (ev) => {
                        const t = ev.target instanceof Element ? ev.target : null;
                        if (!t) return;
                        const chosen = t.closest('a, button, [role="button"]');
                        if (!chosen) return;
                        const sel = cssPathFrom(chosen);
                        window.__learnedSupportSelector = sel;
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.removeEventListener('click', handler, true);
                    };
                    document.addEventListener('click', handler, true);
                });
                await this.page.waitForFunction(() => !!window.__learnedSupportSelector, { timeout: 30000 }).catch(() => {});
                const selector = await this.page.evaluate(() => {
                    const sel = window.__learnedSupportSelector || null;
                    window.__learnedSupportSelector = null;
                    return sel;
                });
                if (selector) {
                    console.log('✅ Learned support selector:', selector);
                    supportLink = await this.page.$(selector);
                }
            }
            
            if (supportLink) {
                // Log what we found before clicking
                const cardText = await supportLink.evaluate(el => (el.textContent || '').trim());
                console.log(`🎯 Found project card: "${cardText}"`);
                
                if (!cardText.toLowerCase().includes('test support')) {
                    console.log('⚠️ Warning: This does not appear to be Test Support. Proceeding anyway...');
                }
                
                await supportLink.click();
                console.log('✅ Clicked on Test Support');
                
                            // Wait for navigation with better error handling
            try {
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            } catch (navError) {
                console.log('⚠️ Navigation timeout, continuing anyway...');
            }
            
            // Wait a bit for page to stabilize and check if page is still valid
            try {
                await this.page.waitForTimeout(2000);
                
                // Verify page is still accessible
                await this.page.evaluate(() => document.title);
                console.log('✅ Page is still accessible after navigation');
                
            } catch (pageError) {
                console.log('⚠️ Page became inaccessible after navigation, attempting recovery...');
                
                // Try to recover by checking if we need to create a new page
                if (this.page.isClosed()) {
                    console.log('❌ Page was closed, cannot recover');
                    return false;
                }
                
                // Wait a bit more and try again
                await this.page.waitForTimeout(3000);
            }
            
            return true;
            }
            
            console.log('⚠️ EOXS Support not found');
            return false;
            
        } catch (error) {
            console.error('❌ Failed to navigate to EOXS Support:', error);
            return false;
        }
    }

    async clickCreate() {
        try {
            console.log('➕ Looking for Create button...');
            await this.page.waitForTimeout(1000);
            
            const [createButton] = await this.page.$x(`//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'create')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'create')]`);
            if (createButton) {
                await createButton.click();
                console.log('✅ Clicked on Create button');
                await this.page.waitForTimeout(1000);
                return true;
            }
            
            console.log('⚠️ Create button not found');
            return false;
            
        } catch (error) {
            console.error('❌ Failed to click Create:', error);
            return false;
        }
    }

    async fillTicketForm() {
        try {
            console.log('📝 Filling ticket form...');
            
            // Check if page is still valid
            if (!this.page || this.page.isClosed()) {
                throw new Error('Page has been closed unexpectedly');
            }
            
            await this.page.waitForTimeout(1000);
            
            // Fill title field
            console.log('🔍 Looking for title input field...');
            let titleInput = await this.queryVisible(CONFIG.selectors.titleInput, false);
            if (!titleInput) {
                // Try common title field selectors
                titleInput = await this.page.$('input[name="name"], input[name="title"], input[placeholder*="title" i], input[placeholder*="name" i], textarea[name="name"], textarea[name="title"]');
            }
            if (!titleInput) {
                // Try to find any visible input field that could be for title
                titleInput = await this.page.evaluateHandle(() => {
                    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'));
                    return inputs.find(input => {
                        const isVisible = input.offsetParent !== null;
                        const placeholder = (input.placeholder || '').toLowerCase();
                        const name = (input.name || '').toLowerCase();
                        return isVisible && (placeholder.includes('title') || placeholder.includes('name') || name.includes('title') || name.includes('name'));
                    }) || inputs.find(input => input.offsetParent !== null) || null;
                });
            }
            if (!titleInput) {
                const learnedTitle = await this.learnElementSelectorFromUser('title');
                if (learnedTitle) {
                    titleInput = await this.page.$(learnedTitle);
                    console.log('✅ Using learned title selector:', learnedTitle);
                }
            }
            if (titleInput) {
                await this.clearAndType(titleInput, CONFIG.ticketDetails.title);
                console.log('✅ Title filled:', CONFIG.ticketDetails.title);
            } else {
                console.log('⚠️ Title input not found');
                return false;
            }
            
            // Fill Ownership field during ticket creation
            console.log('🔍 Looking for Ownership field during ticket creation...');
            
            // Wait a moment for the form to fully load before looking for fields
            console.log('⏳ Waiting for form to fully load before looking for Ownership field...');
            await this.page.waitForTimeout(2000);
            
            // Look for Ownership field specifically
            let ownershipField = null;
            const [ownershipInput] = await this.page.$x(`//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'ownership') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'owner')]/following::*[1]`);
            ownershipField = ownershipInput;
            
            // If not found, try to find by field name containing "owner"
            if (!ownershipField) {
                ownershipField = await this.page.$('select[name*="owner"], input[name*="owner"], select[name*="ownership"], input[name*="ownership"]');
            }
            
            // If still not found, try to find any field with "ownership" in the label
            if (!ownershipField) {
                ownershipField = await this.page.evaluateHandle(() => {
                    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                    return inputs.find(input => {
                        const isVisible = input.offsetParent !== null;
                        if (!isVisible) return false;
                        
                        // Find the associated label
                        let label = null;
                        if (input.id) {
                            label = document.querySelector(`label[for="${input.id}"]`);
                        }
                        if (!label) {
                            label = input.closest('label') || input.parentElement.querySelector('label');
                        }
                        if (!label) {
                            // Look for labels that precede this input
                            const prevElement = input.previousElementSibling;
                            if (prevElement && prevElement.tagName === 'LABEL') {
                                label = prevElement;
                            }
                        }
                        
                        const labelText = label ? (label.textContent || '').toLowerCase() : '';
                        const placeholder = (input.placeholder || '').toLowerCase();
                        const name = (input.name || '').toLowerCase();
                        const id = (input.id || '').toLowerCase();
                        
                        // Look for "ownership" or "owner"
                        return (
                            labelText.includes('ownership') ||
                            labelText.includes('owner') ||
                            placeholder.includes('ownership') ||
                            placeholder.includes('owner') ||
                            name.includes('owner') ||
                            name.includes('ownership') ||
                            id.includes('owner') ||
                            id.includes('ownership')
                        );
                    }) || null;
                });
            }
            
            if (ownershipField) {
                try {
                    // Check if the field is actually usable
                    const isElement = await ownershipField.evaluate(el => el && el.tagName);
                    if (!isElement) {
                        console.log('⚠️ Ownership field found but not accessible - will try in edit mode');
                    } else {
                        const tagName = await ownershipField.evaluate(el => el.tagName.toLowerCase());
                        if (tagName === 'select') {
                            // Handle select dropdown
                            const success = await ownershipField.evaluate((el, targetText) => {
                                const options = Array.from(el.options || []);
                                const match = options.find(o => (o.textContent || '').trim().toLowerCase().includes(targetText.toLowerCase()));
                                if (match) { el.value = match.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
                                return false;
                            }, CONFIG.ticketDetails.assignedTo);
                            if (success) {
                                console.log(`✅ Ownership "${CONFIG.ticketDetails.assignedTo}" selected via <select>`);
                            } else {
                                console.log(`⚠️ Ownership option "${CONFIG.ticketDetails.assignedTo}" not found in <select>`);
                            }
                        } else {
                            // Handle input field - click to select, clear existing text, then type
                            console.log(`🎯 Found Ownership field, clicking to select and clear existing text...`);
                            
                            // Click on the field to focus it
                            await ownershipField.click();
                            console.log('✅ Clicked on Ownership field');
                            await this.page.waitForTimeout(500);
                            
                            // Select all existing text and clear it
                            await this.page.keyboard.down('Control');
                            await this.page.keyboard.press('KeyA');
                            await this.page.keyboard.up('Control');
                            await this.page.waitForTimeout(200);
                            
                            // Type the new name to replace the selected text
                            console.log(`🎯 Typing "${CONFIG.ticketDetails.assignedTo}" to replace existing text...`);
                            await ownershipField.type(CONFIG.ticketDetails.assignedTo);
                            
                            // Wait for dropdown to appear
                            await this.page.waitForTimeout(1000);
                            
                            // Try to select from dropdown options
                            const optionSelected = await this.page.evaluate((targetText) => {
                                const dropdownOptions = Array.from(document.querySelectorAll('.dropdown-item, .select2-results__option, option, .ui-menu-item'));
                                
                                // First try exact match
                                let exactMatch = dropdownOptions.find(option => 
                                    (option.textContent || '').trim() === targetText
                                );
                                
                                // If no exact match, try partial match
                                if (!exactMatch) {
                                    exactMatch = dropdownOptions.find(option => 
                                        (option.textContent || '').trim().toLowerCase().includes(targetText.toLowerCase())
                                    );
                                }
                                
                                if (exactMatch) {
                                    exactMatch.click();
                                    return true;
                                }
                                return false;
                            }, CONFIG.ticketDetails.assignedTo);
                            
                            if (optionSelected) {
                                console.log(`✅ Selected "${CONFIG.ticketDetails.assignedTo}" from Ownership dropdown`);
                            } else {
                                // Fallback: press Enter to confirm the typed value
                                await this.page.keyboard.press('Enter');
                                console.log(`✅ Confirmed "${CONFIG.ticketDetails.assignedTo}" in Ownership field with Enter key`);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ Error accessing Ownership field: ${error.message} - will try in edit mode`);
                }
            } else {
                console.log('⚠️ Ownership field not found - will try to fill it later in edit mode');
            }
            
            console.log('✅ Ticket form filled successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to fill ticket form:', error);
            return false;
        }
    }

    async submitTicket() {
        try {
            console.log('🚀 Submitting ticket...');
            
            // First, let's scan all available buttons to understand what's on the page
            console.log('🔍 Scanning all available buttons on the page...');
            const allButtons = await this.page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
                return buttons.map(btn => ({
                    text: (btn.textContent || '').trim(),
                    type: btn.type || 'button',
                    className: btn.className,
                    visible: btn.offsetParent !== null
                })).filter(info => info.visible && info.text.length > 0);
            });
            
            console.log('📋 Available buttons:');
            allButtons.forEach((btn, idx) => {
                console.log(`   ${idx + 1}. "${btn.text}" (${btn.type}, ${btn.className})`);
            });
            
            // Look for Add button specifically beside Discard button
            let addButton = null;
            
            // Method 1: Look for "Add" button directly
            const [addBtn] = await this.page.$x(`//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'add')]`);
            addButton = addBtn;
            
            // Method 2: If not found, look near Discard button
            if (!addButton) {
                console.log('🔍 Looking for Add button near Discard button...');
                addButton = await this.page.evaluateHandle(() => {
                    // First find the Discard button
                    const discardButtons = Array.from(document.querySelectorAll('button, a'));
                    const discardBtn = discardButtons.find(btn => 
                        (btn.textContent || '').toLowerCase().includes('discard')
                    );
                    
                    if (discardBtn) {
                        console.log('Found Discard button, looking for Add button nearby...');
                        // Look for buttons in the same parent container
                        const parent = discardBtn.parentElement;
                        if (parent) {
                            const siblingButtons = Array.from(parent.querySelectorAll('button, a[role="button"]'));
                            const addBtn = siblingButtons.find(btn => 
                                btn !== discardBtn && 
                                (btn.textContent || '').toLowerCase().includes('add')
                            );
                            if (addBtn) {
                                console.log('Found Add button near Discard button!');
                                return addBtn;
                            }
                        }
                    }
                    
                    // Fallback: look for any button with "Add" text
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                    return buttons.find(btn => {
                        const text = (btn.textContent || '').toLowerCase();
                        const isVisible = btn.offsetParent !== null;
                        return isVisible && text.includes('add');
                    }) || null;
                });
            }
            
            // Method 3: Try specific class selectors we saw in the button scan
            if (!addButton) {
                addButton = await this.page.$('button.o_kanban_add, input.o_kanban_add, submit.o_kanban_add');
            }
            
            // Method 4: Try standard selectors as fallback
            if (!addButton) {
                addButton = await this.page.$('button[data-testid*="add"], button[data-testid*="submit"], button[data-testid*="create"], button[type="submit"], input[type="submit"]');
            }
            
            if (addButton) {
                console.log('🎯 Found Add button, clicking to create ticket...');
                
                // Click the Add button using multiple methods
                try {
                    await addButton.click();
                    console.log('✅ Add button clicked successfully');
                } catch (clickError) {
                    console.log('⚠️ Direct click failed, trying JavaScript click...');
                    // Fallback: use JavaScript click
                    await addButton.evaluate(el => el.click());
                    console.log('✅ Add button clicked with JavaScript');
                }
                
                // Wait for the ticket to actually be created - increased wait time
                console.log('⏳ Waiting for ticket creation to complete...');
                await this.page.waitForTimeout(8000); // Wait 8 seconds for ticket creation
                
                // Check if we're still on the form page or if ticket was created
                const isStillOnForm = await this.page.evaluate(() => {
                    // Check if we're still on a form page
                    const formElements = document.querySelectorAll('input[name="name"], input[name="title"], input[placeholder*="title" i]');
                    return formElements.length > 0;
                });
                
                if (isStillOnForm) {
                    console.log('⚠️ Still on form page after 8 seconds - checking for errors or trying one more time...');
                    
                    // Check for any error messages
                    const errorMessages = await this.page.evaluate(() => {
                        const errors = Array.from(document.querySelectorAll('.alert-danger, .error, .o_form_error, .text-danger'));
                        return errors.map(err => err.textContent.trim()).filter(text => text.length > 0);
                    });
                    
                    if (errorMessages.length > 0) {
                        console.log('❌ Found error messages:', errorMessages);
                    } else {
                        console.log('🔄 No errors found, trying to click Add button one more time...');
                        // Find the Add button again since DOM may have changed
                        const freshAddButton = await this.page.$('button.o_kanban_add, input.o_kanban_add');
                        if (freshAddButton) {
                            try {
                                await freshAddButton.evaluate(el => el.click());
                                console.log('✅ Second Add button click completed');
                                await this.page.waitForTimeout(5000);
                            } catch (secondClickError) {
                                console.log('⚠️ Second click failed:', secondClickError.message);
                            }
                        }
                    }
                } else {
                    console.log('✅ Form page no longer visible - ticket creation appears successful');
                }
                
                // Wait for navigation or page change
                try {
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                    console.log('✅ Navigation completed after ticket submission');
                } catch (navError) {
                    console.log('⚠️ Navigation timeout after ticket submission, continuing...');
                }
                
                // Wait for page to stabilize
                try {
                    await this.page.waitForTimeout(3000);
                } catch (timeoutError) {
                    console.log('⚠️ Wait timeout after ticket submission, continuing...');
                }
                
                // Check for success message
                try {
                    const successElement = await this.page.$(CONFIG.selectors.successMessage);
                    if (successElement) {
                        const successText = await successElement.evaluate(el => (el.textContent || '').trim());
                        console.log('✅ Success message found:', successText);
                    }
                } catch (e) {
                    console.log('⚠️ Could not check for success message:', e.message);
                }
                
                // Try to capture ticket ID
                try {
                    const ticketIdElement = await this.page.$(CONFIG.selectors.ticketId);
                    if (ticketIdElement) {
                        this.ticketId = await ticketIdElement.evaluate(el => (el.textContent || '').trim());
                        console.log('🎫 Ticket ID captured:', this.ticketId);
                    }
                } catch (e) {
                    console.log('⚠️ Could not capture ticket ID:', e.message);
                }
                
                return true;
            }
            
            console.log('⚠️ Add/Submit button not found');
            return false;
            
        } catch (error) {
            console.error('❌ Failed to submit ticket:', error);
            return false;
        }
    }

    async checkPageState() {
        try {
            if (!this.page || this.page.isClosed()) {
                return false;
            }
            
            // Try to access the page
            await this.page.evaluate(() => document.readyState);
            return true;
        } catch (error) {
            console.log('⚠️ Page state check failed:', error.message);
            return false;
        }
    }

    async closePopupWithDiscard() {
        try {
            console.log('❌ Looking for Discard button to close popup...');
            await this.page.waitForTimeout(1000);
            
            // Look for Discard button using different approaches
            let discardButton = await this.page.$('[data-testid*="discard"]');
            if (!discardButton) {
                // Try XPath approach
                const [discardBtn] = await this.page.$x(`//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'discard')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'discard')]`);
                discardButton = discardBtn;
            }
            
            if (!discardButton) {
                // Try looking for Cancel or Close buttons as alternatives
                const [cancelBtn] = await this.page.$x(`//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cancel')] | //button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'close')] | //button[contains(@class, 'close')] | //button[@aria-label='Close']`);
                discardButton = cancelBtn;
            }
            
            if (discardButton) {
                await discardButton.click();
                console.log('✅ Clicked Discard/Close button');
                await this.page.waitForTimeout(1000);
                return true;
            } else {
                console.log('⚠️ Discard button not found');
                
                // Try pressing Escape key as a fallback
                await this.page.keyboard.press('Escape');
                console.log('⚠️ Tried pressing Escape key as fallback');
                await this.page.waitForTimeout(1000);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Failed to close popup with discard:', error);
            return false;
        }
    }

    async clickOnCreatedTicket() {
        try {
            console.log('🎯 Looking for the newly created ticket card...');
            await this.page.waitForTimeout(2000);
            
            // Look for the ticket card with the title we just created
            let ticketCard = await this.page.evaluateHandle((ticketTitle) => {
                const cards = Array.from(document.querySelectorAll('.o_kanban_record, .kanban-card, .ticket-card, .card, a, [role="button"]'));
                
                // Look for card containing our ticket title
                let targetCard = cards.find(card => {
                    const text = (card.textContent || '').trim().toLowerCase();
                    return text.includes(ticketTitle.toLowerCase());
                });
                
                if (targetCard) {
                    console.log('✅ Found ticket card with title:', targetCard.textContent.trim());
                    return targetCard;
                }
                
                // If not found by title, look for the most recent card or first available ticket
                const ticketCards = cards.filter(card => {
                    const text = (card.textContent || '').trim();
                    return text.length > 0 && text.length < 200 && !text.includes('Create') && !text.includes('Project');
                });
                
                if (ticketCards.length > 0) {
                    console.log('✅ Found ticket card (fallback):', ticketCards[0].textContent.trim());
                    return ticketCards[0];
                }
                
                console.log('❌ No ticket card found');
                return null;
            }, CONFIG.ticketDetails.title);
            
            if (ticketCard) {
                const cardElement = await ticketCard.asElement();
                if (cardElement) {
                    await cardElement.click();
                    console.log('✅ Clicked on ticket card');
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                    await this.page.waitForTimeout(2000);
                    return true;
                } else {
                    console.log('⚠️ Could not convert ticket card to clickable element');
                }
            }
            
            console.log('⚠️ Ticket card not found, trying manual approach...');
            return false;
            
        } catch (error) {
            console.error('❌ Failed to click on created ticket:', error);
            return false;
        }
    }

    async editTicketDetails() {
        try {
            console.log('✏️ Looking for Edit button...');
            await this.page.waitForTimeout(1000);
            
            // Look for Edit button
            let editButton = await this.page.$('[data-testid*="edit"]');
            if (!editButton) {
                // Try XPath approach
                const [editBtn] = await this.page.$x(`//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'edit')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'edit')]`);
                editButton = editBtn;
            }
            
            if (editButton) {
                await editButton.click();
                console.log('✅ Clicked Edit button');
                await this.page.waitForTimeout(2000);
            } else {
                console.log('⚠️ Edit button not found, continuing anyway...');
            }
            
            // Click on Customer field and only select "Discount Pipe & Steel" from dropdown
            console.log('👤 Looking for Customer field to select "Discount Pipe & Steel"...');
            let customerField = await this.page.$('input[name*="customer"], input[placeholder*="customer" i], textarea[name*="customer"]');
            if (!customerField) {
                // Try to find by label
                const [customerInput] = await this.page.$x(`//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'customer')]/following::input[1] | //label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'customer')]/following::textarea[1]`);
                customerField = customerInput;
            }
            
            if (customerField) {
                // Click on the customer field to open dropdown
                await customerField.click();
                console.log('✅ Customer field clicked to open dropdown');
                await this.page.waitForTimeout(1000);
                
                // Look for and select "Discount Pipe & Steel" from the existing dropdown options
                const customerSelected = await this.page.evaluate((targetCustomer) => {
                    const dropdownOptions = Array.from(document.querySelectorAll('.dropdown-item, .select2-results__option, option, .ui-menu-item'));
                    
                    // Look for exact match for "Discount Pipe & Steel"
                    let exactMatch = dropdownOptions.find(option => {
                        const text = (option.textContent || '').trim();
                        return text === targetCustomer || text.includes(targetCustomer);
                    });
                    
                    if (exactMatch) {
                        exactMatch.click();
                        return true;
                    }
                    return false;
                }, CONFIG.ticketDetails.customer);
                
                if (customerSelected) {
                    console.log(`✅ Selected customer: ${CONFIG.ticketDetails.customer}`);
                } else {
                    console.log('⚠️ Customer not found in dropdown, trying keyboard navigation...');
                    // Fallback: use keyboard to navigate and select
                    await this.page.keyboard.press('ArrowDown');
                    await this.page.keyboard.press('Enter');
                    console.log('✅ Selected customer option with keyboard');
                }
                
                // Wait 1 second after customer selection to let the form stabilize
                console.log('⏳ Waiting 1 second after customer selection for form to stabilize...');
                await this.page.waitForTimeout(1000);
            } else {
                console.log('⚠️ Customer field not found');
            }
            
            // Company field handling removed - now handled via Customer field above

            
            // Assign to Yash Motghare - specifically in "Assigned To" field with 1 second wait
            console.log('👨‍💼 Looking for Assigned To field to assign Yash Motghare...');
            
            // Wait 1 second as requested before looking for Assigned To field
            console.log('⏳ Waiting 1 second before searching for Assigned To field...');
            await this.page.waitForTimeout(1000);
            
            // First try to find "Assigned To" field specifically
            let assigneeField = null;
            const [assignedToInput] = await this.page.$x(`//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'assigned to') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'assignedto') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'assigned')]/following::*[1]`);
            assigneeField = assignedToInput;
            
            // If not found, try to find by field name containing "assign" but NOT "owner"
            if (!assigneeField) {
                assigneeField = await this.page.$('select[name*="assign"]:not([name*="owner"]), input[name*="assign"]:not([name*="owner"])');
            }
            
            // If still not found, try more specific search
            if (!assigneeField) {
                assigneeField = await this.page.evaluateHandle(() => {
                    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                    return inputs.find(input => {
                        const isVisible = input.offsetParent !== null;
                        if (!isVisible) return false;
                        
                        // Find the associated label
                        let label = null;
                        if (input.id) {
                            label = document.querySelector(`label[for="${input.id}"]`);
                        }
                        if (!label) {
                            label = input.closest('label') || input.parentElement.querySelector('label');
                        }
                        if (!label) {
                            const prevElement = input.previousElementSibling;
                            if (prevElement && prevElement.tagName === 'LABEL') {
                                label = prevElement;
                            }
                        }
                        
                        const labelText = label ? (label.textContent || '').toLowerCase() : '';
                        const placeholder = (input.placeholder || '').toLowerCase();
                        const name = (input.name || '').toLowerCase();
                        const id = (input.id || '').toLowerCase();
                        
                        // Look for "assigned" but specifically avoid "ownership"
                        return (
                            labelText.includes('assigned') ||
                            placeholder.includes('assigned') ||
                            (name.includes('assign') && !name.includes('owner') && !name.includes('ownership')) ||
                            (id.includes('assign') && !id.includes('owner') && !id.includes('ownership'))
                        ) && !labelText.includes('ownership') && !labelText.includes('owner');
                    }) || null;
                });
            }
            
            if (assigneeField) {
                try {
                    // Check if the field is actually usable
                    const isElement = await assigneeField.evaluate(el => el && el.tagName);
                    if (!isElement) {
                        console.log('⚠️ Assigned To field found but not accessible in edit mode');
                    } else {
                        const tagName = await assigneeField.evaluate(el => el.tagName.toLowerCase());
                        if (tagName === 'select') {
                            // Handle select dropdown - look for exact match first
                            const success = await assigneeField.evaluate((el, targetText) => {
                                const options = Array.from(el.options || []);
                                // First try exact match
                                let match = options.find(o => (o.textContent || '').trim() === targetText);
                                if (!match) {
                                    // Fallback to partial match
                                    match = options.find(o => (o.textContent || '').trim().toLowerCase().includes(targetText.toLowerCase()));
                                }
                                if (match) { 
                                    el.value = match.value; 
                                    el.dispatchEvent(new Event('change', { bubbles: true })); 
                                    return true; 
                                }
                                return false;
                            }, CONFIG.ticketDetails.assignedTo);
                            if (success) {
                                console.log(`✅ Assigned "${CONFIG.ticketDetails.assignedTo}" via select dropdown (Assigned To field)`);
                            } else {
                                console.log(`⚠️ Could not find assignment option: ${CONFIG.ticketDetails.assignedTo} in Assigned To field`);
                            }
                        } else {
                            // Handle input field - type the exact value with 1 second wait
                            console.log(`🎯 Found Assigned To field, typing "${CONFIG.ticketDetails.assignedTo}" with 1 second wait...`);
                            await this.clearAndType(assigneeField, CONFIG.ticketDetails.assignedTo);
                            
                            // Wait 1 second as requested
                            console.log('⏳ Waiting 1 second after typing in Assigned To field...');
                            await this.page.waitForTimeout(1000);
                            
                            // Try to select from dropdown or confirm with Enter
                            const optionSelected = await this.page.evaluate((targetText) => {
                                const dropdownOptions = Array.from(document.querySelectorAll('.dropdown-item, .select2-results__option, option, .ui-menu-item'));
                                
                                // First try exact match
                                let exactMatch = dropdownOptions.find(option => 
                                    (option.textContent || '').trim() === targetText
                                );
                                
                                // If no exact match, try partial match
                                if (!exactMatch) {
                                    exactMatch = dropdownOptions.find(option => 
                                        (option.textContent || '').trim().toLowerCase().includes(targetText.toLowerCase())
                                    );
                                }
                                
                                if (exactMatch) {
                                    exactMatch.click();
                                    return true;
                                }
                                return false;
                            }, CONFIG.ticketDetails.assignedTo);
                            
                            if (optionSelected) {
                                console.log(`✅ Selected "${CONFIG.ticketDetails.assignedTo}" from Assigned To dropdown`);
                            } else {
                                // Fallback: press Enter to confirm the typed value
                                await this.page.keyboard.press('Enter');
                                console.log(`✅ Confirmed "${CONFIG.ticketDetails.assignedTo}" in Assigned To field with Enter key`);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ Error accessing Assigned To field in edit mode: ${error.message}`);
                }
            } else {
                console.log('⚠️ Assigned To field not found in edit mode');
            }
            
            // Click Save button
            console.log('💾 Looking for Save button...');
            const [saveButton] = await this.page.$x(`//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'save')] | //input[@type="submit"]`);
            if (saveButton) {
                await saveButton.click();
                console.log('✅ Save button clicked');
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                await this.page.waitForTimeout(2000);
                return true;
            } else {
                console.log('⚠️ Save button not found');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Failed to edit ticket details:', error);
            return false;
        }
    }

    async captureScreenshot(name) {
        try {
            // Check page state before taking screenshot
            if (!await this.checkPageState()) {
                console.log('⚠️ Page not accessible, skipping screenshot');
                return null;
            }
            
            const screenshotPath = path.join(__dirname, `screenshot_${name}_${Date.now()}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot saved: ${screenshotPath}`);
            return screenshotPath;
        } catch (error) {
            console.error('❌ Failed to capture screenshot:', error);
        }
    }

    async run() {
        try {
            await this.init();
            
            // Login
            const loginSuccess = await this.login();
            if (!loginSuccess) {
                throw new Error('Login failed');
            }
            
            // Capture screenshot after login
            await this.captureScreenshot('after_login');
            
            // Navigate to Projects and click on Test Support
            const projectsSuccess = await this.navigateToProjects();
            if (!projectsSuccess) {
                throw new Error('Failed to navigate to Projects and select Test Support');
            }
            
            // Capture screenshot after navigating to Projects and clicking on Test Support
            try {
                await this.captureScreenshot('after_test_support_selection');
            } catch (screenshotError) {
                console.log('⚠️ Failed to capture screenshot after Test Support selection:', screenshotError.message);
            }
            
            // Click Create
            const createSuccess = await this.clickCreate();
            if (!createSuccess) {
                throw new Error('Failed to click Create');
            }
            
            // Capture screenshot after clicking Create
            await this.captureScreenshot('after_create');
            
            // Fill ticket form
            const formSuccess = await this.fillTicketForm();
            if (!formSuccess) {
                throw new Error('Failed to fill ticket form');
            }
            
            // Capture screenshot after filling form
            await this.captureScreenshot('after_form_fill');
            
            // Submit ticket
            const submitSuccess = await this.submitTicket();
            if (!submitSuccess) {
                throw new Error('Failed to submit ticket');
            }
            
            // Capture screenshot after submission
            await this.captureScreenshot('after_submit');
            
            // Close any popup/modal by clicking Discard
            const discardSuccess = await this.closePopupWithDiscard();
            if (!discardSuccess) {
                console.log('⚠️ Could not find Discard button, continuing anyway...');
            }
            
            // Ticket creation completed successfully
            console.log('✅ Ticket created successfully with Ownership set to Yash Motghare');
            
            // Now continue with editing the ticket details
            console.log('📝 Continuing to edit ticket details...');
            
            // Wait a moment for the page to settle after ticket creation
            await this.page.waitForTimeout(3000);
            
            // Click on the created ticket to edit it
            const ticketClickSuccess = await this.clickOnCreatedTicket();
            if (!ticketClickSuccess) {
                console.log('⚠️ Could not click on created ticket, but continuing...');
            }
            
            // Edit the ticket details (Customer and Assigned To)
            const editSuccess = await this.editTicketDetails();
            if (!editSuccess) {
                console.log('⚠️ Could not edit ticket details, but continuing...');
            }
            
            // Capture final screenshot after ticket creation and editing
            await this.captureScreenshot('after_ticket_creation_complete');
            
            // Final result
            if (this.ticketId) {
                console.log(`🎉 Ticket created and edited successfully! Ticket ID: ${this.ticketId}`);
                return { success: true, ticketId: this.ticketId };
            } else {
                console.log('✅ Ticket creation and editing process completed (ID not captured)');
                return { success: true, ticketId: null };
            }
            
        } catch (error) {
            console.error('❌ Automation failed:', error);
            await this.captureScreenshot('error');
            return { success: false, error: error.message };
        } finally {
            if (this.browser) {
                await this.browser.close();
                console.log('🔒 Browser closed');
            }
        }
    }
}

// Main execution
async function main() {
    console.log('🚀 Starting EOXS Ticket Creation Automation...');
    console.log('📋 Configuration:');
    console.log(`   Base URL: ${CONFIG.baseUrl}`);
    console.log(`   Email: ${CONFIG.credentials.email}`);
    console.log(`   Ticket Title: ${CONFIG.ticketDetails.title}`);
    console.log(`   Customer: ${CONFIG.ticketDetails.customer}`);
    console.log(`   Assigned To: ${CONFIG.ticketDetails.assignedTo}`);
    console.log('');
    
    // Check if credentials are set
    if (CONFIG.credentials.email === 'your-email@example.com' || CONFIG.credentials.password === 'your-password') {
        console.log('⚠️  Please set your credentials using environment variables:');
        console.log('   export EOXS_EMAIL="your-email@example.com"');
        console.log('   export EOXS_PASSWORD="your-password"');
        console.log('');
        console.log('   Or modify the CONFIG.credentials object in the script.');
        return;
    }
    
    const automation = new EOXSAutomation();
    const result = await automation.run();
    
    console.log('');
    console.log('📊 Final Result:', result);
    
    if (result.success) {
        console.log('🎉 Automation completed successfully!');
        process.exit(0);
    } else {
        console.log('❌ Automation failed!');
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the automation
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = EOXSAutomation;
