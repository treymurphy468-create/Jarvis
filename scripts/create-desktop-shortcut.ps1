# Creates Jarvis.lnk on the user's Desktop
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$vbsLauncher = Join-Path $PSScriptRoot "Jarvis.vbs"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Jarvis.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$vbsLauncher`""
$Shortcut.WorkingDirectory = $projectRoot
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Jarvis AI desktop companion"
$Shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
