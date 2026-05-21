import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey:      import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:   import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:       import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

let app = null;
export let db = null;
export let auth = null;

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
}

export async function firebaseSignIn() {
  if (!firebaseEnabled) {
    // Fallback offline UID so single-player still works without Firebase configured.
    return "local-" + Math.random().toString(36).slice(2, 10);
  }
  await signInAnonymously(auth);
  return auth.currentUser.uid;
}
