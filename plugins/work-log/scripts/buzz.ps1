# Plays buzz.wav or buzz.mp3 from this folder when the /work timer ends; falls back to the Windows alert sound.
$f = Get-ChildItem "$PSScriptRoot\buzz.*" -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.wav', '.mp3' } | Select-Object -First 1
if ($f -and $f.Extension -eq '.wav') { (New-Object Media.SoundPlayer $f.FullName).PlaySync() }
elseif ($f) {
  Add-Type -AssemblyName presentationCore
  $p = New-Object Windows.Media.MediaPlayer
  $p.Open([uri]$f.FullName); $p.Play()
  $n = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $n -lt 30) { Start-Sleep -Milliseconds 100; $n++ }
  Start-Sleep -Seconds ([math]::Min(15,[math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds)))
}
else { 1..3 | ForEach-Object { [System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 700 } }
