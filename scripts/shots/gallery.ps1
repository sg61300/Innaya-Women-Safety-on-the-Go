# Cycle the eight palettes through the dev gallery route and screenshot each.
# Requires: emulator running with the VAIRA app installed and Metro serving JS.
# Output: <vault>\Design\screens\gallery-<key>.png (the C1 visual contact sheet).
#
# Notes learned on-device (Windows PowerShell 5.1):
#  - the deep link needs THREE slashes (vaira:///gallery) so "gallery" is the
#    path, not the URI host (vaira://gallery resolves to Unmatched Route);
#  - never pipe `screencap -p` through `>` in PS 5.1 — text-mode redirection
#    injects a BOM and corrupts the PNG. Capture to the device, then `adb pull`.
$vault = "./Design/screens"
New-Item -ItemType Directory -Force -Path $vault | Out-Null
foreach ($k in "midnight","violetBloom","rosePetal","blushLavender","oceanMist","goldenIvory","sakuraDawn","darkCherry") {
  adb shell am start -W -a android.intent.action.VIEW -d "vaira:///gallery?palette=$k" com.vaira.app | Out-Null
  Start-Sleep -Seconds 3
  adb shell screencap -p /sdcard/gallery-shot.png
  adb pull /sdcard/gallery-shot.png "$vault\gallery-$k.png" | Out-Null
  Write-Host "shot $k"
}
adb shell rm -f /sdcard/gallery-shot.png | Out-Null
