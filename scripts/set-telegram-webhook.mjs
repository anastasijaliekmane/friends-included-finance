const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.argv[2];

if (!token || !secret || !baseUrl) {
  console.error("Usage: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... pnpm set-telegram-webhook https://your-app.vercel.app");
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ["message"] }),
});
const result = await response.json();
if (!response.ok || !result.ok) {
  console.error(result);
  process.exit(1);
}
console.log(`Telegram webhook set to ${webhookUrl}`);
