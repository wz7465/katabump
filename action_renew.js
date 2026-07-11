const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;

const url = `https://api.telegram.org/bot${token}/sendMessage`;

const target = 1683843200; // 2026-07-13 00:00:00 UTC
const now = Math.floor(Date.now() / 1000);

if (now >= target) {
  console.log(JSON.stringify({ success: true }));

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "点击访问：https://dashboard.katabump.com/auth/login"
    })
  })
    .then(res => {
      console.log("Status:", res.status);
      process.exit(res.ok ? 0 : 1);
    })
    .catch(err => {
      console.error("Error:", err);
      process.exit(1);
    });

} else {
  console.log(`还没到时间，当前时间戳：${now}`);
  process.exit(0);
}
