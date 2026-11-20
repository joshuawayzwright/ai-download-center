// Shows the newsletter signup once a provider is set in config.js. Loads no third-party code:
// the visitor's email goes to the provider only when they submit the form or open its page.
(function () {
  const config = window.SITE_CONFIG || {};
  const isHttps = (value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  };

  function setup(block) {
    const form = block.querySelector('[data-newsletter-form]');
    const link = block.querySelector('[data-newsletter-link]');
    if (form && isHttps(config.newsletterFormAction)) {
      form.action = config.newsletterFormAction;
      const input = form.querySelector('input[type="email"]');
      if (input) input.name = config.newsletterEmailField || 'email';
      form.hidden = false;
      if (link) link.hidden = true;
    } else if (link && isHttps(config.newsletterSignupUrl)) {
      link.href = config.newsletterSignupUrl;
      link.hidden = false;
      if (form) form.hidden = true;
    } else {
      return; // No provider configured: keep the whole block hidden.
    }
    block.hidden = false;
  }

  function init() {
    document.querySelectorAll('[data-newsletter]').forEach(setup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
