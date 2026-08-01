# Copy project to ollama-test/ for Ollama + ElevenLabs experiments
# Run: npm run setup:ollama-test

$root = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $root "ollama-test"
$exclude = @('node_modules', '.git', 'dist', 'backup', 'ollama-test', 'screenshots', 'jarvis.db')

Write-Host "Creating ollama-test copy at $dest"

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Get-ChildItem $root -Force | Where-Object {
  $exclude -notcontains $_.Name
} | ForEach-Object {
  Copy-Item $_.FullName -Destination $dest -Recurse -Force
}

Remove-Item (Join-Path $dest ".env") -ErrorAction SilentlyContinue
Write-Host "ollama-test copy ready. Add .env with ELEVENLABS_API_KEY, then npm install && npm run dev"
