# Deploy to Render

`render.yaml` describes one web service (the API, serving the web app from its own origin) and one Postgres database, both in Frankfurt. Cost: about $13.30 a month (web service $7, Postgres $6, storage $0.30/GB). Why Render and what scaling costs: `docs/research/api-hosting-options.md`.

## First deploy

1. In the Render Dashboard: **New > Blueprint**, pick this repository and the `main` branch. Render reads `render.yaml`.
2. Fill in the values it prompts for:
   - `CLIENT_ORIGIN` and `BETTER_AUTH_URL`: the public address, both the same, e.g. `https://pocket-pantry.onrender.com`. The `onrender.com` name follows the service name; if Render picks a different one, update both after the first deploy and redeploy.
   - `AI_API_KEY`: the OpenAI key.
   - `SIGNUP_REQUIRES_PROMO_CODE`: `true` while testing, so only people with a Promo Code can create a Family.
3. Render builds, runs the migrations (`npm run db:migrate`, before every deploy), and starts the API. `/api/health` must answer before traffic switches over.
4. Load the ingredient catalog once, from the service's **Shell** tab:

   ```bash
   npm run db:seed -w @pocket-pantry/api
   ```

   With `NODE_ENV=production` it creates no test accounts.

5. Sign up, then make yourself an Admin with the SQL in the README ("Give yourself Admin access"). Run it with `psql "$DATABASE_URL"` from the Shell, if that runtime has `psql`. Otherwise add your IP to the database's allow list for a while and connect with its External URL.

## Deploys after that

A push to `main` deploys only after its GitHub Actions checks pass (`autoDeployTrigger: checksPass`). That is why CI also runs on pushes to `main`: Render never deploys a commit with no checks. A failed build or migration leaves the previous deploy running.

## Things to know

- **One instance only.** The per-IP and per-Member limiters (Invite Code, Promo Code, Barcode Lookup, Better Auth) live in process memory. A second instance doubles every limit. Move them to a shared store before scaling out.
- **Client IPs.** `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` makes the limiters see the visitor's address instead of Render's proxy. Cloudflare overwrites that header on every request. Never set it to `x-forwarded-for` on Render: Cloudflare appends to it, so a client can choose its own leftmost address. Off Render, see `apps/api/src/common/client-ip.ts`.
- **Memory.** 512 MB, and a Scan's JSON body can be 12 MB. If the service restarts under load, move to `1c-2g`.
- **Database access.** `ipAllowList: []` blocks connections from outside Render. Use the service Shell, or add your IP to the allow list for a while.
- **Fixed at creation.** Region, database name, user and Postgres version cannot be changed later.
