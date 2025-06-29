# GCP ローカルデプロイ ガイド

このフォルダには、ローカル環境からGCP（Cloud Run）にアプリケーションをデプロイするためのスクリプトと、ChromaDB知識ベース管理機能が含まれています。

## 📋 ファイル構成

### デプロイ関連
- `Dockerfile` - アプリケーションのDockerイメージ定義
- `requirements_gcp.txt` - Python依存パッケージ
- `packages.txt` - システムパッケージ
- `setup.ps1` - 初期セットアップスクリプト
- `deploy.ps1` - デプロイ実行スクリプト
- `manage.ps1` - サービス管理スクリプト

### ChromaDB知識ベース管理
- `chroma/load_knowledge.py` - 知識ベース管理メインスクリプト
- `chroma/knowledge_base/` - 知識ベースファイル格納ディレクトリ
- `chroma/secrets.yaml` - 設定ファイル（オプション）

## 🧠 ChromaDB 知識ベース管理

### 概要
`load_knowledge.py`は、テキストファイルから知識ベースを読み込み、ChromaDBに格納・管理するためのスクリプトです。

### 🎭 モック機能
**開発環境でChromaDBサーバーが利用できない場合**に、モック（偽物）のサービスを使用してテスト・開発を継続できます。

#### モックとは？
- **実際のサービスの代替品**: ChromaDBやGemini APIの振る舞いを模倣
- **外部依存なし**: サーバー起動やAPI制限を気にせず開発可能
- **予測可能**: 常に同じ結果を返すため、安定したテスト環境を提供

### 🚀 基本的な使用方法

#### 1. 設定確認
```bash
# 設定の検証のみ実行
python chroma/load_knowledge.py --mode config-test
```

#### 2. モックテスト（推奨：開発時）
```bash
# ChromaDBサーバーなしで完全テスト
python chroma/load_knowledge.py --mode mock-test

# ドライラン（実際の変更なし）
python chroma/load_knowledge.py --mode mock-test --dry-run
```

#### 3. 実際のChromaDBサーバーでの運用
```bash
# 全データ置き換え
python chroma/load_knowledge.py --mode replace

# 既存データに追加
python chroma/load_knowledge.py --mode append

# 変更分のみ更新（効率的）
python chroma/load_knowledge.py --mode incremental
```

### 📊 利用可能なモード

| モード | 説明 | 用途 |
|--------|------|------|
| `config-test` | 設定検証のみ | 環境変数・ファイル確認 |
| `mock-test` | モック環境での完全テスト | 開発・デバッグ |
| `replace` | 全データ置き換え | 初回セットアップ・完全更新 |
| `append` | 既存データに追加 | データ追加 |
| `incremental` | 変更分のみ更新 | 日常的な更新（効率的） |
| `verify` | ヘルスチェック | システム状態確認 |
| `backup` | バックアップ作成 | データ保護 |

### 🔧 オプション

| オプション | 説明 | 例 |
|------------|------|-----|
| `--mode` | 実行モード | `--mode mock-test` |
| `--dry-run` | 実際の変更なしでシミュレート | `--dry-run` |
| `--mock-chromadb` | 既存モードでモック機能を有効化 | `--mock-chromadb` |
| `--log-level` | ログレベル設定 | `--log-level DEBUG` |

### 🎯 推奨ワークフロー

#### 開発段階
```bash
# 1. 設定確認
python chroma/load_knowledge.py --mode config-test

# 2. モックテストで機能確認
python chroma/load_knowledge.py --mode mock-test

# 3. ドライランで処理内容確認
python chroma/load_knowledge.py --mode replace --mock-chromadb --dry-run
```

#### 本番運用
```bash
# 1. ヘルスチェック
python chroma/load_knowledge.py --mode verify

# 2. バックアップ作成
python chroma/load_knowledge.py --mode backup

# 3. 増分更新（日常運用）
python chroma/load_knowledge.py --mode incremental

# 4. 完全更新（必要時のみ）
python chroma/load_knowledge.py --mode replace
```

### ⚙️ 環境変数設定

```bash
# 必須環境変数
export GEMINI_API_KEY="your-gemini-api-key"
export CHROMA_DB_URL="http://your-chromadb-server:8000"

# 開発・テスト用（モック機能使用時）
export GEMINI_API_KEY="test_key_for_validation"
export CHROMA_DB_URL="http://test-url-for-validation"
```

### 📁 知識ベースファイル

`chroma/knowledge_base/`ディレクトリに`.txt`ファイルを配置：

```
chroma/knowledge_base/
├── basic_moves.txt      # 基本的な動き
├── basic_skills.txt     # 基本スキル
├── common_mistakes.txt  # よくある間違い
└── training_tips.txt    # トレーニングのコツ
```

### 🔍 ログとモニタリング

#### ログファイル
- `chroma_update.log` - 処理ログ
- `knowledge_metadata.json` - ファイルメタデータ
- `backups/` - バックアップファイル

