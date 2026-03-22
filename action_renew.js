const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// ========== 全局截图目录（所有截图都不会再报错）==========
const PHOTO_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });

async function sendTelegramMessage(message, imagePath = null) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

    try {
        const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
        await axios.post(url, { chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' });
        console.log('[Telegram] Message sent.');
    } catch (e) { console.error('[Telegram] Failed to send message:', e.message); }

    if (imagePath && fs.existsSync(imagePath)) {
        const cmd = `curl -s -X POST "https://api.telegram.org/bot\( {TG_BOT_TOKEN}/sendPhoto" -F chat_id=" \){TG_CHAT_ID}" -F photo="@${imagePath}"`;
        await new Promise(resolve => {
            exec(cmd, (err) => {
                if (err) console.error('[Telegram] Failed to send photo:', err.message);
                else console.log('[Telegram] Photo sent.');
                resolve();
            });
        });
    }
}

// --- 下面所有函数全部恢复（原版 + 小优化）---
chromium.use(stealth);
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DEBUG_PORT = 9222;
process.env.NO_PROXY = 'localhost,127.0.0.1';

const HTTP_PROXY = process.env.HTTP_PROXY;
let PROXY_CONFIG = null;
if (HTTP_PROXY) {
    try {
        const proxyUrl = new URL(HTTP_PROXY);
        PROXY_CONFIG = {
            server: `\( {proxyUrl.protocol}// \){proxyUrl.hostname}:${proxyUrl.port}`,
            username: proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined,
            password: proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined
        };
    } catch (e) {
        console.error('[代理] HTTP_PROXY 格式无效');
        process.exit(1);
    }
}

const INJECTED_SCRIPT = `
(function() {
    if (window.self === window.top) return;
    try {
        function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
        let screenX = getRandomInt(800, 1200);
        let screenY = getRandomInt(400, 600);
        Object.defineProperty(MouseEvent.prototype, 'screenX', { value: screenX });
        Object.defineProperty(MouseEvent.prototype, 'screenY', { value: screenY });
    } catch (e) {}
    try {
        const originalAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
            const shadowRoot = originalAttachShadow.call(this, init);
            if (shadowRoot) {
                const checkAndReport = () => {
                    const checkbox = shadowRoot.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        const rect = checkbox.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            const xRatio = (rect.left + rect.width / 2) / window.innerWidth;
                            const yRatio = (rect.top + rect.height / 2) / window.innerHeight;
                            window.__turnstile_data = { xRatio, yRatio };
                            return true;
                        }
                    }
                    return false;
                };
                if (!checkAndReport()) {
                    const observer = new MutationObserver(() => { if (checkAndReport()) observer.disconnect(); });
                    observer.observe(shadowRoot, { childList: true, subtree: true });
                }
            }
            return shadowRoot;
        };
    } catch (e) {}
})();
`;

async function checkProxy() {
    if (!PROXY_CONFIG) return true;
    console.log('[代理] 正在验证...');
    try {
        const axiosConfig = { proxy: { protocol: 'http', host: new URL(PROXY_CONFIG.server).hostname, port: parseInt(new URL(PROXY_CONFIG.server).port) }, timeout: 10000 };
        if (PROXY_CONFIG.username) axiosConfig.proxy.auth = { username: PROXY_CONFIG.username, password: PROXY_CONFIG.password };
        await axios.get('https://www.google.com', axiosConfig);
        console.log('[代理] 连接成功！');
        return true;
    } catch (e) {
        console.error('[代理] 连接失败:', e.message);
        return false;
    }
}

function checkPort(port) {
    return new Promise(resolve => {
        const req = http.get(`http://localhost:${port}/json/version`, () => resolve(true));
        req.on('error', () => resolve(false));
        req.end();
    });
}

async function launchChrome() {
    if (await checkPort(DEBUG_PORT)) return;
    console.log(`启动 Chrome...`);
    const args = [
        `--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--window-size=1280,720', '--no-sandbox', '--disable-setuid-sandbox',
        '--user-data-dir=/tmp/chrome_user_data', '--disable-dev-shm-usage'
    ];
    if (PROXY_CONFIG) {
        args.push(`--proxy-server=${PROXY_CONFIG.server}`);
        args.push('--proxy-bypass-list=<-loopback>');
    }
    const chrome = spawn(CHROME_PATH, args, { detached: true, stdio: 'ignore' });
    chrome.unref();
    for (let i = 0; i < 20; i++) {
        if (await checkPort(DEBUG_PORT)) break;
        await new Promise(r => setTimeout(r, 1000));
    }
}

function getUsers() {
    try {
        if (process.env.USERS_JSON) {
            const parsed = JSON.parse(process.env.USERS_JSON);
            return Array.isArray(parsed) ? parsed : (parsed.users || []);
        }
    } catch (e) {
        console.error('解析 USERS_JSON 错误:', e);
    }
    return [];
}

async function attemptTurnstileCdp(page) {
    const frames = page.frames();
    for (const frame of frames) {
        try {
            const data = await frame.evaluate(() => window.__turnstile_data).catch(() => null);
            if (data) {
                const iframeElement = await frame.frameElement();
                if (!iframeElement) continue;
                const box = await iframeElement.boundingBox();
                if (!box) continue;
                const clickX = box.x + (box.width * data.xRatio);
                const clickY = box.y + (box.height * data.yRatio);
                const client = await page.context().newCDPSession(page);
                await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
                await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
                await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
                await client.detach();
                return true;
            }
        } catch (e) {}
    }
    return false;
}

// ====================== 主逻辑（已修复所有 return、photoDir、多用户）======================
(async () => {
    const users = getUsers();
    if (users.length === 0) {
        console.log('未在 USERS_JSON 中找到用户');
        console.log(JSON.stringify({ success: false }));
        process.exit(1);
    }

    if (PROXY_CONFIG) {
        const isValid = await checkProxy();
        if (!isValid) process.exit(1);
    }

    await launchChrome();

    let browser;
    for (let k = 0; k < 5; k++) {
        try {
            browser = await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 2000)); }
    }
    if (!browser) process.exit(1);

    const context = browser.contexts()[0];
    let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    page.setDefaultTimeout(60000);

    if (PROXY_CONFIG && PROXY_CONFIG.username) {
        await context.setHTTPCredentials({ username: PROXY_CONFIG.username, password: PROXY_CONFIG.password });
    }

    await page.addInitScript(INJECTED_SCRIPT);

    let anyRenewed = false;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`\n=== 处理用户 \( {i + 1}/ \){users.length} ===`);

        try {
            // 登录 + Renew 逻辑（全部保持你原来的流程，只修复路径和 return）
            if (page.isClosed()) {
                page = await context.newPage();
                await page.addInitScript(INJECTED_SCRIPT);
            }

            if (page.url().includes('dashboard')) {
                await page.goto('https://dashboard.katabump.com/auth/logout');
                await page.waitForTimeout(2000);
            }
            await page.goto('https://dashboard.katabump.com/auth/login');
            await page.waitForTimeout(2000);

            const emailInput = page.getByRole('textbox', { name: 'Email' });
            await emailInput.fill(user.username);
            const pwdInput = page.getByRole('textbox', { name: 'Password' });
            await pwdInput.fill(user.password);

            // 登录前 Turnstile
            let cdpClickResult = false;
            for (let a = 0; a < 15; a++) {
                cdpClickResult = await attemptTurnstileCdp(page);
                if (cdpClickResult) break;
                await page.waitForTimeout(1000);
            }
            await page.getByRole('button', { name: 'Login', exact: true }).click();

            // 登录失败检查
            try {
                if (await page.getByText('Incorrect password or no account').isVisible({ timeout: 3000 })) {
                    const safe = user.username.replace(/[^a-z0-9]/gi, '_');
                    const failPath = path.join(PHOTO_DIR, `${safe}.png`);
                    await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
                    await sendTelegramMessage(`❌ *登录失败*\n用户: ${user.username}`, failPath);
                    continue;
                }
            } catch (e) {}

            await page.getByRole('link', { name: 'See' }).first().click();

            // Renew 循环（核心修复：删除 return，修复截图）
            let renewSuccess = false;
            for (let attempt = 1; attempt <= 20; attempt++) {
                const renewBtn = page.getByRole('button', { name: 'Renew', exact: true }).first();
                if (!(await renewBtn.isVisible())) break;

                await renewBtn.click();
                const modal = page.locator('#renew-modal');
                await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

                // Turnstile
                cdpClickResult = false;
                for (let f = 0; f < 30; f++) {
                    cdpClickResult = await attemptTurnstileCdp(page);
                    if (cdpClickResult) break;
                    await page.waitForTimeout(1000);
                }

                const confirmBtn = modal.getByRole('button', { name: 'Renew' });
                if (await confirmBtn.isVisible()) {
                    // Turnstile 快照
                    const safe = user.username.replace(/[^a-z0-9]/gi, '_');
                    await page.screenshot({ path: path.join(PHOTO_DIR, `\( {safe}_Turnstile_ \){attempt}.png`), fullPage: true }).catch(() => {});

                    await confirmBtn.click();

                    // 检查错误
                    if (await page.getByText("You can't renew your server yet").isVisible({ timeout: 3000 })) {
                        const text = await page.getByText("You can't renew your server yet").innerText();
                        const dateStr = text.match(/as of\s+(.*?)\s+\(/)?.[1] || 'Unknown';
                        const skipPath = path.join(PHOTO_DIR, `${safe}_skip.png`);
                        await page.screenshot({ path: skipPath, fullPage: true }).catch(() => {});
                        await sendTelegramMessage(`⏳ *暂无法续期*\n用户: ${user.username}\n下次可用: ${dateStr}`, skipPath);
                        renewSuccess = true;
                        break;
                    }

                    await page.waitForTimeout(2000);
                    if (!await modal.isVisible()) {
                        const successPath = path.join(PHOTO_DIR, `${safe}_success.png`);
                        await page.screenshot({ path: successPath, fullPage: true }).catch(() => {});
                        await sendTelegramMessage(`✅ *续期成功*\n用户: ${user.username}`, successPath);
                        anyRenewed = true;
                        renewSuccess = true;
                        break;
                    }
                }
                if (renewSuccess) break;
                await page.reload().catch(() => {});
                await page.waitForTimeout(3000);
            }
        } catch (err) {
            console.error(`用户处理出错:`, err);
        }

        // 每个用户最终截图
        const safe = user.username.replace(/[^a-z0-9]/gi, '_');
        await page.screenshot({ path: path.join(PHOTO_DIR, `${safe}.png`), fullPage: true }).catch(() => {});
    }

    console.log(JSON.stringify({ success: anyRenewed }));
    await browser.close();
    process.exit(0);
})();
