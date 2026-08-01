# Launch Jarvis Ollama test build (Ollama + ElevenLabs)
# Usage: npm run dev:ollama-test   OR   say "run ollama test"

$root = Split-Path $PSScriptRoot -Parent
$testDir = Join-Path $root "ollama-test"

if (-not (Test-Path $testDir)) {
  Write-Host "ollama-test folder not found. Run: npm run setup:ollama-test"
  exit 1
}

$envFile = Join-Path $testDir ".env"
$envExample = Join-Path $testDir ".env.example"
if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Host "Created .env from .env.example - add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"
  } else {
    Write-Host "Missing .env in ollama-test. Copy .env.example and fill in keys."
    exit 1
  }
}

Push-Location $testDir
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
  }
  Write-Host "Starting Jarvis Ollama test on ports 3848 and 5174..."
  npm run dev
} finally {
  Pop-Location
}
