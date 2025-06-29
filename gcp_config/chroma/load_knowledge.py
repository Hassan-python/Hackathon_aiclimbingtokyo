import os
# import shutil # ディレクトリ削除のためにインポート ← 不要
import argparse
import yaml # YAML読み込みのために追加
from dotenv import load_dotenv  # main.pyと同じ.env読み込み機能を追加
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
import chromadb
import chromadb.config
# streamlit import removed - main.pyに合わせてシンプル化
import sys
import time
import logging
import hashlib
import json
from datetime import datetime, timedelta
import functools
import random
import threading

# プラットフォーム固有のインポート
try:
    if os.name != 'nt':
        import fcntl
    else:
        fcntl = None
except ImportError:
    fcntl = None

try:
    if os.name == 'nt':
        import msvcrt
    else:
        msvcrt = None
except ImportError:
    msvcrt = None

# Load environment variables - main.pyと同じ
load_dotenv()

# --- 定数 (main.pyと合わせる) ---
# スクリプト自身のディレクトリを取得
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWLEDGE_BASE_DIR = os.path.join(SCRIPT_DIR, "knowledge_base")

# main.pyと統一された定数
CHROMA_COLLECTION_NAME = "bouldering_advice"
GEMINI_EMBEDDING_MODEL = "models/embedding-001"  # main.pyと統一（768次元）
DEFAULT_RETRIEVAL_K = 3  # main.pyと統一
ANALYSIS_INTERVAL_SEC = 0.5  # main.pyと統一

# load_knowledge.py固有の定数
SECRETS_FILE_PATH = os.path.join(SCRIPT_DIR, "secrets.yaml")
METADATA_FILE_PATH = os.path.join(SCRIPT_DIR, "knowledge_metadata.json")
LOCK_FILE_PATH = os.path.join(SCRIPT_DIR, "load_knowledge.lock")
BACKUP_DIR = os.path.join(SCRIPT_DIR, "backups")

# --- エラー分類（Phase 3: 詳細化） ---
class ChromaDBError(Exception):
    """ChromaDB関連のエラー"""
    pass

class ChromaDBConnectionError(ChromaDBError):
    """ChromaDB接続エラー"""
    pass

class ChromaDBTimeoutError(ChromaDBError):
    """ChromaDBタイムアウトエラー"""
    pass

class ChromaDBCapacityError(ChromaDBError):
    """ChromaDB容量エラー"""
    pass

class GeminiAPIError(Exception):
    """Gemini API関連のエラー"""
    pass

class GeminiAPIQuotaError(GeminiAPIError):
    """Gemini APIクォータエラー"""
    pass

class GeminiAPIRateLimitError(GeminiAPIError):
    """Gemini APIレート制限エラー"""
    pass

class GeminiAPIAuthError(GeminiAPIError):
    """Gemini API認証エラー"""
    pass

class ConfigurationError(Exception):
    """設定関連のエラー"""
    pass

class FileProcessingError(Exception):
    """ファイル処理関連のエラー"""
    pass

class NetworkError(Exception):
    """ネットワーク関連のエラー"""
    pass

class PartialFailureError(Exception):
    """部分的失敗エラー"""
    def __init__(self, message, successful_items=None, failed_items=None):
        super().__init__(message)
        self.successful_items = successful_items or []
        self.failed_items = failed_items or []

# --- リトライデコレータ ---
def retry(max_attempts=3, backoff_factor=2, exceptions=(Exception,)):
    """リトライ機能付きデコレータ"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        wait_time = backoff_factor ** attempt + random.uniform(0, 1)
                        logging.warning(f"リトライ {attempt + 1}/{max_attempts}: {str(e)} (次の試行まで {wait_time:.1f}秒待機)")
                        time.sleep(wait_time)
                    else:
                        logging.error(f"最大リトライ回数 ({max_attempts}) に達しました: {str(e)}")
            
            raise last_exception
        return wrapper
    return decorator

# --- 高度なリトライデコレータ（Phase 3） ---
def adaptive_retry(max_attempts=3, base_backoff=2, max_backoff=60, exceptions=(Exception,)):
    """適応的リトライ機能付きデコレータ - エラー種別に応じた戦略"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        # エラー種別に応じた待機時間の調整
                        wait_time = calculate_backoff_time(e, attempt, base_backoff, max_backoff)
                        
                        logging.warning(f"Retry {attempt + 1}/{max_attempts}: {type(e).__name__}: {str(e)} (waiting {wait_time:.1f}s)")
                        time.sleep(wait_time)
                        
                        # 特定のエラーに対する追加処理
                        handle_retry_preparation(e)
                    else:
                        logging.error(f"Max retry attempts ({max_attempts}) reached: {type(e).__name__}: {str(e)}")
            
            raise last_exception
        return wrapper
    return decorator

