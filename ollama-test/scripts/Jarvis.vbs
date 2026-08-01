Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Jarvis.bat lives in scripts\ — project root is one level up
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
launcher = scriptDir & "\Jarvis.bat"

shell.CurrentDirectory = projectRoot
shell.Run """" & launcher & """", 0, False
