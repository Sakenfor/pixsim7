' Start PixSim7 Launcher completely hidden (no console window)
' This is the most robust way to detach from terminal

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Find Python executable
strPython = strScriptDir & "\.venv\Scripts\pythonw.exe"
If Not objFSO.FileExists(strPython) Then
    strPython = strScriptDir & "\.venv\Scripts\python.exe"
End If
If Not objFSO.FileExists(strPython) Then
    strPython = "pythonw"
End If

' Build command
strLauncher = strScriptDir & "\scripts\launcher.py"
strCommand = """" & strPython & """ """ & strLauncher & """"

' Run hidden (0 = hidden window)
objShell.Run strCommand, 0, False

' Show confirmation
WScript.Echo "PixSim7 Launcher started!" & vbCrLf & vbCrLf & _
    "The launcher is now running in the background." & vbCrLf & _
    "You can find it in:" & vbCrLf & _
    "  - System tray (if minimized)" & vbCrLf & _
    "  - Task Manager > Details > pythonw.exe or python.exe" & vbCrLf & vbCrLf & _
    "To stop: Close the launcher window or kill the process."
