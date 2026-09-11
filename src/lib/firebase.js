import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain: "hjtrack-928f5.firebaseapp.com",
  projectId: "hjtrack-928f5",
  storageBucket: "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId: "1:236581443884:web:a9ce84dcbf0efc59267489"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persistent local cache: data renders instantly from disk on startup,
// the network only syncs deltas (also massively cuts Firestore reads)
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  _db = getFirestore(app);
}
export const db = _db;

// Переполненный IndexedDB (фото товаров лежат base64 прямо в документах и
// оседают в кэше на диске) валит записи с «Quota exceeded» — и лечится только
// сбросом локального кэша. Данные при этом не теряются: всё живёт на сервере,
// кэш пересоберётся с нуля при следующей загрузке.
export const resetLocalCache = async () => {
  try {
    const { terminate, clearIndexedDbPersistence } = await import('firebase/firestore');
    await terminate(_db);
    await clearIndexedDbPersistence(_db);
  } catch {
    // clearIndexedDbPersistence падает, если открыты другие вкладки —
    // сносим базы напрямую, это тот же результат
    try {
      const dbs = (await indexedDB.databases?.()) || [];
      await Promise.all(
        dbs.filter(d => /firestore/i.test(d.name || ''))
           .map(d => new Promise(res => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))
      );
    } catch {}
  }
  window.location.reload();
};

// iOS/Safari в фоне рвёт соединение вкладки с IndexedDB — после возврата
// Firestore не может писать («Connection to Indexed Database server lost»),
// лечится только перезагрузкой. Проверяем кэш пробным чтением при каждом
// возврате в приложение и перезагружаемся сами, пока форма ещё пустая.
if (typeof document !== 'undefined') {
  let probing = false;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || probing) return;
    probing = true;
    try {
      const { doc, getDocFromCache } = await import('firebase/firestore');
      await getDocFromCache(doc(db, '_health', 'probe'));
    } catch (e) {
      // «not found in cache» — норма (кэш жив); перезагружаемся только
      // на реальной смерти IndexedDB
      if (/Indexed/i.test(String(e?.message || e))) window.location.reload();
    } finally {
      probing = false;
    }
  });
}
// Storage SDK загружается лениво — нужен только при загрузке файлов
export const getStorageLazy = async () => {
  const { getStorage } = await import("firebase/storage");
  return getStorage(app);
};
