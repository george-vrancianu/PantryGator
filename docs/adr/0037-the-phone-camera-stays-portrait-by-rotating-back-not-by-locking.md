# The phone camera stays portrait by rotating back, not by locking

On a phone, the camera screen should not change when the Member turns the phone to landscape, for example to hold it in both hands over a receipt. The top bar, guide, shutter row, mode slider and everything that opens over the camera stay on the phone's portrait edges, and the photo comes out as if the phone had not turned. A web app cannot lock the orientation of one screen, so on the web the camera lets the browser rotate and then rotates its chrome back with CSS. A native lock is only used where the native shell does the locking.

## Decision

- **Phone vs tablet.** A screen whose shortest side is under 600 is a phone; anything else (tablets, laptop and desktop windows) is a tablet. The class does not change when the screen rotates.
- **Phone: rotate back.** When the screen reports an angle (90, 180 or 270), the camera chrome is rotated by the opposite angle, so it stays fixed to the phone. The video is not rotated back: the browser already delivers frames upright for the rotated screen, which is upright to the world.
- **Phone: turn the photo.** The photo is turned by the screen angle at the moment the shutter fires, so it is in the phone's portrait frame, matching the guide the Member framed. A receipt in the tall Receipt guide comes out upright.
- **One switch for both.** The rotate-back and the photo turn are one runtime setting, "orientation is handled by the shell", that defaults to off (the web). They must change together: rotating back without turning the photo leaves receipts sideways, and turning without rotating back turns the photo twice.
- **Tablet: reflow, no lock.** A tablet in landscape gets an upright layout with a rail on the right (photo stack, zoom pill, shutter, mode slider as a vertical list, Import). The tablet never rotates back and is never locked.

## Considered Options

- **`screen.orientation.lock('portrait')`.** Not supported on iOS Safari or iOS home-screen apps. On Android Chrome it needs fullscreen: `display: standalone` does not qualify, so the camera would have to call `requestFullscreen()` from the tap that opens it. That hides the status and navigation bars, and it is a second code path to test for one flicker. Rejected for the web.
- **Manifest `orientation: "portrait"`.** Ignored on iOS, and on Android it applies to the whole app, not one screen. Rejected.
- **Keep the portrait layout and accept the browser's rotation.** That is today's behaviour: in landscape the chrome squeezes into a bottom strip over a short feed. This is the problem.

## Consequences

- On the web, iOS always plays its rotation animation first, so the Member sees the screen turn and then snap back. We accept this.
- With iOS Rotation Lock on, the screen never rotates, the angle stays 0 and the camera already behaves as intended.
- The rotate-back maps the safe-area insets to the rotated edges itself, since `env(safe-area-inset-*)` follows the browser's orientation.
- **The app builds (ADR 0036)** turn the switch on and lock portrait natively while the camera is open, on phones only. Use `@capacitor/screen-orientation` with `lock()` on open and `unlock()` on close. Tablets are left unlocked, which also avoids iPadOS ignoring locks for apps that support Split View. Under a native lock the screen angle stays 0, so the web path would do nothing anyway; the switch makes the hand-over explicit instead of relying on that. The lock calls belong with that work, not with the camera.
