# Backup Realtime Jarvis snapshot
# Run from project root: npm run backup

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "package.json"))) {
  $root = Split-Path $PSScriptRoot -Parent
}

$dest = Join-Path $root "backup\jarvis-mark1-realtime"
$exclude = @('node_modules', '.git', 'dist', 'backup', 'ollama-test', 'screenshots', 'jarvis.db')

Write-Host "Backing up Realtime Jarvis to $dest"

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Get-ChildItem $root -Force | Where-Object {
  $exclude -notcontains $_.Name
} | ForEach-Object {
  Copy-Item $_.FullName -Destination $dest -Recurse -Force
}

# Never copy secrets
Remove-Item (Join-Path $dest ".env") -ErrorAction SilentlyContinue

$meta = @"
Jarvis Mark 1 — Realtime (OpenAI GPT Realtime 2) backup
Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Restore: copy contents back to project root (excluding backup/ and ollama-test/)
Run: npm install && npm run dev
"@
Set-Content (Join-Path $dest "BACKUP-README.txt") $meta
Write-Host "Backup complete: $dest"
