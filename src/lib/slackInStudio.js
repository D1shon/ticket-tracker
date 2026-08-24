// Уведомление в Slack-канал #in-studio-chat о новой заявке InStudio.
// Шлётся через серверный шлюз /api/slack-notify (вебхук в коде не светится).
// Fire-and-forget: сбой Slack не должен ломать создание заявки.

const PRIORITY_LABEL = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

export function slackInStudioTicket(t) {
  try {
    // В Slack уходят только заявки с ВЫСОКИМ приоритетом — остальное не шумит в канал
    if (t.priority !== 'high') return;
    const lines = [
      `🛠 *Новая заявка InStudio* — ${t.club}`,
      `*${t.title}*`,
      `${t.type}${t.zone ? ` · зона: ${t.zone}` : ''}`,
    ];
    const details = [];
    if (t.criticalityLabel) details.push(t.criticalityLabel);
    else if (t.priority) details.push(`Приоритет: ${PRIORITY_LABEL[t.priority] || t.priority}`);
    if (t.affectedLabel) details.push(`Затронуто: ${t.affectedLabel}`);
    if (t.recurring) details.push('🔁 повторяется');
    if (t.requestTypeLabel) details.push(t.requestTypeLabel);
    if (details.length) lines.push(details.join(' · '));
    if (t.description) lines.push(`> ${String(t.description).slice(0, 400)}`);
    lines.push(`Автор: ${t.createdByName || t.createdByEmail || '—'}${t.source === 'shift-board' ? ' · с Доски задач' : ''}`);
    // Прямая ссылка на заявку — открывает окно обсуждения сразу
    lines.push(t.id
      ? `https://ticket-tracker-inky.vercel.app/instudio?ticket=${t.id}`
      : 'https://ticket-tracker-inky.vercel.app/instudio');

    fetch('/api/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'instudio', text: lines.join('\n') }),
    }).catch(() => {});
  } catch { /* не мешаем созданию заявки */ }
}
