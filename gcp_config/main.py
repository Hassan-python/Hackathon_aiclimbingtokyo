from fastapi import FastAPI, UploadFile, HTTPException, Header, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import uuid
from typing import Optional, List, Dict, Any, Tuple
from moviepy.editor import VideoFileClip
import cv2
import numpy as np
from dotenv import load_dotenv
import google.generativeai as genai
import chromadb
from chromadb.config import Settings
from PIL import Image
from google.cloud import storage
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
from functools import lru_cache
from datetime import datetime, timedelta
import subprocess
import base64
from pathlib import Path
import logging

# Load environment variables
load_dotenv()

# Constants from environment variables (定義を先に移動)
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "climbing-videos-bucket-climbing-application-458609")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
CHROMA_DB_URL = os.getenv("CHROMA_DB_URL")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "bouldering_advice")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/embedding-001")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
MEMORY_LIMIT = os.getenv("MEMORY_LIMIT", "4096M")
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "900"))
MAX_FILE_SIZE = os.getenv("MAX_FILE_SIZE", "100MB")
PHASE = os.getenv("PHASE", "2")

# Configure logging with environment variable
log_level = getattr(logging, LOG_LEVEL.upper() if LOG_LEVEL else "INFO", logging.INFO)
logging.basicConfig(level=log_level, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS debugging middleware
@app.middleware("http")
async def cors_debug_middleware(request, call_next):
    origin = request.headers.get("origin")
    logger.info(f"Request from origin: {origin}")
    logger.info(f"Request method: {request.method}")
    logger.info(f"Request URL: {request.url}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    response = await call_next(request)
    
    logger.info(f"Response status: {response.status_code}")
    logger.info(f"Response headers: {dict(response.headers)}")
    
    # Add additional CORS headers for debugging - デプロイ環境のURLも追加
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://climbing-web-app-bolt-932280363930.asia-northeast1.run.app",
        "https://aiclimbingtokyo.com",  # デプロイされたフロントエンドのURL
        "https://www.aiclimbingtokyo.com",  # wwwバリエーション
        "https://gorgeous-sawine-8ea61b.netlify.app"  # Netlifyデプロイメント
    ]
    
    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Accept, Accept-Language, Content-Language, Content-Type, X-Language, Authorization, X-Gemini-Key, X-OpenAI-Key, X-OpenAI-Model"
        response.headers["Access-Control-Expose-Headers"] = "*"
    
    return response

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite統一ポート
        "http://127.0.0.1:5173",
        "https://climbing-web-app-bolt-932280363930.asia-northeast1.run.app",  # Production backend URL
        "https://aiclimbingtokyo.com",  # デプロイされたフロントエンドのURL
        "https://www.aiclimbingtokyo.com",  # wwwバリエーション
        "https://gorgeous-sawine-8ea61b.netlify.app"  # Netlifyデプロイメント
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language", 
        "Content-Language",
        "Content-Type",
        "X-Language",
        "Authorization",
        "X-Gemini-Key",
        "X-OpenAI-Key", 
        "X-OpenAI-Model"
    ],
    expose_headers=["*"],
)

# Application constants
ANALYSIS_INTERVAL_SEC = 0.5
MAX_FRAMES_FOR_GEMINI = 10
DEFAULT_RETRIEVAL_K = 3
UPLOAD_DIR = Path("/tmp/videos")

# Ensure upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class AnalysisSettings(BaseModel):
    problemType: str
    crux: str
    startTime: float
    gcsBlobName: str

class Source(BaseModel):
    name: str
    content: str

class AnalysisResponse(BaseModel):
    advice: str
    sources: list[Source]
    geminiAnalysis: Optional[str] = None

# 新しい機能のためのモデル追加
class VideoMetadata(BaseModel):
    originalFileName: str
    originalSize: int
    originalDuration: float
    optimizedSize: int
    optimizedDuration: float
    compressionRatio: float

class FullVideoUploadResponse(BaseModel):
    gcsBlobName: str
    videoId: str
    metadata: VideoMetadata
    previewUrl: str

class RangeAnalysisSettings(BaseModel):
    problemType: str
    crux: str
    startTime: float
    endTime: float
    gcsBlobName: str

# GCS Signed URL関連のモデル
class SignedUrlRequest(BaseModel):
    filename: str
    contentType: str

class SignedUrlResponse(BaseModel):
    uploadUrl: str
    gcsBlobName: str
    videoId: str

class VideoProcessRequest(BaseModel):
    gcsBlobName: str
    originalFileName: str

# ログ関連のモデル
class LogEntry(BaseModel):
    timestamp: str
    severity: str
    message: str

class LogResponse(BaseModel):
    logs: List[LogEntry]
    total_count: int

def validate_environment_variables():
    """起動時に必須環境変数をチェックする"""
    required_vars = {
        "GCS_BUCKET_NAME": "GCS bucket name for video storage",
        "GEMINI_API_KEY": "Gemini API key for AI analysis",
        "CHROMA_DB_URL": "ChromaDB server URL for knowledge retrieval"
    }
    
    missing_vars = []
    for var_name, description in required_vars.items():
        if not os.getenv(var_name):
            missing_vars.append(f"{var_name} ({description})")
    
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(f"❌ STARTUP ERROR: {error_msg}")
        raise RuntimeError(error_msg)
    
    logger.info("✅ All required environment variables are configured")
    logger.info(f"Environment: PHASE={PHASE}, MEMORY_LIMIT={MEMORY_LIMIT}, REQUEST_TIMEOUT={REQUEST_TIMEOUT}")
    logger.info(f"ChromaDB: Collection={CHROMA_COLLECTION_NAME}, Embedding={EMBEDDING_MODEL}")
    logger.info(f"GCS Bucket: {GCS_BUCKET_NAME}")

# アプリケーション起動時に環境変数をチェック
try:
    validate_environment_variables()
except RuntimeError as e:
    print(f"Application startup failed: {e}")
    # 本番環境では sys.exit(1) を使用することを検討
    pass

def extract_frames(video_path: str, start_sec: float, end_sec: float, interval_sec: float = ANALYSIS_INTERVAL_SEC) -> list:
    frames = []
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Could not open video file")
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    interval_frames = max(1, int(interval_sec * fps))
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    current_frame = start_frame
    while current_frame <= end_frame:
        ret, frame = cap.read()
        if not ret:
            break
            
        if (current_frame - start_frame) % interval_frames == 0:
            frames.append(frame)
            
        current_frame += 1
        
    cap.release()
    return frames

