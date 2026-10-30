# nullstore — SEO gateway for NullStore

The search-engine-facing front door for [NullStore](https://nullcpy.github.io/): a fully
static page that contains the entire catalog as plain HTML (app names, versions, patch
sources, stats, FAQ) and links out to the store and its mirrors.

## Why this repo exists

The store itself is a client-rendered SPA: Google eventually indexes it, but Bing,
DuckDuckGo and AI crawlers see an empty page. Instead of injecting crawler content into
the store (and its four mirror deploy surfaces), this repo publishes one honest static
page. Search engines rank **this** page; visitors click through to the store.

- The store repo (`nullcpy.github.io`) is **never written to from here** — the nightly
  workflow only reads its public `data.json`.
- The mirrors stay `noindex`ed and irrelevant to search; links here point at the
  canonical origin first.

## Layout

| File | Role |
|---|---|
| `template.html` | The page design + all hand-written copy. Contains `<!-- BUILD:* -->` markers and the `ANALYTICS-BEACON` placeholder. |
| `build.mjs` | Fills the `BUILD:*` markers from a catalog `data.json`; writes `index.html`, `robots.txt`, `sitemap.xml`. Leaves the beacon placeholder untouched. |
| `index.html`, `robots.txt`, `sitemap.xml` | **Generated.** Committed so the repo is self-viewable; deployed via the Actions Pages pipeline. Never hand-edit. `index.html` always keeps the beacon placeholder — the token itself never enters git. |
| `inject-beacon.mjs` | CI-only: swaps the `ANALYTICS-BEACON` placeholder for the real beacon from `CF_BEACON_TOKEN`, into the **staged artifact** (not the committed file). Runs only inside `rebuild.yml`. |
| `.github/workflows/rebuild.yml` | Daily (~05:17 UTC) fetch → rebuild → commit-if-changed → Pages deploy with beacon injection. Also rebuilds on `template.html`/`build.mjs` pushes and via `workflow_dispatch`. |

App cards deep-link into the store's URL search (`https://nullcpy.github.io/?q=<appKey>`) — `script.js` reads `?q=` through `URLSearchParams` and its search engine scores `appKey` matches first, so every card lands on the right app. The header stats (apps / total downloads / patch brands) are recomputed from the catalog on every build, so added/removed apps and their counts propagate automatically.

**Domain rotation:** to spread gateway traffic away from a single host, the inline rotator (end of `template.html`) picks one of the four store domains once per visitor (persisted in `localStorage`) and applies it to the "Open the store" button, every app card and the NullStore link in the FAQ. No page section lists the domains individually: the "Store domains" section only explains the setup and offers a large "Open the project page" button beneath the prose, pointing at the maintainer's hub (`fahim-ahmed05.github.io/nullstore`, labelled *project page* here to keep it distinct from this gateway URL). Crawl semantics are untouched: the committed HTML always carries canonical-origin `href`s. `STORE_DOMAINS` in `build.mjs` documents the rotator's target set and the harness validates the rotator's `DOMAINS` array against it.

## Local preview

```bash
node build.mjs ../nullcpy.github.io/data.json   # or: node build.mjs  (fetches live catalog)
python -m http.server 8000
```

Open http://localhost:8000. Editing `template.html` requires a rebuild before serving —
`index.html` is the served artifact, the template is never published directly.

## One-time GitHub setup

1. **Pages**: repo Settings → Pages → Source: **GitHub Actions** (the `rebuild.yml`
   workflow builds and uploads the artifact; branch-deploy cannot inject the analytics
   beacon). The site URL is `https://nullcpy.github.io/nullstore/` — the canonical
   URLs baked into `build.mjs` assume exactly this. A custom domain later means editing
   `PAGE_URL` in `build.mjs` once.
2. **Analytics (optional)**: Settings → Secrets and variables → Actions → new
   repository secret `CF_BEACON_TOKEN` with the Cloudflare Web Analytics token. Without
   it the deploy simply ships no beacon (the placeholder is stripped at staging), same
   fork-safe model as the store repo — **the token is never committed anywhere**: it
   exists only in the uploaded Pages artifact, built fresh on every deploy.
   Local rebuilds must therefore leave `inject-beacon.mjs` out of the loop —
   `node build.mjs` alone always produces the placeholder-carrying page.
3. **After the first deploy**, submit `https://nullcpy.github.io/nullstore/sitemap.xml`
   in Google Search Console and Bing Webmaster Tools.
4. The daily workflow's first scheduled run may take up to 24 h; trigger it manually
   (Actions → Rebuild and deploy gateway page → Run workflow) to publish now.

## Freshness contract

`index.html` changes only when the catalog content changes, and `sitemap.xml`'s
`lastmod` moves only on those same commits — a quiet week produces no commits, so the
sitemap never lies about the page having changed.
