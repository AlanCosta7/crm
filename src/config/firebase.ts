import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Configuração obtida das variáveis de ambiente (.env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Instâncias dos Serviços
export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const rtdb     = getDatabase(app);
export const storage  = getStorage(app);
export const functions = getFunctions(app, 'southamerica-east1');

// Conecta aos Emuladores Locais se estiver em ambiente de Desenvolvimento
if (import.meta.env.DEV) {
  console.log('[Firebase Config] Conectando aos emuladores do Firebase...');
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  } catch (error) {
    console.warn('[Firebase Config] Emuladores já conectados ou offline:', error);
  }
}

export default app;
