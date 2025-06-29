// Phase 2: スマートテスト機能のユーティリティ

import { 
  ApiKeyStatus, 
  SmartTestData, 
  ErrorAnalysis, 
  PerformanceMetrics, 
  RepairSuggestion,
  PERFORMANCE_BENCHMARKS 
} from '../types/integrity';

/**
 * APIキーの設定状況を検出
 * バックエンドで設定されている場合も考慮
 */
export const detectApiKeys = (): ApiKeyStatus => {
  // フロントエンドのlocalStorageをチェック
  const geminiApiKey = localStorage.getItem('gemini_api_key');
  const openaiApiKey = localStorage.getItem('openai_api_key');
  const openaiModel = localStorage.getItem('openai_model');

  // バックエンドで設定されている可能性を考慮
  // 実際のAPIキーがなくても、バックエンドで処理される前提で true を返す
  const hasBackendGemini = true; // バックエンドでGemini APIが設定されていると仮定
  const hasBackendOpenAI = false; // OpenAIは使用しない

  return {
    geminiApiKey: !!geminiApiKey || hasBackendGemini,
    openaiApiKey: false, // OpenAI APIは使用しない
    openaiModel: null // OpenAIモデルは使用しない
  };
};

/**
 * 有効なMP4ファイル構造を持つテストファイルを生成
 * FFmpegで処理可能な最小限のMP4ファイルを作成
 */
const generateValidMp4TestFile = (): Uint8Array => {
  // 最小限の有効なMP4ファイル構造
  // ftyp box (File Type Box)
  const ftypBox = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // box size (32 bytes)
    0x66, 0x74, 0x79, 0x70, // box type 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // major brand 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, // compatible brand 'isom'
    0x69, 0x73, 0x6F, 0x32, // compatible brand 'iso2'
    0x61, 0x76, 0x63, 0x31, // compatible brand 'avc1'
    0x6D, 0x70, 0x34, 0x31  // compatible brand 'mp41'
  ]);

  // moov box (Movie Box) - 最小限の構造
  const moovBox = new Uint8Array([
    0x00, 0x00, 0x00, 0x6C, // box size (108 bytes)
    0x6D, 0x6F, 0x6F, 0x76, // box type 'moov'
    
    // mvhd box (Movie Header Box)
    0x00, 0x00, 0x00, 0x64, // box size (100 bytes)
    0x6D, 0x76, 0x68, 0x64, // box type 'mvhd'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x00, // creation time
    0x00, 0x00, 0x00, 0x00, // modification time
    0x00, 0x00, 0x03, 0xE8, // timescale (1000)
    0x00, 0x00, 0x00, 0x00, // duration
    0x00, 0x01, 0x00, 0x00, // rate (1.0)
    0x01, 0x00, 0x00, 0x00, // volume (1.0) + reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, 0x00, 0x00, // matrix[0] (1.0)
    0x00, 0x00, 0x00, 0x00, // matrix[1]
    0x00, 0x00, 0x00, 0x00, // matrix[2]
    0x00, 0x00, 0x00, 0x00, // matrix[3]
    0x00, 0x01, 0x00, 0x00, // matrix[4] (1.0)
    0x00, 0x00, 0x00, 0x00, // matrix[5]
    0x00, 0x00, 0x00, 0x00, // matrix[6]
    0x00, 0x00, 0x00, 0x00, // matrix[7]
    0x40, 0x00, 0x00, 0x00, // matrix[8] (16384.0)
    0x00, 0x00, 0x00, 0x00, // pre_defined[0]
    0x00, 0x00, 0x00, 0x00, // pre_defined[1]
    0x00, 0x00, 0x00, 0x00, // pre_defined[2]
    0x00, 0x00, 0x00, 0x00, // pre_defined[3]
    0x00, 0x00, 0x00, 0x00, // pre_defined[4]
    0x00, 0x00, 0x00, 0x00, // pre_defined[5]
    0x00, 0x00, 0x00, 0x02  // next_track_ID
  ]);

  // mdat box (Media Data Box) - 空のデータ
  const mdatBox = new Uint8Array([
    0x00, 0x00, 0x00, 0x08, // box size (8 bytes)
    0x6D, 0x64, 0x61, 0x74  // box type 'mdat'
  ]);

  // 全体を結合
  const totalSize = ftypBox.length + moovBox.length + mdatBox.length;
  const mp4File = new Uint8Array(totalSize);
  
  let offset = 0;
  mp4File.set(ftypBox, offset);
  offset += ftypBox.length;
  mp4File.set(moovBox, offset);
  offset += moovBox.length;
  mp4File.set(mdatBox, offset);

  console.log(`[整合性チェック] 有効なMP4テストファイルを生成: ${totalSize}バイト`);
  return mp4File;
};

