// Script to create Firebase Auth user for saniya.o@hj.fit
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, fetchSignInMethodsForEmail } from 'firebase/auth';

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

const EMAIL = 'ainura030594@gmail.com';
const PASSWORD = 'HeroTrack2026!';
const DISPLAY_NAME = 'Айнура (NURLY ORDA)';

async function main() {
  try {
    // Check if user already exists
    const methods = await fetchSignInMethodsForEmail(auth, EMAIL);
    if (methods.length > 0) {
      console.log(`✅ Пользователь ${EMAIL} уже существует в Firebase Auth.`);
      console.log(`   Методы входа: ${methods.join(', ')}`);
      process.exit(0);
    }
  } catch (e) {
    // fetchSignInMethods may fail — continue to creation
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    await updateProfile(cred.user, { displayName: DISPLAY_NAME });
    console.log(`✅ Пользователь создан успешно!`);
    console.log(`   UID: ${cred.user.uid}`);
    console.log(`   Email: ${cred.user.email}`);
    console.log(`   DisplayName: ${DISPLAY_NAME}`);
    console.log(`   Роль в приложении: manager (клуб 4YOU)`);
    process.exit(0);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`✅ Пользователь ${EMAIL} уже существует в Firebase Auth.`);
      process.exit(0);
    }
    console.error(`❌ Ошибка: ${err.code} — ${err.message}`);
    process.exit(1);
  }
}

main();
