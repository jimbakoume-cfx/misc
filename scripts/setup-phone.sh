#!/usr/bin/env bash
# Sets up one or more phones over USB (Mac/Linux). No QR code, no 6 taps.
# Usage: ./setup-phone.sh D9MGX-8VBHW [https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk]
# Phones must be freshly reset, set up WITHOUT any Google/Samsung account, with USB debugging on. See docs/USB_SETUP.md
set -u
CODE="${1:?Usage: ./setup-phone.sh <enrollment code> [server]}"
SERVER="${2:-https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk}"
PKG="com.cofilo.kiosk"
ADB="${ADB:-$(command -v adb || true)}"
[ -x "${ADB:-}" ] || { for c in "$(dirname "$0")/platform-tools/adb" "$HOME/platform-tools/adb"; do [ -x "$c" ] && ADB="$c" && break; done; }
if [ ! -x "${ADB:-}" ]; then
  # Nothing installed yet: fetch Google's USB tools (platform-tools, ~7 MB) next to this script. One-time.
  case "$(uname -s)" in Darwin) os=darwin ;; *) os=linux ;; esac
  echo "Downloading the Android USB tools (one-time, about 7 MB)..."
  dir="$(cd "$(dirname "$0")" && pwd)"
  curl -fsSL -o /tmp/platform-tools.zip "https://dl.google.com/android/repository/platform-tools-latest-$os.zip" \
    && unzip -qo /tmp/platform-tools.zip -d "$dir" && rm -f /tmp/platform-tools.zip \
    || { echo "Could not download the USB tools. Check the internet connection and run again."; exit 1; }
  ADB="$dir/platform-tools/adb"; chmod +x "$ADB" 2>/dev/null || true
  [ -x "$ADB" ] || { echo "The USB tools did not unpack as expected."; exit 1; }
fi

APK="$(mktemp -t confiance-kiosk.XXXXXX).apk"
echo "Downloading the latest Confiance Kiosk app..."
curl -fsSL "$SERVER/apk/latest.apk" -o "$APK" || { echo "Could not download the app from $SERVER"; exit 1; }
echo "Got $(du -h "$APK" | cut -f1)"

"$ADB" start-server >/dev/null 2>&1
DEVICES=$("$ADB" devices | tail -n +2 | awk '$2=="device"{print $1}')
"$ADB" devices | tail -n +2 | awk '$2=="unauthorized"{print "Phone " $1 " is waiting for you to tap Allow USB debugging on its screen, then run this again."}'
[ -n "$DEVICES" ] || { echo "No phone found. Plug it in with a data cable, switch on USB debugging, and tap Allow on the phone."; exit 1; }

for S in $DEVICES; do
  MODEL=$("$ADB" -s "$S" shell getprop ro.product.model | tr -d '\r')
  echo; echo "=== $MODEL ($S)"
  OUT=$("$ADB" -s "$S" install -r "$APK" 2>&1)
  echo "$OUT" | grep -q Success || { echo "Install failed: $OUT"; echo "If the phone asked about Play Protect or install via USB, accept it and run again."; continue; }
  OUT=$("$ADB" -s "$S" shell dpm set-device-owner "$PKG/.AdminReceiver" 2>&1)
  if ! echo "$OUT" | grep -q Success; then
    echo "Could not make the app the device manager: $OUT"
    echo "$OUT" | grep -qi account && echo "The phone has an account on it. Remove it (Settings > Accounts) or factory-reset and skip every account step."
    echo "$OUT" | grep -qiE "already|provision|user" && echo "The phone is already set up in a way that blocks this. Factory-reset it, skip every account step, then run again."
    continue
  fi
  # Portrait only: let the app switch auto-rotate off for the whole phone, and switch it off now.
  "$ADB" -s "$S" shell appops set "$PKG" WRITE_SETTINGS allow >/dev/null 2>&1
  "$ADB" -s "$S" shell settings put system accelerometer_rotation 0 >/dev/null 2>&1
  "$ADB" -s "$S" shell settings put system user_rotation 0 >/dev/null 2>&1
  OUT=$("$ADB" -s "$S" shell am broadcast -n "$PKG/.UsbSetupReceiver" --es server_url "$SERVER" --es enroll_token "$CODE" 2>&1)
  echo "$OUT" | grep -q 'data="ok"' || { echo "The phone did not accept the setup code: $OUT"; continue; }
  "$ADB" -s "$S" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1
  echo "Done. The phone is managed and enrolling. Approve it in the dashboard (Devices)."
done
