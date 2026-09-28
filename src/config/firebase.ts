import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
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
//
// As portas são parametrizáveis (VITE_EMU_*) para o E2E poder subir num segundo
// conjunto de portas — o de `firebase.emutest.json` — sem colidir com o emulador
// de desenvolvimento que alguém já tenha rodando na máquina. Os defaults são as
// portas de `firebase.json`, então nada muda no fluxo normal de `npm run dev`.
if (import.meta.env.DEV) {
  const emuPort = (name: string, fallback: number): number => {
    const raw = import.meta.env[`VITE_EMU_${name}_PORT` as keyof ImportMetaEnv];
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const authPort      = emuPort('AUTH', 9099);
  const firestorePort = emuPort('FIRESTORE', 8080);
  const databasePort  = emuPort('DATABASE', 9000);
  const functionsPort = emuPort('FUNCTIONS', 5001);
  const storagePort   = emuPort('STORAGE', 9199);

  console.log(`[Firebase Config] Conectando aos emuladores (auth:${authPort} firestore:${firestorePort})...`);
  try {
    connectAuthEmulator(auth, `http://localhost:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', firestorePort);
    connectDatabaseEmulator(rtdb, 'localhost', databasePort);
    connectFunctionsEmulator(functions, 'localhost', functionsPort);
    connectStorageEmulator(storage, 'localhost', storagePort);
  } catch (error) {
    console.warn('[Firebase Config] Emuladores já conectados ou offline:', error);
  }
}

export default app;
