/* Progressive enhancement: navigation remains visible if JavaScript is unavailable. */
(() => {
  const nav = document.querySelector('.nav');
  const toggle = nav?.querySelector('.nav-toggle');
  const links = nav?.querySelector('#primary-links');
  if (!toggle || !links) return;
  const mobile = window.matchMedia('(max-width: 800px)');
  const close = (restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };
  toggle.hidden = false;
  nav.classList.add('nav-enhanced');
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
  });
  nav.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      close(true);
    }
  });
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) close();
  });
  nav.addEventListener('focusout', (event) => {
    if (!nav.contains(event.relatedTarget)) close();
  });
  mobile.addEventListener('change', () => {
    const focusWillHide = mobile.matches && links.contains(document.activeElement);
    close(focusWillHide);
  });
  window.addEventListener('pageshow', () => close());
  window.addEventListener('hashchange', () => close());
})();