#### エラーハンドリング
- **Phase 3 エラー分析**: 自動エラー分類・アラート
- **適応的リトライ**: エラータイプ別の再試行戦略
- **部分失敗回復**: 一部失敗時の自動回復機能

### 🎭 モック機能の詳細

#### MockChromaClient
```python
# 実際のChromaDBサーバーの代替
- コレクション作成・削除
- ドキュメント追加・検索
- メモリ内でのデータ管理
```

#### MockEmbeddings
```python
# Gemini APIの代替
- 768次元ベクトル生成
- 決定的な結果（同じテキスト→同じベクトル）
- API制限・課金なし
```

### 💡 トラブルシューティング

#### ChromaDB接続エラー
```bash
# モック機能を使用
python chroma/load_knowledge.py --mode mock-test
```

#### 設定エラー
```bash
# 設定確認
python chroma/load_knowledge.py --mode config-test
```

#### ファイル変更が検出されない
```bash
# 強制的に全更新
python chroma/load_knowledge.py --mode replace
```

#### プロセスロックエラー
```bash
# ロックファイル削除
rm chroma/load_knowledge.lock
```

### 📝 実際の使用例

#### 新しい知識ベースファイルを追加する場合
```bash
# 1. ファイルを配置
echo "新しいクライミング技術について..." > chroma/knowledge_base/new_technique.txt

# 2. 変更を検出・更新
python chroma/load_knowledge.py --mode incremental

# 3. 結果確認
python chroma/load_knowledge.py --mode verify
```

#### 開発環境でのテスト
```bash
# 1. モック環境でテスト
python chroma/load_knowledge.py --mode mock-test --log-level DEBUG

# 2. 処理内容をドライランで確認
python chroma/load_knowledge.py --mode replace --mock-chromadb --dry-run

# 3. 実際の処理をモック環境で実行
python chroma/load_knowledge.py --mode replace --mock-chromadb
```

#### 本番環境への移行
```bash
# 1. 設定確認
python chroma/load_knowledge.py --mode config-test

# 2. バックアップ作成
python chroma/load_knowledge.py --mode backup

# 3. 本番データ更新
python chroma/load_knowledge.py --mode replace

# 4. ヘルスチェック
python chroma/load_knowledge.py --mode verify
```

### 🎯 ベストプラクティス

#### 開発時
- ✅ **モック機能を活用**: `--mode mock-test`で開発効率を向上
- ✅ **ドライランを使用**: `--dry-run`で処理内容を事前確認
- ✅ **ログレベル調整**: `--log-level DEBUG`で詳細な動作確認

#### 本番運用時
- ✅ **増分更新を優先**: `--mode incremental`で効率的な更新
- ✅ **定期バックアップ**: `--mode backup`でデータ保護
- ✅ **ヘルスチェック**: `--mode verify`でシステム状態監視

#### ファイル管理
- ✅ **適切なファイル名**: 内容が分かりやすい名前を使用
- ✅ **ファイルサイズ**: 1ファイル10MB以下を推奨
- ✅ **文字エンコーディング**: UTF-8で保存

### ❓ よくある質問（FAQ）

#### Q: モック機能と実際のサービスの違いは？
**A:** モック機能は開発・テスト用の代替品です：
- **モック**: メモリ内処理、外部依存なし、予測可能な結果
- **実際**: ChromaDBサーバー・Gemini API使用、ネットワーク依存

#### Q: どのモードを使えばいい？
**A:** 用途に応じて選択してください：
- **開発・テスト**: `mock-test`
- **初回セットアップ**: `replace`
- **日常更新**: `incremental`
- **システム確認**: `verify`

#### Q: エラーが発生した場合は？
**A:** 段階的にトラブルシューティング：
1. `--mode config-test`で設定確認
2. `--mode mock-test`でロジック確認
3. ログファイル（`chroma_update.log`）を確認
4. 必要に応じて`--log-level DEBUG`で詳細調査

#### Q: ファイル変更が反映されない
**A:** 以下を確認してください：
- ファイルが`chroma/knowledge_base/`にある
- ファイル拡張子が`.txt`
- `--mode incremental`または`--mode replace`を実行
- `knowledge_metadata.json`でハッシュ値を確認

#### Q: パフォーマンスを向上させるには？
**A:** 以下の最適化を検討：
- **増分更新**: 変更分のみ処理
- **バッチサイズ調整**: 大量データの場合
- **並列処理**: 複数ファイルの同時処理
- **定期メンテナンス**: 不要データの削除

### 🔧 高度な設定

#### カスタム設定ファイル
```yaml
# chroma/secrets.yaml
gemini_api_key: "your-api-key"
chromadb_url: "http://your-server:8000"
collection_name: "custom_collection"
batch_size: 100
```

