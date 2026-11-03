# PantryGator

**Know what's in your kitchen, buy only what you need, and stop throwing food away.**

You come home from the shop, put everything away, and a week later the spinach has gone off at the back of the fridge. Meanwhile someone buys a third jar of paprika because nobody remembered the other two. The shopping list is in one person's head or lost in a group chat.

PantryGator fixes that for you and everyone you live with. Snap a photo of your receipt and your whole shop is in the app in seconds. Everyone at home sees the same pantry and the same shopping list, and the app tells you what to use up before it goes off.

## Why you'll love it

### Your groceries, in with one photo

Nobody wants to type in a week of shopping. With PantryGator you don't have to:

- **Photograph your receipt** and every item lands in your pantry, with quantities. Long receipt? Fold it and take a few photos. Bags and other non-food items are left out for you.
- **Photograph a product** and PantryGator reads what it is and its best-before date.
- **Photograph loose fruit and veg** on the counter and each one is recognised.
- **Photograph a dish** you love and get the ingredients you need to make it again, ready to add to your shopping list.

You always get a quick look before anything is saved, so a wrong guess takes one tap to fix. Works with receipts and labels in English and Romanian.

### A pantry that keeps itself in order

- See everything you have, sorted by where it lives: fridge, freezer, cupboard, or spice rack.
- Find anything in a second with search.
- Bought milk twice this week? Each purchase keeps its own date, so you know which carton to open first.
- Expiry dates are filled in for you based on the kind of food, and you can change them any time.
- Items that are about to go off are flagged, so you use them instead of binning them.

### One shopping list for the whole family

- Everyone adds to the same list, and changes show up for everyone straight away.
- The list is sorted in the order you walk through the shop, so you go round once.
- Tick things off as they go in the basket and see how many are left.
- Scan your receipt and the things you bought are ticked off for you.
- When you're done, one tap moves everything you bought into the pantry and starts a fresh list.

### Made for families

- Start on your own in seconds. When you're ready, share an invite code and your family joins your pantry and shopping list.
- Family members can come and go, and the person who runs the household stays in control of who's in.
- Each person picks their own language. English and Romanian are available today.

### A home screen that fits you

- See at a glance what to use soon, how much is left on the shopping list, and what's in each part of the kitchen.
- Start any kind of scan from the home screen with one tap.
- Add, remove, rearrange, and resize the cards so the screen shows what matters to you. Your layout follows you from your phone to your tablet or laptop.

### Make it yours

- Think milk lasts longer than the default? Change how long each kind of food lasts for your household.
- Decide how early you want to be warned before things go off.

### Coming soon

- **Recipes** that use what you already have, with step-by-step instructions.
- **Cook it, and the pantry updates itself**: ingredients you used are taken out.
- **Favourites** and a **Want to cook** list for the whole family.
- **Reminders** when food is about to go off or the shopping list changes.

---

## Installation

### What you need

