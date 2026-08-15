# Creates Jarvis.lnk and Jarvis(Mark1).lnk on the user's Desktop.
# The shortcuts call Windows Script Host (wscript.exe) with a Desktop copy of
# Jarvis.vbs so they still work after the project folder is moved, as long as
# Jarvis(Mark1) is on the Desktop.

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
$desktopVbs = Join-Path $desktop "Jarvis(Mark1).vbs"
Copy-Item -Path $repoVbs -Destination $desktopVbs -Force

$WshShell = New-Object -ComObject WScript.Shell
$shortcutNames = @("Jarvis.lnk", "Jarvis(Mark1).lnk")
foreach ($name in $shortcutNames) {
  $shortcutPath = Join-Path $desktop $name
  $Shortcut = $WshShell.CreateShortcut($shortcutPath)
  $Shortcut.TargetPath = "wscript.exe"
  $Shortcut.Arguments = "`"$desktopVbs`""
  $Shortcut.WorkingDirectory = $desktop
  $Shortcut.WindowStyle = 7
  $Shortcut.Description = "Jarvis (Mark 1) — OpenAI desktop companion"
  $Shortcut.Save()
  Write-Host "Desktop shortcut created: $shortcutPath"
}

Write-Host "Launcher script: $desktopVbs"
Write-Host "The shortcut searches these Desktop folders for Jarvis(Mark1):"
foreach ($dir in $desktopDirs) {
  Write-Host "  $dir"
}
