# GCP サービス管理スクリプト

param(
    [ValidateSet("deploy", "logs", "status", "url", "stop", "start")]
    [string]$Action = "",
    [string]$ProjectId = "",
    [string]$ServiceName = "climbing-web-app-bolt",
    [string]$Region = "asia-northeast1"
)

# プロジェクトIDが指定されていない場合は設定から取得
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Host "❌ プロジェクトIDが設定されていません"
        Write-Host "   .\setup.ps1 を先に実行してください"
        exit 1
    }
}

function Show-Usage {
    Write-Host "📖 使用方法:"
    Write-Host "   .\manage.ps1 deploy     # デプロイ実行"
    Write-Host "   .\manage.ps1 logs       # ログ表示"
    Write-Host "   .\manage.ps1 status     # サービス状態確認"
    Write-Host "   .\manage.ps1 url        # サービスURL表示"
    Write-Host "   .\manage.ps1 stop       # サービス停止"
    Write-Host "   .\manage.ps1 start      # サービス開始"
}

switch ($Action) {
    "deploy" {
        Write-Host "🚀 デプロイを実行します..."
        .\deploy.ps1 -ProjectId $ProjectId -ServiceName $ServiceName -Region $Region
    }
    
    "logs" {
        Write-Host "📋 ログを表示します..."
        gcloud run services logs read $ServiceName --region $Region --project $ProjectId --limit 50
    }
    
    "status" {
        Write-Host "📊 サービス状態を確認します..."
        gcloud run services describe $ServiceName --region $Region --project $ProjectId --format="table(status.conditions[0].type,status.conditions[0].status,status.conditions[0].reason)"
    }
    
    "url" {
        Write-Host "🌐 サービスURLを表示します..."
        $url = gcloud run services describe $ServiceName --region $Region --project $ProjectId --format="value(status.url)"
        Write-Host "URL: $url"
    }
    
    "stop" {
        Write-Host "⏹️ サービスを停止します..."
        gcloud run services update $ServiceName --region $Region --project $ProjectId --min-instances 0 --max-instances 0
    }
    
    "start" {
        Write-Host "▶️ サービスを開始します..."
        gcloud run services update $ServiceName --region $Region --project $ProjectId --min-instances 0 --max-instances 10
    }
    
    default {
        if ($Action) {
            Write-Host "❌ 不明なアクション: $Action"
        }
        Show-Usage
    }
} 