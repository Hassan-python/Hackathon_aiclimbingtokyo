# Cloud Run Phase 2 Deploy Script
# Prerequisites:
# 1. gcloud auth login
# 2. gcloud config set project YOUR_PROJECT_ID

param(
    [string]$ProjectId = "",
    [string]$ServiceName = "climbing-web-app-bolt",
    [string]$Region = "asia-northeast1"
)

# Check if ProjectId is provided
if (-not $ProjectId) {
    Write-Host "Please specify Project ID:"
    Write-Host ".\deploy.ps1 -ProjectId YOUR_PROJECT_ID"
    Write-Host "Example: .\deploy.ps1 -ProjectId climbing-application-458609"
    exit 1
}

Write-Host "Starting Phase 2 Cloud Run deployment..."
Write-Host "Project: $ProjectId"
Write-Host "Service: $ServiceName"
Write-Host "Region: $Region"

# Build and push Docker image
$ImageName = "asia-northeast1-docker.pkg.dev/$ProjectId/climbing-repo/climbing-web-app-bolt"

Write-Host "Building Phase 2 Docker image..."
docker build -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed"
    exit 1
}

Write-Host "Pushing to Artifact Registry..."
docker push $ImageName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Image push failed"
    exit 1
}

Write-Host "Deploying to Cloud Run with Phase 2 settings..."
gcloud run deploy $ServiceName `
    --image $ImageName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 8000 `
    --memory 4Gi `
    --cpu 2 `
    --max-instances 10 `
    --timeout 900 `
    --concurrency 10 `
    --set-env-vars "MEMORY_LIMIT=4096M,REQUEST_TIMEOUT=900,PHASE=2" `
    --project $ProjectId

if ($LASTEXITCODE -eq 0) {
    Write-Host "Phase 2 deployment completed successfully!"
    Write-Host "Application URL:"
    gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)"
    Write-Host ""
    Write-Host "Phase 2 new features:"
    Write-Host "  - Full video upload (100MB, 30sec limit)"
    Write-Host "  - Video range analysis (3sec limit)"
    Write-Host "  - FFmpeg video optimization"
    Write-Host "  - Mobile responsive UI"
    Write-Host ""
    Write-Host "New endpoints:"
    Write-Host "  - POST /upload-full-video"
    Write-Host "  - POST /analyze-range"
} else {
    Write-Host "Deployment failed"
    exit 1
} 