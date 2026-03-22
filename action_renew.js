const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// ========== 全局截图目录（修复所有未定义问题）==========
const PHOTO_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });

async function sendTelegramMessage(message, imagePath = null) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

    try {
        const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('[Telegram] Message sent.');
    } catch (e) {
        console.error('[Telegram] Failed to send message:', e.message);
    }

    if (imagePath && fs.existsSync(imagePath)) {
        console.log('[Telegram] Sending photo...');
        const cmd = `curl -s -X POST "https://api.telegram.org/bot\( {TG_BOT_TOKEN}/sendPhoto" -F chat_id=" \){TG_CHAT_ID}" -F photo="@${imagePath}"`;
        await new Promise(resolve => {
            exec(cmd, (err) => {
                if (err) console.error('[Telegram] Failed to send photo via curl:', err.message);
                else console.log('[Telegram] Photo sent.');
                resolve();
            });
        });
    }
}

// 启用 stealth 插件（以下所有中间代码保持原样，只改最后部分）
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
        console.log(`[代理] 检测到配置: 服务器=\( {PROXY_CONFIG.server}, 认证= \){PROXY_CONFIG.username ? '是' : '否'}`);
    } catch (e) {
        console.error('[代理] HTTP_PROXY 格式无效。');
        process.exit(1);
    }
}

const INJECTED_SCRIPT = `...`; // ← 你的原 INJECTED_SCRIPT 完全不动（太长，省略粘贴）

async function checkProxy() { /* 原函数不动 */ }
function checkPort(port) { /* 原函数不动 */ }
async function launchChrome() { /* 原函数不动 */ }
function getUsers() { /* 原函数不动 */ }
async function attemptTurnstileCdp(page) { /* 原函数不动 */ }

