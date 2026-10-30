// CI helper: replaces the ANALYTICS-BEACON placeholder in a copied index.html
// with the beacon built from the CF_BEACON_TOKEN environment variable.
// Deliberately separate from build.mjs: the committed index.html must ALWAYS
// keep the placeholder (token never enters git); only the staged deploy
// artifact gets the real beacon. Kept quote-free on purpose so the workflow
// line that calls it needs no shell escaping.
//
// Usage: CF_BEACON_TOKEN=... node inject-beacon.mjs <source> <target>

import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
    console.error('inject-beacon: usage: node inject-beacon.mjs <source> <target>');
    process.exit(1);
}

const token = (process.env.CF_BEACON_TOKEN ?? '').trim();
const beacon = token
    ? '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='
    + "'" + JSON.stringify({ token }) + "'" + '></script>'
    : '';

const html = readFileSync(src, 'utf8');
if (!html.includes('<!-- ANALYTICS-BEACON -->')) {
    console.error('inject-beacon: placeholder not found in ' + src);
    process.exit(1);
}

writeFileSync(dst, html.replace('<!-- ANALYTICS-BEACON -->', beacon));
console.log('inject-beacon: beacon ' + (token ? 'injected (token length ' + token.length + ')' : 'removed') + ' -> ' + dst);
