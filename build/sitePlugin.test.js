import { describe, expect, it } from 'vitest';
import {
  PUBLIC_PAGES,
  SiteConfigError,
  applyConditionals,
  pagePathFor,
  renderHtml,
  resolveSiteConfig,
  robotsTxt,
  sitemapXml,
} from './sitePlugin.js';

const base = {
  siteUrl: 'https://example.workers.dev',
  feedbackFormUrl: '',
  cfAnalyticsToken: '',
  contactEmail: '',
  legalLastUpdated: '1 Jan 2026',
};
const partials = { greet: '<p>hi {{SITE_URL}}</p>' };
const render = (html, cfg, pagePath = '/') => renderHtml(html, cfg, { version: '9.9.9', readPartial: (n) => partials[n], pagePath });

describe('site config', () => {
  it('uses defaults and env overrides', () => {
    const cfg = resolveSiteConfig(base, {
      SITE_URL: 'https://storymotion.example',
      FEEDBACK_FORM_URL: 'https://forms.gle/abc123',
      CF_ANALYTICS_TOKEN: 'A'.repeat(32),
    });
    expect(cfg.siteUrl).toBe('https://storymotion.example');
    expect(cfg.feedbackFormUrl).toBe('https://forms.gle/abc123');
    expect(cfg.cfAnalyticsToken).toBe('a'.repeat(32));
    expect(resolveSiteConfig(base, {}).feedbackFormUrl).toBe('');
  });

  it('rejects non-Google-Forms feedback links, bad tokens and bad origins', () => {
    expect(() => resolveSiteConfig(base, { FEEDBACK_FORM_URL: 'https://evil.example/forms/x' })).toThrow(SiteConfigError);
    expect(() => resolveSiteConfig(base, { FEEDBACK_FORM_URL: 'http://forms.gle/x' })).toThrow(SiteConfigError);
    expect(() => resolveSiteConfig(base, { CF_ANALYTICS_TOKEN: 'abc"><script>' })).toThrow(SiteConfigError);
    expect(() => resolveSiteConfig(base, { SITE_URL: 'https://example.com/app' })).toThrow(SiteConfigError);
    expect(resolveSiteConfig(base, { FEEDBACK_FORM_URL: 'https://docs.google.com/forms/d/e/xyz/viewform' }).feedbackFormUrl).toContain('docs.google.com/forms/');
  });
});

describe('html rendering', () => {
  it('handles if/else, negation and nesting', () => {
    const html = '<!-- @if a -->A<!-- @else --><!-- @if b -->B<!-- @endif -->C<!-- @endif --><!-- @if !a -->N<!-- @endif -->';
    expect(applyConditionals(html, { a: true, b: true })).toBe('A');
    expect(applyConditionals(html, { a: false, b: true })).toBe('BCN');
    expect(applyConditionals(html, { a: false, b: false })).toBe('CN');
    expect(() => applyConditionals('<!-- @if zzz -->x<!-- @endif -->', {})).toThrow();
  });

  it('expands partials, escapes tokens and sets canonical URLs', () => {
    const cfg = resolveSiteConfig(base, { FEEDBACK_FORM_URL: 'https://docs.google.com/forms/d/e/x/viewform?usp=a&b=c' });
    const out = render(
      '<html><body><!-- @include greet --><a href="{{FEEDBACK_URL}}">f</a><link rel="canonical" href="{{CANONICAL_URL}}"></body></html>',
      cfg,
      '/privacy/',
    );
    expect(out).toContain('<p>hi https://example.workers.dev</p>');
    expect(out).toContain('usp=a&amp;b=c');
    expect(out).toContain('href="https://example.workers.dev/privacy/"');
    expect(() => render('{{NOPE}}', cfg)).toThrow();
  });

  it('adds the analytics beacon only when a token is configured', () => {
    const off = render('<html><body></body></html>', resolveSiteConfig(base, {}));
    expect(off).not.toContain('cloudflareinsights');
    const on = render('<html><body></body></html>', resolveSiteConfig(base, { CF_ANALYTICS_TOKEN: 'b'.repeat(32) }));
    expect(on).toContain('https://static.cloudflareinsights.com/beacon.min.js');
    expect(on).toContain(`"token": "${'b'.repeat(32)}"`);
  });

  it('maps entry paths to public URLs', () => {
    expect(pagePathFor('/index.html')).toBe('/');
    expect(pagePathFor('/privacy/index.html')).toBe('/privacy/');
    expect(pagePathFor('/app/')).toBe('/app/');
    expect(pagePathFor('/404.html')).toBe('/404.html');
  });
});

describe('robots and sitemap', () => {
  it('lists only the real public pages', () => {
    const cfg = resolveSiteConfig(base, {});
    expect(robotsTxt(cfg)).toContain('Sitemap: https://example.workers.dev/sitemap.xml');
    const xml = sitemapXml(cfg, '2026-10-17');
    expect((xml.match(/<loc>/g) || []).length).toBe(PUBLIC_PAGES.length);
    expect(xml).toContain('<loc>https://example.workers.dev/privacy/</loc>');
    expect(xml).not.toContain('404');
  });
});