(async () => {
    const users = getUsers();
    if (users.length === 0) {
        console.log('未在 process.env.USERS_JSON 中找到用户');
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
        } catch (e) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    if (!browser) process.exit(1);

    const context = browser.contexts()[0];
    let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    page.setDefaultTimeout(60000);

    if (PROXY_CONFIG && PROXY_CONFIG.username) {
        await context.setHTTPCredentials({ username: PROXY_CONFIG.username, password: PROXY_CONFIG.password });
    }

    await page.addInitScript(INJECTED_SCRIPT);

    let anyRenewed = false;   // ← 新增：至少有一个用户续期成功

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`\n=== 正在处理用户 \( {i + 1}/ \){users.length} ===`);

        try {
            if (page.isClosed()) {
                page = await context.newPage();
                await page.addInitScript(INJECTED_SCRIPT);
            }

            // === 登录逻辑（完全原样）===
            if (page.url().includes('dashboard')) {
                await page.goto('https://dashboard.katabump.com/auth/logout');
                await page.waitForTimeout(2000);
            }
            await page.goto('https://dashboard.katabump.com/auth/login');
            await page.waitForTimeout(2000);

            console.log('正在输入凭据...');
            const emailInput = page.getByRole('textbox', { name: 'Email' });
            await emailInput.fill(user.username);
            const pwdInput = page.getByRole('textbox', { name: 'Password' });
            await pwdInput.fill(user.password);

            // 登录前 Turnstile（原样）
            console.log('   >> 正在登录前检查 Turnstile...');
            let cdpClickResult = false;
            for (let findAttempt = 0; findAttempt < 15; findAttempt++) {
                cdpClickResult = await attemptTurnstileCdp(page);
                if (cdpClickResult) break;
                await page.waitForTimeout(1000);
            }

            await page.getByRole('button', { name: 'Login', exact: true }).click();

            // 登录失败检查
            try {
                const errorMsg = page.getByText('Incorrect password or no account');
                if (await errorMsg.isVisible({ timeout: 3000 })) {
                    console.error(`   >> ❌ 登录失败: 用户 ${user.username}`);
                    const safeUsername = user.username.replace(/[^a-z0-9]/gi, '_');
                    const failShotPath = path.join(PHOTO_DIR, `${safeUsername}.png`);
                    try { await page.screenshot({ path: failShotPath, fullPage: true }); } catch (e) {}
                    await sendTelegramMessage(`❌ *登录失败*\n用户: ${user.username}\n原因: 账号或密码错误`, failShotPath);
                    continue;
                }
            } catch (e) {}

            // 点击 See
            await page.getByRole('link', { name: 'See' }).first().click();

            // === Renew 主循环 ===
            let renewSuccess = false;
            let hasCaptchaError = false;

            for (let attempt = 1; attempt <= 20; attempt++) {
                console.log(`\n[尝试 ${attempt}/20] 正在寻找 Renew 按钮...`);
                const renewBtn = page.getByRole('button', { name: 'Renew', exact: true }).first();
                if (await renewBtn.isVisible()) {
                    await renewBtn.click();

                    const modal = page.locator('#renew-modal');
                    await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

                    // Turnstile CDP（原样）
                    let cdpClickResult = false;
                    for (let findAttempt = 0; findAttempt < 30; findAttempt++) {
                        cdpClickResult = await attemptTurnstileCdp(page);
                        if (cdpClickResult) break;
                        await page.waitForTimeout(1000);
                    }

                    const confirmBtn = modal.getByRole('button', { name: 'Renew' });
                    if (await confirmBtn.isVisible()) {
                        // Turnstile 前截图（修复路径）
                        const safeUser = user.username.replace(/[^a-z0-9]/gi, '_');
                        const tsScreenshotName = `\( {safeUser}_Turnstile_ \){attempt}.png`;
                        try {
                            await page.screenshot({ path: path.join(PHOTO_DIR, tsScreenshotName), fullPage: true });
                            console.log(`   >> 📸 快照已保存: ${tsScreenshotName}`);
                        } catch (e) {}

                        await confirmBtn.click();

                        try {
                            const startVerifyTime = Date.now();
                            while (Date.now() - startVerifyTime < 3000) {
                                if (await page.getByText('Please complete the captcha to continue').isVisible()) {
                                    hasCaptchaError = true;
                                    break;
                                }

                                const notTimeLoc = page.getByText("You can't renew your server yet");
                                if (await notTimeLoc.isVisible()) {
                                    const text = await notTimeLoc.innerText();
                                    const match = text.match(/as of\s+(.*?)\s+\(/);
                                    let dateStr = match ? match[1] : 'Unknown Date';
                                    console.log(`   >> ⏳ 暂无法续期。下次可用时间: ${dateStr}`);

                                    // 修复：截图 + Telegram（原来是死代码）
                                    const safeUserSkip = user.username.replace(/[^a-z0-9]/gi, '_');
                                    const skipShotPath = path.join(PHOTO_DIR, `${safeUserSkip}_skip.png`);
                                    try { await page.screenshot({ path: skipShotPath, fullPage: true }); } catch (e) {}
                                    await sendTelegramMessage(`⏳ *暂无法续期 (跳过)*\n用户: ${user.username}\n下次可用: ${dateStr}`, skipShotPath);

                                    renewSuccess = true;
                                    try {
                                        const closeBtn = modal.getByLabel('Close');
                                        if (await closeBtn.isVisible()) await closeBtn.click();
                                    } catch (e) {}
                                    break;
                                }
                                await page.waitForTimeout(200);
                            }
                        } catch (e) {}

                        if (renewSuccess) break;

                        if (hasCaptchaError) {
                            await page.reload();
                            await page.waitForTimeout(3000);
                            continue;
                        }

                        await page.waitForTimeout(2000);
                        if (!await modal.isVisible()) {
                            console.log('   >> ✅ Renew successful!');

                            // 修复：成功截图 + Telegram（原来是死代码）
                            const safeUserSuccess = user.username.replace(/[^a-z0-9]/gi, '_');
                            const successShotPath = path.join(PHOTO_DIR, `${safeUserSuccess}_success.png`);
                            try { await page.screenshot({ path: successShotPath, fullPage: true }); } catch (e) {}
                            await sendTelegramMessage(`✅ *续期成功*\n用户: ${user.username}\n状态: 服务器已成功续期！`, successShotPath);

                            anyRenewed = true;
                            renewSuccess = true;
                            break;
                        } else {
                            await page.reload();
                            await page.waitForTimeout(3000);
                            continue;
                        }
                    }
                } else {
                    console.log('未找到 Renew 按钮（可能已续期）。');
                    break;
                }
            }
        } catch (err) {
            console.error(`Error processing user:`, err);
        }

        // 每个用户结束后的最终截图
        const safeUsername = user.username.replace(/[^a-z0-9]/gi, '_');
        const screenshotPath = path.join(PHOTO_DIR, `${safeUsername}.png`);
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`截图已保存至: ${screenshotPath}`);
        } catch (e) {}
    }

    // 所有用户处理完后，只输出一次最终结果（sh 文件可稳定 grep）
    console.log(JSON.stringify({ success: anyRenewed }));

    await browser.close();
    process.exit(0);
})();
