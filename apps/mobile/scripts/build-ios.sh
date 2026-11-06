#!/usr/bin/env bash
# Builds the iOS app from the current checkout, stamped with a build number, and installs it on a phone.
#   TEAM_ID=<Apple team> apps/mobile/scripts/build-ios.sh [device-udid]
# Without a device it builds for any iPhone. `xcrun devicectl list devices` lists the UDIDs; a phone
# paired with the Mac once over USB also works over Wi-Fi.
#
# The build number is the Mac's local time, YYYYMMDD.HHMM: it always grows, as TestFlight needs, and
# is the app's CFBundleVersion. Settings shows it under Sign out with the commit
# ("Build 20261106.1758 · 9dabce4", "-dirty" for uncommitted changes).
# Over SSH, unlock the login keychain first, or codesign fails with errSecInternalComponent.
set -euo pipefail

: "${TEAM_ID:?Set TEAM_ID to the Apple Developer team ID}"
device="${1:-}"
mobile="$(cd "$(dirname "$0")/.." && pwd)"

build_number="$(date +%Y%m%d.%H%M)"
commit="$(git -C "$mobile" describe --always --dirty --abbrev=7)"
export VITE_BUILD="$build_number · $commit"
echo "Build $VITE_BUILD"

(cd "$mobile" && npm run sync)

if [ -n "$device" ]; then destination="id=$device"; else destination="generic/platform=iOS"; fi
derived="$HOME/Library/Developer/Xcode/DerivedData/pocketPantry"
xcodebuild -project "$mobile/ios/App/App.xcodeproj" -scheme App -configuration Debug \
  -destination "$destination" -derivedDataPath "$derived" -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$build_number" build -quiet

if [ -n "$device" ]; then
  app="$derived/Build/Products/Debug-iphoneos/App.app"
  xcrun devicectl device install app --device "$device" "$app"
  xcrun devicectl device process launch --terminate-existing --device "$device" ro.vrancianu.pantrygator \
    || echo "Installed. Unlock the phone and open PantryGator."
fi
