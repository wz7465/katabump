const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;

const url = `https://api.telegram.org/bot${token}/sendMessage`;

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
