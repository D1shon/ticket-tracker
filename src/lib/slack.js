// Отправка сообщения в Slack-канал команды через серверный шлюз.
// Никогда не бросает — Slack не должен ломать основной сценарий.
export async function slackNotify(text) {
  try {
    await fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {}
}
