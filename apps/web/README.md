# @pocket-pantry/web

React 19 + Vite web app. It only renders and calls the API; business logic lives in `apps/api`.

## Run it

`npm run dev` from the repository root starts Postgres, the API on `:3000` and this app on
`http://localhost:5173`. To run only the web app: `npm run dev -w @pocket-pantry/web`.

The API origin defaults to the current hostname on port 3000. Set `VITE_API_URL` to point
elsewhere. The API only accepts browser origins on ports 5173 and 5174 (plus `CLIENT_ORIGIN`).

Set `VITE_SIRI_SHORTCUT_URL` (build time) to the iCloud link of the "Pantry add" Shortcut to show it in
Settings > Siri; the link is hidden while unset (Settings then says the link is coming soon).
`VITE_SIRI_NEEDS_SHORTCUT_URL` ("Gator needs"), `VITE_SIRI_GOT_SHORTCUT_URL` ("Gator got") and
`VITE_SIRI_HAVE_SHORTCUT_URL` ("Gator, do we have") do the same for the other three Shortcuts (the old `VITE_SIRI_CHECK_SHORTCUT_URL` for "Pantry check" is retired and no longer read). See [docs/siri-shortcut.md](../../docs/siri-shortcut.md).

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (all with `-w @pocket-pantry/web`).

## Conventions

- **Pages** live in `src/pages/<Name>/<Name>Page.tsx`. Page-only components go in
  `components/`, hooks in `hooks/`, helpers in `utils/`. Tests sit next to the page.
- **UI** comes from `@pocket-pantry/ui` (Material UI behind our own components, themed with
  the handoff tokens). Do not import `@mui/*` in this app. Add missing primitives to the
  UI package instead.
- **Server state** is TanStack Query. Query keys and API hooks live in `src/lib`.
- **Links** use plain `href` props; `RouterLink` is registered as the UI provider's
  `linkComponent` so they navigate client-side.

## Translations

`react-i18next`, English (fallback), Romanian and Danish. One JSON file per namespace per locale in
`src/i18n/locales/<locale>/<namespace>.json`, loaded automatically. A namespace is a page
(`signIn`, `pantry`, ...) or a shared component (`dock`, `screenHeader`, `languageSwitcher`).

- Every string on screen goes through `t()`. Add the key to all three locales: `src/i18n/parity.test.ts`
  fails if `ro` or `da` differ from `en` in namespaces, keys or interpolation variables, if a locale lacks
  the plural forms its language needs (Romanian `few`), or if the English copy uses a term `GLOSSARY.md` avoids.
- API errors are `{ code, params }`. Codes such as `auth.invalid_email_or_password` resolve
  against the nested `errors` namespace (`translateApiError`). Unknown codes show the generic
  message; add copy for new codes in all three locales.
- The UI Language is stored on the Member (Member Preference `locale`, ADR 0022); Settings saves it with
  `useSaveLocale`. `localStorage` (`pocket-pantry.locale`) is only a local cache that picks the language
  before sign-in and until the Member's own has loaded.
