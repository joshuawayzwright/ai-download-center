/* No third-party SDK, cookies, storage, fingerprinting or identity-based click tracking. */
(() => {
  const form = document.querySelector('#launch-notify-form');
  if (!form) return;
  const config = window.SOLO_LAUNCH_CONFIG || {};
  const email = form.querySelector('[name="email"]');
  const interest = form.querySelector('[name="interest"]');
  const consent = form.querySelector('[name="consent"]');
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#launch-notify-status');
  const honeypot = form.querySelector('[name="website"]');
  const allowed = new Set(Array.from(interest.options, option => option.value));
  const page = document.body.dataset.launchPage;
  const sent = new Set();
  let pending = false;
  let request = null;
  let generation = 0;

  function metric(event, product) {
    if (config.metricsEnabled !== true || navigator.doNotTrack === '1' ||
        navigator.globalPrivacyControl === true || !allowed.has(product)) return;
    const key = event + ':' + product;
    if (sent.has(key)) return;
    sent.add(key);
    // Never include email, URL, query string, referrer, device or visitor ID.
    fetch('/api/launch-interest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      body: JSON.stringify({ event, product, page })
    }).catch(() => {}); // Optional measurement must not block navigation or signup.
  }

  document.querySelectorAll('[data-launch-interest]').forEach(link => {
    link.addEventListener('click', () => {
      const product = link.dataset.launchInterest;
      if (!allowed.has(product)) return;
      interest.value = product;
      metric('product_interest', product);
      email.focus({ preventScroll: true });
    });
  });

  function resetPending() {
    pending = false;
    button.disabled = config.subscriptionsEnabled !== true;
    form.removeAttribute('aria-busy');
  }

  if (config.subscriptionsEnabled === true) {
    button.disabled = false;
    status.textContent = 'Choose your product interest and confirm your email permission below.';
  } else {
    button.disabled = true;
    status.textContent = 'Preview only: launch email signup is not open yet. No information is submitted.';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || config.subscriptionsEnabled !== true) return;
    if (!form.reportValidity() || !consent.checked || !allowed.has(interest.value)) return;
    if (honeypot.value) {
      status.textContent = 'We could not submit this request. Please use the support email for help.';
      return;
    }
    const address = email.value.trim();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      status.textContent = 'Enter a valid email address.';
      email.focus();
      return;
    }
    const product = interest.value;
    const current = ++generation;
    const controller = new AbortController();
    request = controller;
    pending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your request…';
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        'https://a.klaviyo.com/client/subscriptions/?company_id=' + encodeURIComponent(config.companyId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.api+json', revision: config.revision },
          credentials: 'omit', referrerPolicy: 'no-referrer', signal: request.signal,
          body: JSON.stringify({ data: {
            type: 'subscription',
            attributes: {
              custom_source: 'SOLO launch updates — consent v1 — ' + page,
              profile: { data: { type: 'profile', attributes: {
                email: address,
                subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                properties: { 'SOLO Signup Source': 'Website launch form',
                  'SOLO Product Interest': product, 'SOLO Consent Version': 'launch-updates-v1' }
              } } }
            },
            relationships: { list: { data: { type: 'list', id: config.listId } } }
          } })
        }
      );
      if (current !== generation) return;
      if (response.status !== 202) {
        status.textContent = response.status === 429
          ? 'Too many attempts. Please wait before trying again. No subscription is confirmed here.'
          : 'We could not confirm that your request was accepted. Try again later or contact support.';
        return;
      }
      metric('signup_request_accepted', product);
      status.textContent = 'Request accepted. If confirmation is needed, check your inbox and spam folder for an email from The Solo Service Provider. Follow its link to confirm. This page does not confirm a subscription or reserve product access.';
      // Clear only the submitted draft; preserve anything typed while the request was pending.
      if (email.value.trim() === address) { email.value = ''; consent.checked = false; }
    } catch (error) {
      if (current !== generation) return;
      status.textContent = 'We could not confirm the result. Your request may have reached the email service. Check your inbox before retrying, or contact support.';
    } finally {
      clearTimeout(timeout);
      if (current === generation) { request = null; resetPending(); }
    }
  });
  window.addEventListener('pagehide', () => {
    generation++;
    request?.abort();
    request = null;
    resetPending();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      consent.checked = false;
      status.textContent = config.subscriptionsEnabled === true
        ? 'Check your inbox if you already submitted a request. You can enter a new request below.'
        : 'Preview only: launch email signup is not open yet. No information is submitted.';
      resetPending();
    }
  });
})();