@lru_cache(maxsize=1)
def get_chroma_client():
    """ChromaDBクライアントを取得（外部サーバー対応）"""
    chromadb_url = os.getenv("CHROMA_DB_URL")
    if not chromadb_url:
        raise HTTPException(status_code=500, detail="ChromaDB URL not configured")
        
    try:
        settings = chromadb.config.Settings(chroma_api_impl="rest")
        client = chromadb.HttpClient(host=chromadb_url, settings=settings)
        
        # 接続確認
        client.heartbeat()
        logger.info(f"ChromaDB HttpClient initialized: {chromadb_url}")
        
        return client
    except Exception as e:
        logger.error(f"ChromaDB connection failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ChromaDB connection failed: {str(e)}")

@lru_cache(maxsize=1)
def get_langchain_chroma_vectorstore() -> Chroma:
    """Langchain経由でChromaベクターストアを取得する（外部ChromaDBサーバー対応）"""
    try:
        gemini_embeddings = GoogleGenerativeAIEmbeddings(
            model=EMBEDDING_MODEL,
            google_api_key=GEMINI_API_KEY
        )
        
        chroma_client = get_chroma_client() 
        
        vectorstore = Chroma(
            client=chroma_client,
            collection_name=CHROMA_COLLECTION_NAME,
            embedding_function=gemini_embeddings
        )
        logger.info(f"Langchain Chroma vectorstore initialized with model: {EMBEDDING_MODEL}")
        return vectorstore
    except Exception as e:
        logger.error(f"Error creating Langchain Chroma vectorstore: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize vectorstore: {str(e)}")

def retrieve_from_chroma_langchain(query: str, k: int = DEFAULT_RETRIEVAL_K) -> List[dict]:
    """Langchainラッパーを使用してChromaDBから関連ドキュメントを取得する"""
    try:
        vectorstore = get_langchain_chroma_vectorstore()
        source_docs_with_scores = vectorstore.similarity_search_with_score(query, k=k)
        
        documents = []
        print(f"[DEBUG Langchain Chroma] Executing query: {query} with k={k}")
        for i, (doc, score) in enumerate(source_docs_with_scores):
            doc_name = doc.metadata.get("name", f"doc_{i+1}") if doc.metadata else f"doc_{i+1}"
            documents.append({
                "name": doc_name,
                "content": doc.page_content,
                "score": score
            })
            print(f"[DEBUG Langchain Chroma] Retrieved doc: {doc_name}, Score: {score:.4f}, Content (first 50 chars): {doc.page_content[:50]}...")
        
        return documents
    except Exception as e:
        print(f"Langchain Chroma retrieval error: {e}")
        return []

