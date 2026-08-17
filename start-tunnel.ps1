Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$psi.Arguments = "tunnel --url http://localhost:3001"
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
$proc = [System.Diagnostics.Process]::Start($psi)
Write-Host "Started cloudflared PID: $($proc.Id)"
Start-Sleep 12
Write-Host "Done"
