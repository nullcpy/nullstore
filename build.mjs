// Builds the NullStore gateway page: fills the BUILD:* markers in
// template.html with live catalog data and emits robots.txt + sitemap.xml.
//
// The gateway is a fully static page whose entire content (app list, stats,
// structured data) exists in the served HTML -- no JS needed to index it.
// It links out to the store (nullcpy.github.io and its mirrors), so search
// engines rank THIS page and visitors click through to the SPA.
//
// Data source: the store's own https://nullcpy.github.io/data.json (fetched
// by the nightly workflow, or passed in for local runs). This repo never
// writes to the store repo.
//
// Usage: node build.mjs [path-to-data.json]
// Without an argument it fetches the live catalog; with one it reads the file.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://nullcpy.github.io';
const PAGE_URL = 'https://nullcpy.github.io/nullstore/';

// The four store domains the per-visitor rotator (template.html) cycles
// through. No page section lists them individually anymore -- the "All store
// domains" button points at the external domains hub instead -- so this
// exists as the harness's reference set for validating the rotator's array.
const STORE_DOMAINS = [
    { label: 'GitHub Pages', host: 'nullcpy.github.io', url: 'https://nullcpy.github.io/', primary: true },
    { label: 'Vercel mirror', host: 'nullstore.vercel.app', url: 'https://nullstore.vercel.app/' },
    { label: 'Cloudflare Pages mirror', host: 'nullcpy.pages.dev', url: 'https://nullcpy.pages.dev/' },
    { label: 'Cloudflare Worker mirror', host: 'nullstore.nullcpy.workers.dev', url: 'https://nullstore.nullcpy.workers.dev/' },
];

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadCatalog() {
    const arg = process.argv[2];
    if (arg) return JSON.parse(readFileSync(path.resolve(arg), 'utf8'));
    const res = await fetch(`${ORIGIN}/data.json`);
    if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
    return res.json();
}

function appRow(app) {
    // Newest brand = the one that published last; its version is the headline.
    // No "v" prefix: the catalog stores bare versions and the store site
    // displays them bare, so the gateway must not invent one.
    const brands = [...(app.brands ?? [])].sort((a, b) =>
        new Date(b.latestPublishedAt ?? 0) - new Date(a.latestPublishedAt ?? 0));
    const newest = brands[0];
    const extra = brands.length > 1 ? ` +${brands.length - 1} more` : '';
    const meta = [
        newest?.latestVersion || null,
        newest?.brandName ? `${newest.brandName}${extra}` : null,
        app.totalDownloads ? `${app.totalDownloads.toLocaleString('en-US')} downloads` : null,
    ].filter(Boolean).join(' · ');
    // The store SPA reads ?q= (URLSearchParams in script.js) and its search
    // scores appKey matches first, so the canonical key is the best token.
    // href stays the canonical origin for crawlers; the rotator swaps the
    // domain per visitor via data-store/data-q without touching crawl semantics.
    return `                <a class="app" id="a-${escapeHtml(app.appKey)}" href="${ORIGIN}/?q=${encodeURIComponent(app.appKey)}" data-store data-q="${escapeHtml(app.appKey)}">${escapeHtml(app.appName)}<small>${escapeHtml(meta)}</small></a>`;
}

function jsonLd(apps, faq) {
    const graph = [
        { '@type': 'WebSite', '@id': `${PAGE_URL}#website`, url: PAGE_URL, name: 'NullStore', publisher: { '@id': `${PAGE_URL}#publisher` }, inLanguage: 'en' },
        { '@type': 'Organization', '@id': `${PAGE_URL}#publisher`, name: 'nullcpy', url: ORIGIN + '/', sameAs: ['https://github.com/nullcpy'] },
        {
            '@type': 'ItemList', '@id': `${PAGE_URL}#apps`,
            name: 'Patched Android apps in the NullStore catalog',
            numberOfItems: apps.length,
            itemListElement: apps.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${PAGE_URL}#a-${a.appKey}`, name: a.appName })),
        },
        { '@type': 'FAQPage', '@id': `${PAGE_URL}#faq`, mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ];
    const body = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
    return `<script type="application/ld+json">\n    ${body.split('\n').map((l, i) => (i === 0 ? l : '    ' + l)).join('\n')}\n    </script>`;
}

// Plain-text twins of the visible FAQ in template.html -- Google requires the
// structured-data text to match what the user sees, so keep these in sync.
const FAQ = [
    ['Where can I download patched ReVanced, MorpheApp or ReVanced Advanced apps?', 'NullStore lists every current build with its version, architecture and applied patches, and links straight to the original release files on GitHub.'],
    ['Is this safe to install?', 'Every build links to its source release; nothing is re-hosted or re-signed by this site. Check the applied-patch list on each build card and install only what you trust.'],
    ['Do I need root?', 'Patched APKs need no root. The catalog also carries Magisk and KernelSU modules for rooted devices, marked as Module downloads.'],
    ['Can I get automatic updates?', 'Yes, every build exposes an Obtainium one-click install, so your phone checks for new builds itself.'],
    ['How often is the catalog refreshed?', 'Automatically, within hours of any upstream release. This page and the store are rebuilt on a daily schedule from the live catalog.'],
    ['Where can I see the source code?', 'The NullForge builder that patches and publishes every build, the store website that renders this catalog, and this gateway page are all open source on GitHub.'],
];

const catalog = await loadCatalog();
const apps = [...catalog.apps].sort((a, b) => a.appName.localeCompare(b.appName, 'en'));

const brandCount = new Set(apps.flatMap((a) => (a.brands ?? []).map((b) => b.brandKey))).size;
// Headline metric the owner asked for: total downloads (sum of per-app
// counters, which the catalog keeps live from the Releases API).
const totalDownloads = apps.reduce((n, a) => n + (a.totalDownloads ?? 0), 0);

const stat = (n, label) => `<span class="stat"><b>${n.toLocaleString('en-US')}</b><span>${label}</span></span>`;

let html = readFileSync(path.join(ROOT, 'template.html'), 'utf8');
html = html.replace('<!-- BUILD:STATS -->', [stat(apps.length, 'apps'), stat(totalDownloads, 'total downloads'), stat(brandCount, 'patch brands')].join('\n                '));
html = html.replace('<!-- BUILD:APPS -->', apps.map((a) => appRow(a)).join('\n'));
html = html.replace('<!-- BUILD:BRANDCOUNT -->', `<strong>${brandCount}</strong>`);
html = html.replace('<!-- BUILD:UPDATED -->', new Date(catalog.updated_at).toUTCString());
html = html.replace('<!-- BUILD:JSONLD -->', jsonLd(apps, FAQ));
// NB: the ANALYTICS-BEACON placeholder is deliberately LEFT in index.html.
// The committed artifact must stay token-free; only the CI deploy staging
// step (rebuild.yml) swaps in the real beacon, via inject-beacon.mjs
// reading CF_BEACON_TOKEN from the repo secret.
writeFileSync(path.join(ROOT, 'index.html'), html);

writeFileSync(path.join(ROOT, 'robots.txt'), [
    'User-agent: *',
    'Disallow:',
    `Sitemap: ${PAGE_URL}sitemap.xml`,
    '',
].join('\n'));

writeFileSync(path.join(ROOT, 'sitemap.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${PAGE_URL}</loc>`,
    `    <lastmod>${catalog.updated_at.slice(0, 10)}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
].join('\n'));

console.log(`build: ${apps.length} apps, ${totalDownloads.toLocaleString('en-US')} downloads, ${brandCount} brands -> index.html + robots.txt + sitemap.xml`);
