<#
 Sets up one or more phones over USB (Windows). No QR code, no 6 taps.
 Usage (PowerShell):   .\setup-phone.ps1 -Code D9MGX-8VBHW
 Optional:             -Server https://confiance-kiosk.netlify.app   -Adb C:\path\to\platform-tools\adb.exe
 Phones must be freshly reset, set up WITHOUT any Google/Samsung account, with USB debugging on. See docs/USB_SETUP.md
#>
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$Server = "https://confiance-kiosk.netlify.app",
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
  Say "adb was not found. Download 'SDK Platform-Tools for Windows' from https://developer.android.com/tools/releases/platform-tools," Red
  Say "unzip it next to this script (so you have a 'platform-tools' folder) and run again." Red
  exit 1
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
    if ($out -match "account") { Say "The phone has an account on it. Remove it (Settings > Accounts) or factory-reset and skip every account step in the setup." Yellow }
    elseif ($out -match "already|provision|user") { Say "The phone is already set up in a way that blocks this. Factory-reset it, skip every account step, then run this again." Yellow }
    continue
  }
  $out = Run $s @("shell", "am", "broadcast", "-n", "$Package/.UsbSetupReceiver", "--es", "server_url", $Server, "--es", "enroll_token", $Code)
  if ($out -notmatch "data=`"ok`"") { Say "The phone did not accept the setup code: $out" Red; continue }
  Run $s @("shell", "am", "start", "-n", "$Package/.MainActivity") | Out-Null
  Say "Done. The phone is managed and enrolling. Approve it in the dashboard (Devices)." Green
}
