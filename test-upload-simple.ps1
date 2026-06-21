# Miller Storm Upload Test
$videoPath = "D:\Youtube\SHORT LAN 1080.mov"
$uploadUrl = "https://millerstorm.tech/api/upload-image"

Write-Host "Miller Storm Upload Test" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

if (-not (Test-Path $videoPath)) {
    Write-Host "ERROR: Video file not found: $videoPath" -ForegroundColor Red
    exit 1
}

$fileInfo = Get-Item $videoPath
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host "File: $($fileInfo.Name)" -ForegroundColor Yellow
Write-Host "Size: $fileSizeMB MB" -ForegroundColor Yellow
Write-Host "URL: $uploadUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Starting upload..." -ForegroundColor Green

$startTime = Get-Date

try {
    $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -InFile $videoPath -ContentType "multipart/form-data" -TimeoutSec 900
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host ""
    Write-Host "SUCCESS! Upload completed in $([math]::Round($duration, 2)) seconds" -ForegroundColor Green
    Write-Host "File URL: $($response.url)" -ForegroundColor Green
    Write-Host "Full URL: https://millerstorm.tech$($response.url)" -ForegroundColor Green
}
catch {
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host ""
    Write-Host "FAILED after $([math]::Round($duration, 2)) seconds" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

Write-Host ""
Read-Host "Press Enter to exit"
