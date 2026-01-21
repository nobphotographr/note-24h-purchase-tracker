$action = New-ScheduledTaskAction -Execute 'F:\Github\note-24h-purchase-tracker\.venv\Scripts\python.exe' -Argument '-m src.main' -WorkingDirectory 'F:\Github\note-24h-purchase-tracker'
$trigger = New-ScheduledTaskTrigger -Daily -At '10:00'
$settings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'NoteTracker' -Action $action -Trigger $trigger -Settings $settings -Description 'note.com 24h purchase tracker'
