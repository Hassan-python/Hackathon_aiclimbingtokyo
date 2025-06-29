# ChromaDB 知識ベース管理システム

クライミングWebアプリ用の知識ベース管理システムです。テキストファイルから知識を読み込み、ChromaDBに格納・管理します。

## 🎭 モック機能について

**モック機能**は、実際のChromaDBサーバーやGemini APIが利用できない開発環境でも、完全なテスト・開発を可能にする機能です。

### モックの利点
- 🚀 **開発効率向上**: サーバー起動不要で即座にテスト
- 💰 **コスト削減**: API呼び出し料金なし
- 🔒 **安定性**: 外部依存なしで予測可能な結果
- 🛠️ **デバッグ容易**: 複雑な外部システムの影響を排除

## 🚀 クイックスタート

### 1. 開発環境（推奨）
```bash
# 設定確認
python load_knowledge.py --mode config-test

# モックテスト実行
python load_knowledge.py --mode mock-test

# ドライラン（安全確認）
python load_knowledge.py --mode replace --mock-chromadb --dry-run
```

### 2. 本番環境
```bash
# 環境変数設定
export GEMINI_API_KEY="your-actual-api-key"
export CHROMA_DB_URL="http://your-chromadb-server:8000"

# 実際のサービスで実行
python load_knowledge.py --mode replace
```

## 📊 モード一覧

| モード | 説明 | 推奨用途 |
|--------|------|----------|
| `config-test` | 設定検証のみ | 初期確認 |
| `mock-test` | モック環境完全テスト | 開発・デバッグ |
| `replace` | 全データ置き換え | 初回・完全更新 |
| `append` | データ追加 | 新規データ追加 |
| `incremental` | 変更分のみ更新 | 日常運用 |
| `verify` | ヘルスチェック | 状態確認 |
| `backup` | バックアップ作成 | データ保護 |

## 🔧 主要オプション

```bash
# モード指定
--mode {config-test,mock-test,replace,append,incremental,verify,backup}

# ドライラン（実際の変更なし）
--dry-run

# モック機能有効化
--mock-chromadb

# ログレベル調整
--log-level {DEBUG,INFO,WARNING,ERROR}
```

## 📁 ファイル構成

```
chroma/
├── load_knowledge.py          # メインスクリプト
├── knowledge_base/            # 知識ベースファイル
│   ├── basic_moves.txt
│   ├── basic_skills.txt
│   ├── common_mistakes.txt
│   └── training_tips.txt
├── secrets.yaml              # 設定ファイル（オプション）
├── chroma_update.log          # 処理ログ
├── knowledge_metadata.json    # ファイルメタデータ
├── backups/                   # バックアップ
└── load_knowledge.lock        # プロセスロック
```

## 🎯 使用例

### 新しい知識ファイル追加
```bash
# 1. ファイル作成
echo "新しいクライミング技術..." > knowledge_base/advanced_techniques.txt

# 2. 変更検出・更新
python load_knowledge.py --mode incremental

# 3. 結果確認
python load_knowledge.py --mode verify
```

### 開発環境でのテスト
```bash
# 詳細ログでモックテスト
python load_knowledge.py --mode mock-test --log-level DEBUG

# 処理内容確認
python load_knowledge.py --mode replace --mock-chromadb --dry-run

# モック環境で実際の処理
python load_knowledge.py --mode replace --mock-chromadb
```

### 本番環境運用
```bash
# 日次バックアップ
python load_knowledge.py --mode backup

# 増分更新
python load_knowledge.py --mode incremental

# システム状態確認
python load_knowledge.py --mode verify
```

## 🔍 モック機能の詳細

### MockChromaClient
- コレクション作成・削除・取得
- ドキュメント追加・検索・削除
- メモリ内データ管理
- 接続テスト（常に成功）

### MockEmbeddings
- 768次元ベクトル生成（Gemini互換）
- 決定的結果（同じテキスト→同じベクトル）
- ハッシュベース生成アルゴリズム
- API制限・課金なし

### MockCollection
- ドキュメント操作（追加・削除・検索）
- メタデータ管理
- カウント機能
- クエリ機能（モック結果返却）

## ⚙️ 環境変数

### 必須（本番環境）
```bash
export GEMINI_API_KEY="your-gemini-api-key"
export CHROMA_DB_URL="http://chromadb-server:8000"
```

### 開発・テスト用
```bash
export GEMINI_API_KEY="test_key_for_validation"
export CHROMA_DB_URL="http://test-url-for-validation"
```

## 🛠️ トラブルシューティング

### ChromaDB接続エラー
```bash
# モック機能で回避
python load_knowledge.py --mode mock-test
```

### 設定エラー
```bash
# 設定詳細確認
python load_knowledge.py --mode config-test --log-level DEBUG
```

### ファイル変更未検出
```bash
# メタデータ確認
cat knowledge_metadata.json

# 強制更新
python load_knowledge.py --mode replace
```

### プロセスロック
```bash
# ロックファイル削除
rm load_knowledge.lock
```

## 📈 パフォーマンス最適化

### バッチサイズ調整
- **小さなファイル**: バッチサイズ 10-20
- **大きなファイル**: バッチサイズ 50-100
- **メモリ制限**: バッチサイズ 5-10

### 処理モード選択
- **初回**: `replace`（全データ処理）
- **日常**: `incremental`（変更分のみ）
- **緊急**: `append`（追加のみ）

## 🔒 セキュリティ

### API キー管理
- 環境変数での管理推奨
- `secrets.yaml`は`.gitignore`に追加
- 本番環境では Secret Manager 使用

### ログ管理
- 機密情報の自動マスキング
- ログローテーション設定
- アクセス制限

## 🚀 自動化

### 日次更新スクリプト
```bash
#!/bin/bash
# daily_update.sh

# バックアップ
python load_knowledge.py --mode backup

# 増分更新
python load_knowledge.py --mode incremental

# ヘルスチェック
if python load_knowledge.py --mode verify; then
    echo "✅ Daily update successful"
else
    echo "❌ Daily update failed"
    exit 1
fi
```

### CI/CD統合
```yaml
# .github/workflows/knowledge-update.yml
name: Knowledge Base Update
on:
  push:
    paths: ['gcp_config/chroma/knowledge_base/**']

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Mock Test
        run: python gcp_config/chroma/load_knowledge.py --mode mock-test
      - name: Deploy to Production
        run: python gcp_config/chroma/load_knowledge.py --mode incremental
```

## 📚 関連ドキュメント

- [メインREADME](../README.md) - GCPデプロイ全般
- [Phase 3 エラーハンドリング](./error_handling.md) - 高度なエラー処理
- [API仕様](./api_spec.md) - 詳細なAPI仕様

## 🤝 コントリビューション

1. モック機能でテスト
2. 実際の環境で検証
3. ドキュメント更新
4. プルリクエスト作成

---

**🎭 モック機能により、外部依存なしで安全・効率的な開発が可能です！** 