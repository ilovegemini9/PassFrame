import {
  COUNTRY_SPECS,
  formatPhysicalDimensions,
  getCountryFaqs,
  getSpecBySlug,
  getSpecUrlPath,
  type CountryPhotoSpec,
} from '../data/countrySpecs.ts';

export type SeoRouteKind = 'home' | 'country' | 'directory' | 'guide';

export interface ResolvedRouteSeo {
  kind: SeoRouteKind;
  spec: CountryPhotoSpec | null;
  title: string;
  description: string;
  canonicalPath: string;
  canonicalUrl: string;
  jsonLd: Record<string, unknown>[];
}

export function resolveRouteSeo(pathname: string, baseUrl: string): ResolvedRouteSeo {
  const cleanOrigin = baseUrl.replace(/\/+$/, '');
  const normalizedPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';

  if (normalizedPath === '/country-specs') {
    const title = `All ${COUNTRY_SPECS.length} Passport & Visa Photo Specs | PassFrame`;
    const description = `Compare official passport, visa, and ID photo dimensions, head-height ratios, and KB file limits across ${COUNTRY_SPECS.length} global documents.`;
    const canonicalPath = '/country-specs';
    const canonicalUrl = `${cleanOrigin}${canonicalPath}`;

    return {
      kind: 'directory',
      spec: null,
      title,
      description,
      canonicalPath,
      canonicalUrl,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: canonicalUrl,
        },
      ],
    };
  }

  if (normalizedPath === '/print-guide') {
    const title = 'DIY Passport Photo Lighting & 4x6 Print Guide | PassFrame';
    const description =
      'Take compliant biometric passport photos at home with natural window light and print 4x6 sheets for pennies without AI rejection risks.';
    const canonicalPath = '/print-guide';
    const canonicalUrl = `${cleanOrigin}${canonicalPath}`;

    return {
      kind: 'guide',
      spec: null,
      title,
      description,
      canonicalPath,
      canonicalUrl,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to Take and Print Compliant Passport Photos at Home',
          description,
          step: [
            {
              '@type': 'HowToStep',
              name: 'Stand in front of natural window light',
              text: 'Face a bright window during daylight hours about 1 meter in front of a plain light-colored wall.',
            },
            {
              '@type': 'HowToStep',
              name: 'Align biometric calipers without AI filters',
              text: 'Verify exact head height, eye line, and 300 DPI resolution locally in PassFrame without AI retouching.',
            },
            {
              '@type': 'HowToStep',
              name: 'Export 4x6 inch print sheet',
              text: 'Download the 4x6 photo sheet and print at any photo kiosk or home printer at 100% actual size.',
            },
          ],
        },
      ],
    };
  }

  if (normalizedPath.startsWith('/photo/')) {
    const slug = normalizedPath.slice('/photo/'.length);
    const spec = getSpecBySlug(slug);
    if (spec) {
      const dim = formatPhysicalDimensions(spec);
      const title = `${spec.country} ${spec.document} Photo Maker | PassFrame`;
      const description = `Free browser-local ${spec.country} (${spec.document}) biometric photo tool (${dim}, ${spec.widthPx}x${spec.heightPx} px). Zero uploads, zero watermarks, 4x6 print sheet.`;
      const canonicalPath = getSpecUrlPath(spec);
      const canonicalUrl = `${cleanOrigin}${canonicalPath}`;
      const faqs = getCountryFaqs(spec);

      return {
        kind: 'country',
        spec,
        title: title.slice(0, 68),
        description: description.slice(0, 162),
        canonicalPath,
        canonicalUrl,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: `${spec.country} ${spec.document} Photo Studio`,
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'All',
            url: canonicalUrl,
            description,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'PassFrame Studio',
                item: `${cleanOrigin}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Country Specs',
                item: `${cleanOrigin}/country-specs`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: `${spec.country} — ${spec.document}`,
                item: canonicalUrl,
              },
            ],
          },
        ],
      };
    }
  }

  const title = 'PassFrame – Free Biometric Passport & Visa Photo Studio';
  const description = `Create compliant passport, visa, and ID photos 100% locally in your browser. Zero uploads, zero watermarks, ${COUNTRY_SPECS.length} country specs, and 4x6 print sheets.`;
  const canonicalPath = '/';
  const canonicalUrl = `${cleanOrigin}/`;

  return {
    kind: 'home',
    spec: null,
    title,
    description,
    canonicalPath,
    canonicalUrl,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'PassFrame',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'All',
        url: canonicalUrl,
        description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function injectSeoIntoHtml(html: string, seo: ResolvedRouteSeo): string {
  const safeTitle = escapeHtmlAttr(seo.title);
  const safeDesc = escapeHtmlAttr(seo.description);
  const safeUrl = escapeHtmlAttr(seo.canonicalUrl);
  const ldJsonString = JSON.stringify(seo.jsonLd.length === 1 ? seo.jsonLd[0] : seo.jsonLd);

  let updated = html;
  updated = updated.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  updated = updated.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  updated = updated.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${safeTitle}" />`
  );
  updated = updated.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );
  updated = updated.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`
  );
  updated = updated.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`
  );

  // Inject canonical & og:url before </head> if not already present
  const canonicalTags = `    <link rel="canonical" href="${safeUrl}" />\n    <meta property="og:url" content="${safeUrl}" />`;
  if (/<link\s+rel="canonical"/i.test(updated)) {
    updated = updated.replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${safeUrl}" />`
    );
  } else {
    updated = updated.replace('</head>', `${canonicalTags}\n  </head>`);
  }

  updated = updated.replace(
    /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${ldJsonString}</script>`
  );

  return updated;
}

export function buildSitemapXml(baseUrl: string): string {
  const cleanOrigin = baseUrl.replace(/\/+$/, '');
  const staticUrls = [
    { loc: `${cleanOrigin}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${cleanOrigin}/country-specs`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${cleanOrigin}/print-guide`, priority: '0.8', changefreq: 'monthly' },
  ];

  const countryUrls = COUNTRY_SPECS.map((spec) => ({
    loc: `${cleanOrigin}${getSpecUrlPath(spec)}`,
    priority: '0.9',
    changefreq: 'monthly',
  }));

  const entries = [...staticUrls, ...countryUrls]
    .map(
      (item) =>
        `  <url>\n    <loc>${escapeHtmlAttr(item.loc)}</loc>\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildRobotsTxt(baseUrl: string): string {
  const cleanOrigin = baseUrl.replace(/\/+$/, '');
  return `User-agent: *\nAllow: /\n\nSitemap: ${cleanOrigin}/sitemap.xml\n`;
}
