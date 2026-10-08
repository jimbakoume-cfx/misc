# Setting up phones over USB (no QR code, no 6 taps)

Use this when the QR setup fails or is blocked. It works on every Android phone and sets up all phones plugged into the computer.
You need: a Windows PC (or Mac/Linux), a USB **data** cable, and the enrollment code from the dashboard (**Add devices**).

## One-time on the computer
1. Download **SDK Platform-Tools for Windows** from https://developer.android.com/tools/releases/platform-tools and unzip it.
   Put the `platform-tools` folder next to `setup-phone.ps1` (both from the `scripts` folder of this project).

## For each phone
1. **Factory reset** (Paramètres → Gestion générale → Réinitialisation → Rétablir la configuration d'usine).
2. In the setup wizard: choose the language, **connect to Wi-Fi**, and **skip every account step**: no Google account, no Samsung
   account. Decline the optional offers. (An account on the phone is the one thing that blocks this method.)
3. When the phone is on its home screen, switch on **USB debugging**:
   Paramètres → À propos du téléphone → Informations sur le logiciel → tap **Numéro de build** 7 times →
   back to Paramètres → **Options pour les développeurs** → **Débogage USB** ON.
4. Plug the phone into the computer. On the phone, tap **Autoriser** on the "Allow USB debugging?" question.
5. On the computer, open PowerShell in the `scripts` folder and run:
   ```
   .\setup-phone.ps1 -Code D9MGX-8VBHW
   ```
   (Mac/Linux: `./setup-phone.sh D9MGX-8VBHW`). Plug in several phones at once and it does them one after another.
6. The phone shows **Confiance Kiosk** and appears in the dashboard under **Devices** as "needs approval". Click **Approve**.

## If something goes wrong
- *"No phone found"*: use a data cable (not charge-only), re-do step 3–4, tap Autoriser.
- *"…there are already some accounts on the device"*: remove the account (Paramètres → Comptes), or reset and skip the account steps.
- *"Install failed"*: accept any Play Protect or "install via USB" question on the phone and run again.
- Samsung **Auto Blocker** (Paramètres → Sécurité et confidentialité) blocks USB commands and every later app update or
  install from the dashboard (the phone then reports "INSTALL_FAILED_VERIFICATION_FAILURE: Install not allowed").
  The setup script switches it off; since agent 1.4.10 the app finds every Auto Blocker switch on the phone, writes
  it off before each check-in and the moment someone turns it on, and the phone's page in the dashboard shows
  "Auto Blocker: off, kept off by the app" (or "on, no permission" when the USB setup was skipped). A refused update also makes the
  app switch Auto Blocker off, restart the phone once and install the update right after boot (on a Galaxy A17 the
  block only lifts after a restart); the dashboard shows "restarting the phone to retry" meanwhile. If an update is
  still refused after that restart, switch Auto Blocker off by hand (search "Auto Blocker" in Settings) and leave it off.
- To start over on a phone: factory-reset it.