def analyze_and_generate_advice(
    frames: list, 
    problem_type: str, 
    crux: str, 
    output_language: str
) -> Tuple[str, str, List[Source]]:
    """1回のGemini呼び出しで動画分析とアドバイス生成を行う"""
    if not frames:
        return "No frames available for analysis", "アドバイスを生成できません", []
        
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash-lite')
        
        # Select frames for analysis
        num_frames = min(len(frames), MAX_FRAMES_FOR_GEMINI)
        indices = np.linspace(0, len(frames) - 1, num_frames, dtype=int)
        selected_frames = [frames[i] for i in indices]
        
        # Convert frames to PIL images
        pil_images = []
        for frame in selected_frames:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_frame)
            pil_images.append(pil_image)
            
        # ChromaDBから関連情報を検索 (ユーザーのテキスト入力のみを使用)
        rag_query = f"課題の種類: {problem_type}, 難しい点: {crux}"
        print(f"[DEBUG] RAG query: {rag_query}")
        retrieved_docs_for_gemini = retrieve_from_chroma_langchain(rag_query)
        print(f"[DEBUG] Retrieved {len(retrieved_docs_for_gemini)} documents from ChromaDB")
        
        # Format retrieved_knowledge for prompt as per FR-001 and FR-002
        formatted_knowledge_parts = []
        if retrieved_docs_for_gemini:
            for i, doc in enumerate(retrieved_docs_for_gemini):
                # Using the name from metadata if available, otherwise a generic one
                source_name = doc.get("name", f"知識{i+1}") 
                formatted_knowledge_parts.append(f"[知識{i+1}: {source_name}]\n{doc['content']}")
            retrieved_knowledge_for_prompt = "\n\n".join(formatted_knowledge_parts)
        else:
            retrieved_knowledge_for_prompt = "関連する知識は見つかりませんでした。"
            
        # output_language の値に基づいてプロンプトを構築
        if output_language == "English":
            prompt = f"""**
        ### Generation Rules (Must Follow) ###
        Your response MUST be written in **English**. Do not use any other languages.
        Aim for an overall response length of about 6 to 10 sentences.

        ### Role ###
        You are an expert in analyzing climbing movements and an experienced professional bouldering coach.

        ### Instructions ###
        1. Analyze the provided sequence of images (frames from a bouldering attempt) and identify the climber's posture, balance, position and movement of hands and feet, as well as any inefficient or unstable elements.
        2. Based on the above image analysis, the user-reported situation, and the "related bouldering knowledge" provided, generate specific and practical improvement advice by **comprehensively considering** all these elements.
        3. Present your advice in a step-by-step format, with about three steps, so that the climber can improve incrementally.
        4. For each step, add one sentence of supplementary explanation, such as "why this advice is effective," "key points to be aware of," or "helpful tips."
        5. Aim for an overall response length of about 6 to 10 sentences.
        6. **Do not include any source information** (e.g., [Knowledge1: doc_1]) for the referenced knowledge in your advice. Incorporate the knowledge content into your advice, but never mention any source.

        ### Language and Format for Response ###
        - All responses must be written in **English**.
        - If no relevant bouldering knowledge is found, provide the best advice possible based on the image analysis and user situation.
        - Structure your response in the following two clearly separated sections:
        - `# Image Analysis`
        - `# Advice`

        ---
        User-reported situation:
        - Problem type: {problem_type or "Not specified"}
        - Crux (difficulty point): {crux or "Not specified"}
        ---
        ### Related Bouldering Knowledge (Reference information from the database. Use this in your advice. Do not mention sources.)
        {retrieved_knowledge_for_prompt}
        ---

        #### Example response format:

        # Image Analysis
        From the video, it appears that your left foot placement is somewhat unstable and your right hand remains relatively low. There is also a tendency for your whole body to be slightly away from the wall.

        # Advice **Do not mention sources.**
        1. Focus on stepping firmly with your left foot. Imagining pressing the hold with your big toe will help you maintain better balance.
        2. Try reaching for the next hold with your right hand. Twisting your body slightly will help you extend your reach.
        3. Throughout your movement, try to keep your body weight close to the wall. This will allow you to transfer weight to your feet more efficiently and move more smoothly. Take your time and proceed carefully through each move.
        """
        elif output_language == "日本語":
            prompt = f"""**
       ### 生成時ルール（must rule）###
        あなたの応答は必ず**日本語**で記述してください。他の言語は一切使用しないでください。

        ### 役割 ###
        あなたはクライミングの動きを分析する専門家であり、経験豊富なプロのボルダリングコーチです。
        全体として6～10文程度のボリューム感となるよう意識してください。

        ### 指示 ###
        1. 提供された一連の画像（ボルダリング中のフレーム）を分析し、クライマーの体勢、バランス、手足の位置と動き、非効率な動きや不安定な要素を特定してください。
        2. 上記の画像分析結果、ユーザーが報告した状況、および提供される「関連するボルダリング知識」を**総合的に考慮**して、具体的で実践的な改善アドバイスを生成してください。
        3. アドバイスは、クライマーが段階的に改善できるよう、3ステップ程度のステップ形式で提示してください。
        4. 各ステップには「なぜそのアドバイスが有効か」「意識すべきポイント」や「ちょっとしたコツ」など、補足説明を1文程度加えてください。
        5. 全体として6～10文程度のボリューム感となるよう意識してください。
        6. 生成するアドバイスには、参照した知識の出典元（例：[知識1: doc_1]など）を絶対に含めないでください。知識はアドバイス内容に活かすのみとし、出典情報は記載しないでください。

        ### 回答生成時の言語およびフォーマット ###
        - 回答は必ず日本語で生成してください。
        - 関連するボルダリング知識が見つからない場合でも、画像分析結果とユーザーの状況に基づいて最適なアドバイスを提供してください。
        - 回答は、以下の2つのセクションに明確に分けて出力してください。
        - `# 画像分析`
        - `# アドバイス`

        ---
        ユーザーが報告した状況:
        - 課題の種類: {problem_type or "特に指定なし"}
        - 難しいと感じるポイント: {crux or "特に指定なし"}
        ---
        ### 関連するボルダリング知識 (データベースより参考情報。アドバイスに活かすこと。出典は記載しないこと。)
        {retrieved_knowledge_for_prompt}
        ---

        #### 回答形式の例：

        # 画像分析
        動画から、左足の置き方がやや不安定で、右手の位置が低めになっていることがわかります。また、体全体が壁から少し離れている傾向も見受けられます。

        # アドバイス **出典元は記載しない。**
        1. 左足のスタンスを意識してしっかりと踏み込みましょう。足の親指でホールドを押すイメージを持つと、バランスがとりやすくなります。
        2. 右手はもう一段上のホールドを目指してみてください。体を少しひねることで、手が伸ばしやすくなります。
        3. 動作全体を通して体重を壁に近づける意識を持つことで、足にしっかりと体重が乗り、次の動きがスムーズになります。焦らず丁寧にムーブを進めていきましょう。
        """
        else: # デフォルトは英語プロンプト (念のため)
            prompt = f"""**
        ### Generation Rules (Must Follow) ###
        Your response MUST be written in **English**. Do not use any other languages.
        Aim for an overall response length of about 6 to 10 sentences.

        ### Role ###
        You are an expert in analyzing climbing movements and an experienced professional bouldering coach.

        ### Instructions ###
        1. Analyze the provided sequence of images (frames from a bouldering attempt) and identify the climber's posture, balance, position and movement of hands and feet, as well as any inefficient or unstable elements.
        2. Based on the above image analysis, the user-reported situation, and the "related bouldering knowledge" provided, generate specific and practical improvement advice by **comprehensively considering** all these elements.
        3. Present your advice in a step-by-step format, with about three steps, so that the climber can improve incrementally.
        4. For each step, add one sentence of supplementary explanation, such as "why this advice is effective," "key points to be aware of," or "helpful tips."
        5. Aim for an overall response length of about 6 to 10 sentences.
        6. **Do not include any source information** (e.g., [Knowledge1: doc_1]) for the referenced knowledge in your advice. Incorporate the knowledge content into your advice, but never mention any source.

        ### Language and Format for Response ###
        - All responses must be written in **English**.
        - If no relevant bouldering knowledge is found, provide the best advice possible based on the image analysis and user situation.
        - Structure your response in the following two clearly separated sections:
        - `# Image Analysis`
        - `# Advice`

        ---
        User-reported situation:
        - Problem type: {problem_type or "Not specified"}
        - Crux (difficulty point): {crux or "Not specified"}
        ---
        ### Related Bouldering Knowledge (Reference information from the database. Use this in your advice. Do not mention sources.)
        {retrieved_knowledge_for_prompt}
        ---

        #### Example response format:

        # Image Analysis
        From the video, it appears that your left foot placement is somewhat unstable and your right hand remains relatively low. There is also a tendency for your whole body to be slightly away from the wall.

        # Advice **Do not mention sources.**
        1. Focus on stepping firmly with your left foot. Imagining pressing the hold with your big toe will help you maintain better balance.
        2. Try reaching for the next hold with your right hand. Twisting your body slightly will help you extend your reach.
        3. Throughout your movement, try to keep your body weight close to the wall. This will allow you to transfer weight to your feet more efficiently and move more smoothly. Take your time and proceed carefully through each move.
        """
        
        print(f"[DEBUG] Prompt to Gemini: {prompt[:200]}...") 
        response = model.generate_content([prompt, *pil_images])
        full_response = response.text
        print(f"[DEBUG] Full response from Gemini: {full_response}")
        print(f"[DEBUG] Output language: {output_language}")
        print(f"[DEBUG] Response contains '# 画像分析': {'# 画像分析' in full_response}")
        print(f"[DEBUG] Response contains '# アドバイス': {'# アドバイス' in full_response}")
        print(f"[DEBUG] Response contains '# Image Analysis': {'# Image Analysis' in full_response}")
        print(f"[DEBUG] Response contains '# Advice': {'# Advice' in full_response}")
        
        # レスポンスを分析とアドバイスに分割
        try:
            analysis_part = ""
            advice_part = ""
            
            # 日本語の場合
            if output_language == "日本語":
                if "# 画像分析" in full_response and "# アドバイス" in full_response:
                    parts = full_response.split("# アドバイス")
                    analysis_part = parts[0].replace("# 画像分析", "").strip()
                    advice_part = parts[1].strip()
                elif "画像分析" in full_response and "アドバイス" in full_response:
                    # ヘッダーが少し違う場合にも対応
                    parts = full_response.split("アドバイス")
                    analysis_part = parts[0].replace("画像分析", "").strip()
                    advice_part = parts[1].strip()
                else:
                    # セクションが明確に分かれていない場合、最初の改行で分割を試す
                    if "\n\n" in full_response:
                        analysis_part, advice_part = full_response.split("\n\n", 1)
                    else:
                        analysis_part = "分析結果を抽出できませんでした"
                        advice_part = full_response
            # 英語の場合
            else:
                if "# Image Analysis" in full_response and "# Advice" in full_response:
                    parts = full_response.split("# Advice")
                    analysis_part = parts[0].replace("# Image Analysis", "").strip()
                    advice_part = parts[1].strip()
                elif "Image Analysis" in full_response and "Advice" in full_response:
                    # ヘッダーが少し違う場合にも対応
                    parts = full_response.split("Advice")
                    analysis_part = parts[0].replace("Image Analysis", "").strip()
                    advice_part = parts[1].strip()
                else:
                    # セクションが明確に分かれていない場合、最初の改行で分割を試す
                    if "\n\n" in full_response:
                        analysis_part, advice_part = full_response.split("\n\n", 1)
                    else:
                        analysis_part = "Analysis could not be extracted"
                        advice_part = full_response
            
            return analysis_part, advice_part, [Source(name=doc["name"], content=doc["content"]) for doc in retrieved_docs_for_gemini]
        except Exception as e:
            print(f"Response parsing error: {e}")
            # エラー時は分析結果、アドバイス、空のソースリストを返す
            if "\n\n" in full_response:
                 analysis_part, advice_part = full_response.split("\n\n", 1) # 最初の区切りで分割
            else:
                 analysis_part = "分析結果を抽出できませんでした" if output_language == "日本語" else "Analysis extraction failed"
                 advice_part = "アドバイスの抽出に失敗しました" if output_language == "日本語" else "Advice extraction failed"
            return analysis_part, advice_part, []
        
    except Exception as e:
        print(f"Gemini analysis and advice generation error: {e}")
        return "画像分析中にエラーが発生しました", "アドバイス生成中にエラーが発生しました", []

