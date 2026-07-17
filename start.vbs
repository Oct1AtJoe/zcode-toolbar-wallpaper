' start.vbs - invisible launcher. Double-click to run with no console window.
' Launches start.bat HIDDEN and returns immediately (does NOT wait).
' start.bat writes progress to .start.log so you can check what happened.
Set sh = CreateObject("WScript.Shell")
batPath = Replace(WScript.ScriptFullName, "start.vbs", "start.bat")
sh.Run "cmd /c """ & batPath & """", 0, False
