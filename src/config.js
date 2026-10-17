/* global __SITE__ */
/** Public site settings injected at build time from site.config.js (see build/sitePlugin.js). */
const fallback = { siteUrl: '', feedbackFormUrl: '', analytics: false, version: '' };

export const SITE = typeof __SITE__ !== 'undefined' ? { ...fallback, ...__SITE__ } : fallback;
