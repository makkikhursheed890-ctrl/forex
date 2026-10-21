import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEY9o8xLvmMX69Ttk6lwK5Usu-61MDn-o",
  authDomain: "forex-22cb3.firebaseapp.com",
  projectId: "forex-22cb3",
  storageBucket: "forex-22cb3.firebasestorage.app",
  messagingSenderId: "158417452176",
  appId: "1:158417452176:web:03109b89c48ceb0ae06c15",
  measurementId: "G-2WGRX6502C",
};

const form = document.getElementById("authForm");
const nameInput = document.getElementById("authName");
const nameField = document.getElementById("authNameField");
const emailInput = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const submitButton = document.getElementById("authSubmit");
const message = document.getElementById("authMessage");
const title = document.getElementById("authTitle");
const description = document.getElementById("authDescription");
const modeToggle = document.getElementById("authModeToggle");
const switchPrompt = document.getElementById("authSwitchPrompt");
const passwordHint = document.getElementById("authPasswordHint");
const forgotButton = document.getElementById("forgotPassword");
const passwordToggle = document.getElementById("toggleAuthPassword");
let isSignUp = false;
let auth;

function showMessage(text, kind = "error") {
  message.textContent = text;
  message.classList.toggle("is-error", kind === "error");
  message.classList.toggle("is-success", kind === "success");
  message.hidden = false;
}

function errorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists for this email. Sign in instead.",
    "auth/invalid-credential": "That email and password combination was not recognized.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
    "auth/user-disabled": "This account is currently disabled. Contact support for help.",
    "auth/too-many-requests": "Too many attempts. Please wait a little and try again.",
    "auth/network-request-failed": "Connection problem. Check your internet and try again.",
    "auth/operation-not-allowed": "Email and password sign-in is not enabled for this Firebase project yet.",
  };
  return messages[error?.code] || "We could not complete that request. Please try again.";
}

function setMode(signUp) {
  isSignUp = signUp;
  nameField.hidden = !signUp;
  nameInput.required = signUp;
  passwordInput.autocomplete = signUp ? "new-password" : "current-password";
  title.textContent = signUp ? "Create your account" : "Welcome back";
  description.textContent = signUp
    ? "Set up your PipsPath account to keep your workspace in sync."
    : "Sign in to continue to your PipsPath workspace.";
  submitButton.querySelector("span").textContent = signUp ? "Create account" : "Sign in";
  passwordHint.textContent = signUp ? "Use at least 6 characters." : "Your password is kept private.";
  forgotButton.hidden = signUp;
  switchPrompt.textContent = signUp ? "Already have an account?" : "New to PipsPath?";
  modeToggle.textContent = signUp ? "Sign in" : "Create an account";
  message.hidden = true;
}

modeToggle.addEventListener("click", () => setMode(!isSignUp));
window.pipsStartSignup = () => {
  setMode(true);
  window.pipsNavigate?.("loginView");
  window.setTimeout(() => nameInput.focus(), 80);
};
passwordToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  passwordToggle.textContent = show ? "Hide" : "Show";
  passwordToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
});

forgotButton.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    showMessage("Enter your email address first, then choose Forgot password again.");
    return;
  }
  forgotButton.disabled = true;
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("If an account uses that email, a password reset link is on its way.", "success");
  } catch (error) {
    showMessage(errorMessage(error));
  } finally {
    forgotButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = true;
  if (!form.reportValidity()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim();
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = isSignUp ? "Creating account…" : "Signing in…";
  try {
    if (isSignUp) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(credential.user, { displayName: name });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    window.pipsNavigate?.("homeView");
  } catch (error) {
    showMessage(errorMessage(error));
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = isSignUp ? "Create account" : "Sign in";
  }
});

try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  window.pipsUpdateAuthProfile = async (displayName) => {
    if (!auth.currentUser) throw new Error("No signed-in account.");
    await updateProfile(auth.currentUser, { displayName });
    window.pipsApplyAuthState?.(auth.currentUser);
  };
  window.pipsSignOut = () => signOut(auth);
  onAuthStateChanged(auth, (user) => {
    window.pipsApplyAuthState?.(user);
    if (user) window.pipsNavigate?.("homeView");
  });
} catch (error) {
  console.error("Firebase Authentication initialization failed:", error);
  showMessage("Firebase could not connect. Open this site through a local or hosted web server and try again.");
}
