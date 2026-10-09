<#
 Sets up one or more phones over USB (Windows). No QR code, no 6 taps.
 Usage (PowerShell):   .\setup-phone.ps1 -Code D9MGX-8VBHW
 Optional:             -Server https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk   -Adb C:\path\to\platform-tools\adb.exe
 Phones must be freshly reset, set up WITHOUT any Google/Samsung account, with USB debugging on. See docs/USB_SETUP.md
#>
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$Server = "https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk",
  [string]$Adb = ""
)
$ErrorActionPreference = "Continue"
$Package = "com.cofilo.kiosk"
function Say($text, $color = "White") { Write-Host $text -ForegroundColor $color }

# 1. find adb
if (-not $Adb) {
  foreach ($c in @("$PSScriptRoot\platform-tools\adb.exe", "$PSScriptRoot\..\platform-tools\adb.exe", "$HOME\platform-tools\adb.exe", "$HOME\Downloads\platform-tools\adb.exe", "$HOME\Downloads\platform-tools-latest-windows\platform-tools\adb.exe")) {
    if (Test-Path $c) { $Adb = $c; break }
  }
  if (-not $Adb) { $cmd = Get-Command adb -ErrorAction SilentlyContinue; if ($cmd) { $Adb = $cmd.Source } }
}
if (-not $Adb) {
  # Nothing installed yet: fetch Google's USB tools (platform-tools, ~7 MB) next to this script. One-time, no admin rights needed.
  Say "Downloading the Android USB tools (one-time, about 7 MB)..."
  $zip = Join-Path $env:TEMP "platform-tools-latest-windows.zip"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $PSScriptRoot -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
  } catch { Say "Could not download the USB tools: $($_.Exception.Message)" Red; Say "Check the internet connection and run again." Red; exit 1 }
  $Adb = "$PSScriptRoot\platform-tools\adb.exe"
  if (-not (Test-Path $Adb)) { Say "The USB tools did not unpack as expected. Run again, or unzip platform-tools next to this script." Red; exit 1 }
  Say "USB tools ready." Green
}
function Run($serial, [string[]]$adbArgs) { (& $Adb -s $serial @adbArgs 2>&1 | Out-String).Trim() }

# 2. download the latest app
$apk = Join-Path $env:TEMP "confiance-kiosk-latest.apk"
Say "Downloading the latest Confiance Kiosk app..."
try { Invoke-WebRequest -Uri "$Server/apk/latest.apk" -OutFile $apk -UseBasicParsing } catch { Say "Could not download the app from $Server : $($_.Exception.Message)" Red; exit 1 }
Say ("Got " + [math]::Round((Get-Item $apk).Length / 1MB, 1) + " MB") Green

# 3. find phones
& $Adb start-server 2>&1 | Out-Null
$lines = (& $Adb devices 2>&1) -split "`n" | Select-Object -Skip 1
$ready = @(); foreach ($l in $lines) { if ($l -match "^(\S+)\s+device\s*$") { $ready += $Matches[1] } elseif ($l -match "^(\S+)\s+unauthorized") { Say "Phone $($Matches[1]) is waiting for you to tap 'Allow USB debugging' on its screen, then run this again." Yellow } }
if ($ready.Count -eq 0) { Say "No phone found. Plug it in with a data cable, switch on USB debugging, and tap 'Allow' on the phone." Red; exit 1 }

# 4. each phone
foreach ($s in $ready) {
  $model = Run $s @("shell", "getprop", "ro.product.model")
  Say "`n=== $model ($s)" Cyan
  $out = Run $s @("install", "-r", $apk)
  if ($out -notmatch "Success") { Say "Install failed: $out" Red; Say "If the phone showed a Play Protect or 'install via USB' question, accept it and run again." Yellow; continue }
  $out = Run $s @("shell", "dpm", "set-device-owner", "$Package/.AdminReceiver")
  if ($out -notmatch "Success") {
    Say "Could not make the app the device manager: $out" Red
    if ($out -match "already.*owner|device owner.*already") { Say "This phone is already managed: the app was updated to the latest version, nothing else to do." Green; continue }
    if ($out -match "account") { Say "The phone has an account on it. Remove it (Settings > Accounts) or factory-reset and skip every account step in the setup." Yellow }
    elseif ($out -match "already|provision|user") { Say "The phone is already set up in a way that blocks this. Factory-reset it, skip every account step, then run this again." Yellow }
    continue
  }
  # Samsung Auto Blocker refuses every app that is not from a store (our updates included): switch it off now and let
  # the app keep it off. Only settings whose name starts with "rampart_" (Samsung's name for it) are touched.
  Run $s @("shell", "pm", "grant", $Package, "android.permission.WRITE_SECURE_SETTINGS") | Out-Null
  # Deep sleep must not pause the live connection (instant commands and Locate): exempt the app from battery optimisation.
  Run $s @("shell", "dumpsys", "deviceidle", "whitelist", "+com.cofilo.kiosk") | Out-Null
  $found = @()
  foreach ($ns in @("secure", "global")) {
    $lines = (Run $s @("shell", "settings", "list", $ns)) -split "`n" | Where-Object { $_ -match "^(rampart_\S*(enabled|switch)\S*|block_unverified_apps)=" }
    foreach ($l in $lines) { $name = ($l.Trim() -split "=")[0]; Run $s @("shell", "settings", "put", $ns, $name, "0") | Out-Null; $found += "$ns/$name" }
  }
  if ($found.Count) { Say ("Samsung Auto Blocker switched off (" + ($found -join ", ") + ")") Green }
  else { Say "No Auto Blocker setting found on this phone. If updates are refused later, switch Auto Blocker off by hand (Settings > Security and privacy)." Yellow }
  # Portrait only: let the app switch auto-rotate off for the whole phone, and switch it off now.
  Run $s @("shell", "appops", "set", $Package, "WRITE_SETTINGS", "allow") | Out-Null
  Run $s @("shell", "settings", "put", "system", "accelerometer_rotation", "0") | Out-Null
  Run $s @("shell", "settings", "put", "system", "user_rotation", "0") | Out-Null
  $out = Run $s @("shell", "am", "broadcast", "-n", "$Package/.UsbSetupReceiver", "--es", "server_url", $Server, "--es", "enroll_token", $Code)
  if ($out -notmatch "data=`"ok`"") { Say "The phone did not accept the setup code: $out" Red; continue }
  Run $s @("shell", "am", "start", "-n", "$Package/.MainActivity") | Out-Null
  Say "Done. The phone is managed and enrolling. Approve it in the dashboard (Devices)." Green
}
