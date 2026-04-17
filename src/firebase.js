import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// REPLACE THESE WITH YOUR FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyBUI2MenP1BhR5d1GiKSD4DCJ8ZT1zlRME",
  authDomain: "cashewtracker-app.firebaseapp.com",
  projectId: "cashewtracker-app",
  storageBucket: "cashewtracker-app.firebasestorage.app",
  messagingSenderId: "994230872360",
  appId: "1:994230872360:web:4552220b618609ca5dc81d"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
