# Miller Storm Upload Test - PowerShell Script
# This script tests video upload to your server

$videoPath = "D:\Youtube\SHORT LAN 1080.mov"
$uploadUrl = "https://millerstorm.tech/api/upload-image"

Write-Host "🎬 Miller Storm Upload Test" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Check if file exists
if (-not (Test-Path $videoPath)) {
    Write-Host "❌ Video file not found: $videoPath" -ForegroundColor Red
    exit 1
}

# Get file info
$fileInfo = Get-Item $videoPath
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host "📁 File: $($fileInfo.Name)" -ForegroundColor Yellow
Write-Host "📊 Size: $fileSizeMB MB" -ForegroundColor Yellow
Write-Host "📍 Path: $videoPath" -ForegroundColor Yellow
Write-Host "🌐 Upload URL: $uploadUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "⏳ Starting upload..." -ForegroundColor Green
Write-Host ""

$startTime = Get-Date

try {
    # Create multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    # Read file content
    $fileBytes = [System.IO.File]::ReadAllBytes($videoPath)
    
    # Build multipart body
    $bodyLines = (
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$($fileInfo.Name)`"",
        "Content-Type: video/quicktime",
        "",
        [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes),
        "--$boundary--"
    ) -join $LF
    
    Write-Host "📤 Uploading $fileSizeMB MB..." -ForegroundColor Cyan
    
    # Make request
    $response = Invoke-WebRequest -Uri $uploadUrl `
        -Method Post `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Body $bodyLines `
        -TimeoutSec 900 `
        -UseBasicParsing
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host ""
    Write-Host "⏱️  Upload Duration: $([math]::Round($duration, 2)) seconds" -ForegroundColor Yellow
    Write-Host "📡 Response Status: $($response.StatusCode)" -ForegroundColor Yellow
    Write-Host ""
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Upload successful!" -ForegroundColor Green
        $responseData = $response.Content | ConvertFrom-Json
        Write-Host "🔗 File URL: $($responseData.url)" -ForegroundColor Green
        Write-Host "🌐 Full URL: https://millerstorm.tech$($responseData.url)" -ForegroundColor Green
    }
    
}
catch {
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host ""
    Write-Host "❌ Upload Error!" -ForegroundColor Red
    Write-Host "⏱️  Failed after: $([math]::Round($duration, 2)) seconds" -ForegroundColor Yellow
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        Write-Host "📡 Response Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        Write-Host "📋 Response Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Yellow
        
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "📦 Response Body: $responseBody" -ForegroundColor Yellow
        }
        catch {
            Write-Host "Could not read response body" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "🔍 Possible Issues:" -ForegroundColor Cyan
    Write-Host "  1. Server timeout (check nginx timeout settings)" -ForegroundColor White
    Write-Host "  2. File size limit exceeded (check nginx client_max_body_size)" -ForegroundColor White
    Write-Host "  3. Network connection issue" -ForegroundColor White
    Write-Host "  4. Server not running or crashed" -ForegroundColor White
    Write-Host "  5. Disk space full on server" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
