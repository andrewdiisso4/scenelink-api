(function () {
  'use strict';
  const params = new URLSearchParams(location.hash.slice(1));
  const mode = params.get('mode');
  let token = params.get('token');
  if (location.hash) history.replaceState(null, '', location.pathname);
  window.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('newsletterStatus');
    const title = document.getElementById('newsletterTitle');
    const button = document.getElementById('newsletterAction');
    if (!['confirm', 'unsubscribe'].includes(mode) || !/^[A-Za-z0-9_-]{43}$/.test(token || '')) {
      status.textContent = 'This link is invalid. Use the link in your SceneLink newsletter email.';
      return;
    }
    const confirm = mode === 'confirm';
    title.textContent = confirm ? 'Join the SceneLink newsletter' : 'Leave the SceneLink newsletter';
    button.textContent = confirm ? 'Confirm signup' : 'Unsubscribe';
    status.textContent = confirm ? 'Confirm to receive Boston venue picks and SceneLink updates.' : 'Press Unsubscribe to stop newsletter emails.';
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (button.disabled || !token) return;
      button.disabled = true;
      status.textContent = 'Saving…';
      try {
        const response = await fetch('/api/newsletter/' + mode, {
          method:'POST', credentials:'same-origin', cache:'no-store',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({token})
        });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error(result.error || 'Could not save your choice. Try again.');
        token = '';
        status.textContent = confirm ? 'You’re on the SceneLink newsletter list.' : 'You’re unsubscribed from the SceneLink newsletter.';
      } catch (err) {
        status.textContent = err.message || 'Could not save your choice. Try again.';
        button.disabled = false;
      }
    });
  }, {once:true});
})();
