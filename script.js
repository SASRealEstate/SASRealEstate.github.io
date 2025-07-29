// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyClkUIAwd4rkHLWMxVLKU59IW2RZkZUnNY",
  authDomain: "sas-realestate-c79bf.firebaseapp.com",
  projectId: "sas-realestate-c79bf",
  storageBucket: "sas-realestate-c79bf.appspot.com",
  messagingSenderId: "1014311982277",
  appId: "1:1014311982277:web:0cb545d498b32b90078cac",
  measurementId: "G-K849PQXV9S"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

let confirmationResult;
let recaptchaVerifier;

// Normalize Saudi phone numbers
function normalizePhone(input) {
  input = input.replace(/\D/g, '');
  if (input.startsWith('0')) input = input.slice(1);
  return '+966' + input;
}

// Initialize reCAPTCHA once on page load
window.onload = function () {
  // Render reCAPTCHA if login page is open
  if (document.getElementById('recaptcha-container')) {
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      'size': 'normal',
      'callback': (response) => {
        // Captcha solved
      }
    });
    recaptchaVerifier.render();
  }

  // Enforce login for AllLands.html
  auth.onAuthStateChanged(user => {
    const pathname = window.location.pathname;
    const currentPage = pathname.substring(pathname.lastIndexOf('/') + 1);

    if (!user && currentPage === "AllLands.html") {
      window.location.href = "login.html";
    }

    if (user && currentPage === "login.html") {
      window.location.href = "index.html";
    }
  });
};

// Send SMS code to phone
function sendCode() {
  const rawPhone = document.getElementById("phone").value;
  const phone = normalizePhone(rawPhone);


  auth.signInWithPhoneNumber(phone, recaptchaVerifier)
    .then(result => {
      confirmationResult = result;
      document.getElementById("verify-section").style.display = "block";
      document.getElementById("msg").innerText = "تم إرسال الرمز، يرجى التحقق من جوالك.";
    })
    .catch(error => {
      document.getElementById("msg").innerText = "خطأ: " + error.message;
    });
}

// Verify SMS code
function verifyCode() {
  const code = document.getElementById("code").value;

  confirmationResult.confirm(code)
    .then(result => {
      document.getElementById("msg").innerText = "تم التحقق! سيتم تحويلك...";
      setTimeout(() => window.location.href = "AllLands.html", 1000);
    })
    .catch(error => {
      document.getElementById("msg").innerText = "رمز غير صحيح.";
    });
}