#### 環境別設定
```bash
# 開発環境
export ENVIRONMENT="development"
python chroma/load_knowledge.py --mode mock-test

# ステージング環境
export ENVIRONMENT="staging"
python chroma/load_knowledge.py --mode verify

# 本番環境
export ENVIRONMENT="production"
python chroma/load_knowledge.py --mode incremental
```

#### 自動化スクリプト例
```bash
#!/bin/bash
# daily_update.sh - 日次更新スクリプト

# バックアップ作成
python chroma/load_knowledge.py --mode backup

# 増分更新
python chroma/load_knowledge.py --mode incremental

# ヘルスチェック
python chroma/load_knowledge.py --mode verify

echo "Daily update completed: $(date)"
```

## 🚀 セットアップ（初回のみ）

### 1. 環境セットアップ
```powershell
# gcp_configディレクトリに移動
cd gcp_config

# 初期セットアップ実行（GCPプロジェクトIDを指定）
.\setup.ps1 -ProjectId "your-gcp-project-id"
```

このスクリプトが以下を自動実行します：
- gcloud認証
- プロジェクト設定
- Docker認証
- 必要なAPI有効化

### 2. 設定確認
```powershell
# 認証状態確認
gcloud auth list

# プロジェクト確認
gcloud config get-value project
```

## 🔄 デプロイ

### 基本デプロイ
```powershell
# 設定済みプロジェクトにデプロイ
.\deploy.ps1 -ProjectId "your-gcp-project-id"
```

### カスタム設定でデプロイ
```powershell
# サービス名・リージョンを指定
.\deploy.ps1 -ProjectId "your-project" -ServiceName "my-app" -Region "us-central1"
```

## 🛠️ サービス管理

便利な管理コマンド：

```powershell
# デプロイ実行
.\manage.ps1 deploy

# ログ確認
.\manage.ps1 logs

# サービス状態確認
.\manage.ps1 status

# サービスURL確認
.\manage.ps1 url

# サービス停止（コスト削減）
.\manage.ps1 stop

# サービス再開
.\manage.ps1 start
```

## 📝 デプロイフロー

1. **ビルド**: ローカルでDockerイメージをビルド
2. **プッシュ**: Container Registryにイメージアップロード
3. **デプロイ**: Cloud Runサービスを更新

## ⚙️ デフォルト設定

- **サービス名**: `climbing-web-app-bolt`
- **リージョン**: `asia-northeast1`
- **ポート**: `8000`
- **メモリ**: `2Gi`
- **CPU**: `1`
- **最大インスタンス**: `10`
- **タイムアウト**: `3600秒`

## 🔍 トラブルシューティング

### gcloudコマンドが動かない
```powershell
# PowerShell実行ポリシー変更
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 認証エラー
```powershell
# 再認証
gcloud auth login
gcloud auth configure-docker
```

### プロジェクト設定エラー
```powershell
# プロジェクト一覧確認
gcloud projects list

# プロジェクト設定
gcloud config set project YOUR_PROJECT_ID
```

### デプロイエラー
```powershell
# ログ確認
.\manage.ps1 logs

# サービス状態確認
.\manage.ps1 status
```

## 🌐 デプロイ後の確認

デプロイ完了後、以下で動作確認：

```powershell
# サービスURL取得
.\manage.ps1 url

# 健康状態チェック
curl "YOUR_SERVICE_URL/chroma-status"
```

## 💡 ヒント

- 初回デプロイには5-10分程度かかります
- `manage.ps1 stop`でサービス停止により課金を抑制できます
- ログは`manage.ps1 logs`で簡単に確認できます
- 環境変数が必要な場合は`deploy.ps1`を編集してください 

## 🚨 トラブルシューティング：動画分析エラー

### 問題: `/analyze-range` エンドポイントで500エラーが発生

#### 原因分析
1. **環境変数の設定不備**
   - `GCS_BUCKET_NAME`, `GEMINI_API_KEY`, `CHROMA_DB_URL` が未設定
   - Cloud Run の `service.yaml` に環境変数が含まれていない

2. **構文エラー**
   - `analyze_and_generate_advice` 関数内の三重引用符の不備

3. **エラーハンドリングの不備**
   - 例外の詳細がCloud Loggingに記録されない

#### 解決方法

##### 1. 環境変数の設定
```bash
# Secret Manager にAPI キーを保存
gcloud secrets create gemini-api-key --data-file=api-key.txt

# service.yaml に環境変数を追加済み
```

##### 2. デプロイ前の確認
```bash
# 環境変数の確認
echo $GCS_BUCKET_NAME
echo $GEMINI_API_KEY
echo $CHROMA_DB_URL

# ローカルテスト
python gcp_config/main.py
```

##### 3. エラーログの確認
```bash
# Cloud Runのログを確認
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=10

# 詳細なエラートレースが出力されるようになります
```

#### 予防策
- 起動時の環境変数チェック機能を追加済み
- エラーの種類に応じた適切なHTTPステータスコードを返却
- 詳細なエラートレースをログに出力 