$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$api = Start-Process -FilePath "python" `
    -ArgumentList "-m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000" `
    -WorkingDirectory $root -PassThru -NoNewWindow

$frontend = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "--prefix frontend run dev" `
    -WorkingDirectory $root -PassThru -NoNewWindow

Write-Host "Spiral API: http://127.0.0.1:8000"
Write-Host "Spiral UI:  http://localhost:5173"
Write-Host "Press Ctrl+C to stop both servers."

try {
    while ($true) {
        $apiProcess = Get-Process -Id $api.Id -ErrorAction SilentlyContinue
        $frontendProcess = Get-Process -Id $frontend.Id -ErrorAction SilentlyContinue
        if (-not $apiProcess -or -not $frontendProcess) {
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($processId in @($api.Id, $frontend.Id)) {
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            Stop-Process -Id $processId
        }
    }
}
