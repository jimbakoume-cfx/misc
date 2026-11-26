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

DONE=0; FAILED=0
# Android's own sentence about why it refused, without the technical trace that follows it.
reason() { echo "$1" | grep -E "Exception:|Error:" | head -n 1 | sed -E 's/^.*(Exception|Error):[[:space:]]*//' | tr -d '\r'; }
for S in $DEVICES; do
  MODEL=$("$ADB" -s "$S" shell getprop ro.product.model | tr -d '\r')
  echo; echo "=== $MODEL ($S)"
  OUT=$("$ADB" -s "$S" install -r "$APK" 2>&1)
  if echo "$OUT" | grep -qE "UPDATE_INCOMPATIBLE|signatures do not match|INCONSISTENT_CERTIFICATES"; then
    # An older copy signed with the previous key is on the phone: it has to go before the new one can be installed.
    echo "An older Confiance Kiosk (previous signing key) is installed: removing it first..."
    UN=$("$ADB" -s "$S" uninstall "$PKG" 2>&1)
    if ! echo "$UN" | grep -q Success; then
      echo "The old app is still managing this phone, so it cannot be removed: $UN"
      echo "Either press 'Release & remove' for this phone on the dashboard, wait until the phone unlocks, switch USB debugging on again and run this again; or factory-reset the phone, skip every account step, and run this again."
      FAILED=$((FAILED+1)); continue
    fi
    OUT=$("$ADB" -s "$S" install -r "$APK" 2>&1)
  fi
  echo "$OUT" | grep -q Success || { FAILED=$((FAILED+1)); echo "Install failed: $OUT"; echo "If the phone asked about Play Protect or install via USB, accept it and run again."; continue; }
  OUT=$("$ADB" -s "$S" shell dpm set-device-owner "$PKG/.AdminReceiver" 2>&1)
  if ! echo "$OUT" | grep -q Success; then
    # Is Confiance Kiosk already in charge of this phone? Then only the app needed updating.
    if "$ADB" -s "$S" shell dpm list-owners 2>&1 | grep -qF "$PKG"; then echo "This phone is already managed by Confiance Kiosk: the app was updated to the latest version, nothing else to do."; DONE=$((DONE+1)); continue; fi
    FAILED=$((FAILED+1))
    echo "This phone is NOT set up yet. Android refused to put Confiance Kiosk in charge:"
    echo "  $(reason "$OUT")"
    if echo "$OUT" | grep -qiE "accounts? on the device"; then
      ACC=$("$ADB" -s "$S" shell dumpsys account 2>/dev/null | tr -d '\r' | grep "Account {name=" | sed -E 's/.*type=([^} ]+).*/\1/; s/^com\.google$/Google/; s/^com\.osp\.app\.signin$/Samsung-account/' | sort -u | tr '\n' ' ')
      [ -n "$ACC" ] && echo "  Accounts found on the phone: $ACC"
      echo "What to do: on the phone, open Settings > Accounts and backup > Manage accounts, tap each account and choose 'Remove account'."
      echo "When the list is empty, run this again. (Or factory-reset the phone and skip every Google and Samsung account step.)"
    elif echo "$OUT" | grep -qiE "users? on the device"; then
      echo "What to do: the phone has a second user or profile (Secure Folder, work profile, guest). Remove it in Settings, or factory-reset the phone, then run this again."
    elif echo "$OUT" | grep -qiE "already (set|has)|already provisioned|is already"; then
      echo "What to do: the phone is already managed by something else or was fully set up. Factory-reset it, skip every account step, then run this again."
    else
      echo "What to do: factory-reset the phone, skip every Google and Samsung account step, switch USB debugging on, then run this again."
    fi
    continue
  fi
  # Samsung Auto Blocker refuses every app that is not from a store (our updates included): switch it off now and let
  # the app keep it off. Only settings whose name starts with "rampart_" (Samsung's name for it) are touched.
  "$ADB" -s "$S" shell pm grant "$PKG" android.permission.WRITE_SECURE_SETTINGS >/dev/null 2>&1
  # Deep sleep must not pause the live connection (instant commands and Locate): exempt the app from battery optimisation.
  "$ADB" -s "$S" shell dumpsys deviceidle whitelist "+$PKG" >/dev/null 2>&1
  FOUND=""
  for NS in secure global; do
    for NAME in $("$ADB" -s "$S" shell settings list "$NS" 2>/dev/null | tr -d '\r' | grep -E '^(rampart_[^=]*(enabled|switch)[^=]*|block_unverified_apps)=' | cut -d= -f1); do
      "$ADB" -s "$S" shell settings put "$NS" "$NAME" 0 >/dev/null 2>&1; FOUND="$FOUND $NS/$NAME"
    done
  done
  if [ -n "$FOUND" ]; then echo "Samsung Auto Blocker switched off ($FOUND )"; else echo "No Auto Blocker setting found on this phone. If updates are refused later, switch it off by hand (Settings > Security and privacy)."; fi
  # Portrait only: let the app switch auto-rotate off for the whole phone, and switch it off now.
  "$ADB" -s "$S" shell appops set "$PKG" WRITE_SETTINGS allow >/dev/null 2>&1
  "$ADB" -s "$S" shell settings put system accelerometer_rotation 0 >/dev/null 2>&1
  "$ADB" -s "$S" shell settings put system user_rotation 0 >/dev/null 2>&1
  OUT=$("$ADB" -s "$S" shell am broadcast -n "$PKG/.UsbSetupReceiver" --es server_url "$SERVER" --es enroll_token "$CODE" 2>&1)
  echo "$OUT" | grep -q 'data="ok"' || { FAILED=$((FAILED+1)); echo "The phone did not accept the setup code: $OUT"; continue; }
  "$ADB" -s "$S" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1
  DONE=$((DONE+1))
  echo "Done. The phone is managed and enrolling. Approve it on the dashboard under Phones."
done

echo
if [ "$FAILED" -eq 0 ]; then echo "Finished: $DONE phone(s) set up. Approve them on the dashboard under Phones."
elif [ "$DONE" -eq 0 ]; then echo "Finished, but NO phone was set up. Follow 'What to do' above, then run this again."
else echo "Finished: $DONE phone(s) set up, $FAILED not set up. Follow 'What to do' above for those, then run this again."; fi
[ "$FAILED" -eq 0 ] || exit 2
