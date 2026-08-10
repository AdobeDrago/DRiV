# DriveParts Cloudflare Workers

Workers migrated from the DriveParts EDS repo. Wrangler `name` / `account_id` values are unchanged so existing `*.workers.dev` deployments keep working. Block URLs still point at `https://drivparts-catalog-api.code-and-theory-adobe.workers.dev`.

## Workers

| Folder | Wrangler name | Role |
|--------|---------------|------|
| `catalog-api` | `drivparts-catalog-api` | Parts Finder / details / cross-sell / where-to-buy CORS + cache |
| `drivparts` | `drivparts` | Front door: EDS pages + Hybris paths on one origin |

Both deploy to account `21efb214803a94508b91d4a0df4b15c8`.

## Deploy

From the DRiV repo root (requires Cloudflare auth via `npx wrangler login`):

```sh
npm run deploy:catalog-api
npm run deploy:drivparts
```

### Production routes

Neither worker is bound to a custom domain yet — both serve from `*.workers.dev`. `catalog-api/wrangler.toml` has a commented `api.moogparts.com` `[[routes]]` placeholder to fill once the production zone is decided.

## Local Hybris proxy vs workers

For localhost (Hybris iframe / login / cart):

```sh
aem up --port 3001 --no-open
npm run proxy
```

Open `http://localhost:3000/`. `tools/fmstorefront-proxy.mjs` proxies EDS from `:3001` and Hybris paths (`/fmstorefront`, `/medias`, `/fmwebservice`, `/content/dam`) same-origin.

- **Local proxy** — day-to-day storefront work on localhost.
- **drivparts** — combined front door on `*.workers.dev`; serves EDS from `EDS_ORIGIN` (`https://code-and-theory--driv--adobedrago.aem.page`) and proxies Hybris paths to `https://qa.drivparts.com`. Not a production proxy — confirm `EDS_ORIGIN` before demos.
