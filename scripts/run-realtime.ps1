# Refresh backup of Realtime Jarvis snapshot
# Usage: npm run backup

$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root "scripts\backup-realtime.ps1")