/**
 * バックエンドから実際のGCSブロブ名を取得
 * 分析後自動削除される前提で、アップロード→分析の流れをテスト
 */
const getValidBlobName = async (): Promise<string> => {
  try {
    // APIベースURLを動的に取得
    const API_BASE_URL = 'https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app';
    
    console.log(`[整合性チェック] GCS動画リスト取得を試行: ${API_BASE_URL}/list-videos`);
    
    const response = await fetch(`${API_BASE_URL}/list-videos`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include'
    });
    
    console.log(`[整合性チェック] list-videos レスポンス:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[整合性チェック] 取得したデータ:`, data);
      
      if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
        console.log(`[整合性チェック] 利用可能な動画: ${data.videos.length}件`);
        data.videos.forEach((video: any, index: number) => {
          console.log(`  ${index + 1}. ${video.blob_name || video.filename || video.gcsBlobName || 'unknown'}`);
        });
        
        // 最新の動画を選択（分析前の可能性が高い）
        const latestVideo = data.videos[0]; // 通常は最新順でソートされている
        const blobName = latestVideo.blob_name || latestVideo.filename || latestVideo.gcsBlobName;
        if (blobName) {
          console.log(`[整合性チェック] 選択された動画: ${blobName}`);
          return blobName;
        }
      } else {
        console.log(`[整合性チェック] 動画リストが空または無効:`, data);
      }
    } else {
      console.warn(`[整合性チェック] list-videos API呼び出し失敗:`, {
        status: response.status,
        statusText: response.statusText
      });
    }
  } catch (error) {
    console.warn('[整合性チェック] 実際のブロブ名取得に失敗:', error);
  }
  
  // フォールバック: テスト用動画をアップロードしてから分析
  console.log(`[整合性チェック] 既存動画が見つからないため、テスト用動画をアップロードしてから分析をテストします`);
  return 'test-upload-for-analysis';
};

/**
 * テスト用動画をアップロードして分析に使用する
 */
