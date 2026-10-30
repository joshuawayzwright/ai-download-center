(() => {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'solo-guide-trigger';
  trigger.setAttribute('aria-controls', 'solo-site-guide');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Open SOLO site guide');

  const mark = document.createElement('img');
  mark.src = '/assets/approved-stage/solo-ai-mark-v4.svg';
  mark.alt = '';
  mark.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'ASK SOLO';
  trigger.append(mark, label);

  const panel = document.createElement('section');
  panel.className = 'solo-guide-panel';
  panel.id = 'solo-site-guide';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'SOLO site guide');
  panel.hidden = true;
  panel.innerHTML = '<h2>SOLO SITE GUIDE <button type="button" aria-label="Close SOLO guide">×</button></h2><p>Explore the products, projects and support pages. Live generative AI is still in development.</p><form><input aria-label="Ask SOLO about the site" maxlength="250" placeholder="Products, apps, support..."><button type="submit">ASK</button></form><div role="status" aria-live="polite"></div>';
  document.body.append(trigger, panel);

  const input = panel.querySelector('input');
  const status = panel.querySelector('[role=status]');
  const close = (restoreFocus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    if (!panel.hidden) {
      close(true);
      return;
    }
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  panel.querySelector('h2 button').addEventListener('click', () => close(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close(true);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });

  panel.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const topic = input.value.trim().toLowerCase();
    if (!topic) {
      status.textContent = 'Enter a topic such as products, SOLO AI or support.';
      input.focus();
      return;
    }
    const url = /support|contact|refund/.test(topic) ? '/contact.html'
      : /app|solo|project/.test(topic) ? '/solo-ai.html'
      : '/digital-products.html';
    status.textContent = 'Relevant page: ';
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    status.append(link);
  });

  // Keep the approved SOLO mark accessible outside the catalogue without
  // obscuring product titles or calls-to-action while scrolling on phones.
  const products = document.getElementById('products');
  if (products && typeof IntersectionObserver === 'function' && typeof window.matchMedia === 'function') {
    const mobile = window.matchMedia('(max-width: 760px)');
    let productsVisible = false;
    const update = () => {
      const hidden = mobile.matches && productsVisible;
      trigger.classList.toggle('solo-guide-products-hidden', hidden);
      trigger.disabled = hidden;
      trigger.setAttribute('aria-hidden', String(hidden));
      if (hidden) close();
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === products) {
          productsVisible = entry.isIntersecting;
          update();
        }
      }
    }, { threshold: 0 });
    observer.observe(products);
    if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', update);
    update();
  }
})();
