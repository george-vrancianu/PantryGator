# The app draws edge to edge and pads itself by the device's safe area

In the iPhone app, the top of every page sat behind the clock and the Dynamic Island, where the controls were hard to tap. The webview already runs under the status bar (Capacitor's default `contentInset: 'never'`), but the viewport had no `viewport-fit=cover`, so iOS reported every `env(safe-area-inset-*)` as 0. Code that already offset by the inset (pull-to-refresh, the camera top bar, the bars above the Dock) silently got 0. We decided the web app sets `viewport-fit=cover` and pads itself by the real safe area on every edge, on every platform. A device with no notch, island or home indicator reports 0 and does not change.

## Decision

- **Top.** Pages are padded by `env(safe-area-inset-top)`. A fixed band of that height, in the page background colour, covers the status bar, so scrolled content goes under the band and nothing tappable sits behind the island or the iOS edge blur. Sticky headers stick at `top: env(safe-area-inset-top)`, not at `top: 0`. A header's own top room (28px on the Screen and Dashboard headers) gives way to the inset instead of stacking on it: it becomes `max(0px, 28px - inset)`, so the header starts at `max(28px, inset)`. Stacked, it left the first control about 35px below the inset on an iPhone with a Dynamic Island. Pages with no header still get the full inset.
- **Bottom.** The Dock sits at `max(28px, env(safe-area-inset-bottom))`, and everything placed above it uses the same expression, so the Dock clears the home indicator and stays lined up with the bars above it.
- **Sides.** Page gutters are `max(20px, env(safe-area-inset-left/right))`, so iPhone landscape keeps content out from under the island.
- **Full-screen views handle their own insets.** The Scan camera stays edge to edge and offsets its controls by the inset. Tall Sheets are capped below the top inset so their grab handle stays reachable.

## Considered options

- **Native `contentInset: 'always'`**, so iOS shrinks the webview below the status bar. Rejected: the camera could no longer draw under the island, the web app in Safari and Android would still need its own handling, and the existing `env()` code would stay at 0.
- **A fixed top padding for iPhones only.** Rejected: it guesses at heights that differ by model and orientation, and misses Android edge-to-edge (Android 15+).
