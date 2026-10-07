# Setting up a phone (≈2 minutes, no cables)

## Per phone
1. Factory-reset the phone (or use a brand-new one). **It must be at the first "Welcome / Hi there" screen.**
2. Tap the same spot on that screen **6 times** until a QR scanner appears.
3. Connect to Wi-Fi if asked (or include Wi-Fi in the QR via Dashboard → Settings).
4. Scan the QR from Dashboard → **Add devices**.
5. The phone downloads the app, installs it, becomes **device-owner managed**, locks itself to the allowed apps and appears in the dashboard.

Once set up, the lock survives reboots: the kiosk is the Home screen, Back/Recents/status bar are disabled,
safe-mode, factory reset, USB debugging and installing/removing apps are blocked.

## Leaving kiosk mode (administrator)
- On the phone: tap the device name at the top **5 times quickly** → enter the admin PIN → *Release device*.
- From the dashboard: open the device → *Release (unlock) device* / *Re-lock kiosk*.
- To remove management completely, use the `unenroll` command (device then behaves like a normal phone).

## Signing-certificate checksum
The QR contains the SHA-256 of the app's signing certificate so Android can verify the download.
For the supplied build it is in `releases/kiosk-agent-1.3.0.txt`. For your own build:
```bash
keytool -list -v -keystore kiosk-release.keystore -alias kiosk | grep SHA256
# convert the hex to base64url (no padding):
python3 -c "import base64,binascii,sys;print(base64.urlsafe_b64encode(binascii.unhexlify(sys.argv[1].replace(':',''))).decode().rstrip('='))" AA:BB:...
```
**Always sign updates with the same keystore**, otherwise devices will refuse the update. Keep the keystore and its password safe and backed up.

## Alternative for a few devices (USB)
On a freshly reset phone with **no Google account added** and USB debugging on:
```bash
adb install kiosk-agent-1.3.0.apk
adb shell dpm set-device-owner com.cofilo.kiosk/.AdminReceiver
```
Then enter the server address and enrolment code on the phone's screen.

## Troubleshooting
- *QR scanner doesn't appear:* the phone isn't on the first setup screen; reset it again.
- *"Can't set up your device":* the phone already has an account or the checksum doesn't match the APK's certificate.
- *Device shows "not locked" in the dashboard:* the app is installed but is not device owner; re-provision it.