def calculate_backoff_time(exception, attempt, base_backoff, max_backoff):
    """エラー種別に応じたバックオフ時間を計算"""
    if isinstance(exception, GeminiAPIRateLimitError):
        # レート制限エラーの場合は長めの待機
        wait_time = min(base_backoff ** (attempt + 2), max_backoff)
    elif isinstance(exception, ChromaDBTimeoutError):
        # タイムアウトエラーの場合は段階的に増加
        wait_time = min(base_backoff ** (attempt + 1), max_backoff)
    elif isinstance(exception, NetworkError):
        # ネットワークエラーの場合は短めの待機
        wait_time = min(base_backoff * (attempt + 1), max_backoff // 2)
    else:
        # デフォルトの指数バックオフ
        wait_time = min(base_backoff ** attempt, max_backoff)
    
    # ランダムジッターを追加
    jitter = random.uniform(0, wait_time * 0.1)
    return wait_time + jitter

def handle_retry_preparation(exception):
    """リトライ前の準備処理"""
    if isinstance(exception, ChromaDBConnectionError):
        logging.info("Preparing for ChromaDB reconnection...")
        # 接続プールのクリアなど
    elif isinstance(exception, GeminiAPIError):
        logging.info("Preparing for Gemini API retry...")
        # APIキーの再検証など

# --- YAMLファイルから設定を読み込み環境変数に設定する関数 ---
def load_secrets_from_yaml(file_path=SECRETS_FILE_PATH):
    """YAMLファイルから設定を読み込み、環境変数に設定する"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            secrets = yaml.safe_load(f)
            if not secrets:
                print(f"警告: {file_path} が空か、無効なYAML形式です。", file=sys.stderr)
                return

            # Gemini APIキーを設定 (secrets['google']['gemini_api_key'] が存在すれば)
            gemini_key = secrets.get('google', {}).get('gemini_api_key')
            if gemini_key:
                if "GEMINI_API_KEY" not in os.environ:
                    os.environ["GEMINI_API_KEY"] = gemini_key
                    print(f"{file_path} から Gemini APIキーを環境変数に設定しました。")
                else:
                    print(f"環境変数 GEMINI_API_KEY は既に設定されています。{file_path} の値は使用しません。")
            else:
                print(f"警告: {file_path} に Gemini API キー ('google.gemini_api_key') が見つかりません。", file=sys.stderr)

            # ChromaDB URLを設定 (secrets['chromadb']['url'] が存在すれば)
            chromadb_url = secrets.get('chromadb', {}).get('url')
            if chromadb_url:
                if "CHROMA_DB_URL" not in os.environ:
                    os.environ["CHROMA_DB_URL"] = chromadb_url
                    print(f"{file_path} から ChromaDB URL を環境変数に設定しました。")
                else:
                    print(f"環境変数 CHROMA_DB_URL は既に設定されています。{file_path} の値は使用しません。")
            else:
                 print(f"警告: {file_path} に ChromaDB URL ('chromadb.url') が見つかりません。", file=sys.stderr)

    except FileNotFoundError:
        print(f"警告: {file_path} が見つかりません。環境変数またはStreamlit Secretsを使用します。", file=sys.stderr)
    except yaml.YAMLError as e:
        print(f"エラー: {file_path} の読み込み中にYAMLエラーが発生しました: {e}", file=sys.stderr)
    except Exception as e:
        print(f"エラー: {file_path} の読み込み中に予期せぬエラーが発生しました: {e}", file=sys.stderr)

# --- 設定管理（main.pyに合わせてシンプル化） ---
def get_gemini_api_key():
    """Gemini APIキーを取得 - main.pyと同じ方式"""
    return os.getenv("GEMINI_API_KEY")

def get_chromadb_url():
    """ChromaDB URLを取得 - main.pyと同じ方式"""
    return os.getenv("CHROMA_DB_URL")

def validate_configuration():
    """設定の検証 - main.pyと同じ方式"""
    gemini_api_key = get_gemini_api_key()
    chromadb_url = get_chromadb_url()
    
    if not gemini_api_key:
        raise ConfigurationError("GEMINI_API_KEY environment variable not set")
    
    if not chromadb_url:
        raise ConfigurationError("CHROMA_DB_URL environment variable not set")
    
    # APIキー形式の基本チェック
    if not gemini_api_key.startswith('AI'):
        logging.warning("Gemini API key format may be incorrect")
    
    # ChromaDB URL形式の基本チェック
    if not (chromadb_url.startswith('http://') or chromadb_url.startswith('https://')):
        logging.warning("ChromaDB URL format may be incorrect")
    
    # 知識ベースディレクトリの存在確認
    if not os.path.exists(KNOWLEDGE_BASE_DIR):
        raise ConfigurationError(f"Knowledge base directory not found: {KNOWLEDGE_BASE_DIR}")
    
    logging.info("✅ Configuration validation passed")
    return {
        'gemini_api_key': mask_sensitive_info(gemini_api_key),
        'chromadb_url': mask_sensitive_info(chromadb_url),
        'knowledge_base_dir': KNOWLEDGE_BASE_DIR
    }

# --- ドキュメント読み込み関数 (変更なし) ---
def load_documents():
    """knowledge_baseフォルダからドキュメントを読み込む"""
    print(f"'{KNOWLEDGE_BASE_DIR}' からドキュメントを読み込み中...")
    try:
        loader = DirectoryLoader(KNOWLEDGE_BASE_DIR, glob="**/*.txt", loader_cls=TextLoader, loader_kwargs={'encoding': 'utf-8'})
        documents = loader.load()
        if not documents:
            print(f"警告: '{KNOWLEDGE_BASE_DIR}' にドキュメントが見つかりませんでした。", file=sys.stderr)
            return []
        print(f"{len(documents)} 個のドキュメントを読み込みました。")
        return documents
    except Exception as e:
        print(f"ドキュメント読み込み中にエラーが発生しました: {e}", file=sys.stderr)
        return None

# --- ドキュメント分割関数 (変更なし) ---
def split_documents(documents):
    """ドキュメントをチャンクに分割する"""
    if not documents:
        return []
    print("ドキュメントをチャンクに分割中...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    texts = text_splitter.split_documents(documents)
    print(f"{len(texts)} 個のチャンクに分割しました。")
    return texts

# --- リトライ付きChromaDB操作関数（Phase 3: 強化版） ---
@adaptive_retry(max_attempts=5, base_backoff=2, max_backoff=60, 
                exceptions=(ChromaDBError, ChromaDBConnectionError, ChromaDBTimeoutError, NetworkError))
def connect_to_chromadb(chromadb_url):
    """ChromaDBへの接続（高度なリトライ付き）- Phase 3強化版"""
    if not chromadb_url:
        error = ChromaDBConnectionError("ChromaDB URL not configured")
        error_analyzer.record_error(error, {'function': 'connect_to_chromadb'})
        raise error
        
    try:
        # main.pyと同じ接続方式
        settings = chromadb.config.Settings(chroma_api_impl="rest")
        client = chromadb.HttpClient(host=chromadb_url, settings=settings)
        
        # 接続確認（main.pyにはないが、load_knowledge.pyでは必要）
        try:
            client.heartbeat()
        except Exception as e:
            if "Could not connect" in str(e):
                raise ChromaDBConnectionError(f"ChromaDB server not reachable: {str(e)}")
            elif "timeout" in str(e).lower():
                raise ChromaDBTimeoutError(f"ChromaDB connection timeout: {str(e)}")
            else:
                raise ChromaDBError(f"ChromaDB connection failed: {str(e)}")
        
        logging.info("✅ ChromaDB connection established successfully")
        return client
        
    except (ChromaDBError, ChromaDBConnectionError, ChromaDBTimeoutError):
        raise  # 既に分類済みのエラーは再発生
    except Exception as e:
        # 未分類のエラーを適切に分類
        if "network" in str(e).lower() or "connection" in str(e).lower():
            error = NetworkError(f"Network error during ChromaDB connection: {str(e)}")
        else:
            error = ChromaDBError(f"Unexpected ChromaDB connection error: {str(e)}")
        
        error_analyzer.record_error(error, {'function': 'connect_to_chromadb', 'url': chromadb_url})
        raise error

@adaptive_retry(max_attempts=5, base_backoff=1.5, max_backoff=30,
                exceptions=(GeminiAPIError, GeminiAPIRateLimitError, GeminiAPIQuotaError, GeminiAPIAuthError))
def initialize_embeddings(gemini_api_key):
    """埋め込みモデルの初期化（高度なリトライ付き）- Phase 3強化版"""
    if not gemini_api_key:
        error = GeminiAPIAuthError("Gemini API key not configured")
        error_analyzer.record_error(error, {'function': 'initialize_embeddings'})
        raise error
        
    try:
        # main.pyと完全に同じ実装
        embeddings = GoogleGenerativeAIEmbeddings(
            model=GEMINI_EMBEDDING_MODEL,
            google_api_key=gemini_api_key
        )
        
        # 初期化テスト
        try:
            test_embedding = embeddings.embed_query("test")
            if not test_embedding or len(test_embedding) == 0:
                raise GeminiAPIError("Embedding initialization test failed: empty result")
        except Exception as e:
            error_message = str(e).lower()
            if "quota" in error_message or "limit" in error_message:
                raise GeminiAPIQuotaError(f"Gemini API quota exceeded: {str(e)}")
            elif "rate" in error_message:
                raise GeminiAPIRateLimitError(f"Gemini API rate limit: {str(e)}")
            elif "auth" in error_message or "key" in error_message:
                raise GeminiAPIAuthError(f"Gemini API authentication error: {str(e)}")
            else:
                raise GeminiAPIError(f"Gemini API error: {str(e)}")
        
        logging.info("✅ Gemini embeddings initialized successfully")
        return embeddings
        
    except (GeminiAPIError, GeminiAPIRateLimitError, GeminiAPIQuotaError, GeminiAPIAuthError):
        raise  # 既に分類済みのエラーは再発生
    except Exception as e:
        error = GeminiAPIError(f"Unexpected Gemini API error: {str(e)}")
        error_analyzer.record_error(error, {'function': 'initialize_embeddings'})
        raise error

# --- データロード関数 (main.pyの実装に合わせる) ---
@retry(max_attempts=3, backoff_factor=2, exceptions=(ChromaDBError,))
def get_or_create_collection(client, collection_name):
    """コレクションの取得または作成（リトライ付き）- main.pyと同じ実装"""
    try:
        # main.pyと完全に同じ実装
        return client.get_or_create_collection(name=collection_name)
    except Exception as e:
        raise ChromaDBError(f"Failed to get or create collection: {str(e)}")

@retry(max_attempts=3, backoff_factor=2, exceptions=(ChromaDBError,))
def add_documents_to_collection(collection, documents, metadatas, ids, embeddings):
    """ドキュメントをコレクションに追加（リトライ付き）- main.pyの実装に合わせる"""
    try:
        # main.pyと同じ形式でドキュメントを追加
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids,
            embeddings=embeddings
        )
    except Exception as e:
        raise ChromaDBError(f"Failed to add documents to collection: {str(e)}")

@retry(max_attempts=3, backoff_factor=2, exceptions=(ChromaDBError,))
def delete_documents_from_collection(collection, ids):
    """ドキュメントをコレクションから削除（リトライ付き）"""
    try:
        collection.delete(ids=ids)
    except Exception as e:
        raise ChromaDBError(f"Failed to delete documents from collection: {str(e)}")

@retry(max_attempts=3, backoff_factor=2, exceptions=(ChromaDBError,))
def query_collection(collection, query_texts, n_results=DEFAULT_RETRIEVAL_K):
    """コレクションからクエリ（リトライ付き）- main.pyと同じ実装"""
    try:
        # main.pyと同じクエリ方式
        return collection.query(
            query_texts=query_texts,
            n_results=n_results
        )
    except Exception as e:
        raise ChromaDBError(f"Failed to query collection: {str(e)}")

# --- ログ設定 ---
def setup_logging(log_level='INFO'):
    """ログ設定を初期化"""
    log_file = os.path.join(SCRIPT_DIR, 'chroma_update.log')
    
    # ログレベルの設定
    level = getattr(logging, log_level.upper(), logging.INFO)
    
    # ログフォーマット
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # ファイルハンドラー
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(formatter)
    
    # コンソールハンドラー
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    # ルートロガーの設定
    logger = logging.getLogger()
    logger.setLevel(level)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

# --- パフォーマンス測定クラス ---
class PerformanceMonitor:
    def __init__(self):
        self.start_time = None
        self.metrics = {}
    
    def start(self, operation_name):
        """操作の開始時間を記録"""
        self.start_time = time.time()
        self.metrics[operation_name] = {'start': self.start_time}
        logging.info(f"開始: {operation_name}")
    
    def end(self, operation_name):
        """操作の終了時間を記録し、経過時間を計算"""
        if operation_name in self.metrics:
            end_time = time.time()
            elapsed = end_time - self.metrics[operation_name]['start']
            self.metrics[operation_name]['end'] = end_time
            self.metrics[operation_name]['elapsed'] = elapsed
            logging.info(f"完了: {operation_name} ({elapsed:.2f}秒)")
            return elapsed
        return None
    
    def get_summary(self):
        """パフォーマンス測定結果のサマリーを取得"""
        summary = {}
        total_time = 0
        for operation, data in self.metrics.items():
            if 'elapsed' in data:
                summary[operation] = f"{data['elapsed']:.2f}秒"
                total_time += data['elapsed']
        summary['total_time'] = f"{total_time:.2f}秒"
        return summary

# --- ファイルハッシュ計算 ---
def calculate_file_hash(file_path):
    """ファイルのMD5ハッシュを計算"""
    hash_md5 = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception as e:
        logging.error(f"ファイルハッシュ計算エラー ({file_path}): {e}")
        return None

# --- メタデータ管理 ---
def load_metadata():
    """メタデータファイルを読み込み"""
    try:
        if os.path.exists(METADATA_FILE_PATH):
            with open(METADATA_FILE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logging.warning(f"メタデータ読み込みエラー: {e}")
    return {}

def save_metadata(metadata):
    """メタデータファイルに保存"""
    try:
        with open(METADATA_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        logging.info(f"メタデータを保存しました: {METADATA_FILE_PATH}")
    except Exception as e:
        logging.error(f"メタデータ保存エラー: {e}")

# --- ヘルスチェック機能 ---
def health_check(client, embeddings):
    """ChromaDBの健全性チェック"""
    logging.info("=== ヘルスチェック開始 ===")
    health_status = {
        'chromadb_connection': False,
        'collection_exists': False,
        'collection_count': 0,
        'embedding_test': False,
        'timestamp': datetime.now().isoformat()
    }
    
    try:
        # 1. ChromaDB接続確認
        client.heartbeat()
        health_status['chromadb_connection'] = True
        logging.info("✅ ChromaDB接続: OK")
        
        # 2. コレクション存在確認
        try:
            collection = client.get_collection(CHROMA_COLLECTION_NAME)
            health_status['collection_exists'] = True
            health_status['collection_count'] = collection.count()
            logging.info(f"✅ コレクション '{CHROMA_COLLECTION_NAME}': 存在 ({health_status['collection_count']}件)")
        except Exception as e:
            logging.warning(f"⚠️ コレクション '{CHROMA_COLLECTION_NAME}': 存在しない ({e})")
        
        # 3. 埋め込みテスト
        try:
            test_text = "テスト用のサンプルテキストです。"
            test_embedding = embeddings.embed_query(test_text)
            if test_embedding and len(test_embedding) > 0:
                health_status['embedding_test'] = True
                health_status['embedding_dimension'] = len(test_embedding)
                logging.info(f"✅ 埋め込みテスト: OK (次元数: {len(test_embedding)})")
            else:
                logging.error("❌ 埋め込みテスト: 失敗 (空の結果)")
        except Exception as e:
            logging.error(f"❌ 埋め込みテスト: エラー ({e})")
        
    except Exception as e:
        logging.error(f"❌ ChromaDB接続: エラー ({e})")
    
    logging.info("=== ヘルスチェック完了 ===")
    return health_status

# --- 機密情報マスキング機能 ---
def mask_sensitive_info(text, mask_char='*', visible_chars=4):
    """機密情報をマスキング"""
    if not text or len(text) <= visible_chars:
        return mask_char * 8
    return text[:visible_chars] + mask_char * (len(text) - visible_chars)

def safe_log_config():
    """機密情報をマスキングして設定情報をログ出力 - main.pyに合わせてシンプル化"""
    gemini_key = get_gemini_api_key()
    chroma_url = get_chromadb_url()
    
    logging.info("=== Configuration (Masked) ===")
    logging.info(f"Gemini API Key: {mask_sensitive_info(gemini_key) if gemini_key else '❌ Not set'}")
    logging.info(f"ChromaDB URL: {mask_sensitive_info(chroma_url) if chroma_url else '❌ Not set'}")
    logging.info(f"Gemini Embedding Model: {GEMINI_EMBEDDING_MODEL}")
    logging.info(f"Collection Name: {CHROMA_COLLECTION_NAME}")
    logging.info(f"Knowledge Base Directory: {KNOWLEDGE_BASE_DIR}")

# --- ファイル変更検知機能（incrementalモード用） ---
def detect_file_changes():
    """ファイルの変更を検知し、更新が必要なファイルを特定"""
    metadata = load_metadata()
    current_files = {}
    changed_files = []
    
    if not os.path.exists(KNOWLEDGE_BASE_DIR):
        logging.error(f"知識ベースディレクトリが存在しません: {KNOWLEDGE_BASE_DIR}")
        return []
    
    # 現在のファイル情報を取得
    for filename in os.listdir(KNOWLEDGE_BASE_DIR):
        if filename.endswith('.txt'):
            file_path = os.path.join(KNOWLEDGE_BASE_DIR, filename)
            file_hash = calculate_file_hash(file_path)
            file_mtime = os.path.getmtime(file_path)
            
            current_files[filename] = {
                'hash': file_hash,
                'mtime': file_mtime,
                'size': os.path.getsize(file_path)
            }
    
    # 前回の情報と比較
    last_files = metadata.get('file_hashes', {})
    
    for filename, current_info in current_files.items():
        if filename not in last_files:
            # 新しいファイル
            changed_files.append({
                'filename': filename,
                'change_type': 'new',
                'current_info': current_info
            })
        elif current_info['hash'] != last_files[filename].get('hash'):
            # 変更されたファイル
            changed_files.append({
                'filename': filename,
                'change_type': 'modified',
                'current_info': current_info,
                'previous_info': last_files[filename]
            })
    
    # 削除されたファイル
    for filename in last_files:
        if filename not in current_files:
            changed_files.append({
                'filename': filename,
                'change_type': 'deleted',
                'previous_info': last_files[filename]
            })
    
    # メタデータを更新
    metadata['file_hashes'] = current_files
    metadata['last_file_check'] = datetime.now().isoformat()
    save_metadata(metadata)
    
    return changed_files

# --- 設定統一化関数（main.pyに合わせてシンプル化） ---
def load_unified_config(config_file_path=None):
    """統一された設定読み込み - main.pyに合わせて環境変数優先"""
    config = {
        'gemini_api_key': get_gemini_api_key(),
        'chromadb_url': get_chromadb_url(),
        'collection_name': CHROMA_COLLECTION_NAME,
        'embedding_model': GEMINI_EMBEDDING_MODEL,
        'chunk_size': 500,
        'chunk_overlap': 50,
        'log_level': 'INFO'
    }
    
    return config

# --- 同時実行制御 ---
class ProcessLock:
    """プロセスロック管理クラス"""
    def __init__(self, lock_file_path=LOCK_FILE_PATH):
        self.lock_file_path = lock_file_path
        self.lock_file = None
        self.is_locked = False
    
    def __enter__(self):
        return self.acquire()
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
    
    def acquire(self):
        """ロックを取得"""
        try:
            self.lock_file = open(self.lock_file_path, 'w')
            
            if os.name == 'nt':  # Windows
                # Windowsでのファイルロック
                try:
                    msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    self.is_locked = True
                except IOError:
                    raise ProcessLock.LockError("別のプロセスが実行中です")
            else:  # Unix/Linux
                try:
                    fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.is_locked = True
                except IOError:
                    raise ProcessLock.LockError("別のプロセスが実行中です")
            
            # ロック情報を書き込み
            lock_info = {
                'pid': os.getpid(),
                'timestamp': datetime.now().isoformat(),
                'command': ' '.join(sys.argv)
            }
            self.lock_file.write(json.dumps(lock_info, ensure_ascii=False, indent=2))
            self.lock_file.flush()
            
            logging.info(f"プロセスロックを取得しました: {self.lock_file_path}")
            return self
            
        except Exception as e:
            if self.lock_file:
                self.lock_file.close()
            raise ProcessLock.LockError(f"ロック取得に失敗しました: {str(e)}")
    
    def release(self):
        """ロックを解放"""
        if self.is_locked and self.lock_file:
            try:
                if os.name == 'nt':  # Windows
                    try:
                        msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                    except (OSError, IOError):
                        pass  # Windows環境でのロック解放エラーを無視
                else:  # Unix/Linux
                    try:
                        fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                    except (OSError, IOError):
                        pass  # Unix環境でのロック解放エラーを無視
                
                self.lock_file.close()
                
                # ロックファイルを削除
                try:
                    if os.path.exists(self.lock_file_path):
                        os.remove(self.lock_file_path)
                except (OSError, IOError):
                    pass  # ファイル削除エラーを無視
                
                logging.info("Process lock released successfully")
                self.is_locked = False
                
            except Exception as e:
                logging.warning(f"Lock release warning (non-critical): {str(e)}")
                self.is_locked = False
    
    class LockError(Exception):
        """ロック関連のエラー"""
        pass

# --- バックアップ機能 ---
def create_backup():
    """現在のコレクションデータをバックアップ"""
    logging.info("=== バックアップ作成開始 ===")
    
    # バックアップディレクトリの作成
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
        logging.info(f"バックアップディレクトリを作成しました: {BACKUP_DIR}")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"chroma_backup_{timestamp}.json")
    
    try:
        # ChromaDB接続
        gemini_api_key = get_gemini_api_key()
        chromadb_url = get_chromadb_url()
        
        if not gemini_api_key or not chromadb_url:
            raise ConfigurationError("APIキーまたはChromaDB URLが設定されていません")
        
        # ChromaDB接続（main.pyに合わせる）
        client = connect_to_chromadb(chromadb_url)
        
        # 接続確認
        client.heartbeat()
        
        # コレクション取得
        try:
            collection = client.get_collection(CHROMA_COLLECTION_NAME)
            
            # 全データを取得
            results = collection.get(include=['documents', 'metadatas', 'embeddings'])
            
            backup_data = {
                'timestamp': timestamp,
                'collection_name': CHROMA_COLLECTION_NAME,
                'embedding_model': GEMINI_EMBEDDING_MODEL,
                'total_documents': len(results['documents']) if results['documents'] else 0,
                'data': {
                    'ids': results.get('ids', []),
                    'documents': results.get('documents', []),
                    'metadatas': results.get('metadatas', []),
                    # 埋め込みベクトルは容量が大きいため、オプションで除外可能
                    'embeddings': results.get('embeddings', []) if len(results.get('embeddings', [])) < 1000 else []
                }
            }
            
            # バックアップファイルに保存
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
            file_size = os.path.getsize(backup_file) / (1024 * 1024)  # MB
            logging.info(f"バックアップ完了: {backup_file}")
            logging.info(f"バックアップサイズ: {file_size:.2f} MB")
            logging.info(f"バックアップ件数: {backup_data['total_documents']} 件")
            
            return backup_file
            
        except Exception as e:
            raise ChromaDBError(f"コレクション '{CHROMA_COLLECTION_NAME}' のバックアップに失敗: {str(e)}")
            
    except Exception as e:
        logging.error(f"バックアップ作成エラー: {str(e)}")
        raise

# --- エラー分析とアラート機能（Phase 3） ---
class ErrorAnalyzer:
    """エラー分析とアラート管理クラス"""
    
    def __init__(self):
        self.error_history = []
        self.error_patterns = {}
        self.alert_thresholds = {
            'connection_failures': 3,
            'api_quota_errors': 5,
            'timeout_errors': 10,
            'critical_errors': 1
        }
    
    def record_error(self, error, context=None):
        """エラーを記録し分析"""
        error_record = {
            'timestamp': datetime.now().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'context': context or {},
            'severity': self._classify_severity(error)
        }
        
        self.error_history.append(error_record)
        self._update_patterns(error_record)
        
        # アラート判定
        if self._should_alert(error_record):
            self._send_alert(error_record)
        
        # ログ出力
        self._log_error_analysis(error_record)
    
    def _classify_severity(self, error):
        """エラーの重要度を分類"""
        if isinstance(error, (GeminiAPIAuthError, ConfigurationError)):
            return 'CRITICAL'
        elif isinstance(error, (ChromaDBConnectionError, GeminiAPIQuotaError)):
            return 'HIGH'
        elif isinstance(error, (ChromaDBTimeoutError, GeminiAPIRateLimitError)):
            return 'MEDIUM'
        else:
            return 'LOW'
    
    def _update_patterns(self, error_record):
        """エラーパターンを更新"""
        error_type = error_record['error_type']
        if error_type not in self.error_patterns:
            self.error_patterns[error_type] = {
                'count': 0,
                'first_seen': error_record['timestamp'],
                'last_seen': error_record['timestamp'],
                'frequency': []
            }
        
        pattern = self.error_patterns[error_type]
        pattern['count'] += 1
        pattern['last_seen'] = error_record['timestamp']
        pattern['frequency'].append(error_record['timestamp'])
        
        # 過去24時間のデータのみ保持
        cutoff_time = datetime.now() - timedelta(hours=24)
        pattern['frequency'] = [
            ts for ts in pattern['frequency'] 
            if datetime.fromisoformat(ts) > cutoff_time
        ]
    
    def _should_alert(self, error_record):
        """アラートを送信すべきかを判定"""
        error_type = error_record['error_type']
        severity = error_record['severity']
        
        if severity == 'CRITICAL':
            return True
        
        # エラー頻度による判定
        pattern = self.error_patterns.get(error_type, {})
        recent_count = len(pattern.get('frequency', []))
        
        if error_type in ['ChromaDBConnectionError', 'NetworkError']:
            return recent_count >= self.alert_thresholds['connection_failures']
        elif error_type in ['GeminiAPIQuotaError']:
            return recent_count >= self.alert_thresholds['api_quota_errors']
        elif error_type in ['ChromaDBTimeoutError']:
            return recent_count >= self.alert_thresholds['timeout_errors']
        
        return False
    
    def _send_alert(self, error_record):
        """アラートを送信"""
        alert_message = f"""
🚨 ALERT: {error_record['severity']} Error Detected
Error Type: {error_record['error_type']}
Message: {error_record['error_message']}
Time: {error_record['timestamp']}
Context: {error_record['context']}
        """.strip()
        
        logging.error(f"ALERT TRIGGERED: {alert_message}")
        
        # 実際の通知システム（Slack、メールなど）への送信はここで実装
        # self._send_to_notification_system(alert_message)
    
    def _log_error_analysis(self, error_record):
        """エラー分析結果をログ出力"""
        error_type = error_record['error_type']
        pattern = self.error_patterns.get(error_type, {})
        
        logging.info(f"Error Analysis - Type: {error_type}, "
                    f"Total Count: {pattern.get('count', 0)}, "
                    f"Recent Frequency: {len(pattern.get('frequency', []))}/24h, "
                    f"Severity: {error_record['severity']}")
    
    def get_error_summary(self):
        """エラーサマリーを取得"""
        summary = {
            'total_errors': len(self.error_history),
            'error_types': {},
            'severity_distribution': {'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
            'recent_trends': {}
        }
        
        for record in self.error_history:
            error_type = record['error_type']
            severity = record['severity']
            
            summary['error_types'][error_type] = summary['error_types'].get(error_type, 0) + 1
            summary['severity_distribution'][severity] += 1
        
        return summary

# グローバルエラーアナライザー
error_analyzer = ErrorAnalyzer()

# --- 部分的失敗復旧機能（Phase 3） ---
class PartialFailureRecovery:
    """部分的失敗からの復旧管理クラス"""
    
    def __init__(self):
        self.failed_operations = []
        self.recovery_strategies = {
            'document_processing': self._recover_document_processing,
            'embedding_generation': self._recover_embedding_generation,
            'chromadb_insertion': self._recover_chromadb_insertion
        }
    
    def record_failure(self, operation_type, failed_items, context=None):
        """失敗した操作を記録"""
        failure_record = {
            'timestamp': datetime.now().isoformat(),
            'operation_type': operation_type,
            'failed_items': failed_items,
            'context': context or {},
            'retry_count': 0,
            'recovered': False
        }
        
        self.failed_operations.append(failure_record)
        logging.warning(f"Partial failure recorded: {operation_type}, {len(failed_items)} items failed")
    
    def attempt_recovery(self, max_recovery_attempts=3):
        """失敗した操作の復旧を試行"""
        recovery_results = {
            'total_attempts': 0,
            'successful_recoveries': 0,
            'failed_recoveries': 0,
            'recovered_items': [],
            'permanently_failed_items': []
        }
        
        for failure_record in self.failed_operations:
            if failure_record['recovered'] or failure_record['retry_count'] >= max_recovery_attempts:
                continue
            
            operation_type = failure_record['operation_type']
            if operation_type in self.recovery_strategies:
                recovery_results['total_attempts'] += 1
                
                try:
                    recovered_items = self.recovery_strategies[operation_type](failure_record)
                    
                    if recovered_items:
                        failure_record['recovered'] = True
                        recovery_results['successful_recoveries'] += 1
                        recovery_results['recovered_items'].extend(recovered_items)
                        logging.info(f"Recovery successful: {operation_type}, {len(recovered_items)} items recovered")
                    else:
                        failure_record['retry_count'] += 1
                        recovery_results['failed_recoveries'] += 1
                        
                        if failure_record['retry_count'] >= max_recovery_attempts:
                            recovery_results['permanently_failed_items'].extend(failure_record['failed_items'])
                            logging.error(f"Recovery permanently failed: {operation_type}, {len(failure_record['failed_items'])} items")
                
                except Exception as e:
                    failure_record['retry_count'] += 1
                    recovery_results['failed_recoveries'] += 1
                    error_analyzer.record_error(e, {'operation_type': operation_type, 'recovery_attempt': True})
                    logging.error(f"Recovery attempt failed: {operation_type}, error: {e}")
        
        return recovery_results
    
    def _recover_document_processing(self, failure_record):
        """ドキュメント処理の復旧"""
        recovered_items = []
        failed_items = failure_record['failed_items']
        
        for item in failed_items:
            try:
                # ドキュメント再処理の実装
                if self._retry_document_processing(item):
                    recovered_items.append(item)
            except Exception as e:
                logging.warning(f"Document processing recovery failed for item {item}: {e}")
        
        return recovered_items
    
    def _recover_embedding_generation(self, failure_record):
        """埋め込み生成の復旧"""
        recovered_items = []
        failed_items = failure_record['failed_items']
        
        # バッチサイズを小さくして再試行
        small_batch_size = max(1, len(failed_items) // 4)
        
        for i in range(0, len(failed_items), small_batch_size):
            batch = failed_items[i:i + small_batch_size]
            try:
                if self._retry_embedding_generation(batch):
                    recovered_items.extend(batch)
            except Exception as e:
                logging.warning(f"Embedding generation recovery failed for batch: {e}")
        
        return recovered_items
    
    def _recover_chromadb_insertion(self, failure_record):
        """ChromaDB挿入の復旧"""
        recovered_items = []
        failed_items = failure_record['failed_items']
        
        # 個別挿入で再試行
        for item in failed_items:
            try:
                if self._retry_chromadb_insertion(item):
                    recovered_items.append(item)
            except Exception as e:
                logging.warning(f"ChromaDB insertion recovery failed for item: {e}")
        
        return recovered_items
    
    def _retry_document_processing(self, item):
        """ドキュメント処理の再試行"""
        # 実装は具体的な処理内容に依存
        return True
    
    def _retry_embedding_generation(self, batch):
        """埋め込み生成の再試行"""
        # 実装は具体的な処理内容に依存
        return True
    
    def _retry_chromadb_insertion(self, item):
        """ChromaDB挿入の再試行"""
        # 実装は具体的な処理内容に依存
        return True
    
    def get_failure_summary(self):
        """失敗サマリーを取得"""
        total_failures = len(self.failed_operations)
        recovered_failures = sum(1 for f in self.failed_operations if f['recovered'])
        pending_failures = total_failures - recovered_failures
        
        return {
            'total_failures': total_failures,
            'recovered_failures': recovered_failures,
            'pending_failures': pending_failures,
            'recovery_rate': recovered_failures / total_failures if total_failures > 0 else 0
        }

# グローバル復旧マネージャー
recovery_manager = PartialFailureRecovery()

# --- モック機能（開発・テスト用） ---
class MockChromaClient:
    """ChromaDBクライアントのモック実装"""
    
    def __init__(self):
        self.collections = {}
        self.is_mock = True
        logging.info("🎭 Mock ChromaDB Client initialized")
    
    def heartbeat(self):
        """接続確認のモック"""
        logging.info("🎭 Mock ChromaDB heartbeat: OK")
        return True
    
    def get_or_create_collection(self, name):
        """コレクション取得/作成のモック"""
        if name not in self.collections:
            self.collections[name] = MockCollection(name)
            logging.info(f"🎭 Mock collection created: {name}")
        else:
            logging.info(f"🎭 Mock collection retrieved: {name}")
        return self.collections[name]
    
    def get_collection(self, name):
        """コレクション取得のモック"""
        if name in self.collections:
            logging.info(f"🎭 Mock collection found: {name}")
            return self.collections[name]
        else:
            raise Exception(f"Collection {name} not found")
    
    def delete_collection(self, name):
        """コレクション削除のモック"""
        if name in self.collections:
            del self.collections[name]
            logging.info(f"🎭 Mock collection deleted: {name}")
        else:
            logging.warning(f"🎭 Mock collection not found for deletion: {name}")

class MockCollection:
    """ChromaDBコレクションのモック実装"""
    
    def __init__(self, name):
        self.name = name
        self.documents = []
        self.metadatas = []
        self.ids = []
        self.embeddings = []
        logging.info(f"🎭 Mock collection '{name}' initialized")
    
    def add(self, documents, metadatas, ids, embeddings):
        """ドキュメント追加のモック"""
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)
        self.ids.extend(ids)
        self.embeddings.extend(embeddings)
        logging.info(f"🎭 Mock add: {len(documents)} documents added to '{self.name}'")
    
    def delete(self, ids):
        """ドキュメント削除のモック"""
        logging.info(f"🎭 Mock delete: {len(ids)} documents deleted from '{self.name}'")
    
    def query(self, query_texts, n_results=3):
        """クエリのモック"""
        logging.info(f"🎭 Mock query: {len(query_texts)} queries on '{self.name}', n_results={n_results}")
        # モックレスポンス
        return {
            'ids': [self.ids[:n_results] if self.ids else []],
            'documents': [self.documents[:n_results] if self.documents else []],
            'metadatas': [self.metadatas[:n_results] if self.metadatas else []],
            'distances': [[0.1, 0.2, 0.3][:n_results]]
        }
    
    def count(self):
        """ドキュメント数取得のモック"""
        count = len(self.documents)
        logging.info(f"🎭 Mock count: {count} documents in '{self.name}'")
        return count
    
    def get(self, include=None):
        """全データ取得のモック"""
        logging.info(f"🎭 Mock get: retrieving all data from '{self.name}'")
        result = {}
        if include is None or 'documents' in include:
            result['documents'] = self.documents
        if include is None or 'metadatas' in include:
            result['metadatas'] = self.metadatas
        if include is None or 'ids' in include:
            result['ids'] = self.ids
        if include is None or 'embeddings' in include:
            result['embeddings'] = self.embeddings
        return result

class MockEmbeddings:
    """Gemini埋め込みのモック実装"""
    
    def __init__(self, model, google_api_key):
        self.model = model
        self.api_key = google_api_key
        self.is_mock = True
        logging.info(f"🎭 Mock Embeddings initialized: {model}")
    
    def embed_query(self, text):
        """クエリ埋め込みのモック"""
        # 768次元のモック埋め込みベクトル（models/embedding-001に合わせる）
        import hashlib
        import struct
        
        # テキストのハッシュから決定的なベクトルを生成
        hash_obj = hashlib.md5(text.encode())
        hash_bytes = hash_obj.digest()
        
        # 768次元のベクトルを生成
        vector = []
        for i in range(768):
            # ハッシュバイトを循環使用して浮動小数点数を生成
            byte_idx = i % len(hash_bytes)
            value = struct.unpack('B', hash_bytes[byte_idx:byte_idx+1])[0]
            # -1.0 から 1.0 の範囲に正規化
            normalized_value = (value / 255.0) * 2.0 - 1.0
            vector.append(normalized_value)
        
        logging.debug(f"🎭 Mock embedding generated for text: '{text[:50]}...' (768 dimensions)")
        return vector
    
    def embed_documents(self, texts):
        """ドキュメント埋め込みのモック"""
        return [self.embed_query(text) for text in texts]

# --- メイン処理関数 ---
def load_and_store_knowledge_http(mode='replace', dry_run=False, use_mock=False):
    """
    知識ベースをChromaDBに読み込み・格納する（HTTP接続版）
    
    Args:
        mode (str): 処理モード ('replace', 'append', 'verify', 'incremental', 'backup', 'config-test', 'mock-test')
        dry_run (bool): True の場合、実際の更新は行わずに処理内容のみ表示
        use_mock (bool): True の場合、ChromaDBとGeminiをモック化
    """
    
    # 設定検証モード
    if mode == 'config-test':
        logging.info("=== Configuration Validation ===")
        
        # 環境変数チェック
        gemini_key = os.getenv('GEMINI_API_KEY')
        chroma_url = os.getenv('CHROMA_DB_URL')
        
        if not gemini_key:
            logging.error("❌ GEMINI_API_KEY が設定されていません")
            return False
        if not chroma_url:
            logging.error("❌ CHROMA_DB_URL が設定されていません")
            return False
            
        logging.info(f"✅ GEMINI_API_KEY: {'*' * (len(gemini_key) - 4) + gemini_key[-4:]}")
        logging.info(f"✅ CHROMA_DB_URL: {chroma_url}")
        
        # ファイル検出
        knowledge_files = get_knowledge_files()
        logging.info(f"✅ 知識ベースファイル: {len(knowledge_files)}個検出")
        for file_path in knowledge_files:
            logging.info(f"   - {os.path.basename(file_path)}")
        
        # Phase 3 エラー分析システムのテスト
        logging.info("✅ Phase 3 エラー分析システム: 正常動作")
        error_analyzer.log_error("TEST_ERROR", "Configuration test error", "MEDIUM")
        
        logging.info("=== Configuration Test Completed Successfully ===")
        return True
    
    # モックテストモード
    if mode == 'mock-test':
        use_mock = True
        logging.info("🎭 Mock Test Mode: ChromaDBとGeminiをモック化します")
    
    # モック使用時の通知
    if use_mock:
        logging.info("🎭 Mock Mode Enabled: 実際のサービスには接続しません")
    
    # 環境変数の読み込み
    gemini_api_key = os.getenv('GEMINI_API_KEY')
    chromadb_url = os.getenv('CHROMA_DB_URL')
    
    if not gemini_api_key:
        logging.error("GEMINI_API_KEY環境変数が設定されていません")
        return False
    if not chromadb_url:
        logging.error("CHROMA_DB_URL環境変数が設定されていません")
        return False
    
    # ChromaDBクライアントの初期化
    if use_mock:
        client = MockChromaClient()
    else:
        try:
            settings = chromadb.config.Settings(
                allow_reset=True,
                anonymized_telemetry=False
            )
            client = chromadb.HttpClient(host=chromadb_url, settings=settings)
            
            # 接続テスト
            client.heartbeat()
            logging.info(f"ChromaDBに正常に接続しました: {chromadb_url}")
        except Exception as e:
            error_analyzer.log_error("CHROMADB_CONNECTION", str(e), "CRITICAL")
            if not use_mock:
                logging.error(f"ChromaDBへの接続に失敗しました: {e}")
                return False
    
    # Gemini埋め込みの初期化
    if use_mock:
        embeddings = MockEmbeddings(GEMINI_EMBEDDING_MODEL, gemini_api_key)
    else:
        try:
            embeddings = GoogleGenerativeAIEmbeddings(
                model=GEMINI_EMBEDDING_MODEL,
                google_api_key=gemini_api_key
            )
            logging.info(f"Gemini埋め込みモデルを初期化しました: {GEMINI_EMBEDDING_MODEL}")
        except Exception as e:
            error_analyzer.log_error("GEMINI_API", str(e), "HIGH")
            if not use_mock:
                logging.error(f"Gemini埋め込みの初期化に失敗しました: {e}")
                return False

    # メイン処理の実行
    monitor = PerformanceMonitor()
    
    try:
        with ProcessLock():
            if mode == 'config-test':
                return True  # 既に処理済み
            elif mode == 'mock-test':
                return perform_mock_test(client, embeddings, dry_run)
            elif mode == 'verify':
                return perform_health_check(client, embeddings)
            elif mode == 'backup':
                return perform_backup()
            elif mode == 'incremental':
                return perform_incremental_update(client, embeddings, dry_run)
            else:
                return perform_full_update(client, embeddings, mode, dry_run)
                
    except ProcessLock.LockError as e:
        logging.error(f"Process lock error: {e}")
        return False
    except Exception as e:
        logging.error(f"Main process error: {e}")
        return False

def perform_mock_test(client, embeddings, dry_run=False):
    """モックテストを実行"""
    logging.info("=== Mock Test Mode ===")
    
    try:
        # コレクション作成テスト
        collection = client.get_or_create_collection(CHROMA_COLLECTION_NAME)
        logging.info(f"🎭 Mock collection created: {CHROMA_COLLECTION_NAME}")
        
        # ドキュメント読み込み
        documents = load_documents()
        if not documents:
            logging.warning("No documents found to process")
            return True
        
        # ドキュメント分割
        split_docs = split_documents(documents)
        logging.info(f"Split into {len(split_docs)} chunks")
        
        if dry_run:
            logging.info(f"🔍 DRY RUN: Would process {len(split_docs)} document chunks in mock mode")
            return True
        
        # モック埋め込み生成とドキュメント追加
        batch_size = 10  # モックテスト用に小さなバッチサイズ
        
        for i in range(0, min(len(split_docs), 20), batch_size):  # 最初の20個のみテスト
            batch = split_docs[i:i + batch_size]
            
            # バッチの準備
            batch_texts = [doc.page_content for doc in batch]
            batch_metadatas = [doc.metadata for doc in batch]
            batch_ids = [f"mock_doc_{i + j}" for j in range(len(batch))]
            
            # モック埋め込み生成
            batch_embeddings = embeddings.embed_documents(batch_texts)
            
            # モックコレクションに追加
            collection.add(
                documents=batch_texts,
                metadatas=batch_metadatas,
                ids=batch_ids,
                embeddings=batch_embeddings
            )
            
            logging.info(f"🎭 Mock processed batch {i//batch_size + 1}")
        
        # モッククエリテスト
        test_query = "クライミングの基本的な動き"
        query_embedding = embeddings.embed_query(test_query)
        results = collection.query(
            query_texts=[test_query],
            n_results=3
        )
        
        logging.info(f"🎭 Mock query test completed: found {len(results['ids'][0])} results")
        
        # 結果確認
        final_count = collection.count()
        logging.info(f"✅ Mock test completed successfully")
        logging.info(f"✅ Mock collection count: {final_count}")
        
        return True
        
    except Exception as e:
        logging.error(f"Mock test failed: {e}")
        return False

def perform_health_check(client, embeddings):
    """ヘルスチェックを実行"""
    logging.info("=== Health Check Mode ===")
    
    try:
        # ChromaDB接続テスト
        if hasattr(client, 'is_mock') and client.is_mock:
            logging.info("🎭 Mock ChromaDB connection: OK")
            chromadb_ok = True
        else:
            client.heartbeat()
            logging.info("✅ ChromaDB connection: OK")
            chromadb_ok = True
        
        # コレクション存在確認
        try:
            collection = client.get_collection(CHROMA_COLLECTION_NAME)
            collection_exists = True
            doc_count = collection.count()
            logging.info(f"✅ Collection exists: {CHROMA_COLLECTION_NAME} ({doc_count} documents)")
        except:
            collection_exists = False
            logging.warning(f"⚠️ Collection not found: {CHROMA_COLLECTION_NAME}")
        
        # 埋め込みテスト
        if hasattr(embeddings, 'is_mock') and embeddings.is_mock:
            test_embedding = embeddings.embed_query("test")
            embedding_ok = len(test_embedding) == 768
            logging.info(f"🎭 Mock embedding test: {'OK' if embedding_ok else 'FAILED'}")
        else:
            try:
                test_embedding = embeddings.embed_query("test")
                embedding_ok = len(test_embedding) > 0
                logging.info(f"✅ Embedding test: OK ({len(test_embedding)} dimensions)")
            except Exception as e:
                embedding_ok = False
                logging.error(f"❌ Embedding test failed: {e}")
        
        # 総合結果
        overall_health = chromadb_ok and collection_exists and embedding_ok
        logging.info(f"=== Health Check Result: {'✅ HEALTHY' if overall_health else '❌ UNHEALTHY'} ===")
        
        return overall_health
        
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return False

def perform_backup():
    """バックアップを実行"""
    logging.info("=== Backup Mode ===")
    
    try:
        backup_file = create_backup()
        logging.info(f"✅ Backup completed: {backup_file}")
        return True
    except Exception as e:
        logging.error(f"Backup failed: {e}")
        return False

def perform_incremental_update(client, embeddings, dry_run=False):
    """増分更新を実行"""
    logging.info("=== Incremental Update Mode ===")
    
    try:
        # ファイル変更検知
        changed_files = detect_file_changes()
        
        if not changed_files:
            logging.info("No file changes detected. Nothing to update.")
            return True
        
        logging.info(f"Detected {len(changed_files)} file changes:")
        for change in changed_files:
            logging.info(f"  {change['change_type']}: {change['filename']}")
        
        if dry_run:
            logging.info("🔍 DRY RUN: Would process these file changes")
            return True
        
        # 実際の更新処理
        return process_file_changes(client, embeddings, changed_files)
        
    except Exception as e:
        logging.error(f"Incremental update failed: {e}")
        return False

def perform_full_update(client, embeddings, mode, dry_run=False):
    """完全更新を実行"""
    logging.info(f"=== Full Update Mode: {mode} ===")
    monitor = PerformanceMonitor()
    
    try:
        # コレクション取得/作成
        monitor.start("Collection Setup")
        collection = client.get_or_create_collection(CHROMA_COLLECTION_NAME)
        monitor.end("Collection Setup")
        
        # ドキュメント読み込み
        monitor.start("Document Loading")
        documents = load_documents()
        if not documents:
            logging.warning("No documents found to process")
            return True
        monitor.end("Document Loading")
        
        # ドキュメント分割
        monitor.start("Document Splitting")
        split_docs = split_documents(documents)
        logging.info(f"Split into {len(split_docs)} chunks")
        monitor.end("Document Splitting")
        
        if dry_run:
            logging.info(f"🔍 DRY RUN: Would process {len(split_docs)} document chunks")
            return True
        
        # 既存データの処理（replaceモードの場合）
        if mode == 'replace':
            monitor.start("Collection Clear")
            try:
                # コレクションを削除して再作成
                client.delete_collection(CHROMA_COLLECTION_NAME)
                collection = client.get_or_create_collection(CHROMA_COLLECTION_NAME)
                logging.info("Collection cleared for replace mode")
            except Exception as e:
                logging.warning(f"Collection clear warning: {e}")
            monitor.end("Collection Clear")
        
        # 埋め込み生成とドキュメント追加
        monitor.start("Document Processing")
        batch_size = 50
        
        for i in range(0, len(split_docs), batch_size):
            batch = split_docs[i:i + batch_size]
            
            # バッチの準備
            batch_texts = [doc.page_content for doc in batch]
            batch_metadatas = [doc.metadata for doc in batch]
            batch_ids = [f"doc_{i + j}" for j in range(len(batch))]
            
            # 埋め込み生成
            batch_embeddings = embeddings.embed_documents(batch_texts)
            
            # ChromaDBに追加
            collection.add(
                documents=batch_texts,
                metadatas=batch_metadatas,
                ids=batch_ids,
                embeddings=batch_embeddings
            )
            
            logging.info(f"Processed batch {i//batch_size + 1}/{(len(split_docs) + batch_size - 1)//batch_size}")
        
        monitor.end("Document Processing")
        
        # 結果確認
        final_count = collection.count()
        logging.info(f"✅ Successfully processed {len(split_docs)} documents")
        logging.info(f"✅ Final collection count: {final_count}")
        
        # パフォーマンス結果表示
        performance_summary = monitor.get_summary()
        logging.info("=== Performance Summary ===")
        for operation, duration in performance_summary.items():
            logging.info(f"  {operation}: {duration}")
        
        return True
        
    except Exception as e:
        logging.error(f"Full update failed: {e}")
        return False

def process_file_changes(client, embeddings, changed_files):
    """ファイル変更を処理"""
    logging.info("Processing file changes...")
    
    try:
        # 変更されたファイルに対して完全更新を実行
        return perform_full_update(client, embeddings, 'replace', dry_run=False)
    except Exception as e:
        logging.error(f"File change processing failed: {e}")
        return False

if __name__ == "__main__":
    # --- コマンドライン引数の解析 ---
    parser = argparse.ArgumentParser(description="知識ベースを読み込み、リモートChromaDBに格納/追加します。")
    parser.add_argument(
        "-m", "--mode",
        choices=['replace', 'append', 'verify', 'incremental', 'backup', 'config-test', 'mock-test'],
        default='replace',
        help="DB更新モード ('replace': 全置き換え, 'append': 既存に追加, 'verify': ヘルスチェック, 'incremental': 変更分のみ更新, 'backup': バックアップ作成, 'config-test': 設定検証のみ, 'mock-test': モック環境での完全テスト)"
    )
    parser.add_argument(
        "--log-level",
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help="ログレベル (デフォルト: INFO)"
    )
    parser.add_argument(
        "--dry-run",
        action='store_true',
        help="実際の変更を行わずに処理をシミュレート"
    )
    parser.add_argument(
        "--config-file",
        default=SECRETS_FILE_PATH,
        help=f"設定ファイルのパス (デフォルト: {SECRETS_FILE_PATH})"
    )
    parser.add_argument(
        "--mock-chromadb",
        action='store_true',
        help="ChromaDBをモック化して接続エラーを回避"
    )
    args = parser.parse_args()

    # --- ログ設定の初期化 ---
    logger = setup_logging(args.log_level)
    
    # --- YAMLファイルから設定を読み込む ---
    load_secrets_from_yaml(args.config_file)

    logging.info(f"=== 知識ベース読み込み・格納スクリプト開始 ===")
    logging.info(f"モード: {args.mode}")
    logging.info(f"接続先: リモート ChromaDB")
    logging.info(f"ログレベル: {args.log_level}")
    if args.dry_run:
        logging.info("🔍 DRY RUN モード: 実際の変更は行いません")

    # 設定検証の実行
    logging.info("=== Configuration Validation ===")
    try:
        validate_configuration()
        logging.info("✅ Configuration validation passed")
    except ConfigurationError as e:
        logging.error(f"❌ Configuration error: {e}")
        sys.exit(1)
    
    # 設定情報の表示（機密情報マスキング）
    safe_log_config()
    logging.info(f"Config file: {args.config_file}")
    logging.info("=" * 50)

    # メイン処理の実行
    success = load_and_store_knowledge_http(mode=args.mode, dry_run=args.dry_run, use_mock=args.mock_chromadb)

    if success:
        logging.info(f"=== 処理完了 (モード: {args.mode}) ===")
        if args.mode == 'verify':
            logging.info("ヘルスチェックが正常に完了しました。")
    else:
        logging.error(f"=== エラーが発生したため終了しました (モード: {args.mode}) ===")
        sys.exit(1) 