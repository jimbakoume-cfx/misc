# Play Protect appeal: Confiance Kiosk (draft)

Submit at: https://support.google.com/googleplay/android-developer/contact/protectappeals
Submit from the company Google account you want Google to reply to. Attach `releases/kiosk-agent-1.3.4.apk` if the form allows a file.
Replace every `[…]` before sending.

---

## Details to enter in the form

| Field | Value |
|---|---|
| App name | Confiance Kiosk |
| Package name | `com.cofilo.kiosk` |
| Version | 1.3.4 (version code 12) |
| APK SHA-256 | `9e38423c28ea381bd46228007e8d5a2bb9612ec44dba501ad62683473cf2df5b` |
| Signing certificate SHA-256 | `c5:20:42:3b:a4:d2:8b:39:51:9b:59:ae:e3:96:6f:cd:0e:fb:e3:c5:50:71:50:44:a3:cd:6b:03:c7:d3:8b:fe` |
| Download URL | https://confiance-kiosk.netlify.app/kiosk-agent.apk |
| Distribution | Not on Google Play. Private, internal distribution only, on company-owned devices. |
| Developer / company | [Company legal name], [country] |
| Contact | [name], jim.bakoume@confiance-app.com |
| Issue | DPC blocked during Android Enterprise QR provisioning (fully managed device) |

## Appeal text (paste into the description box)

Hello,

We are [Company legal name], and we are asking for our device policy controller (DPC), Confiance Kiosk (package `com.cofilo.kiosk`), to be allowed for Android Enterprise QR-code provisioning.

**What the app is.** Confiance Kiosk is an internal, company-built DPC that we use only on our own company-owned phones (about 200 Samsung Galaxy A17 devices) used by our field staff. It is not sold, not offered to other companies, and not on Google Play. We provision each phone ourselves as a fully managed device right after a factory reset, by scanning a QR code on the setup welcome screen.

**What it does.** As device owner, it locks the phone into kiosk mode (Lock Task) so that staff can only open the work apps our company approves. Administrators manage the phones from our own web console: they choose the allowed apps, send a lock or reboot, release a phone from kiosk mode, and update the app. The app also enforces basic protections on company phones (for example, it blocks factory reset and USB debugging by staff).

**What happens today.** The QR code is read and the app downloads, but provisioning then stops with "Something went wrong, contact your IT admin" (Samsung, One UI, Android 15). The app never starts, which matches the Play Protect DPC allowlist block.

**Why it is not harmful or unwanted software.**
- It is installed only on devices owned by our company, by our IT staff, with the explicit setup step Android requires (factory reset and QR provisioning). It is never installed silently on anyone's personal phone.
- It is not a device-financing or payment-enforcement tool, and it does not restrict phones based on payment.
- It does not monitor or spy on users. It has no access to location, contacts, SMS, call logs, camera, microphone, notifications or accessibility services, and it does not request those permissions.
- The only data it sends to our own server (HTTPS only) is device-management information: device name, model, serial number and Android ID, Android version, app version, battery level, network type, free storage, the list of launchable apps (to choose the allowed apps), and crash information.
- Permissions requested: INTERNET, ACCESS_NETWORK_STATE, RECEIVE_BOOT_COMPLETED, FOREGROUND_SERVICE (+ DATA_SYNC), WAKE_LOCK, POST_NOTIFICATIONS, plus the device-admin receiver (BIND_DEVICE_ADMIN) required for a DPC.
- It follows the Android 12+ DPC requirements: it handles `GET_PROVISIONING_MODE` (fully managed device only) and `ADMIN_POLICY_COMPLIANCE`, and it starts no screens or services during setup.

We are happy to provide more information, a test device, or a screen recording of the provisioning flow.

Thank you,
[Name]
[Title], [Company legal name]
jim.bakoume@confiance-app.com
