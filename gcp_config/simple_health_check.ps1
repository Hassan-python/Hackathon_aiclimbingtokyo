$serviceUrl = "https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app"

Write-Host "=== Health Check Test ===" -ForegroundColor Yellow
Write-Host "Service URL: $serviceUrl" -ForegroundColor Cyan

try {
    Write-Host "1. Testing /health endpoint..." -ForegroundColor White
    $healthResponse = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get -TimeoutSec 30
    Write-Host "✅ Health Check: SUCCESS" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $healthResponse | ConvertTo-Json -Depth 3
    
    Write-Host "`n2. Testing /chroma-status endpoint..." -ForegroundColor White
    $chromaResponse = Invoke-RestMethod -Uri "$serviceUrl/chroma-status" -Method Get -TimeoutSec 30
    Write-Host "✅ ChromaDB Status: SUCCESS" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $chromaResponse | ConvertTo-Json -Depth 3
    
} catch {
    Write-Host "❌ Error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Status Code:" $_.Exception.Response.StatusCode -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Yellow 