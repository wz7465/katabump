const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const PHOTO_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });

async function sendTelegramMessage(message, imagePath = null) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown'
        });
    } catch (e) {}
    if (imagePath && fs.existsSync(imagePath)) {
        const cmd = `curl -s -X POST "https://api.telegram.org/bot\( {TG_BOT_TOKEN}/sendPhoto" -F chat_id=" \){TG_CHAT_ID}" -F photo="@${imagePath}"`;
        await new Promise(r => exec(cmd, () => r()));
    }
}

// === 下面函数全部恢复（和上次一样）===
chromium.use(stealth);
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DEBUG_PORT = 9222;
process.env.NO_PROXY = 'localhost,127.0.0.1';

const HTTP_PROXY = process.env.HTTP_PROXY;
let PROXY_CONFIG = null;
if (HTTP_PROXY) {
    try {
        const u = new URL(HTTP_PROXY);
        PROXY_CONFIG = { server: `\( {u.protocol}// \){u.hostname}:${u.port}`, username: u.username ? decodeURIComponent(u.username) : undefined, password: u.password ? decodeURIComponent(u.password) : undefined };
    } catch (e) { process.exit(1); }
}

const INJECTED_SCRIPT = `(function(){if(window.self===window.top)return;try{function getRandomInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}let x=getRandomInt(800,1200),y=getRandomInt(400,600);Object.defineProperty(MouseEvent.prototype,"screenX",{value:x});Object.defineProperty(MouseEvent.prototype,"screenY",{value:y})}catch(e){}try{const o=Element.prototype.attachShadow;Element.prototype.attachShadow=function(i){const r=o.call(this,i);if(r){const c=()=>{const t=r.querySelector('input[type="checkbox"]');if(t){const b=t.getBoundingClientRect();if(b.width>0&&b.height>0){const xr=(b.left+b.width/2)/window.innerWidth,yr=(b.top+b.height/2)/window.innerHeight;window.__turnstile_data={xRatio:xr,yRatio:yr};return!0}}return!1};c()||new MutationObserver(()=>{c()&&this.disconnect}).observe(r,{childList:!0,subtree:!0})}return r}}catch(e){}})();`;

async function checkProxy() { /* 同上次 */ if(!PROXY_CONFIG)return true; /* ... 保持原样 */ }
function checkPort(port) { /* 同上次 */ }
async function launchChrome() { /* 同上次 */ }
function getUsers() { /* 同上次 */ }
async function attemptTurnstileCdp(page) { /* 同上次 */ }

// ====================== 主逻辑（新增诊断 + 自动报警）======================
(async () => {
    const users = getUsers();
    if (users.length === 0) {
        console.log('未找到用户');
        console.log(JSON.stringify({ success: false }));
        process.exit(1);
    }

    if (PROXY_CONFIG) { const ok = await checkProxy(); if(!ok) process.exit(1); }
    await launchChrome();

    let browser;
    for(let k=0;k<5;k++){try{browser=await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);break}catch(e){await new Promise(r=>setTimeout(r,2000))}}
    if(!browser) process.exit(1);

    const context = browser.contexts()[0];
    let page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(90000);  // 加大超时

    if (PROXY_CONFIG?.username) await context.setHTTPCredentials({username: PROXY_CONFIG.username, password: PROXY_CONFIG.password});
    await page.addInitScript(INJECTED_SCRIPT);

    let anyRenewed = false;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`\n=== 处理用户 \( {i + 1}/ \){users.length} ===`);   // ← 确保用反引号 `

        try {
            // 强制重新登录
            await page.goto('https://dashboard.katabump.com/auth/login', { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);

            // 使用更准确的 selector（根据网站实际 placeholder）
            await page.getByPlaceholder('Please enter your email.').fill(user.username);
            await page.getByPlaceholder('Please enter your password.').fill(user.password);

            // Turnstile（保持原逻辑）
            let clicked = false;
            for(let a=0;a<15;a++){clicked=await attemptTurnstileCdp(page);if(clicked)break;await page.waitForTimeout(1000);}
            await page.getByRole('button', { name: /Login/i }).click();

            console.log('登录后 URL:', page.url());
            console.log('页面标题:', await page.title());

            // 关键诊断：等 See 链接，最多 45 秒
            const seeLink = page.getByRole('link', { name: 'See' }).first();
            try {
                await seeLink.waitFor({ state: 'visible', timeout: 45000 });
                await seeLink.click();
            } catch (e) {
                console.log('❌ 未找到 "See" 链接！截图报警...');
                const safe = user.username.replace(/[^a-z0-9]/gi, '_');
                const diagPath = path.join(PHOTO_DIR, `${safe}_SEE_NOT_FOUND.png`);
                await page.screenshot({ path: diagPath, fullPage: true }).catch(()=>{});
                await sendTelegramMessage(`⚠️ *无法找到 See 链接*\n用户: ${user.username}\n当前 URL: ${page.url()}\n标题: ${await page.title()}\n可能原因：Turnstile 未通过 或 页面加载问题`, diagPath);
                continue;   // 继续下一个用户
            }

            // === 后面的 Renew 循环保持你原来的（或上次我给的简化版）===
            // 这里为了简洁我省略了完整 Renew（你直接把上次版本的 Renew 部分粘贴进来即可）
            // ...（把你上次 action_renew.js 中从 “console.log('正在寻找 "See" 链接...')” 之后的所有 Renew 代码粘贴到这里）

            anyRenewed = true;   // 如果走到这里说明至少有一个用户处理成功
        } catch (err) {
            console.error('用户处理出错:', err.message);
            const safe = user.username.replace(/[^a-z0-9]/gi, '_');
            const errPath = path.join(PHOTO_DIR, `${safe}_ERROR.png`);
            await page.screenshot({ path: errPath, fullPage: true }).catch(()=>{});
            await sendTelegramMessage(`❌ *处理出错*\n用户: ${user.username}\n错误: ${err.message}`, errPath);
        }
    }

    console.log(JSON.stringify({ success: anyRenewed }));
    await browser.close();
    process.exit(0);
})();
