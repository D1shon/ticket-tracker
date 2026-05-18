// Script to create Firebase Auth user for saniya.o@hj.fit
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, fetchSignInMethodsForEmail } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCiDHP-Jj11LJdojVk_71VxxzvKT4TmayI",
  authDomain: "ticket-tracker-inky.firebaseapp.com",
  projectId: "ticket-tracker-inky",
  storageBucket: "ticket-tracker-inky.appspot.com",
  messagingSenderId: "898511478144",
  appId: "1:898511478144:web:e3f695427d14f479d20f9c"
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