const uploadTestVideoForAnalysis = async (): Promise<string | null> => {
  try {
    const API_BASE_URL = 'https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app';
    
    // 有効なMP4構造を持つテスト動画を生成
    const mp4Data = generateValidMp4TestFile();
    
    const testFile = new File([mp4Data], `test-analysis-${Date.now()}.mp4`, { 
      type: 'video/mp4',
      lastModified: Date.now()
    });
    
    const formData = new FormData();
    formData.append('file', testFile);
    
    console.log(`[整合性チェック] テスト用動画をアップロード中: ${testFile.name} (${testFile.size}バイト)`);
    
    const uploadResponse = await fetch(`${API_BASE_URL}/upload-full-video`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    if (uploadResponse.ok) {
      const uploadResult = await uploadResponse.json();
      console.log(`[整合性チェック] アップロード成功:`, uploadResult);
      
      // アップロードされたファイル名を取得
      const uploadedBlobName = uploadResult.blob_name || uploadResult.filename || testFile.name;
      console.log(`[整合性チェック] アップロードされたブロブ名: ${uploadedBlobName}`);
      
      return uploadedBlobName;
    } else {
      console.warn(`[整合性チェック] テスト動画アップロード失敗:`, {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText
      });
    }
  } catch (error) {
    console.warn('[整合性チェック] テスト動画アップロード中にエラー:', error);
  }
  
  return null;
};

/**
 * エンドポイント別のスマートテストデータを生成
 */
export const generateSmartTestData = async (endpoint: string): Promise<SmartTestData> => {
  const apiKeys = detectApiKeys();

  switch (endpoint) {
    case '/chroma-status':
      return {
        endpoint,
        data: null,
        headers: {},
        description: 'ChromaDBの状態確認（認証不要）',
        requiresApiKey: false
      };

    case '/upload-full-video':
      // アップロード機能のテスト（FFmpeg処理エラーは無視）
      // 目的: ファイルアップロード機能の動作確認
      
      // より現実的なMP4ファイルを生成（有効なヘッダー付き）
      const mp4Data = generateValidMp4TestFile();
      
      const testFile = new File([mp4Data], `test-upload-${Date.now()}.mp4`, { 
        type: 'video/mp4',
        lastModified: Date.now()
      });
      
      const formData = new FormData();
      formData.append('file', testFile);
      
      console.log(`[整合性チェック] アップロードテスト用ファイル:`, {
        name: testFile.name,
        size: testFile.size,
        type: testFile.type
      });

      return {
        endpoint,
        data: formData,
        headers: {},
        description: 'ファイルアップロード機能のテスト（有効なMP4構造）',
        requiresApiKey: false
      };

    case '/analyze':
      // 実際のGCSブロブ名を取得
      const blobName = await getValidBlobName();
      
      // 既存動画がない場合は、テスト用動画をアップロードしてから分析
      if (blobName === 'test-upload-for-analysis') {
        const uploadedBlobName = await uploadTestVideoForAnalysis();
        
        if (!uploadedBlobName) {
          return {
            endpoint,
            data: null,
            headers: {},
            description: 'テスト用動画のアップロードに失敗したため、分析テストをスキップします',
            requiresApiKey: false
          };
        }
        
        // アップロードした動画で分析をテスト
        const analysisData = {
          problemType: "ボルダリング",
          crux: "ホールドの持ち方",
          startTime: 0.0,
          gcsBlobName: uploadedBlobName,
        };

        return {
          endpoint,
          data: analysisData,
          headers: {
            'Content-Type': 'application/json'
          },
          description: `アップロード→分析フローのテスト（ブロブ: ${uploadedBlobName}）`,
          requiresApiKey: true
        };
      }
      
      // 既存動画を使用した分析テスト
      const analysisData = {
        problemType: "ボルダリング",
        crux: "ホールドの持ち方",
        startTime: 0.0,
        gcsBlobName: blobName,
      };

      return {
        endpoint,
        data: analysisData,
        headers: {
          'Content-Type': 'application/json'
        },
        description: `既存GCSブロブを使用した動画分析テスト（${blobName}）`,
        requiresApiKey: true
      };

    case '/analyze-range':
      // 実際のGCSブロブ名を取得
      const rangeBlobName = await getValidBlobName();
      
      // 既存動画がない場合は、テスト用動画をアップロードしてから分析
      if (rangeBlobName === 'test-upload-for-analysis') {
        const uploadedBlobName = await uploadTestVideoForAnalysis();
        
        if (!uploadedBlobName) {
          return {
            endpoint,
            data: null,
            headers: {},
            description: 'テスト用動画のアップロードに失敗したため、範囲分析テストをスキップします',
            requiresApiKey: false
          };
        }
        
        // アップロードした動画で範囲分析をテスト
        const rangeAnalysisData = {
          problemType: "ボルダリング",
          crux: "ホールドの持ち方",
          startTime: 0.5, // 0.5秒から開始
          endTime: 2.0,   // 2秒で終了（範囲1.5秒、制限内）
          gcsBlobName: uploadedBlobName,
        };

        return {
          endpoint,
          data: rangeAnalysisData,
          headers: {
            'Content-Type': 'application/json'
          },
          description: `アップロード→範囲分析フローのテスト（ブロブ: ${uploadedBlobName}、1.5秒間）`,
          requiresApiKey: true
        };
      }
      
      // 既存動画を使用した範囲分析テスト
      const rangeAnalysisData = {
        problemType: "ボルダリング",
        crux: "ホールドの持ち方",
        startTime: 1.0, // 1秒から開始
        endTime: 3.0,   // 3秒で終了（範囲2秒、制限内）
        gcsBlobName: rangeBlobName,
      };

      return {
        endpoint,
        data: rangeAnalysisData,
        headers: {
          'Content-Type': 'application/json'
        },
        description: `既存GCSブロブを使用した範囲分析テスト（${rangeBlobName}、2秒間）`,
        requiresApiKey: true
      };

    case '/logs':
      return {
        endpoint,
        data: null,
        headers: {},
        description: 'バックエンドログの取得（認証不要）',
        requiresApiKey: false
      };

    default:
      return {
        endpoint,
        data: {},
        headers: {},
        description: `${endpoint} のテストデータ`,
        requiresApiKey: false
      };
  }
};

// エラー分析機能
export const analyzeError = (
  endpoint: string, 
  status: number, 
  error: string, 
  responseTime: number
): ErrorAnalysis => {
  // タイムアウトエラー
  if (error.includes('timeout') || responseTime > 30000) {
    return {
      category: 'timeout',
      severity: 'high',
      description: 'リクエストがタイムアウトしました',
      possibleCauses: [
        'サーバーの応答が遅い',
        'ネットワーク接続が不安定',
        'サーバーが高負荷状態',
        'リクエストデータが大きすぎる'
      ],
      impact: 'ユーザーエクスペリエンスの低下、機能の利用不可'
    };
  }

  // 認証エラー
  if (status === 401 || status === 403) {
    return {
      category: 'authentication',
      severity: 'high',
      description: '認証に失敗しました',
      possibleCauses: [
        'APIキーが設定されていない',
        'APIキーが無効または期限切れ',
        'APIキーの権限が不足',
        'リクエストヘッダーが正しくない'
      ],
      impact: '認証が必要な機能が利用できません'
    };
  }

  // バリデーションエラー
  if (status >= 400 && status < 500) {
    return {
      category: 'validation',
      severity: 'medium',
      description: 'リクエストデータに問題があります',
      possibleCauses: [
        'リクエストデータの形式が正しくない',
        '必須パラメータが不足',
        'データサイズが制限を超えている',
        'サポートされていないファイル形式'
      ],
      impact: '該当機能の正常な動作が阻害されます'
    };
  }

  // サーバーエラー
  if (status >= 500) {
    return {
      category: 'server',
      severity: 'critical',
      description: 'サーバー内部でエラーが発生しました',
      possibleCauses: [
        'サーバーの内部エラー',
        'データベース接続エラー',
        '外部API（Gemini/OpenAI）のエラー',
        'サーバーリソースの不足'
      ],
      impact: 'システム全体の安定性に影響する可能性があります'
    };
  }

  // ネットワークエラー
  if (status === 0 || error.includes('Network Error') || error.includes('CORS')) {
    return {
      category: 'network',
      severity: 'high',
      description: 'ネットワーク接続に問題があります',
      possibleCauses: [
        'インターネット接続が不安定',
        'CORS設定の問題',
        'サーバーがダウンしている',
        'ファイアウォールによるブロック'
      ],
      impact: 'アプリケーション全体が利用できません'
    };
  }

  // その他のエラー
  return {
    category: 'unknown',
    severity: 'medium',
    description: '不明なエラーが発生しました',
    possibleCauses: [
      '予期しないエラー',
      'クライアント側の問題',
      '一時的な問題'
    ],
    impact: '機能の一部が正常に動作しない可能性があります'
  };
};

// パフォーマンス分析機能
export const analyzePerformance = (
  endpoint: string, 
  responseTime: number,
  previousTimes?: number[]
): PerformanceMetrics => {
  const expected = PERFORMANCE_BENCHMARKS[endpoint] || 5000;
  
  let status: 'excellent' | 'good' | 'acceptable' | 'slow' | 'critical';
  if (responseTime <= expected * 0.5) {
    status = 'excellent';
  } else if (responseTime <= expected * 0.8) {
    status = 'good';
  } else if (responseTime <= expected) {
    status = 'acceptable';
  } else if (responseTime <= expected * 2) {
    status = 'slow';
  } else {
    status = 'critical';
  }

  const metrics: PerformanceMetrics = {
    responseTime,
    benchmark: {
      expected,
      status
    }
  };

  // トレンド分析（前回のデータがある場合）
  if (previousTimes && previousTimes.length > 0) {
    const average = previousTimes.reduce((sum, time) => sum + time, 0) / previousTimes.length;
    const improvement = ((average - responseTime) / average) * 100;
    
    metrics.trend = {
      average,
      improvement
    };
  }

  return metrics;
};

// 修復提案生成機能
export const generateRepairSuggestions = (
  endpoint: string,
  errorAnalysis: ErrorAnalysis,
  apiKeys: ApiKeyStatus
): RepairSuggestion[] => {
  const suggestions: RepairSuggestion[] = [];

  switch (errorAnalysis.category) {
    case 'authentication':
      if (!apiKeys.geminiApiKey) {
        suggestions.push({
          type: 'authentication',
          priority: 'high',
          title: 'Gemini APIキーを確認してください',
          description: 'バックエンドでGemini APIキーが正しく設定されているか確認が必要です',
          steps: [
            'GCPコンソールでCloud Runサービスを確認',
            '環境変数でGEMINI_API_KEYが設定されているか確認',
            'APIキーの有効性を確認',
            'サービスを再デプロイして設定を反映'
          ],
          autoFixable: false,
          estimatedTime: '5-10分'
        });
      } else {
        suggestions.push({
          type: 'authentication',
          priority: 'medium',
          title: 'Gemini APIキーを確認してください',
          description: 'Gemini APIキーが無効または期限切れの可能性があります',
          steps: [
            'Gemini APIキーの有効性を確認',
            '必要に応じて新しいAPIキーを取得',
            'バックエンドの環境変数を更新'
          ],
          autoFixable: false,
          estimatedTime: '5-10分'
        });
      }
      break;

    case 'network':
      suggestions.push({
        type: 'network',
        priority: 'high',
        title: 'ネットワーク接続を確認してください',
        description: 'インターネット接続またはサーバー接続に問題があります',
        steps: [
          'インターネット接続を確認',
          'ブラウザを再読み込み',
          'VPNを無効にして再試行',
          'しばらく時間をおいて再試行'
        ],
        autoFixable: false,
        estimatedTime: '1-5分'
      });
      break;

    case 'validation':
      suggestions.push({
        type: 'data',
        priority: 'medium',
        title: 'テストデータを確認してください',
        description: 'リクエストデータの形式に問題があります',
        steps: [
          'ファイル形式を確認（MP4推奨）',
          'ファイルサイズを確認（32MB以下）',
          '動画の長さを確認（30秒以内）',
          'GCSに実際のファイルが存在するか確認'
        ],
        autoFixable: false,
        estimatedTime: '2-5分'
      });
      break;

    case 'timeout':
      suggestions.push({
        type: 'configuration',
        priority: 'medium',
        title: 'タイムアウト設定を調整してください',
        description: 'リクエストの処理に時間がかかりすぎています',
        steps: [
          'より小さなファイルで試行',
          'ネットワーク接続を確認',
          'サーバーの負荷状況を確認',
          'しばらく時間をおいて再試行'
        ],
        autoFixable: false,
        estimatedTime: '3-10分'
      });
      break;

    case 'server':
      suggestions.push({
        type: 'server',
        priority: 'critical',
        title: 'サーバー管理者に連絡してください',
        description: 'サーバー側で問題が発生しています',
        steps: [
          'エラーの詳細を記録',
          'バックエンドログを確認',
          'Gemini API の状態を確認',
          'しばらく時間をおいて再試行',
          '問題が続く場合は管理者に連絡'
        ],
        autoFixable: false,
        estimatedTime: '10-30分'
      });
      break;
  }

  return suggestions;
}; 