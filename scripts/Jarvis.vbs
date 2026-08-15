Option Explicit

' Finds Jarvis(Mark1) on the Windows Desktop (including OneDrive Desktop)
' and launches the OpenAI Realtime app through scripts\Jarvis.bat.
' Safe to run from scripts\ or from a copy on the Desktop.

Dim fso, shell, scriptPath, scriptDir, projectRoot, launcher, message, searched

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
searched = ""

Function PathExistsInList(list, path)
  PathExistsInList = (InStr(1, "|" & LCase(list) & "|", "|" & LCase(path) & "|", vbTextCompare) > 0)
End Function

Function AddDir(list, path)
  Dim trimmed
  trimmed = Trim(path & "")
  If Len(trimmed) = 0 Then
    AddDir = list
    Exit Function
  End If
  If Not fso.FolderExists(trimmed) Then
    AddDir = list
    Exit Function
  End If
  If PathExistsInList(list, trimmed) Then
    AddDir = list
    Exit Function
  End If
  If Len(list) = 0 Then
    AddDir = trimmed
  Else
    AddDir = list & "|" & trimmed
  End If
End Function

Function LooksLikeJarvis(dir)
  Dim pkg, txt, bat, electron
  LooksLikeJarvis = False
  If Len(dir) = 0 Then Exit Function
  If Not fso.FolderExists(dir) Then Exit Function
  pkg = dir & "\package.json"
  If fso.FileExists(pkg) Then
    txt = fso.OpenTextFile(pkg, 1).ReadAll
    If InStr(1, txt, "jarvis-mark1", vbTextCompare) > 0 Then
      LooksLikeJarvis = True
      Exit Function
    End If
  End If
  bat = dir & "\scripts\Jarvis.bat"
  electron = dir & "\electron\main.cjs"
  If fso.FileExists(bat) And fso.FileExists(electron) Then LooksLikeJarvis = True
End Function

Function FindOnDesktop()
  Dim desktops, desktopArr, names, nameArr, i, j, desktop, candidate, folder, subFolders
  names = "Jarvis(Mark1)|Jarvis (Mark 1)|Jarvis-Mark1|Jarvis Mark 1|jarvis-mark1|Jarvis"
  desktops = ""
  desktops = AddDir(desktops, shell.SpecialFolders("Desktop"))
  desktops = AddDir(desktops, shell.ExpandEnvironmentStrings("%USERPROFILE%\Desktop"))
  desktops = AddDir(desktops, shell.ExpandEnvironmentStrings("%USERPROFILE%\OneDrive\Desktop"))
  desktops = AddDir(desktops, shell.ExpandEnvironmentStrings("%USERPROFILE%\OneDrive - Personal\Desktop"))
  desktops = AddDir(desktops, shell.ExpandEnvironmentStrings("%OneDrive%\Desktop"))
  desktops = AddDir(desktops, shell.ExpandEnvironmentStrings("%PUBLIC%\Desktop"))

  searched = desktops
  desktopArr = Split(desktops, "|")
  nameArr = Split(names, "|")

  For i = 0 To UBound(desktopArr)
    desktop = desktopArr(i)
    For j = 0 To UBound(nameArr)
      candidate = desktop & "\" & nameArr(j)
      If LooksLikeJarvis(candidate) Then
        FindOnDesktop = candidate
        Exit Function
      End If
    Next
  Next

  For i = 0 To UBound(desktopArr)
    desktop = desktopArr(i)
    Set subFolders = fso.GetFolder(desktop).SubFolders
    For Each folder In subFolders
      If InStr(1, folder.Name, "jarvis", vbTextCompare) > 0 Then
        If LooksLikeJarvis(folder.Path) Then
          FindOnDesktop = folder.Path
          Exit Function
        End If
      End If
    Next
  Next

  FindOnDesktop = ""
End Function

projectRoot = ""

If LCase(fso.GetFileName(scriptDir)) = "scripts" Then
  If LooksLikeJarvis(fso.GetParentFolderName(scriptDir)) Then
    projectRoot = fso.GetParentFolderName(scriptDir)
  End If
End If

If Len(projectRoot) = 0 Then
  If LooksLikeJarvis(scriptDir) Then projectRoot = scriptDir
End If

If Len(projectRoot) = 0 Then
  projectRoot = FindOnDesktop()
End If

If Len(projectRoot) = 0 Then
  message = "Could not find Jarvis(Mark1) on the Desktop." & vbCrLf & vbCrLf & _
    "Looked for a folder named Jarvis(Mark1) (or Jarvis) that contains package.json." & vbCrLf & vbCrLf & _
    "Desktops searched:" & vbCrLf & Replace(searched, "|", vbCrLf) & vbCrLf & vbCrLf & _
    "Put the project folder on the Desktop, then double-click Jarvis or Jarvis(Mark1)."
  MsgBox message, 16, "Jarvis (Mark 1)"
  WScript.Quit 1
End If

launcher = projectRoot & "\scripts\Jarvis.bat"
If Not fso.FileExists(launcher) Then
  MsgBox "Found Jarvis at:" & vbCrLf & projectRoot & vbCrLf & vbCrLf & _
    "but scripts\Jarvis.bat is missing.", 16, "Jarvis (Mark 1)"
  WScript.Quit 1
End If

shell.CurrentDirectory = projectRoot
' 7 = minimized — keep a taskbar console so boot errors stay visible
shell.Run """" & launcher & """ """ & projectRoot & """", 7, False
