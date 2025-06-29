# GCP ローカルデプロイ環境セットアップスクリプト

param(
    [string]$ProjectId = ""
)

Write-Host "🔧 GCP ローカルデプロイ環境をセットアップします..."

# プロジェクトIDが指定されていない場合は入力を求める
if (-not $ProjectId) {
    $ProjectId = Read-Host "GCPプロジェクトIDを入力してください"
}

# gcloud認証状態確認
Write-Host "🔐 gcloud認証状態を確認中..."
$authStatus = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null

if (-not $authStatus) {
    Write-Host "⚠️ gcloudにログインしていません。ログインを開始します..."
    gcloud auth login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ gcloudログインに失敗しました"
        exit 1
    }
    Write-Host "✅ gcloudログイン完了"
} else {
    Write-Host "✅ gcloudログイン済み: $authStatus"
}

# プロジェクト設定
Write-Host "🎯 プロジェクトを設定中: $ProjectId"
gcloud config set project $ProjectId

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ プロジェクト設定に失敗しました"
    exit 1
}

# Docker認証設定
Write-Host "🐳 Container Registry認証を設定中..."
gcloud auth configure-docker

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker認証設定に失敗しました"
    exit 1
}

# Cloud Run APIの有効化確認
Write-Host "☁️ Cloud Run APIを有効化中..."
gcloud services enable run.googleapis.com

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cloud Run API有効化に失敗しました"
    exit 1
}

# Container Registry APIの有効化
Write-Host "📦 Container Registry APIを有効化中..."
gcloud services enable containerregistry.googleapis.com

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Container Registry API有効化に失敗しました"
    exit 1
}

Write-Host ""
Write-Host "✅ セットアップ完了!"
Write-Host "🚀 以下のコマンドでデプロイできます:"
Write-Host "   .\deploy.ps1 -ProjectId $ProjectId"
Write-Host ""
Write-Host "📝 設定内容:"
Write-Host "   プロジェクト: $ProjectId"
Write-Host "   アカウント: $authStatus" 