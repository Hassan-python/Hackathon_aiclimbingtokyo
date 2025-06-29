# Cloud Build Phase 2 Deploy Script (No Docker Desktop Required)
# Prerequisites:
# 1. gcloud auth login
# 2. gcloud config set project YOUR_PROJECT_ID
# 3. Enable Cloud Build API: gcloud services enable cloudbuild.googleapis.com

param(
    [string]$ProjectId = "",
    [string]$ServiceName = "climbing-web-app-bolt",
    [string]$Region = "asia-northeast1"
)

# Check if ProjectId is provided
if (-not $ProjectId) {
    Write-Host "Please specify Project ID:"
    Write-Host ".\deploy-cloudbuild.ps1 -ProjectId YOUR_PROJECT_ID"
    Write-Host "Example: .\deploy-cloudbuild.ps1 -ProjectId climbing-application-458609"
    exit 1
}

Write-Host "Starting Phase 2 Cloud Build deployment..."
Write-Host "Project: $ProjectId"
Write-Host "Service: $ServiceName"
Write-Host "Region: $Region"
Write-Host ""

# Enable required APIs
Write-Host "Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com --project $ProjectId
gcloud services enable run.googleapis.com --project $ProjectId
gcloud services enable artifactregistry.googleapis.com --project $ProjectId

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to enable APIs"
    exit 1
}

# Create Artifact Registry repository if not exists
Write-Host "Creating Artifact Registry repository..."
gcloud artifacts repositories create climbing-repo `
    --repository-format=docker `
    --location=$Region `
    --description="Phase 2 Climbing Web App Repository" `
    --project $ProjectId 2>$null

# Note: This command may fail if repository already exists, which is fine

# Submit build to Cloud Build
Write-Host "Submitting Phase 2 build to Cloud Build..."
Write-Host "This will build and deploy without requiring local Docker..."

gcloud builds submit --config cloudbuild.yaml --project $ProjectId .

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Phase 2 Cloud Build deployment completed successfully!"
    Write-Host ""
    Write-Host "Getting application URL..."
    $AppUrl = gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)" 2>$null
    
    if ($AppUrl) {
        Write-Host "Application URL: $AppUrl"
    } else {
        Write-Host "Could not retrieve application URL. Check Cloud Console."
    }
    
    Write-Host ""
    Write-Host "Phase 2 new features deployed:"
    Write-Host "  - Full video upload (100MB, 30sec limit)"
    Write-Host "  - Video range analysis (3sec limit)"  
    Write-Host "  - FFmpeg video optimization"
    Write-Host "  - Mobile responsive UI"
    Write-Host ""
    Write-Host "New endpoints available:"
    Write-Host "  - POST /upload-full-video"
    Write-Host "  - POST /analyze-range"
    Write-Host ""
    Write-Host "Test the deployment:"
    Write-Host "  curl $AppUrl/chroma-status"
} else {
    Write-Host "Cloud Build deployment failed"
    Write-Host "Check build logs in Cloud Console: https://console.cloud.google.com/cloud-build/builds?project=$ProjectId"
    exit 1
} 