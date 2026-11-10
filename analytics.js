'use strict';

// Google Analytics 4. Set gaMeasurementId in config.js to turn it on.
(function () {
  const id = (window.SITE_CONFIG && window.SITE_CONFIG.gaMeasurementId) || '';
  if (!/^G-[A-Z0-9]{4,20}$/.test(id)) return;
  // Respect the visitor's Global Privacy Control or Do Not Track setting.
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted'
  });
  window.gtag('js', new Date());
  window.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  const loader = document.createElement('script');
  loader.async = true;
  loader.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(loader);
}());
