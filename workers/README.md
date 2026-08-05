# DriveParts Cloudflare Workers

Workers migrated from the DriveParts EDS repo. Wrangler `name` / `account_id` values are unchanged so existing `*.workers.dev` deployments keep working. Block URLs still point at `moogparts-catalog-api.atul-code-auth0.workers.dev`.

## Workers

| Folder | Wrangler name | Role |
|--------|---------------|------|
| `catalog-api` | `moogparts-catalog-api` | Parts Finder / details / where-to-buy CORS + cache |
| `drivparts-eds-poc` | `drivparts-eds-poc` | POC front door: EDS pages + Hybris paths on one origin |

## Deploy

From the DRiV repo root (requires Cloudflare auth via `npx wrangler login`):

```sh
npm run deploy:catalog-api
npm run deploy:eds-poc
```

### Production routes

The catalog worker has a commented `api.moogparts.com` route placeholder in its `wrangler.toml` once the production zone is decided.

## Local Hybris proxy vs workers

For localhost (Hybris iframe / login / cart):

```sh
aem up --port 3001 --no-open
npm run proxy
```

Open `http://localhost:3000/`. `tools/fmstorefront-proxy.mjs` proxies EDS from `:3001` and Hybris paths (`/fmstorefront`, `/medias`, `/fmwebservice`, `/content/dam`) same-origin.

- **Local proxy** — day-to-day storefront work on localhost.
- **drivparts-eds-poc** — temporary combined front door; `EDS_ORIGIN` still points at `https://main--drivparts--codeandtheory.aem.page` (not a production proxy).
