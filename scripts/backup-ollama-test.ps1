# Backup Ollama + ElevenLabs + local Whisper test build
# Run from project root: npm run backup:ollama-test

$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "ollama-test"
$dest = Join-Path $root "backup\jarvis-ollama-test"
$logsDir = Join-Path $root "logs"
$exclude = @('node_modules', 'dist', 'screenshots', 'jarvis.db')

if (-not (Test-Path $src)) {
  Write-Host "ollama-test folder not found at $src"
  exit 1
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$downloadsZip = Join-Path $env:USERPROFILE "Downloads\Jarvis-Ollama-Test-Backup-$stamp.zip"

Write-Host "Backing up Ollama test build to $dest"

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Get-ChildItem $src -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
  Copy-Item $_.FullName -Destination $dest -Recurse -Force
}

Remove-Item (Join-Path $dest ".env") -ErrorAction SilentlyContinue

$meta = @"
Jarvis Mark 1 — Ollama + ElevenLabs + local Whisper test build
Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Branch snapshot: cursor/jarvis-desktop-companion (local Whisper voice pipeline)

Restore:
  1. Copy this folder to <project>/ollama-test
  2. Copy .env.example to .env and add API keys
  3. cd ollama-test && npm install && npm run dev
  Or from project root: npm run dev:ollama-test

Requires: Ollama (qwen3.5:2b + 9b), ElevenLabs API key, local Whisper via @xenova/transformers
Ports: 3848 (server), 5174 (vite)
"@
Set-Content (Join-Path $dest "BACKUP-README.txt") $meta

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$manifest = Join-Path $logsDir "ollama-test-backup-$stamp.txt"
@"
Jarvis Ollama test backup
Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Project copy: $dest
Downloads zip: $downloadsZip
Restore: see BACKUP-README.txt in either location
"@ | Set-Content $manifest

Write-Host "Creating Downloads archive..."
if (Test-Path $downloadsZip) { Remove-Item $downloadsZip -Force }
Compress-Archive -Path $dest -DestinationPath $downloadsZip -Force

Write-Host ""
Write-Host "Backup complete."
Write-Host "  Project:  $dest"
Write-Host "  Logs:     $manifest"
Write-Host "  Download: $downloadsZip"
