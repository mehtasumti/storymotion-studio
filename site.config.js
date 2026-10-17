/**
 * StoryMotion Studio — public site settings.
 *
 * Every value can be overridden at build time with an environment variable
 * (set them in Cloudflare → Workers & Pages → storymotion-studio → Settings →
 * Build → Variables and secrets, or in a local `.env` file). Leave a value empty
 * to switch the feature off: the related button, script and privacy-notice
 * section are then left out of the build.
 *
 * These values end up in public HTML, so never put secrets here.
 */
export default {
  /** Public origin without a trailing slash. Used for canonical URLs, Open Graph, robots.txt and sitemap.xml. Env: SITE_URL */
  siteUrl: 'https://storymotion-studio.sumti-mehta-01.workers.dev',

  /** Google Form link for the "Send feedback" button, e.g. https://forms.gle/… or https://docs.google.com/forms/d/e/…/viewform. Env: FEEDBACK_FORM_URL */
  feedbackFormUrl: '',

  /** Cloudflare Web Analytics site token (32 hex characters, from the JS snippet). Env: CF_ANALYTICS_TOKEN */
  cfAnalyticsToken: '',

  /** Optional contact e-mail shown on the privacy and terms pages. Env: CONTACT_EMAIL */
  contactEmail: '',

  /** Shown on the privacy notice and terms. Update it whenever you change either page. */
  legalLastUpdated: '17 October 2026',
};
