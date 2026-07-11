const https = require("https");

const token = process.env.TG_BOT_TOKEN;
const chatId = process.env.TG_CHAT_ID;
const urlToSend = "https://dashboard.katabump.com/auth/login"; // 你要发送的网址

const message = `点击访问：${urlToSend}`;

const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`;

https.get(apiUrl, (res) => {
  console.log("Status Code:", res.statusCode);
}).on("error", (err) => {
  console.error("Error:", err);
});
