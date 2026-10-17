/**
 * Build-time helpers for the static marketing/legal pages and site config.
 *
 * - Resolves site.config.js + environment overrides and validates them.
 * - In every HTML entry: expands <!-- @include name --> partials, keeps or drops
 *   <!-- @if flag --> … <!-- @else --> … <!-- @endif --> blocks, replaces
 *   {{TOKENS}}, and adds the Cloudflare Web Analytics beacon when configured.
 * - Emits robots.txt and sitemap.xml for the real, public pages only.
 * - Exposes a small, safe subset of the config to the React app as __SITE__.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const PARTIALS_DIR = resolve(process.cwd(), 'src/site/partials');

/** Public pages, in sitemap order. Paths match the built files (Workers serves /x/ from x/index.html). */
export const PUBLIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/app/', changefreq: 'weekly', priority: '0.9' },
  { path: '/privacy/', changefreq: 'monthly', priority: '0.4' },
  { path: '/terms/', changefreq: 'monthly', priority: '0.4' },
];

export class SiteConfigError extends Error {}

function pick(env, ...names) {
  for (const n of names) {
    if (env[n] !== undefined && env[n] !== '') return String(env[n]).trim();
  }
  return undefined;
}

export function validateFeedbackUrl(value) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SiteConfigError(`FEEDBACK_FORM_URL is not a valid URL: ${value}`);
  }
  const okHost =
    (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/')) || url.hostname === 'forms.gle';
  if (url.protocol !== 'https:' || !okHost) {
    throw new SiteConfigError(
      'FEEDBACK_FORM_URL must be a Google Forms link (https://forms.gle/… or https://docs.google.com/forms/…).',
    );
  }
  return url.toString();
}

export function validateAnalyticsToken(value) {
  if (!value) return '';
  if (!/^[a-f0-9]{32}$/i.test(value)) {
    throw new SiteConfigError(
      'CF_ANALYTICS_TOKEN must be the 32-character token from your Cloudflare Web Analytics snippet (data-cf-beacon \'{"token": "…"}\').',
    );
  }
  return value.toLowerCase();
}

export function validateSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SiteConfigError(`SITE_URL is not a valid URL: ${value}`);
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new SiteConfigError('SITE_URL must be an origin such as https://example.com (no path, query or hash).');
  }
  return url.origin;
}

export function validateEmail(value) {
  if (!value) return '';
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(value)) throw new SiteConfigError(`CONTACT_EMAIL is not valid: ${value}`);
  return value;
}

export function resolveSiteConfig(base, env = process.env) {
  return {
    siteUrl: validateSiteUrl(pick(env, 'SITE_URL', 'VITE_SITE_URL') ?? base.siteUrl),
    feedbackFormUrl: validateFeedbackUrl(pick(env, 'FEEDBACK_FORM_URL', 'VITE_FEEDBACK_FORM_URL') ?? base.feedbackFormUrl),
    cfAnalyticsToken: validateAnalyticsToken(pick(env, 'CF_ANALYTICS_TOKEN', 'VITE_CF_ANALYTICS_TOKEN') ?? base.cfAnalyticsToken),
    contactEmail: validateEmail(pick(env, 'CONTACT_EMAIL', 'VITE_CONTACT_EMAIL') ?? base.contactEmail),
    legalLastUpdated: base.legalLastUpdated || '',
  };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function expandIncludes(html, readPartial, depth = 0) {
  if (depth > 5) throw new Error('Partials nested too deeply');
  return html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) =>
    expandIncludes(readPartial(name), readPartial, depth + 1),
  );
}

export function applyConditionals(html, flags) {
  // Bodies may not contain another @if, so the innermost block is resolved first; the loop handles nesting.
  const body = '((?:(?!<!--\\s*@if)[\\s\\S])*?)';
  const re = new RegExp(`<!--\\s*@if\\s+(!?)([\\w-]+)\\s*-->${body}(?:<!--\\s*@else\\s*-->${body})?<!--\\s*@endif\\s*-->`, 'g');
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(re, (_, neg, flag, yes, no = '') => {
      if (!(flag in flags)) throw new Error(`Unknown @if flag "${flag}"`);
      const on = Boolean(flags[flag]) !== (neg === '!');
      return on ? yes : no;
    });
  } while (out !== prev);
  return out;
}

export function analyticsSnippet(token) {
  if (!token) return '';
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;
}

export function renderHtml(html, cfg, { version, readPartial, pagePath = '/' }) {
  const flags = {
    feedback: !!cfg.feedbackFormUrl,
    analytics: !!cfg.cfAnalyticsToken,
    contact: !!cfg.contactEmail,
  };
  const tokens = {
    SITE_URL: cfg.siteUrl,
    CANONICAL_URL: cfg.siteUrl + pagePath,
    FEEDBACK_URL: cfg.feedbackFormUrl,
    CONTACT_EMAIL: cfg.contactEmail,
    LEGAL_LAST_UPDATED: cfg.legalLastUpdated,
    VERSION: version,
    YEAR: String(new Date().getFullYear()),
  };
  let out = expandIncludes(html, readPartial);
  out = applyConditionals(out, flags);
  out = out.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in tokens)) throw new Error(`Unknown template token ${m}`);
    return escapeHtml(tokens[key]);
  });
  if (flags.analytics) out = out.replace('</body>', `  ${analyticsSnippet(cfg.cfAnalyticsToken)}\n  </body>`);
  return out;
}

export function robotsTxt(cfg) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`;
}

export function sitemapXml(cfg, lastmod) {
  const urls = PUBLIC_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${cfg.siteUrl}${p.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Maps a Vite HTML entry path ("/privacy/index.html") to its public URL path ("/privacy/"). */
export function pagePathFor(htmlPath) {
  const p = htmlPath.replace(/\\/g, '/');
  if (p.endsWith('/404.html')) return '/404.html';
  return p.replace(/index\.html$/, '');
}

export default function sitePlugin({ config: baseConfig, version }) {
  let cfg;
  const readPartial = (name) => readFileSync(resolve(PARTIALS_DIR, `${name}.html`), 'utf8');
  return {
    name: 'storymotion-site',
    config(_, { mode }) {
      // .env files (all keys, not only VITE_*) first; real environment variables win, as on Cloudflare builds.
      cfg = resolveSiteConfig(baseConfig, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
      if (mode !== 'test') {
        const on = (v) => (v ? 'on' : 'off');
        console.log(
          `\n[site] ${cfg.siteUrl} · feedback ${on(cfg.feedbackFormUrl)} · analytics ${on(cfg.cfAnalyticsToken)} · contact ${on(cfg.contactEmail)}\n`,
        );
      }
      return {
        define: {
          __SITE__: JSON.stringify({
            siteUrl: cfg.siteUrl,
            feedbackFormUrl: cfg.feedbackFormUrl,
            analytics: !!cfg.cfAnalyticsToken,
            version,
          }),
        },
      };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return renderHtml(html, cfg, { version, readPartial, pagePath: pagePathFor(ctx.path) });
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(robotsTxt(cfg));
        } else if (req.url === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(sitemapXml(cfg, new Date().toISOString().slice(0, 10)));
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(cfg) });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(cfg, new Date().toISOString().slice(0, 10)) });
    },
  };
}
