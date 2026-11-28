'use strict';

const {shell} = require('./gate.cjs');

// Overrides one exact canonical confirmation request. Fetch's same-origin
// mode may serialize Origin as null under no-referrer; strict-origin sends
// only the origin, never a path, query or fragment. Keep the page itself
// no-referrer. The host cookie is never sent off-origin or persisted by JS.
function recoveryFetch() {
  const request = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    if (input !== '/api/auth/verification/confirm' || options?.method !== 'POST')
      throw new Error('Unexpected verification request');
    const response = await request(input, {...options,credentials:'same-origin',referrerPolicy:'strict-origin'});
    document.getElementById('qaUnlockRecovery').hidden = response.status !== 401;
    return response;
  };
}

function makeVerificationLanding(canonical) {
  const scripts = '('+recoveryFetch.toString()+')();\n' + canonical;
  if (/<\/script/i.test(scripts)) throw new Error('Unsafe verification script');
  const body = '<p>Confirm your email for the SceneLink test account. This does not affect your production account.</p>' +
    '<button id="verifySubmit" type="button" disabled>Confirm email</button>' +
    '<p id="verifyStatus" role="status" aria-live="polite" aria-atomic="true">Checking the link…</p>' +
    '<p id="qaUnlockRecovery" hidden><a href="/__acceptance/" target="_blank" rel="noopener noreferrer">Unlock the private SceneLink test environment</a> in the new tab, then return here and select Confirm email again.</p>' +
    '<noscript><p>JavaScript is required. No verification request has been sent.</p></noscript>';
  return shell('Confirm your SceneLink test email',body)
    .replace('<main>','<main class="sl-account-card">')
    .replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="referrer" content="no-referrer"><script>'+scripts+'</script>');
}

module.exports={makeVerificationLanding};
