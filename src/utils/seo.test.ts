import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_SPECS } from '../data/countrySpecs.ts';
import {
  buildRobotsTxt,
  buildSitemapXml,
  injectSeoIntoHtml,
  resolveRouteSeo,
} from './seo.ts';

test('every country spec has a unique URL-safe SEO slug', () => {
  const slugs = COUNTRY_SPECS.map((s) => s.slug);
  const unique = new Set(slugs);
  assert.equal(unique.size, COUNTRY_SPECS.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9-]+$/);
  }
});

test('resolveRouteSeo resolves country landing pages with FAQPage and BreadcrumbList JSON-LD', () => {
  const seo = resolveRouteSeo('/photo/us-dv-lottery-ds160-photo-maker', 'https://passframe.example');
  assert.equal(seo.kind, 'country');
  assert.equal(seo.spec?.id, 'us-visa-ds160');
  assert.ok(seo.title.includes('United States'));
  assert.equal(seo.canonicalUrl, 'https://passframe.example/photo/us-dv-lottery-ds160-photo-maker');
  assert.equal(seo.jsonLd.length, 3);
});

test('buildSitemapXml includes home, guide, directory, and all country pages', () => {
  const xml = buildSitemapXml('https://passframe.example');
  assert.ok(xml.includes('<loc>https://passframe.example/</loc>'));
  assert.ok(xml.includes('<loc>https://passframe.example/country-specs</loc>'));
  assert.ok(xml.includes('<loc>https://passframe.example/print-guide</loc>'));
  for (const spec of COUNTRY_SPECS) {
    assert.ok(xml.includes(`<loc>https://passframe.example/photo/${spec.slug}</loc>`));
  }
});

test('buildRobotsTxt includes Allow and Sitemap URL', () => {
  const txt = buildRobotsTxt('https://passframe.example');
  assert.ok(txt.includes('Allow: /'));
  assert.ok(txt.includes('Sitemap: https://passframe.example/sitemap.xml'));
});

test('injectSeoIntoHtml rewrites title, meta description, canonical, and JSON-LD', () => {
  const template = `<!doctype html><html><head>
    <title>Old</title>
    <meta name="description" content="Old desc" />
    <meta property="og:title" content="Old" />
    <meta property="og:description" content="Old desc" />
    <meta name="twitter:title" content="Old" />
    <meta name="twitter:description" content="Old desc" />
    <script type="application/ld+json">{}</script>
  </head><body></body></html>`;

  const seo = resolveRouteSeo('/photo/schengen-visa-35x45mm-photo-maker', 'https://passframe.example');
  const html = injectSeoIntoHtml(template, seo);
  assert.ok(html.includes('Schengen Area'));
  assert.ok(html.includes('<link rel="canonical" href="https://passframe.example/photo/schengen-visa-35x45mm-photo-maker" />'));
  assert.ok(html.includes('FAQPage'));
});
