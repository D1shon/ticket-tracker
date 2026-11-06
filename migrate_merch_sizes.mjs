// Переименование размера мерча XL-XXL → 2XL-3XL.
// 1) merch_products: остаток sizes["XL-XXL"] складывается в sizes["2XL-3XL"], старый ключ удаляется.
// 2) merch_transfers (pending): поле size меняется, чтобы приёмка не возродила старый ключ.
// История (merch_sales/merch_history) не трогается — там размер лишь текст прошлых операций.
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, updateDoc, doc, deleteField } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain: "hjtrack-928f5.firebaseapp.com",
  projectId: "hjtrack-928f5",
  storageBucket: "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId: "1:236581443884:web:a9ce84dcbf0efc59267489"
};

const OLD = "XL-XXL";
const NEW = "2XL-3XL";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  await signInAnonymously(auth);

  const products = await getDocs(collection(db, "merch_products"));
  let migrated = 0;
  for (const d of products.docs) {
    const sizes = d.data().sizes;
    if (!sizes || sizes[OLD] === undefined) continue;
    const merged = (parseInt(sizes[OLD]) || 0) + (parseInt(sizes[NEW]) || 0);
    console.log(`product ${d.id} «${d.data().name}» (${d.data().club}): ${OLD}=${sizes[OLD]} → ${NEW}=${merged}`);
    await updateDoc(doc(db, "merch_products", d.id), {
      [`sizes.${NEW}`]: merged,
      [`sizes.${OLD}`]: deleteField(),
    });
    migrated++;
  }
  console.log(`merch_products: migrated ${migrated} of ${products.size}`);

  const transfers = await getDocs(collection(db, "merch_transfers"));
  let fixed = 0;
  for (const d of transfers.docs) {
    const t = d.data();
    if (t.status !== "pending" || t.size !== OLD) continue;
    console.log(`transfer ${d.id} «${t.productName}» ${t.fromClub}→${t.toClub}: size ${OLD} → ${NEW}`);
    await updateDoc(doc(db, "merch_transfers", d.id), { size: NEW });
    fixed++;
  }
  console.log(`merch_transfers (pending): fixed ${fixed} of ${transfers.size}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