@app.post("/upload")
async def upload_video(video: UploadFile):
    if not video.filename:
        raise HTTPException(status_code=400, detail="No video file provided")
    if not GCS_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")

    # Generate unique filename for GCS
    video_id = str(uuid.uuid4())
    file_extension = os.path.splitext(video.filename)[1]
    gcs_blob_name = f"videos/{video_id}{file_extension}"

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(gcs_blob_name)

        # Save uploaded file to GCS
        content = await video.read()
        blob.upload_from_string(content, content_type=video.content_type)

        # Verify it's a valid video and check duration
        temp_local_path = f"/tmp/{video_id}{file_extension}"
        blob.download_to_filename(temp_local_path)

        with VideoFileClip(temp_local_path) as clip:
            if clip.duration > 5.0:
                os.remove(temp_local_path)
                blob.delete()
                raise HTTPException(status_code=400, detail="Video must be 5 seconds or shorter")
        
        os.remove(temp_local_path)

        # Generate absolute preview URL
        base_url = "https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app"
        preview_url = f"{base_url}/video/{video_id}{file_extension}"

        return {
            "gcsBlobName": gcs_blob_name, 
            "videoId": video_id,
            "previewUrl": preview_url
        }

    except Exception as e:
        if 'blob' in locals() and blob.exists():
            try:
                blob.delete()
            except Exception as delete_e:
                print(f"Error deleting blob during cleanup: {delete_e}")

        if 'temp_local_path' in locals() and os.path.exists(temp_local_path):
            os.remove(temp_local_path)
            
        print(f"Upload error: {e}") 
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")

