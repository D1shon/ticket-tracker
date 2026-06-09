import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = {
  apiKey: "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain: "hjtrack-928f5.firebaseapp.com",
  projectId: "hjtrack-928f5",
  storageBucket: "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId: "1:236581443884:web:a9ce84dcbf0efc59267489"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log("Signing in anonymously...");
  await signInAnonymously(auth);
  console.log("Signed in successfully!");

  const filePath = "scratch/notion_guidebook_full_api.json";
  const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));

  console.log("Uploading to Firestore under collection 'guidebook'...");
  for (const page of fileData) {
    if (page.blocks.length === 0) continue;
    const docRef = doc(db, "guidebook", page.pageId);
    await setDoc(docRef, {
      id: page.pageId,
      title: page.title.trim(),
      section: page.section,
      subsection: page.subsection,
      blocks: page.blocks
    });
    console.log(`Uploaded page: "${page.title.trim()}"`);
  }
  console.log("Successfully uploaded all pages to Firestore!");
}

main().catch(err => {
  console.error("Firestore upload failed:", err);
});
