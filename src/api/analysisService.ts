import axios from 'axios';
import { AnalysisSettings, AnalysisResponse, VideoInfo, AnalysisProgress, FullVideoInfo, RangeAnalysisSettings } from '../types';
import i18next from 'i18next';

const API_BASE_URL = 'https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app';

// ログ管理
interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warning';
  message: string;
  endpoint?: string;
}

class LogManager {
  private static logs: LogEntry[] = [];
  private static listeners: ((logs: LogEntry[]) => void)[] = [];

  static addLog(entry: LogEntry) {
    this.logs = [entry, ...this.logs.slice(0, 49)]; // 最新50件まで保持
    this.notifyListeners();
  }

  static getLogs(): LogEntry[] {
    return this.logs;
  }

  static clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  static subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notifyListeners() {
    this.listeners.forEach(listener => listener(this.logs));
  }
}

// ログ管理をエクスポート
export { LogManager };

// API設定
const apiConfig = {
  baseURL: API_BASE_URL,
  timeout: 300000, // 5分
  withCredentials: true, // クッキーを含める
  headers: {
    'Accept': 'application/json',
    // Content-Typeはリクエストごとに設定する
  }
};

// Axiosインスタンスの作成
const apiClient = axios.create(apiConfig);

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    // 言語ヘッダーを追加
    config.headers['X-Language'] = i18next.language || 'ja';
    
    // CORSデバッグ用ログ
    console.log('API Request:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      origin: window.location.origin
    });
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// レスポンスインターセプター
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      headers: response.headers,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      message: error.message,
      status: error.response?.status,
      headers: error.response?.headers,
      url: error.config?.url,
      origin: window.location.origin
    });
    
    // CORSエラーの詳細ログ
    if (error.message.includes('CORS') || error.response?.status === 0) {
      console.error('CORS Error Details:', {
        origin: window.location.origin,
        targetURL: error.config?.url,
        method: error.config?.method,
        withCredentials: error.config?.withCredentials
      });
    }
    
    return Promise.reject(error);
  }
);

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Language': i18next.language || 'ja',
  };

  // 一時的にAPIキーヘッダーを無効化してテスト
  // const geminiApiKey = localStorage.getItem('geminiApiKey');
  // const openaiApiKey = localStorage.getItem('openaiApiKey');
  // const openaiModel = localStorage.getItem('openaiModel');

  // if (geminiApiKey) headers['X-Gemini-Key'] = geminiApiKey;
  // if (openaiApiKey) headers['X-OpenAI-Key'] = openaiApiKey;
  // if (openaiModel) headers['X-OpenAI-Model'] = openaiModel;

  return headers;
};

// API呼び出しのログ記録用ヘルパー
const logApiCall = (endpoint: string, method: string, success: boolean, message: string, error?: any) => {
  const logEntry: LogEntry = {
    timestamp: new Date().toLocaleString('ja-JP'),
    level: success ? 'info' : 'error',
    message: `${method} ${endpoint}: ${message}`,
    endpoint
  };

  if (error) {
    logEntry.message += ` - ${error.message || error}`;
  }

  LogManager.addLog(logEntry);
};

