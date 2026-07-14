// Shared push sender: resolves recipient tokens with the client SDK
// (server-side Firestore reads hit Spark quota limits), then calls the API.
// Filters: the actor never gets their own push; club events go to that club's
// staff + chefs (club=null tokens see everything).
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export async function pushNotify({ title, body = '', club = null, excludeEmail = '', url = '/', tag = '' }) {
  try {
    const snap = await getDocs(collection(db, 'push_tokens'));
    const exclude = (excludeEmail || '').toLowerCase();
    const tokens = [];
    snap.docs.forEach(d => {
      const t = d.data();
      if (exclude && (t.email || '').toLowerCase() === exclude) return;
      if (club && t.club && (t.club || '').toUpperCase() !== (club || '').toUpperCase()) return;
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
