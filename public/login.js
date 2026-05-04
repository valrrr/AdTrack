/* ------------------------------------------------------------------ */
/* Tab switching                                                        */
/* ------------------------------------------------------------------ */
const tabSignin = document.getElementById('tab-signin');
const tabSignup = document.getElementById('tab-signup');
const formSignin = document.getElementById('form-signin');
const formSignup = document.getElementById('form-signup');
const alert_ = document.getElementById('login-alert');

function showTab(tab) {
  const isSignin = tab === 'signin';
  tabSignin.classList.toggle('active', isSignin);
  tabSignup.classList.toggle('active', !isSignin);
  formSignin.classList.toggle('hidden', !isSignin);
  formSignup.classList.toggle('hidden', isSignin);
  hideAlert();
}

tabSignin.addEventListener('click', () => showTab('signin'));
tabSignup.addEventListener('click', () => showTab('signup'));

/* ------------------------------------------------------------------ */
/* Alert helpers                                                        */
/* ------------------------------------------------------------------ */
function showAlert(msg, type = 'error') {
  alert_.textContent = msg;
  alert_.className = `login-alert login-alert-${type}`;
}
function hideAlert() {
  alert_.className = 'login-alert hidden';
}

/* ------------------------------------------------------------------ */
/* Button loading state                                                 */
/* ------------------------------------------------------------------ */
function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : text;
}

/* ------------------------------------------------------------------ */
/* Sign In                                                              */
/* ------------------------------------------------------------------ */
formSignin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email      = document.getElementById('si-email').value.trim();
  const password   = document.getElementById('si-password').value;
  const rememberMe = document.getElementById('si-remember').checked;
  const btn        = document.getElementById('btn-signin');

  if (!email || !password) return showAlert('Please enter your email and password.');

  setLoading(btn, true, 'Sign In');
  hideAlert();

  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const data = await res.json();
    if (!data.ok) return showAlert(data.error);
    window.location.href = '/';
  } catch {
    showAlert('Connection error. Please try again.');
  } finally {
    setLoading(btn, false, 'Sign In');
  }
});

/* ------------------------------------------------------------------ */
/* Email domain check                                                   */
/* ------------------------------------------------------------------ */
let emailCheckTimer;
const emailInput  = document.getElementById('su-email');
const emailStatus = document.getElementById('email-status');

emailInput.addEventListener('blur', () => {
  const email = emailInput.value.trim();
  if (!email) { emailStatus.innerHTML = ''; return; }
  checkEmailDomain(email);
});

emailInput.addEventListener('input', () => {
  emailStatus.innerHTML = '';
  clearTimeout(emailCheckTimer);
  const email = emailInput.value.trim();
  if (!email.includes('@') || !email.includes('.')) return;
  emailCheckTimer = setTimeout(() => checkEmailDomain(email), 600);
});

async function checkEmailDomain(email) {
  emailStatus.innerHTML = '<span class="email-checking">Checking…</span>';
  try {
    const res  = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.valid) {
      emailStatus.innerHTML = '<span class="email-valid">✓ Valid email</span>';
    } else {
      emailStatus.innerHTML = `<span class="email-invalid">✗ ${data.reason}</span>`;
    }
  } catch {
    emailStatus.innerHTML = '';
  }
}

/* ------------------------------------------------------------------ */
/* Create Account                                                       */
/* ------------------------------------------------------------------ */
formSignup.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name     = document.getElementById('su-name').value.trim();
  const email    = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value;
  const confirm  = document.getElementById('su-confirm').value;
  const btn      = document.getElementById('btn-signup');

  if (!name)                      return showAlert('Please enter your name.');
  if (!email)                     return showAlert('Please enter your email.');
  if (password.length < 8)        return showAlert('Password must be at least 8 characters.');
  if (password !== confirm)       return showAlert('Passwords do not match.');

  setLoading(btn, true, 'Create Account');
  hideAlert();

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!data.ok) return showAlert(data.error);
    showAlert('Account created! Redirecting…', 'success');
    setTimeout(() => window.location.href = '/', 800);
  } catch {
    showAlert('Connection error. Please try again.');
  } finally {
    setLoading(btn, false, 'Create Account');
  }
});

/* ------------------------------------------------------------------ */
/* Vercel env-var setup panel                                           */
