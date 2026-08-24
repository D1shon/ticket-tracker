// Shared push sender: resolves recipient tokens with the client SDK
// (server-side Firestore reads hit Spark quota limits), then calls the API.
// Filters: the actor never gets their own push; club events go to that club's
// staff + chefs (club=null tokens see everything).
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Роли, которые ЛЕГИТИМНО видят все клубы (их токен club=null по задумке).
// Только им клубный пуш уходит без совпадения клуба. Всем остальным — строго по клубу.
const GLOBAL_ROLES = new Set(['chef', 'komdir', 'viewer']); // viewer видит всё — как в колокольчике

export async function pushNotify({ title, body = '', club = null, excludeEmail = '', url = '/', tag = '', roles = null, emails = null }) {
  try {
    const snap = await getDocs(collection(db, 'push_tokens'));
    const exclude = (excludeEmail || '').toLowerCase();
    const emailSet = Array.isArray(emails) && emails.length > 0
      ? new Set(emails.map(e => (e || '').toLowerCase()))
      : null;
    // Отличаем «общий пуш» (club не передан → null/undefined) от «клубного пуша»
    // (club передан, даже пустой). Клубный пуш НИКОГДА не уходит в другие клубы:
    // если клуб задан — только его сотрудникам + глобальным (club=null, шеф/Ком-Дир);
    // если клуб задан пустым/«ВСЕ» — только глобальным (не рассыпаем по всем клубам).
    const clubScoped = club !== null && club !== undefined;
    const clubNorm = (club || '').toString().trim().toUpperCase();
    const clubValid = clubScoped && clubNorm && clubNorm !== 'ВСЕ' && clubNorm !== 'ALL';
    const tokens = [];
    snap.docs.forEach(d => {
      const t = d.data();
      if (exclude && (t.email || '').toLowerCase() === exclude) return;
      if (emailSet && !emailSet.has((t.email || '').toLowerCase())) return; // адресная отправка
      if (clubScoped) {
        const tClub = (t.club || '').toUpperCase();
        const isGlobal = GLOBAL_ROLES.has(t.role || '');
        // Мультиклубный менеджер: токен хранит массив clubs — совпадение по любому из них
        const inClubs = Array.isArray(t.clubs) && t.clubs.some(c => (c || '').toUpperCase() === clubNorm);
        // Клубный пуш → ТОЛЬКО точное совпадение клуба ИЛИ глобальная роль (шеф/Ком-Дир).
        // Токен с пустым/чужим клубом у обычной роли больше НЕ получает — это фикс межклубной утечки.
        if (clubValid) {
          if (!isGlobal && tClub !== clubNorm && !inClubs) return;
        } else if (!isGlobal) {
          return; // club пустой/«ВСЕ» → только глобальным ролям
        }
      }
      if (Array.isArray(roles) && roles.length > 0 && !roles.includes(t.role || '')) return;
      tokens.push(d.id);
    });
    if (tokens.length === 0) return;
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, tag, tokens }),
    });
  } catch {}
}
