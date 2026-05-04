/* ------------------------------------------------------------------ */
/* Helpers shared by desktop + mobile forms                            */
/* ------------------------------------------------------------------ */
function makeAlertFns(alertEl) {
  return {
    show(msg, type = 'error') {
      alertEl.textContent = msg;
      alertEl.className = `login-alert login-alert-${type}`;
    },
    hide() { alertEl.className = 'login-alert hidden'; }
  };
}

function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : text;
}

async function doLogin({ email, password, rememberMe, btn, alert }) {
  if (!email || !password) return alert.show('Please enter your email and password.');
  setLoading(btn, true, 'Sign In');
  alert.hide();
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const data = await res.json();
    if (!data.ok) return alert.show(data.error);
    window.location.href = '/';
  } catch {
    alert.show('Connection error. Please try again.');
  } finally {
    setLoading(btn, false, 'Sign In');
  }
}

async function doRegister({ name, email, password, confirm, btn, alert }) {
  if (!name)               return alert.show('Please enter your name.');
  if (!email)              return alert.show('Please enter your email.');
  if (password.length < 8) return alert.show('Password must be at least 8 characters.');
  if (password !== confirm) return alert.show('Passwords do not match.');
  setLoading(btn, true, 'Create Account');
  alert.hide();
  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!data.ok) return alert.show(data.error);
    alert.show('Account created! Redirecting…', 'success');
    setTimeout(() => window.location.href = '/', 800);
  } catch {
    alert.show('Connection error. Please try again.');
  } finally {
    setLoading(btn, false, 'Create Account');
  }
}

/* ------------------------------------------------------------------ */
/* Desktop forms                                                        */
/* ------------------------------------------------------------------ */
const alert_ = makeAlertFns(document.getElementById('login-alert'));

function showTab(tab) {
  const isSignin = tab === 'signin';
  document.getElementById('tab-signin').classList.toggle('active', isSignin);
  document.getElementById('tab-signup').classList.toggle('active', !isSignin);
  document.getElementById('form-signin').classList.toggle('hidden', !isSignin);
  document.getElementById('form-signup').classList.toggle('hidden', isSignin);
  alert_.hide();
}
document.getElementById('tab-signin').addEventListener('click', () => showTab('signin'));
document.getElementById('tab-signup').addEventListener('click', () => showTab('signup'));

document.getElementById('form-signin').addEventListener('submit', (e) => {
  e.preventDefault();
  doLogin({
    email:      document.getElementById('si-email').value.trim(),
    password:   document.getElementById('si-password').value,
    rememberMe: document.getElementById('si-remember').checked,
    btn:        document.getElementById('btn-signin'),
    alert:      alert_,
  });
});

document.getElementById('form-signup').addEventListener('submit', (e) => {
  e.preventDefault();
  doRegister({
    name:     document.getElementById('su-name').value.trim(),
    email:    document.getElementById('su-email').value.trim(),
    password: document.getElementById('su-password').value,
    confirm:  document.getElementById('su-confirm').value,
    btn:      document.getElementById('btn-signup'),
    alert:    alert_,
  });
});

/* ------------------------------------------------------------------ */
/* Email domain check (desktop)                                        */
/* ------------------------------------------------------------------ */
let emailCheckTimer;
const emailInput  = document.getElementById('su-email');
const emailStatus = document.getElementById('email-status');

async function checkEmailDomain(email) {
  emailStatus.innerHTML = '<span class="email-checking">Checking…</span>';
  try {
    const res  = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    emailStatus.innerHTML = data.valid
      ? '<span class="email-valid">✓ Valid email</span>'
      : `<span class="email-invalid">✗ ${data.reason}</span>`;
  } catch { emailStatus.innerHTML = ''; }
}
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

/* ------------------------------------------------------------------ */
/* Mobile modal                                                         */
/* ------------------------------------------------------------------ */
const authModal  = document.getElementById('auth-modal');
const alertM_    = makeAlertFns(document.getElementById('login-alert-m'));

function openAuthModal(tab = 'signin') {
  authModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  showTabM(tab);
}
function closeAuthModal() {
  authModal.classList.remove('open');
  document.body.style.overflow = '';
}

// Open on nav button tap
document.getElementById('nav-signin-btn').addEventListener('click', () => openAuthModal('signin'));

// Close on overlay tap (not sheet)
authModal.addEventListener('click', (e) => {
  if (e.target === authModal) closeAuthModal();
});

function showTabM(tab) {
  const isSignin = tab === 'signin';
  document.getElementById('tab-signin-m').classList.toggle('active', isSignin);
  document.getElementById('tab-signup-m').classList.toggle('active', !isSignin);
  document.getElementById('form-signin-m').classList.toggle('hidden', !isSignin);
  document.getElementById('form-signup-m').classList.toggle('hidden', isSignin);
  alertM_.hide();
}
document.getElementById('tab-signin-m').addEventListener('click', () => showTabM('signin'));
document.getElementById('tab-signup-m').addEventListener('click', () => showTabM('signup'));

document.getElementById('form-signin-m').addEventListener('submit', (e) => {
  e.preventDefault();
  doLogin({
    email:      document.getElementById('si-email-m').value.trim(),
    password:   document.getElementById('si-password-m').value,
    rememberMe: document.getElementById('si-remember-m').checked,
    btn:        document.getElementById('btn-signin-m'),
    alert:      alertM_,
  });
});

document.getElementById('form-signup-m').addEventListener('submit', (e) => {
  e.preventDefault();
  doRegister({
    name:     document.getElementById('su-name-m').value.trim(),
    email:    document.getElementById('su-email-m').value.trim(),
    password: document.getElementById('su-password-m').value,
    confirm:  document.getElementById('su-confirm-m').value,
    btn:      document.getElementById('btn-signup-m'),
    alert:    alertM_,
  });
});

// "get started" hero button on mobile opens modal on signup tab
const heroGetStarted = document.querySelector('.v2-hero-ctas .v2-btn-pink');
if (heroGetStarted) {
  heroGetStarted.addEventListener('click', () => {
    if (window.innerWidth <= 800) {
      openAuthModal('signup');
    }
  });
}
