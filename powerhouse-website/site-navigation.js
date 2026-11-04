/* Progressive enhancement: navigation remains visible if JavaScript is unavailable. */
(() => {
  const serviceHref = '/revenue-rescue.html';
  const nav = document.querySelector('.nav');
  const links = nav?.querySelector('#primary-links');
  const createServiceLink = (label) => {
    const link = document.createElement?.('a');
    if (!link) return null;
    link.href = serviceHref;
    link.textContent = label;
    return link;
  };

  if (links && !links.querySelector?.('a[href="/revenue-rescue.html"]')) {
    const serviceLink = createServiceLink('SERVICES');
    const contactLink = links.querySelector?.('a[href="/contact.html"]');
    if (serviceLink && contactLink && links.insertBefore) links.insertBefore(serviceLink, contactLink);
    else if (serviceLink) links.append?.(serviceLink);
  }

  document.querySelectorAll?.('.founder-actions a.button')?.forEach((link) => {
    if ((link.textContent || '').trim().toUpperCase().includes('WORK WITH ME')) link.href = serviceHref;
  });

  document.querySelectorAll?.('footer .footerlinks')?.forEach((group) => {
    if (group.querySelector?.('a[href="/revenue-rescue.html"]')) return;
    const serviceLink = createServiceLink('Revenue Rescue');
    if (serviceLink) group.append?.(serviceLink);
  });

  const toggle = nav?.querySelector('.nav-toggle');
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
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close(true);
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
