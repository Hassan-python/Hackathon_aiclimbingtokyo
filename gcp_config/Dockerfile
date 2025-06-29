# Pythonの公式イメージをベースイメージとして使用
FROM python:3.10-slim

# 環境変数を設定
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
# Cloud Runがリッスンするポート
ENV PORT 8000

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係ファイルをコピー
COPY requirements_gcp.txt .

# packages.txt に記載されたシステムライブラリをインストール
# Phase 2: FFmpeg関連ツールとメモリ最適化のための追加パッケージ
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        build-essential \
        curl \
        wget \
        ca-certificates && \
    # FFmpegとffprobeのバージョン確認
    ffmpeg -version && \
    ffprobe -version && \
    # Phase 2: 動画処理用の一時ディレクトリ作成
    mkdir -p /tmp/videos && \
    chmod 755 /tmp/videos && \
    # 不要なパッケージを削除してイメージサイズを最小化
    rm -rf /var/lib/apt/lists/*

# Pythonの依存関係をインストール
RUN pip install --no-cache-dir -r requirements_gcp.txt

# アプリケーションコードをコピー
COPY main.py .
# 他に必要な .py ファイルがあれば同様にコピー

# Phase 2: ヘルスチェック追加（Cloud Runではサポートされていないため、コメントアウト）
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD curl -f http://localhost:8000/chroma-status || exit 1

# Phase 2: Cloud Run用のメモリ制限とタイムアウト設定
ENV MEMORY_LIMIT=2048M
ENV REQUEST_TIMEOUT=600

# HTTP/2関連の設定
ENV HTTP2_ENABLED=true
ENV MAX_REQUEST_SIZE=104857600

# アプリケーションを実行
# HTTP/2対応のためhypercornを使用（正しいフラグを使用）
CMD ["hypercorn", "main:app", "--bind", "0.0.0.0:8000", "--workers", "1", "--access-logfile", "-", "--error-logfile", "-"]