export const checkChromaStatus = async (): Promise<{ status: string }> => {
  try {
    const response = await apiClient.get('/chroma-status');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('ChromaDB status check error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
    throw new Error('Failed to check ChromaDB status');
  }
};

// バックエンドログ関連の型定義
interface BackendLogEntry {
  timestamp: string;
  severity: string;
  message: string;
}

interface BackendLogResponse {
  logs: BackendLogEntry[];
  total_count: number;
}

export const getBackendLogs = async (limit: number = 50): Promise<BackendLogResponse> => {
  try {
    logApiCall('/logs', 'GET', true, 'バックエンドログ取得開始');
    
    const response = await apiClient.get(`/logs?limit=${limit}`);
    
    logApiCall('/logs', 'GET', true, `バックエンドログ取得成功: ${response.data.total_count}件`);
    
    return response.data;
  } catch (error) {
    logApiCall('/logs', 'GET', false, 'バックエンドログ取得失敗', error);
    
    if (axios.isAxiosError(error)) {
      console.error('Backend logs fetch error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
    throw new Error('Failed to fetch backend logs');
  }
};

export const uploadVideo = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<VideoInfo> => {
  const formData = new FormData();
  formData.append('video', file);

  try {
    logApiCall('/upload', 'POST', true, '動画アップロード開始');

    const response = await apiClient.post('/upload', formData, {
      headers: {
        ...getHeaders(),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress?.(percentCompleted);
        }
      },
    });

    const { gcsBlobName, previewUrl } = response.data;
    
    // 動画の長さを取得
    const url = URL.createObjectURL(file);
    const duration = await getVideoDuration(url);
    
    logApiCall('/upload', 'POST', true, `動画アップロード成功: ${file.name}`);

    return {
      file,
      url: previewUrl,
      duration,
      name: file.name,
      gcsBlobName,
    };
  } catch (error) {
    logApiCall('/upload', 'POST', false, '動画アップロード失敗', error);
    throw error;
  }
};

// 動画の長さを取得するヘルパー関数
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
};

export const analyzeVideo = async (settings: AnalysisSettings): Promise<AnalysisResponse> => {
  try {
    logApiCall('/analyze', 'POST', true, '動画解析開始');

    const response = await apiClient.post('/analyze', settings);

    logApiCall('/analyze', 'POST', true, '動画解析成功');
    return response.data;
  } catch (error) {
    logApiCall('/analyze', 'POST', false, '動画解析失敗', error);
    throw error;
  }
};

export const uploadAndAnalyze = async (
  videoInfo: VideoInfo,
  settings: AnalysisSettings,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<AnalysisResponse> => {
  try {
    console.log('Starting upload and analysis process:', {
      fileName: videoInfo.file.name,
      fileSize: videoInfo.file.size,
      settings
    });
    
    if (!videoInfo.gcsBlobName) {
      onProgress?.({ stage: 'upload', progress: 0 });
      const uploadedInfo = await uploadVideo(videoInfo.file, (progress) => {
        onProgress?.({ stage: 'upload', progress });
      });
      videoInfo = { ...videoInfo, gcsBlobName: uploadedInfo.gcsBlobName };
    }
    
    // gcsBlobNameが確実に存在することを確認
    if (!videoInfo.gcsBlobName) {
      throw new Error('Failed to get gcsBlobName after upload');
    }
    
    const result = await analyzeVideo({
      ...settings,
      gcsBlobName: videoInfo.gcsBlobName,
    });

    return result;
  } catch (error) {
    console.error('Upload and analysis error:', error);
    throw error;
  }
};

// Signed URL関連の型定義
interface SignedUrlRequest {
  filename: string;
  contentType: string;
}

interface SignedUrlResponse {
  uploadUrl: string;
  gcsBlobName: string;
  videoId: string;
}

interface VideoProcessRequest {
  gcsBlobName: string;
  originalFileName: string;
}

// 既存のuploadFullVideo関数を修正（一時的に従来方式を使用）
export const uploadFullVideo = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<FullVideoInfo> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    console.log('uploadFullVideo: Starting upload', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      apiUrl: `${API_BASE_URL}/upload-full-video`
    });
    
    // ファイルサイズチェック（100MB制限 - HTTP/2対応により拡張）
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`ファイルサイズが制限を超えています。100MB以下のファイルを選択してください。（現在: ${(file.size / (1024 * 1024)).toFixed(1)}MB）`);
    }
    
    logApiCall('/upload-full-video', 'POST', true, 'フル動画アップロード開始');

    const response = await apiClient.post('/upload-full-video', formData, {
      headers: {
        // multipart/form-dataの場合、Content-Typeを削除してブラウザに自動設定させる
        // 言語ヘッダーのみ明示的に設定
        'X-Language': i18next.language || 'ja',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log('Upload progress:', percentCompleted + '%');
          onProgress?.(percentCompleted);
        }
      },
    });

    console.log('uploadFullVideo: Upload successful', response.data);
    const { gcsBlobName, videoId, metadata, previewUrl } = response.data;

    logApiCall('/upload-full-video', 'POST', true, `フル動画アップロード成功: ${file.name}`);

    return {
      file,
      url: previewUrl,
      duration: metadata.optimizedDuration,
      name: metadata.originalFileName,
      gcsBlobName,
      videoId,
      metadata: {
        originalFileName: metadata.originalFileName,
        originalSize: metadata.originalSize,
        originalDuration: metadata.originalDuration,
        optimizedSize: metadata.optimizedSize,
        optimizedDuration: metadata.optimizedDuration,
        compressionRatio: metadata.compressionRatio
      },
      previewUrl
    };
  } catch (error) {
    console.error('uploadFullVideo: Detailed error information:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      response: axios.isAxiosError(error) ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : null,
      request: axios.isAxiosError(error) ? {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      } : null
    });
    
    let errorMessage = 'アップロードに失敗しました';
    if (error instanceof Error) {
      errorMessage = error.message;
          } else if (axios.isAxiosError(error)) {
        if (error.response?.status === 413) {
          errorMessage = 'ファイルサイズが大きすぎます。100MB以下のファイルを選択してください。';
        } else if (error.response?.status === 400) {
          errorMessage = error.response.data?.detail || '無効なファイル形式です。';
        } else if (error.response?.status === 405) {
          errorMessage = 'サービスが一時的に利用できません。しばらく待ってから再試行してください。';
        } else {
          errorMessage = `アップロードエラー: ${error.response?.status || 'ネットワークエラー'}`;
        }
      }
    
    logApiCall('/upload-full-video', 'POST', false, 'フル動画アップロード失敗', error);
    throw new Error(errorMessage);
  }
};

