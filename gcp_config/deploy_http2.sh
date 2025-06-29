#!/bin/bash

# HTTP/2対応のCloud Runデプロイメントスクリプト
# 使用方法: ./deploy_http2.sh [PROJECT_ID]

set -e

# プロジェクトIDの設定
PROJECT_ID=${1:-"your-project-id"}
SERVICE_NAME="climbing-web-app-bolt"
REGION="asia-northeast1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 HTTP/2対応のCloud Runデプロイメントを開始します..."
echo "プロジェクトID: ${PROJECT_ID}"
echo "サービス名: ${SERVICE_NAME}"
echo "リージョン: ${REGION}"

# 1. Dockerイメージをビルド
echo "📦 Dockerイメージをビルド中..."
docker build -t ${IMAGE_NAME} .

# 2. イメージをGoogle Container Registryにプッシュ
echo "📤 イメージをGCRにプッシュ中..."
docker push ${IMAGE_NAME}

# 3. service.yamlのPROJECT_IDを置換
echo "📝 service.yamlを更新中..."
sed "s/PROJECT_ID/${PROJECT_ID}/g" service.yaml > service_deploy.yaml

# 4. Cloud RunサービスをHTTP/2対応でデプロイ
echo "🌐 Cloud RunサービスをHTTP/2対応でデプロイ中..."

# 方法1: gcloudコマンドでデプロイ（推奨）
gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_NAME} \
  --region=${REGION} \
  --platform=managed \
  --use-http2 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=600s \
  --concurrency=100 \
  --max-instances=10 \
  --set-env-vars="HTTP2_ENABLED=true,MAX_REQUEST_SIZE=104857600"

# 方法2: YAMLファイルでデプロイ（代替手段）
# gcloud run services replace service_deploy.yaml --region=${REGION}

# 5. デプロイメント確認
echo "✅ デプロイメント完了！"
echo "🔍 HTTP/2対応状況を確認中..."

SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")
echo "サービスURL: ${SERVICE_URL}"

# HTTP/2対応確認
echo "📡 HTTP/2ステータスチェック..."
curl -s "${SERVICE_URL}/http2-status" | jq '.' || echo "HTTP/2ステータス確認に失敗しました"

echo "🎉 HTTP/2対応のデプロイメントが完了しました！"
echo "テスト用コマンド:"
echo "curl -I --http2 ${SERVICE_URL}/health"

# 一時ファイルを削除
rm -f service_deploy.yaml

echo "✨ 32MB制限突破の準備完了です！" 