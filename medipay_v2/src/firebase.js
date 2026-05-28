import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInEmail = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signUpEmail  = (email, pw) => createUserWithEmailAndPassword(auth, email, pw);
export const logOut = () => signOut(auth);

export async function getPatientRecord(uid) {
  const snap = await getDoc(doc(db, "patients", uid));
  return snap.exists() ? snap.data() : null;
}

export async function savePatientRecord(uid, data) {
  await setDoc(doc(db, "patients", uid), data, { merge: true });
}

export async function updatePatientRecord(uid, data) {
  await updateDoc(doc(db, "patients", uid), data);
}
