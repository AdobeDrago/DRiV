# DriveParts Cloudflare Workers

Workers migrated from the DriveParts EDS repo. Wrangler `name` / `account_id` values are unchanged so existing `*.workers.dev` deployments keep working. Block URLs still point at `moogparts-catalog-api.atul-code-auth0.workers.dev`.

## Workers

| Folder | Wrangler name | Role |
|--------|---------------|------|
| `catalog-api` | `moogparts-catalog-api` | Parts Finder / details / where-to-buy CORS + cache |
| `drivparts-hybris-proxy` | `drivparts-hybris-proxy` | Same-origin Hybris `/fmstorefront/*`, `/medias/*` |
| `contact-proxy` | `moogparts-contact-proxy` | Web3Forms submit proxy |
| `drivparts-eds-poc` | `drivparts-eds-poc` | POC front door: EDS pages + Hybris paths on one origin |

## Deploy

From the DRiV repo root (requires Cloudflare auth via `npx wrangler login`):

```sh
npm run deploy:catalog-api
npm run deploy:hybris-proxy
npm run deploy:contact-proxy
npm run deploy:eds-poc
```

### contact-proxy secret

```sh
npx wrangler secret put WEB3FORMS_ACCESS_KEY -c workers/contact-proxy/wrangler.toml
```

### Production routes

`drivparts-hybris-proxy` is not bound to a custom domain yet. Uncomment and fill `[[routes]]` in its `wrangler.toml` (`REPLACE_WITH_PROD_DOMAIN`) once the production zone is decided. Catalog and contact workers have similar commented `api.moogparts.com` placeholders.

## Local Hybris proxy vs workers

For localhost (Hybris iframe / login / cart):

```sh
aem up --port 3001 --no-open
npm run proxy
```

Open `http://localhost:3000/`. `tools/fmstorefront-proxy.mjs` proxies EDS from `:3001` and Hybris paths (`/fmstorefront`, `/medias`, `/fmwebservice`, `/content/dam`) same-origin.

- **Local proxy** — day-to-day storefront work on localhost.
- **drivparts-hybris-proxy** — production-oriented Hybris reverse proxy (`*.workers.dev` until routes are bound).
- **drivparts-eds-poc** — temporary combined front door; `EDS_ORIGIN` still points at `https://main--drivparts--codeandtheory.aem.page` (not a production proxy).
