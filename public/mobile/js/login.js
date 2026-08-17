document.addEventListener('DOMContentLoaded', async () => {
  // If already authenticated, skip to home
  const me = await API.get('/api/me');
  if (me && me.success) { location.replace('/unifiedsmi/m/home'); return; }

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const data = await fetch('/unifiedsmi/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      })
    }).then(r => r.json()).catch(() => null);

    if (data && data.success) {
      location.replace('/unifiedsmi/m/home');
    } else {
      UI.toast(data?.message || 'Invalid credentials', 'error');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
});