- [Node.js](https://nodejs.org/) 24.15.0 (if you use `nvm`, run `nvm use`)
- [Docker](https://www.docker.com/), for the database
- An OpenAI API key, for scanning

### Run it

```bash
npm install
npm run dev
```

The first run creates a `.env` file from `.env.example`. Open `.env` and set at least:

- `BETTER_AUTH_SECRET`: any string of at least 32 random characters.
- `AI_API_KEY`: your OpenAI API key.

Then restart `npm run dev`. It starts the database, sets it up, and runs the app at http://localhost:5173.

### Load the ingredient list and test accounts

With the app running, in a second terminal:

```bash
npm run db:seed -w @pocket-pantry/api
```

This loads the ingredient catalog. In development it also creates three test accounts, `alice@test.local`, `bob@test.local` and `george@test.local`, all with the password `password123`.

### Give yourself Admin access

Nobody becomes an Admin by signing up, and no screen or endpoint grants the role. Sign up as usual, then set your role directly in the database:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Locally, run it with `docker compose exec postgres psql -U postgres -d pocket_pantry -c "<the SQL above>"`. In production, run it against `DATABASE_URL`. Reload the app to see the Admin screens. To take the role away, set it back to `'regular'`.

### Try it on your phone

`npm run dev` listens on your whole network, and the app talks to the API through the same address, so your phone only needs port 5173.

1. Put your phone on the same Wi-Fi as your computer.
2. Open `http://<your computer's local IP>:5173` on the phone.

On Windows with WSL2, the phone can't see into WSL by default. Add this to `%UserProfile%\.wslconfig`, run `wsl --shutdown`, and allow port 5173 through the Windows firewall:

```ini
[wsl2]
networkingMode=mirrored
```

Over plain `http://`, iPhone Safari won't give the app the live camera, so scanning falls back to the photo picker (which still offers "Take Photo"). For the live camera, open the app over HTTPS with a tunnel:

```bash
cloudflared tunnel --url http://localhost:5173
```

Set `CLIENT_ORIGIN` in `.env` to the `https://….trycloudflare.com` address it prints, restart `npm run dev`, and open that address on the phone.

### See what a Scan sent and got back

In development, set `SCAN_DEBUG_DIR=.scan-debug` in `.env` and restart. Every Scan then saves a folder in `apps/api/.scan-debug/` with the photos, the prompt, and the AI's raw answer (or the error). Use it to work out why something was misread. It only works with `NODE_ENV=development` (the API won't start with it in production), the folder is ignored by Git, and you should delete it when you're done, since receipts are personal.

To try another model or reasoning effort on those debug captures, replay them with `npm run scan:replay -w @pocket-pantry/api -- --model gpt-6-luna --effort low --repeat 3`. See [the usage notes](apps/api/src/ai/scan-replay/README.md).

### Voice Notes models

Voice Notes use two models besides the Scan model, on the same `AI_API_KEY` and `AI_BASE_URL`: `AI_TRANSCRIBE_MODEL` (default `gpt-transcribe`) turns the recording into text, and `AI_TEXT_MODEL` (default `gpt-5-mini`) reads that text into Voice Actions. The text model runs at `AI_TEXT_REASONING_EFFORT=low` by default; as with Scans, setting `AI_TEXT_MODEL` yourself sends no effort unless you also set one. The development debug capture (`SCAN_DEBUG_DIR`) records these reads too, and each Voice Note's recording and transcription request (voice is personal data: delete captures when done). `npm run voice:replay` in `apps/api` replays Voice Notes against real providers; see `apps/api/src/ai/scan-replay/README.md`.

### Choose the Scan model

With no AI settings, Scans run on OpenAI's `gpt-6-luna` at reasoning effort `none`. That effort keeps `temperature: 0` (repeatable receipt reads) and spends no reasoning tokens. To try a higher effort, set `AI_REASONING_EFFORT` (`low`, `medium`, `high` or `xhigh`; gpt-6-luna has no `minimal`).

The default effort only comes with the default model. If you set `AI_VISION_MODEL` yourself, no effort is sent unless you also set `AI_REASONING_EFFORT`, so a reasoning model needs both lines.

To go back to gpt-4o-mini while it still exists (OpenAI shuts it down on January 14, 2027), set the model and leave the effort out or empty:

```bash
AI_VISION_MODEL=gpt-4o-mini-2024-07-18
AI_REASONING_EFFORT=
```

The API then sends the same requests as before gpt-6-luna: `temperature: 0` and no reasoning effort.

With `AI_PROVIDER=openai-compatible`, set `AI_VISION_MODEL` to your vendor's model. With no effort set, requests stay as they were (`max_tokens`, no `reasoning_effort`), which vendors without reasoning support expect. Only set `AI_REASONING_EFFORT` if the vendor accepts `reasoning_effort` and `max_completion_tokens`.

### Run it in production

Build everything, then start the API with `WEB_DIST_DIR` set. The build and database steps need the dev tools, so install with `--include=dev` even when `NODE_ENV=production` is already set. The API then serves the web app from the same address, which keeps sign-in working in Safari.

```bash
npm ci --include=dev
npm run build
npm run db:migrate
npm run db:seed -w @pocket-pantry/api   # once, loads the ingredient catalog
WEB_DIST_DIR=../web/dist npm run start:prod -w @pocket-pantry/api
```

Set these in the environment (see `.env.example`):

- `NODE_ENV=production`
- `DATABASE_URL`: your Postgres database.
- `CLIENT_ORIGIN` and `BETTER_AUTH_URL`: both the public address, e.g. `https://pantry.example.com`.
- `BETTER_AUTH_SECRET` and `SCAN_TOKEN_SECRET`: different random values, e.g. `openssl rand -base64 48`.
- `AI_API_KEY`: your OpenAI API key.
- `TRUSTED_CLIENT_IP_HEADER`: behind a hosting proxy, the header holding the visitor's IP (Render: `cf-connecting-ip`). Leave it unset when nothing sits in front of the API.

To deploy on Render, see `docs/deploy-render.md`.
