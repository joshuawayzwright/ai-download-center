// Site settings for listings and revenue. Edit these values; no other code changes are needed.
window.SITE_CONFIG = {
  repoUrl: 'https://github.com/joshuawayzwright/ai-download-center',

  // Paid featured listing. Paste a Stripe Payment Link, Gumroad or Lemon Squeezy checkout URL here.
  // While it is empty, the "Get featured" button opens a GitHub request form instead.
  featuredCheckoutUrl: 'https://buy.stripe.com/7sYfZh9Tcb1hfQQ6dFeAg08',
  featuredPrice: '$99 USD',
  featuredPeriod: 'per month',

  // Where sponsors manage or cancel their subscription. Paste the Stripe customer portal login link
  // (Stripe Dashboard > Settings > Billing > Customer portal > "Login link"), e.g. https://billing.stripe.com/p/login/...
  billingPortalUrl: 'https://billing.stripe.com/p/login/eVq00je9s5GX8oobxZeAg00',
  // A public contact address for sponsors (shown on the confirmation page). Leave empty to hide it.
  supportEmail: 'hello@thesoloserviceprovider.com.au',
  // The business name customers see on Stripe checkout and their card statement.
  merchantName: 'The Solo Service Provider',

  // Email newsletter. While both are empty, the signup box stays hidden on every page.
  // Easiest: paste your provider's hosted subscribe page (Beehiiv, Kit, Substack, ...) into newsletterSignupUrl.
  // Optional: for an email box on the page itself, paste the provider's HTML form "action" URL into
  // newsletterFormAction and the name of its email field into newsletterEmailField. This takes priority.
  newsletterSignupUrl: '',
  newsletterFormAction: '',
  newsletterEmailField: 'email',

  // Google Analytics 4 Measurement ID (Admin > Data streams > Web), e.g. 'G-ABC123XYZ9'.
  // While it is empty, no analytics code loads.
  gaMeasurementId: 'G-18D31VQ9SB',
};
