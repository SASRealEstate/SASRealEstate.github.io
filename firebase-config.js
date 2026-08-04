// إعدادات Firebase لمشروع تطوير ساس العقارية
const firebaseConfig = {
  apiKey: "AIzaSyCz2gI3p-pVS8uikzgqj1Y-oVXRwQzuz4U",
  authDomain: "sas-realestate-c79bf.firebaseapp.com",
  projectId: "sas-realestate-c79bf",
  storageBucket: "sas-realestate-c79bf.firebasestorage.app",
  messagingSenderId: "1014311982277",
  appId: "1:1014311982277:web:7d76ca91469a38c3078cac"
};

try {
  if (!firebaseConfig.apiKey.startsWith("PASTE_")) {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore();
    if (firebase.auth) window.auth = firebase.auth();
  }
} catch (e) {
  console.warn("Firebase غير مُهيأ بعد", e);
}