@app.post("/upload-full-video", response_model=FullVideoUploadResponse)
async def upload_full_video(file: UploadFile = File(...)):
    logger.info("=== UPLOAD FULL VIDEO START ===")
    logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")
    
    # Validate file
    if not file.content_type or not file.content_type.startswith('video/'):
        logger.error(f"Invalid content type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Only video files are supported")
    
    if not GCS_BUCKET_NAME:
        logger.error("GCS_BUCKET_NAME not configured")
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")
    
    logger.info(f"GCS_BUCKET_NAME: {GCS_BUCKET_NAME}")
    
    # Check file size (100MB limit)
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    
    # Create unique filename
    file_id = str(uuid.uuid4())
    original_extension = Path(file.filename or "video.mp4").suffix
    original_filename = f"{file_id}_original{original_extension}"
    optimized_filename = f"{file_id}_optimized.mp4"
    gcs_blob_name = f"videos/{optimized_filename}"
    
    logger.info(f"Generated IDs - file_id: {file_id}, original: {original_filename}, optimized: {optimized_filename}")
    
    original_path = UPLOAD_DIR / original_filename
    optimized_path = UPLOAD_DIR / optimized_filename
    
    logger.info(f"Paths - original: {original_path}, optimized: {optimized_path}")
    logger.info(f"UPLOAD_DIR: {UPLOAD_DIR}")
    
    try:
        # Ensure upload directory exists
        logger.info("Creating upload directory...")
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Upload directory created/verified: {UPLOAD_DIR}")
        
        # Stream file to disk with size check and progress tracking
        logger.info("Starting file streaming...")
        total_size = 0
        with open(original_path, "wb") as buffer:
            while chunk := await file.read(8192):  # 8KB chunks for better memory management
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    buffer.close()
                    os.remove(original_path)
                    logger.error(f"File size limit exceeded: {total_size} > {MAX_FILE_SIZE}")
                    raise HTTPException(status_code=413, detail=f"File size exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit")
                buffer.write(chunk)
        
        logger.info(f"File uploaded successfully: {total_size} bytes")
        logger.info(f"File exists: {original_path.exists()}")
        logger.info(f"Starting video processing for file: {original_filename}")
        
        # Get video metadata before optimization
        logger.info("Running ffprobe to get duration...")
        duration_cmd = [
            'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', str(original_path)
        ]
        duration_result = subprocess.run(duration_cmd, capture_output=True, text=True)
        logger.info(f"ffprobe result: returncode={duration_result.returncode}, stdout='{duration_result.stdout}', stderr='{duration_result.stderr}'")
        
        original_duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
        logger.info(f"Detected duration: {original_duration} seconds")
        
        # Check duration limit (30 seconds)
        if original_duration > 30:
            os.remove(original_path)
            logger.error(f"Duration limit exceeded: {original_duration} > 30 seconds")
            raise HTTPException(status_code=400, detail="Video must be 30 seconds or shorter")
        
        # Check if ffmpeg is available
        logger.info("Checking FFmpeg availability...")
        try:
            ffmpeg_check = subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
            logger.info(f"FFmpeg available: {ffmpeg_check.stdout[:100]}...")
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.error(f"FFmpeg not available: {str(e)}")
            os.remove(original_path)
            raise HTTPException(status_code=500, detail="Video processing tools not available")
        
        logger.info(f"Starting video optimization: {original_path} -> {optimized_path}")
        # Optimize video with enhanced settings
        logger.info(f"Starting FFmpeg optimization...")
        optimization_result = optimize_video_ffmpeg(str(original_path), str(optimized_path), max_duration=30.0)
        logger.info(f"FFmpeg optimization completed successfully")
        logger.info(f"Video optimization completed: {optimization_result}")
        
        # Clean up original file to save space
        logger.info("Cleaning up original file...")
        os.remove(original_path)
        
        # Upload optimized video to GCS
        logger.info("Uploading to GCS...")
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(gcs_blob_name)
        
        with open(optimized_path, "rb") as video_file:
            blob.upload_from_file(video_file, content_type="video/mp4")
        
        logger.info("GCS upload completed")
        
        # Clean up local optimized file
        logger.info("Cleaning up optimized file...")
        os.remove(optimized_path)
        
        # Generate absolute preview URL
        base_url = "https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app"
        preview_url = f"{base_url}/video/{optimized_filename}"
        
        # Create metadata
        metadata = VideoMetadata(
            originalFileName=file.filename or "video.mp4",
            originalSize=optimization_result['originalSize'],
            originalDuration=original_duration,
            optimizedSize=optimization_result['optimizedSize'],
            optimizedDuration=optimization_result['optimizedDuration'],
            compressionRatio=optimization_result['compressionRatio']
        )
        
        # Create response
        response = FullVideoUploadResponse(
            gcsBlobName=gcs_blob_name,
            videoId=file_id,
            metadata=metadata,
            previewUrl=preview_url
        )
        
        logger.info("=== UPLOAD FULL VIDEO SUCCESS ===")
        return response
        
    except HTTPException:
        logger.error("HTTPException raised, re-raising...")
        raise
    except Exception as e:
        # Clean up files on error
        logger.error(f"Exception in upload process: {type(e).__name__}: {str(e)}")
        for path in [original_path, optimized_path]:
            if path.exists():
                logger.info(f"Cleaning up file: {path}")
                path.unlink()
        
        # より詳細なエラーログ
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Full video upload error: {str(e)}")
        logger.error(f"Full error traceback: {error_details}")
        logger.error("=== UPLOAD FULL VIDEO FAILED ===")
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_video(settings: AnalysisSettings, x_language: Optional[str] = Header(None, alias="X-Language")):
    if not settings.gcsBlobName:
        raise HTTPException(status_code=400, detail="gcsBlobName must be provided in settings")
    if not GCS_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")

    temp_local_path = f"/tmp/{os.path.basename(settings.gcsBlobName)}" 

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(settings.gcsBlobName)

        if not blob.exists():
            raise HTTPException(status_code=404, detail=f"Video blob {settings.gcsBlobName} not found in GCS")

        blob.download_to_filename(temp_local_path)

        with VideoFileClip(temp_local_path) as clip:
            end_time = min(settings.startTime + 1.0, clip.duration)

        frames = extract_frames(temp_local_path, settings.startTime, end_time)
        
        # 言語設定の取得 (FR-001, FR-002, TR-001)
        output_language = "English" # Default to English
        print(f"[DEBUG] Received X-Language header: {x_language}")
        if x_language:
            if x_language.lower().startswith("ja"):
                output_language = "日本語"
            elif x_language.lower().startswith("en"):
                output_language = "English"
            # 上記以外の場合はデフォルトの「英語」のまま
        print(f"[DEBUG] Determined output_language: {output_language}")
        
        # 1回のGemini呼び出しで分析とアドバイス生成、RAG結果取得を行う
        gemini_analysis, final_advice, retrieved_sources = analyze_and_generate_advice(
            frames,
            settings.problemType,
            settings.crux,
            output_language
        )
                
        if os.path.exists(temp_local_path):
            os.remove(temp_local_path)
            
        return AnalysisResponse(
            advice=final_advice,
            sources=retrieved_sources,
            geminiAnalysis=gemini_analysis
        )
        
    except Exception as e:
        if os.path.exists(temp_local_path):
            os.remove(temp_local_path)
        print(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze video: {str(e)}")

@app.post("/analyze-range", response_model=AnalysisResponse)
async def analyze_video_range(settings: RangeAnalysisSettings, x_language: Optional[str] = Header(None, alias="X-Language")):
    """指定された時間範囲での動画分析（新機能）"""
    
    # 🔥 詳細なリクエストログを追加
    logger.info(f"=== analyze_video_range called ===")
    logger.info(f"Request settings: {settings}")
    logger.info(f"problemType: {settings.problemType}")
    logger.info(f"crux: {settings.crux}")
    logger.info(f"startTime: {settings.startTime}")
    logger.info(f"endTime: {settings.endTime}")
    logger.info(f"gcsBlobName: {settings.gcsBlobName}")
    logger.info(f"X-Language header: {x_language}")
    
    # 🔥 バリデーションを詳細化
    if not settings.gcsBlobName:
        logger.error("❌ VALIDATION ERROR: gcsBlobName is missing")
        raise HTTPException(status_code=400, detail="gcsBlobName must be provided in settings")
    
    if not GCS_BUCKET_NAME:
        logger.error("❌ CONFIG ERROR: GCS_BUCKET_NAME not configured")
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")
    
    # 🔥 時間範囲チェックを詳細化
    logger.info(f"Time range validation: startTime={settings.startTime}, endTime={settings.endTime}")
    range_duration = settings.endTime - settings.startTime
    logger.info(f"Calculated range_duration: {range_duration}")
    
    if range_duration <= 0:
        logger.error(f"❌ TIME RANGE ERROR: Invalid range - startTime={settings.startTime}, endTime={settings.endTime}, duration={range_duration}")
        raise HTTPException(status_code=400, detail=f"End time ({settings.endTime}) must be greater than start time ({settings.startTime})")
    
    # 浮動小数点数の精度問題を考慮して、小さなマージン（0.01秒）を追加
    max_range_duration = 3.01  # 3.0 + 0.01のマージン
    if range_duration > max_range_duration:
        logger.error(f"❌ TIME RANGE ERROR: Range too long - duration={range_duration}, max_allowed={max_range_duration}")
        raise HTTPException(status_code=400, detail="Analysis range must be 3 seconds or shorter")

    temp_local_path = f"/tmp/{os.path.basename(settings.gcsBlobName)}"
    logger.info(f"Temp file path: {temp_local_path}")

    try:
        # 🔥 GCS接続確認
        logger.info("🔄 Initializing GCS client...")
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(settings.gcsBlobName)
        logger.info(f"GCS bucket: {GCS_BUCKET_NAME}")
        logger.info(f"GCS blob: {settings.gcsBlobName}")

        # 🔥 ファイル存在確認
        logger.info("🔄 Checking blob existence...")
        if not blob.exists():
            logger.error(f"❌ BLOB NOT FOUND: {settings.gcsBlobName} not found in bucket {GCS_BUCKET_NAME}")
            raise HTTPException(status_code=404, detail=f"Video blob {settings.gcsBlobName} not found in GCS")

        # 🔥 ファイルダウンロード
        logger.info("🔄 Downloading blob to temp file...")
        blob.download_to_filename(temp_local_path)
        logger.info(f"✅ Blob downloaded successfully to {temp_local_path}")

        # 🔥 動画ファイル検証
        logger.info("🔄 Validating video file with VideoFileClip...")
        with VideoFileClip(temp_local_path) as clip:
            video_duration = clip.duration
            logger.info(f"Video duration: {video_duration} seconds")
            
            # 浮動小数点数の精度問題を考慮して、小さなマージン（0.1秒）を追加
            duration_margin = 0.1
            if settings.endTime > (video_duration + duration_margin):
                logger.error(f"❌ TIME RANGE ERROR: endTime ({settings.endTime}) exceeds video duration ({video_duration}) + margin ({duration_margin})")
                raise HTTPException(status_code=400, detail="End time exceeds video duration")
            
            # endTimeが動画の長さを超えている場合は、動画の長さに調整
            actual_end_time = min(settings.endTime, video_duration)
            logger.info(f"Adjusted endTime: {settings.endTime} -> {actual_end_time}")

        # 🔥 フレーム抽出
        logger.info("🔄 Extracting frames...")
        frames = extract_frames(temp_local_path, settings.startTime, actual_end_time)
        logger.info(f"✅ Extracted {len(frames)} frames")
        
        # 🔥 言語設定の取得
        output_language = "English"  # Default to English
        logger.info(f"Received X-Language header: {x_language}")
        if x_language:
            if x_language.lower().startswith("ja"):
                output_language = "日本語"
            elif x_language.lower().startswith("en"):
                output_language = "English"
        logger.info(f"Determined output_language: {output_language}")
        
        # 🔥 AI分析開始
        logger.info("🔄 Starting AI analysis...")
        gemini_analysis, final_advice, retrieved_sources = analyze_and_generate_advice(
            frames,
            settings.problemType,
            settings.crux,
            output_language
        )
        logger.info("✅ AI analysis completed")
                
        # 🔥 一時ファイル削除
        if os.path.exists(temp_local_path):
            os.remove(temp_local_path)
            logger.info(f"✅ Temp file cleaned up: {temp_local_path}")
            
        logger.info("✅ analyze_video_range completed successfully")
        return AnalysisResponse(
            advice=final_advice,
            sources=retrieved_sources,
            geminiAnalysis=gemini_analysis
        )
        
    except HTTPException:
        # HTTPExceptionはそのまま再発生
        raise
    except Exception as e:
        # 🔥 一時ファイル削除
        if os.path.exists(temp_local_path):
            os.remove(temp_local_path)
            logger.info(f"Temp file cleaned up after error: {temp_local_path}")
        
        # 🔥 詳細なエラーログを出力
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(f"❌ UNEXPECTED ERROR in analyze_video_range: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error traceback: {error_traceback}")
        
        # 🔥 エラーの種類に応じて適切なHTTPステータスコードを返す
        if "GCS_BUCKET_NAME not configured" in str(e):
            raise HTTPException(status_code=500, detail="GCS bucket configuration error")
        elif "not found in GCS" in str(e):
            raise HTTPException(status_code=404, detail="Video file not found")
        elif "End time exceeds video duration" in str(e):
            raise HTTPException(status_code=400, detail="Invalid time range specified")
        elif "GEMINI_API_KEY" in str(e) or "ChromaDB" in str(e):
            raise HTTPException(status_code=500, detail="External service configuration error")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to analyze video range: {str(e)}")

@app.get("/chroma-status")
async def check_chroma_status():
    try:
        vectorstore = get_langchain_chroma_vectorstore()
        dummy_search_query = "test query"
        dummy_docs = vectorstore.similarity_search_with_score(dummy_search_query, k=1)
        count = vectorstore._collection.count()
        
        if dummy_docs:
            print(f"[Chroma Status] Dummy search retrieved {len(dummy_docs)} doc(s). First doc score: {dummy_docs[0][1] if dummy_docs else 'N/A'}")
        else:
            print("[Chroma Status] Dummy search retrieved no documents.")
            
        return {"status": f"✅ ChromaDB(Langchain) 接続成功 (`{CHROMA_COLLECTION_NAME}`: {count} アイテム)"}
    except Exception as e:
        print(f"❌ ChromaDB(Langchain) connection failed: {str(e)}")
        return {"status": f"❌ ChromaDB(Langchain) connection failed: {str(e)}"}

@app.get("/http2-status")
async def check_http2_status(request: Request):
    """HTTP/2対応状況を確認するエンドポイント"""
    try:
        http2_enabled = os.getenv("HTTP2_ENABLED", "false").lower() == "true"
        max_request_size = os.getenv("MAX_REQUEST_SIZE", "100MB")
        
        # リクエストのHTTPバージョンを確認
        http_version = "unknown"
        if hasattr(request, 'scope') and 'http_version' in request.scope:
            http_version = request.scope['http_version']
        
        # hypercornの設定を確認
        hypercorn_h2 = False
        try:
            import hypercorn
            hypercorn_h2 = True
        except ImportError:
            pass
        
        return {
            "http2_enabled": http2_enabled,
            "max_request_size": max_request_size,
            "server": "hypercorn",
            "http_version": http_version,
            "hypercorn_available": hypercorn_h2,
            "status": "✅ HTTP/2 ready" if http2_enabled and hypercorn_h2 else "⚠️ HTTP/2 not enabled"
        }
    except Exception as e:
        return {"status": f"❌ HTTP/2 status check failed: {str(e)}"}

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント（HTTP/2対応確認含む）"""
    try:
        # 基本的なヘルスチェック
        http2_enabled = os.getenv("HTTP2_ENABLED", "false").lower() == "true"
        
        # ChromaDBの接続確認
        chroma_status = "unknown"
        try:
            vectorstore = get_langchain_chroma_vectorstore()
            count = vectorstore._collection.count()
            chroma_status = f"connected ({count} items)"
        except Exception:
            chroma_status = "disconnected"
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "http2_enabled": http2_enabled,
            "chroma_status": chroma_status,
            "server": "hypercorn"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/video/{filename}")
async def serve_video(filename: str):
    """動画ファイルを提供するエンドポイント"""
    if not GCS_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")
    
    try:
        # GCSから動画ファイルを取得
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob_name = f"videos/{filename}"
        blob = bucket.blob(blob_name)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="Video not found")
        
        # 一時ファイルにダウンロード
        temp_path = UPLOAD_DIR / filename
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        blob.download_to_filename(str(temp_path))
        
        # ファイルを提供
        return FileResponse(
            temp_path, 
            media_type="video/mp4",
            headers={
                "Cache-Control": "public, max-age=3600",  # 1時間キャッシュ
                "Accept-Ranges": "bytes"  # 範囲リクエストをサポート
            }
        )
        
    except Exception as e:
        logger.error(f"Error serving video {filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to serve video: {str(e)}")

# Video optimization functions with enhanced performance
def optimize_video_ffmpeg(input_path: str, output_path: str, max_duration: float = 30.0) -> Dict[str, Any]:
    """
    Optimize video using FFmpeg with ultra-lightweight settings for debugging
    """
    try:
        # 入力ファイルの存在確認
        if not os.path.exists(input_path):
            raise Exception(f"Input file does not exist: {input_path}")
        
        # 出力ディレクトリの確認・作成
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # 動作確認済み設定に戻す（HTTP/2対応版）
        cmd = [
            'ffmpeg', '-i', input_path,
            '-c:v', 'libx264',  # H.264 codec
            '-crf', '28',       # Constant Rate Factor for quality vs size balance
            '-preset', 'fast',  # Use fast preset for better performance
            '-vf', f'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30',  # Enhanced scaling
            '-r', '30',         # Frame rate
            '-an',              # Remove audio
            '-t', str(max_duration),  # Limit duration
            '-movflags', '+faststart',  # Optimize for web streaming
            '-threads', '0',    # Use all available CPU threads
            '-y',               # Overwrite output file
            output_path
        ]
        
        # 詳細ログ出力
        logger.info(f"=== FFmpeg Processing Start ===")
        logger.info(f"Input file: {input_path}")
        logger.info(f"Output file: {output_path}")
        logger.info(f"Input file size: {os.path.getsize(input_path)} bytes")
        logger.info(f"Max duration: {max_duration} seconds")
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        
        # FFmpeg実行（タイムアウト300秒）
        logger.info("Starting FFmpeg execution...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        logger.info(f"FFmpeg execution completed with return code: {result.returncode}")
        
        # 標準出力・エラー出力をログ
        if result.stdout:
            logger.info(f"FFmpeg stdout: {result.stdout}")
        if result.stderr:
            logger.info(f"FFmpeg stderr: {result.stderr}")
        
        if result.returncode != 0:
            logger.error(f"FFmpeg failed with return code: {result.returncode}")
            raise Exception(f"FFmpeg failed (code {result.returncode}): {result.stderr}")
        
        # 出力ファイルの存在確認
        if not os.path.exists(output_path):
            raise Exception(f"Output file was not created: {output_path}")
        
        # ファイルサイズ計算
        original_size = os.path.getsize(input_path)
        optimized_size = os.path.getsize(output_path)
        
        if optimized_size == 0:
            raise Exception("Output file is empty")
        
        compression_ratio = ((original_size - optimized_size) / original_size) * 100
        
        # 簡単な動画時間取得（エラーが起きても処理を続行）
        try:
            duration_cmd = [
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', output_path
            ]
            duration_result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=10)
            duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 and duration_result.stdout.strip() else max_duration
        except Exception as e:
            logger.warning(f"Failed to get video duration: {e}")
            duration = max_duration
        
        logger.info(f"=== FFmpeg Processing Success ===")
        logger.info(f"Original size: {original_size} bytes")
        logger.info(f"Optimized size: {optimized_size} bytes")
        logger.info(f"Compression ratio: {compression_ratio:.1f}%")
        logger.info(f"Duration: {duration} seconds")
        
        return {
            'success': True,
            'originalSize': original_size,
            'optimizedSize': optimized_size,
            'compressionRatio': compression_ratio,
            'optimizedDuration': duration,
            'message': f'Video optimized successfully. Reduced size by {compression_ratio:.1f}%'
        }
        
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg processing timed out (300 seconds)")
        if os.path.exists(output_path):
            os.remove(output_path)
        raise Exception("Video processing timed out. Please try with a shorter video.")
    except Exception as e:
        logger.error(f"FFmpeg processing failed: {str(e)}")
        # Clean up on error
        if os.path.exists(output_path):
            os.remove(output_path)
        raise Exception(f"Video optimization failed: {str(e)}")

# Memory-efficient video processing for ranges
def extract_video_range_optimized(input_path: str, output_path: str, start_time: float, duration: float) -> Dict[str, Any]:
    """
    Extract a specific time range from video with memory optimization
    """
    try:
        # Use seek before input for better performance
        cmd = [
            'ffmpeg',
            '-ss', str(start_time),  # Seek to start time (before input for better performance)
            '-i', input_path,
            '-t', str(duration),     # Duration to extract
            '-c:v', 'libx264',
            '-crf', '23',            # Slightly better quality for analysis
            '-preset', 'veryfast',   # Fastest encoding for range extraction
            '-vf', 'scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2',  # Lower resolution for faster processing
            '-r', '30',
            '-an',                   # Remove audio
            '-movflags', '+faststart',
            '-threads', '0',
            '-y',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)  # 2 minute timeout for range extraction
        
        if result.returncode != 0:
            raise Exception(f"Range extraction failed: {result.stderr}")
        
        file_size = os.path.getsize(output_path)
        
        return {
            'success': True,
            'size': file_size,
            'message': f'Range extracted successfully ({duration:.1f}s from {start_time:.1f}s)'
        }
        
    except subprocess.TimeoutExpired:
        raise Exception("Range extraction timed out.")
    except Exception as e:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise Exception(f"Range extraction failed: {str(e)}")

# Add explicit OPTIONS handler for preflight requests
@app.options("/{path:path}")
async def handle_options(path: str, request):
    origin = request.headers.get("origin")
    logger.info(f"OPTIONS request for path: {path} from origin: {origin}")
    
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://climbing-web-app-bolt-932280363930.asia-northeast1.run.app",
        "https://aiclimbingtokyo.com",  # デプロイされたフロントエンドのURL
        "https://www.aiclimbingtokyo.com",  # wwwバリエーション
        "https://gorgeous-sawine-8ea61b.netlify.app"  # Netlifyデプロイメント
    ]
    
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Accept-Language, Content-Language, Content-Type, X-Language, Authorization, X-Gemini-Key, X-OpenAI-Key, X-OpenAI-Model",
        "Access-Control-Max-Age": "86400",  # 24 hours
    }
    
    if origin and origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(content={"message": "OK"}, headers=headers)

@app.post("/generate-signed-url", response_model=SignedUrlResponse)
async def generate_signed_url(request: SignedUrlRequest):
    """GCS Signed URLを生成して直接アップロードを可能にする"""
    if not GCS_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")
    
    # ファイル形式の検証
    if not request.contentType.startswith('video/'):
        raise HTTPException(status_code=400, detail="Only video files are supported")
    
    try:
        # ユニークなファイルIDとパスを生成
        file_id = str(uuid.uuid4())
        file_extension = Path(request.filename).suffix or '.mp4'
        gcs_blob_name = f"videos/raw/{file_id}_original{file_extension}"
        
        # GCS クライアントを初期化
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(gcs_blob_name)
        
        # Signed URLを生成（15分間有効）
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="PUT",
            content_type=request.contentType,
            headers={
                'x-goog-content-length-range': '0,104857600'  # 100MB制限
            }
        )
        
        logger.info(f"Generated signed URL for file: {request.filename}, blob: {gcs_blob_name}")
        
        return SignedUrlResponse(
            uploadUrl=signed_url,
            gcsBlobName=gcs_blob_name,
            videoId=file_id
        )
        
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(e)}")

@app.post("/process-uploaded-video", response_model=FullVideoUploadResponse)
async def process_uploaded_video(request: VideoProcessRequest):
    """GCSにアップロードされた動画を処理・最適化する"""
    if not GCS_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="GCS_BUCKET_NAME not configured")
    
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        source_blob = bucket.blob(request.gcsBlobName)
        
        # アップロードされたファイルの存在確認
        if not source_blob.exists():
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        
        # ファイルサイズチェック（100MB制限）
        blob_size = source_blob.size
        MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
        if blob_size > MAX_FILE_SIZE:
            source_blob.delete()  # 制限を超えたファイルを削除
            raise HTTPException(status_code=413, detail=f"File size exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit")
        
        # 一時ファイルパスを生成
        video_id = request.gcsBlobName.split('/')[-1].split('_')[0]  # Extract video ID
        original_path = UPLOAD_DIR / f"{video_id}_original.mp4"
        optimized_path = UPLOAD_DIR / f"{video_id}_optimized.mp4"
        
        # GCSから一時ファイルにダウンロード
        source_blob.download_to_filename(str(original_path))
        logger.info(f"Downloaded file from GCS: {blob_size} bytes")
        
        # 動画の長さをチェック
        duration_cmd = [
            'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', str(original_path)
        ]
        duration_result = subprocess.run(duration_cmd, capture_output=True, text=True)
        original_duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
        
        # 30秒制限チェック
        if original_duration > 30:
            original_path.unlink()  # ローカルファイル削除
            source_blob.delete()    # GCSファイル削除
            raise HTTPException(status_code=400, detail="Video must be 30 seconds or shorter")
        
        # 動画を最適化
        optimization_result = optimize_video_ffmpeg(str(original_path), str(optimized_path), max_duration=30.0)
        
        # 元ファイルを削除（容量節約）
        original_path.unlink()
        source_blob.delete()
        
        # 最適化された動画をGCSにアップロード
        optimized_blob_name = f"videos/{video_id}_optimized.mp4"
        optimized_blob = bucket.blob(optimized_blob_name)
        
        with open(optimized_path, "rb") as video_file:
            optimized_blob.upload_from_file(video_file, content_type="video/mp4")
        
        # ローカルの最適化ファイルを削除
        optimized_path.unlink()
        
        # プレビューURL生成
        preview_url = f"/video/{video_id}_optimized.mp4"
        
        # メタデータ作成
        metadata = VideoMetadata(
            originalFileName=request.originalFileName,
            originalSize=optimization_result['originalSize'],
            originalDuration=original_duration,
            optimizedSize=optimization_result['optimizedSize'],
            optimizedDuration=optimization_result['optimizedDuration'],
            compressionRatio=optimization_result['compressionRatio']
        )
        
        # レスポンス作成
        response = FullVideoUploadResponse(
            gcsBlobName=optimized_blob_name,
            videoId=video_id,
            metadata=metadata,
            previewUrl=preview_url
        )
        
        logger.info(f"Video processing completed successfully: {video_id}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        # エラー時のクリーンアップ
        for path in [original_path, optimized_path]:
            if 'path' in locals() and path.exists():
                path.unlink()
        
        logger.error(f"Video processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")

@app.get("/logs", response_model=LogResponse)
async def get_application_logs(limit: int = 50):
    """アプリケーションのログを取得する"""
    try:
        # Cloud Runのログを取得するコマンド
        cmd = [
            'gcloud', 'run', 'services', 'logs', 'read', 'climbing-web-app-bolt',
            '--region=asia-northeast1',
            f'--limit={limit}',
            '--format=json'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            logger.error(f"Failed to fetch logs: {result.stderr}")
            # フォールバック: 基本的なログエントリを返す
            return LogResponse(
                logs=[
                    LogEntry(
                        timestamp=datetime.now().isoformat(),
                        severity="ERROR",
                        message=f"Failed to fetch logs: {result.stderr}"
                    )
                ],
                total_count=1
            )
        
        # JSONログを解析
        import json
        log_entries = []
        
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                try:
                    log_data = json.loads(line)
                    log_entries.append(LogEntry(
                        timestamp=log_data.get('timestamp', ''),
                        severity=log_data.get('severity', 'INFO'),
                        message=log_data.get('textPayload', log_data.get('jsonPayload', {}).get('message', str(log_data)))
                    ))
                except json.JSONDecodeError:
                    # プレーンテキストログの場合
                    log_entries.append(LogEntry(
                        timestamp=datetime.now().isoformat(),
                        severity="INFO",
                        message=line.strip()
                    ))
        
        return LogResponse(
            logs=log_entries,
            total_count=len(log_entries)
        )
        
    except subprocess.TimeoutExpired:
        logger.error("Log fetch timeout")
        return LogResponse(
            logs=[
                LogEntry(
                    timestamp=datetime.now().isoformat(),
                    severity="ERROR",
                    message="Log fetch timeout"
                )
            ],
            total_count=1
        )
    except Exception as e:
        logger.error(f"Error fetching logs: {str(e)}")
        return LogResponse(
            logs=[
                LogEntry(
                    timestamp=datetime.now().isoformat(),
                    severity="ERROR",
                    message=f"Error fetching logs: {str(e)}"
                )
            ],
            total_count=1
        )

if __name__ == "__main__":
    # HTTP/2対応のためhypercornを使用
    try:
        import hypercorn.asyncio
        from hypercorn.config import Config
        import asyncio
        
        config = Config()
        config.use_reloader = False
        config.h2 = True  # HTTP/2有効化
        config.workers = 1
        config.access_log_format = '%(h)s %(r)s %(s)s %(b)s %(D)s'
        config.access_logfile = '-'  # stdout
        config.errorlog = '-'  # stderr
        config.loglevel = 'info'
        
        # Cloud Run環境変数からポートを取得
        port = int(os.getenv("PORT", 8000))
        config.bind = [f"0.0.0.0:{port}"]
        
        print(f"Starting Hypercorn server with HTTP/2 support on port {port}")
        print(f"HTTP/2 enabled: {config.h2}")
        print(f"Bind address: {config.bind}")
        
        asyncio.run(hypercorn.asyncio.serve(app, config))
    except ImportError as e:
        print(f"Hypercorn import failed: {e}")
        print("Falling back to uvicorn...")
        import uvicorn
        port = int(os.getenv("PORT", 8000))
        uvicorn.run(app, host="0.0.0.0", port=port)
    except Exception as e:
        print(f"Server startup failed: {e}")
        import traceback
        traceback.print_exc()
        raise