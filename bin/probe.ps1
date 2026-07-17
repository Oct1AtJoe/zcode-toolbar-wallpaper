# probe.ps1 - shared debug-port probe logic
# Exits:
#   0  -> port open AND at least one "page" target present
#   2  -> port open but no page target yet
#   1  -> could not reach the port
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File probe.ps1 -Port 9222
param(
  [int]$Port = 9222
)

try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:" + $Port + "/json") -TimeoutSec 2
  $t = $r.Content | ConvertFrom-Json
  if (@($t | Where-Object { $_.type -eq 'page' }).Count -gt 0) {
    exit 0
  } else {
    exit 2
  }
} catch {
  exit 1
}