export const analyzeVideoRange = async (settings: RangeAnalysisSettings): Promise<AnalysisResponse> => {
  try {
    console.log('analyzeVideoRange: Request data:', {
      settings,
      settingsType: typeof settings,
      settingsKeys: Object.keys(settings),
      settingsValues: Object.values(settings)
    });
    
    // データの妥当性チェック
    if (!settings.gcsBlobName) {
      throw new Error('gcsBlobName is required');
    }
    if (typeof settings.startTime !== 'number' || typeof settings.endTime !== 'number') {
      throw new Error('startTime and endTime must be numbers');
    }
    if (settings.startTime >= settings.endTime) {
      throw new Error('startTime must be less than endTime');
    }
    if (!settings.problemType || !settings.crux) {
      throw new Error('problemType and crux are required');
    }
    
    logApiCall('/analyze-range', 'POST', true, '範囲解析開始');

    const response = await apiClient.post('/analyze-range', settings, {
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json'
      }
    });

    console.log('analyzeVideoRange: Response received:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    });

    logApiCall('/analyze-range', 'POST', true, '範囲解析成功');
    return response.data;
  } catch (error) {
    console.error('analyzeVideoRange: Detailed error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      response: axios.isAxiosError(error) ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : null,
      request: axios.isAxiosError(error) ? {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
      } : null
    });
    
    logApiCall('/analyze-range', 'POST', false, '範囲解析失敗', error);
    throw error;
  }
};

export const uploadFullVideoAndAnalyzeRange = async (
  fullVideoInfo: FullVideoInfo,
  settings: RangeAnalysisSettings,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<AnalysisResponse> => {
  try {
    console.log('Starting full video upload and range analysis:', {
      fileName: fullVideoInfo.file.name,
      fileSize: fullVideoInfo.file.size,
      settings,
      currentGcsBlobName: fullVideoInfo.gcsBlobName
    });
    
    // 常に再アップロードしてgcsBlobNameを取得する
    onProgress?.({ stage: 'upload', progress: 0 });
    const uploadedInfo = await uploadFullVideo(fullVideoInfo.file, (progress) => {
      onProgress?.({ stage: 'upload', progress });
    });
    
    // アップロード結果から最新のgcsBlobNameを取得
    const latestGcsBlobName = uploadedInfo.gcsBlobName;
    
    console.log('Upload completed, using gcsBlobName:', latestGcsBlobName);
    
    if (!latestGcsBlobName) {
      throw new Error('Failed to get gcsBlobName after upload');
    }
    
    onProgress?.({ stage: 'analysis', progress: 0 });
    
    const result = await analyzeVideoRange({
      ...settings,
      gcsBlobName: latestGcsBlobName,
    });

    return result;
  } catch (error) {
    console.error('Full video upload and range analysis error:', error);
    throw error;
  }
};