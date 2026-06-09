import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
const storage = getStorage(app);

async function main() {
  console.log("Signing in anonymously...");
  await signInAnonymously(auth);
  console.log("Signed in successfully!");

  const filePath = "scratch/notion_guidebook_full_api.json";
  const fileData = fs.readFileSync(filePath);

  console.log("Uploading to Firebase Storage...");
  let storageRef = ref(storage, "guidebook/data.json");
  try {
    await uploadBytes(storageRef, fileData, { contentType: "application/json" });
    console.log("Uploaded successfully to guidebook/data.json!");
  } catch (err) {
    console.warn("Failed uploading to guidebook/data.json, trying attachments/guidebook_data.json...", err.message);
    storageRef = ref(storage, "attachments/guidebook_data.json");
    await uploadBytes(storageRef, fileData, { contentType: "application/json" });
    console.log("Uploaded successfully to attachments/guidebook_data.json!");
  }

  const url = await getDownloadURL(storageRef);
  console.log("Download URL:", url);
  
  fs.writeFileSync("scratch/guidebook_url.txt", url);
  console.log("Saved URL to scratch/guidebook_url.txt");
}

main().catch(err => {
  console.error("Upload failed:", err);
});
