# Creates Jarvis.lnk and Jarvis(Mark1).lnk on the user's Desktop.
# Prefers C:\Jarvis(Mark1) so edits in that copy are what double-click runs.

$ErrorActionPreference = "Stop"

$repoVbs = Join-Path $PSScriptRoot "Jarvis.vbs"
if (-not (Test-Path $repoVbs)) {
  throw "Missing launcher: $repoVbs"
}

function Add-DesktopDir([System.Collections.Generic.List[string]]$list, [string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return }
  if (-not (Test-Path $path)) { return }
  $full = [IO.Path]::GetFullPath($path)
  if ($list | Where-Object { $_.ToLowerInvariant() -eq $full.ToLowerInvariant() }) { return }
  $list.Add($full)
}

function Test-JarvisRoot([string]$dir) {
  if ([string]::IsNullOrWhiteSpace($dir)) { return $false }
  if (-not (Test-Path -LiteralPath $dir)) { return $false }
  $pkg = Join-Path $dir "package.json"
  if (Test-Path -LiteralPath $pkg) {
    $txt = Get-Content -LiteralPath $pkg -Raw -ErrorAction SilentlyContinue
    if ($txt -match 'jarvis-mark1') { return $true }
  }
  return (Test-Path -LiteralPath (Join-Path $dir "scripts\Jarvis.bat")) -and
    (Test-Path -LiteralPath (Join-Path $dir "electron\main.cjs"))
}

$names = @("Jarvis(Mark1)", "Jarvis (Mark 1)", "Jarvis-Mark1", "Jarvis Mark 1", "jarvis-mark1", "Jarvis")
$projectRoot = $null
foreach ($name in $names) {
  $candidate = Join-Path "C:\" $name
  if (Test-JarvisRoot $candidate) {
    $projectRoot = (Get-Item -LiteralPath $candidate).FullName
    break
  }
}
if (-not $projectRoot) {
  Get-ChildItem -LiteralPath "C:\" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'jarvis' } |
    ForEach-Object {
      if (-not $projectRoot -and (Test-JarvisRoot $_.FullName)) {
        $projectRoot = $_.FullName
      }
    }
}
if (-not $projectRoot) {
  $scriptParent = Split-Path $PSScriptRoot -Parent
  if (Test-JarvisRoot $scriptParent) {
    $projectRoot = $scriptParent
  }
}
if (-not $projectRoot) {
  throw "Could not find Jarvis(Mark1). Copy it to C:\Jarvis(Mark1) and run this again."
}

$bat = Join-Path $projectRoot "scripts\Jarvis.bat"
if (-not (Test-Path -LiteralPath $bat)) {
  throw "Missing launcher: $bat"
}

$desktopDirs = New-Object 'System.Collections.Generic.List[string]'
Add-DesktopDir $desktopDirs ([Environment]::GetFolderPath("Desktop"))
Add-DesktopDir $desktopDirs (Join-Path $env:USERPROFILE "Desktop")
Add-DesktopDir $desktopDirs (Join-Path $env:USERPROFILE "OneDrive\Desktop")
Add-DesktopDir $desktopDirs (Join-Path $env:USERPROFILE "OneDrive - Personal\Desktop")
if ($env:OneDrive) { Add-DesktopDir $desktopDirs (Join-Path $env:OneDrive "Desktop") }
Add-DesktopDir $desktopDirs ([Environment]::GetFolderPath("CommonDesktopDirectory"))

if ($desktopDirs.Count -eq 0) {
  throw "Could not locate a Desktop folder."
}

$desktop = $desktopDirs[0]
$WshShell = New-Object -ComObject WScript.Shell
$shortcutNames = @("Jarvis.lnk", "Jarvis(Mark1).lnk")
foreach ($name in $shortcutNames) {
  $shortcutPath = Join-Path $desktop $name
  $Shortcut = $WshShell.CreateShortcut($shortcutPath)
  $Shortcut.TargetPath = $bat
  $Shortcut.Arguments = "`"$projectRoot`""
  $Shortcut.WorkingDirectory = $projectRoot
  $Shortcut.WindowStyle = 7
  $Shortcut.Description = "Jarvis (Mark 1) — OpenAI desktop companion"
  $Shortcut.Save()
  Write-Host "Desktop shortcut created: $shortcutPath"
}

Write-Host "Project folder: $projectRoot"
Write-Host "Launcher: $bat"
Write-Host "Double-click Jarvis on the Desktop to run this copy."
