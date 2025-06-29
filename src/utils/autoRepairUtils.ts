import {
  RepairableIssue,
  AutoRepairSuggestion,
  RepairResult,
  RepairChange,
  CheckResult,
  ErrorAnalysis,
  ApiKeyStatus,
  EndpointConfig,
  ENDPOINT_CONFIGS
} from '../types/integrity';
import { detectApiKeys, analyzeError } from './smartTestUtils';

// 自動修復エンジンのユーティリティ関数

/**
 * システム全体の問題を検出
 */
export const detectSystemIssues = async (
  checkResults: Record<string, CheckResult>,
  apiKeys: ApiKeyStatus
): Promise<RepairableIssue[]> => {
  const issues: RepairableIssue[] = [];
  const timestamp = new Date();

  // 各エンドポイントの結果を分析
  for (const [endpoint, result] of Object.entries(checkResults)) {
    if (!result.success && result.error) {
      const errorAnalysis = analyzeError(endpoint, result.status, result.error, result.responseTime);
      const issue = await createRepairableIssue(endpoint, result, errorAnalysis, timestamp);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  // APIキー関連の問題を検出
  const apiKeyIssues = detectApiKeyIssues(apiKeys, timestamp);
  issues.push(...apiKeyIssues);

  // 環境変数の問題を検出
  const envIssues = await detectEnvironmentIssues(timestamp);
  issues.push(...envIssues);

  // 設定の問題を検出
  const configIssues = detectConfigurationIssues(checkResults, timestamp);
  issues.push(...configIssues);

  return issues;
};

/**
 * 修復可能な問題を作成
 */
const createRepairableIssue = async (
  endpoint: string,
  result: CheckResult,
  errorAnalysis: ErrorAnalysis,
  timestamp: Date
): Promise<RepairableIssue | null> => {
  const issueId = `${endpoint}-${timestamp.getTime()}`;
  
  // エラーカテゴリに基づいて問題タイプを決定
  let type: RepairableIssue['type'];
  let autoFixable = false;
  let estimatedTime = 5; // デフォルト5分

  switch (errorAnalysis.category) {
    case 'authentication':
      type = 'api_key';
      autoFixable = true;
      estimatedTime = 2;
      break;
    case 'validation':
      type = 'data_format';
      autoFixable = true;
      estimatedTime = 3;
      break;
    case 'network':
      type = 'network';
      autoFixable = false;
      estimatedTime = 10;
      break;
    case 'server':
      type = 'server';
      autoFixable = false;
      estimatedTime = 15;
      break;
    case 'timeout':
      type = 'configuration';
      autoFixable = true;
      estimatedTime = 1;
      break;
    default:
      type = 'configuration';
      autoFixable = false;
      estimatedTime = 10;
  }

  return {
    id: issueId,
    type,
    severity: errorAnalysis.severity,
    title: `${endpoint} - ${errorAnalysis.description}`,
    description: `エンドポイント ${endpoint} で ${errorAnalysis.category} エラーが発生しました。${errorAnalysis.impact}`,
    endpoint,
    autoFixable,
    estimatedTime,
    detectedAt: timestamp,
    relatedError: errorAnalysis
  };
};

/**
 * APIキー関連の問題を検出
 */
const detectApiKeyIssues = (apiKeys: ApiKeyStatus, timestamp: Date): RepairableIssue[] => {
  const issues: RepairableIssue[] = [];

  if (!apiKeys.geminiApiKey) {
    issues.push({
      id: `gemini-api-key-missing-${timestamp.getTime()}`,
      type: 'api_key',
      severity: 'high',
      title: 'Gemini APIキーが設定されていません',
      description: 'Gemini APIキーが設定されていないため、分析機能が利用できません。',
      endpoint: '/analyze',
      autoFixable: false, // バックエンドの環境変数設定が必要
      estimatedTime: 10,
      detectedAt: timestamp
    });
  }

  return issues;
};

/**
 * 環境変数の問題を検出
 */
const detectEnvironmentIssues = async (timestamp: Date): Promise<RepairableIssue[]> => {
  const issues: RepairableIssue[] = [];

  // ローカルストレージから設定を確認
  const backendUrl = localStorage.getItem('backend_url');
  if (!backendUrl) {
    issues.push({
      id: `backend-url-missing-${timestamp.getTime()}`,
      type: 'environment',
      severity: 'critical',
      title: 'バックエンドURLが設定されていません',
      description: 'バックエンドサーバーのURLが設定されていないため、API通信ができません。',
      endpoint: 'all',
      autoFixable: true,
      estimatedTime: 1,
      detectedAt: timestamp
    });
  }

  return issues;
};

/**
 * 設定の問題を検出
 */
const detectConfigurationIssues = (
  checkResults: Record<string, CheckResult>,
  timestamp: Date
): RepairableIssue[] => {
  const issues: RepairableIssue[] = [];

  // 全エンドポイントが失敗している場合
  const allFailed = Object.values(checkResults).every(result => !result.success);
  if (allFailed && Object.keys(checkResults).length > 0) {
    issues.push({
      id: `all-endpoints-failed-${timestamp.getTime()}`,
      type: 'network',
      severity: 'critical',
      title: '全エンドポイントが失敗しています',
      description: 'すべてのエンドポイントでエラーが発生しています。ネットワーク接続またはサーバーの問題の可能性があります。',
      endpoint: 'all',
      autoFixable: false,
      estimatedTime: 20,
      detectedAt: timestamp
    });
  }

  // 応答時間が異常に遅い場合
  for (const [endpoint, result] of Object.entries(checkResults)) {
    if (result.success && result.responseTime > 10000) { // 10秒以上
      issues.push({
        id: `slow-response-${endpoint}-${timestamp.getTime()}`,
        type: 'configuration',
        severity: 'medium',
        title: `${endpoint} の応答が遅すぎます`,
        description: `エンドポイント ${endpoint} の応答時間が ${result.responseTime}ms と異常に遅くなっています。`,
        endpoint,
        autoFixable: true,
        estimatedTime: 5,
        detectedAt: timestamp
      });
    }
  }

  return issues;
};

/**
 * 修復提案を生成
 */
export const generateRepairSuggestions = async (
  issues: RepairableIssue[]
): Promise<AutoRepairSuggestion[]> => {
  const suggestions: AutoRepairSuggestion[] = [];

  for (const issue of issues) {
    const suggestion = await createRepairSuggestion(issue);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions.sort((a, b) => {
    // 優先度順にソート（critical > high > medium > low）
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.riskLevel as keyof typeof priorityOrder] || 0;
    const bPriority = priorityOrder[b.riskLevel as keyof typeof priorityOrder] || 0;
    return bPriority - aPriority;
  });
};

/**
 * 個別の修復提案を作成
 */
const createRepairSuggestion = async (issue: RepairableIssue): Promise<AutoRepairSuggestion | null> => {
  const suggestionId = `suggestion-${issue.id}`;

  switch (issue.type) {
    case 'api_key':
      return createApiKeyRepairSuggestion(suggestionId, issue);
    case 'environment':
      return createEnvironmentRepairSuggestion(suggestionId, issue);
    case 'configuration':
      return createConfigurationRepairSuggestion(suggestionId, issue);
    case 'data_format':
      return createDataFormatRepairSuggestion(suggestionId, issue);
    case 'network':
      return createNetworkRepairSuggestion(suggestionId, issue);
    case 'server':
      return createServerRepairSuggestion(suggestionId, issue);
    default:
      return null;
  }
};

/**
 * APIキー関連の修復提案
 */
const createApiKeyRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  return {
    issueId: issue.id,
    action: 'configure',
    title: 'Gemini APIキー設定を確認',
    description: 'バックエンドでGemini APIキーが正しく設定されているか確認してください。',
    parameters: { showGuide: true },
    confirmationRequired: false,
    riskLevel: 'low',
    estimatedTime: 10,
    steps: [
      'GCPコンソールでCloud Runサービスを確認',
      '環境変数でGEMINI_API_KEYが設定されているか確認',
      'APIキーの有効性を確認',
      'サービスを再デプロイして設定を反映'
    ],
    rollbackPossible: false
  };
};

/**
 * 環境変数関連の修復提案
 */
const createEnvironmentRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  return {
    issueId: issue.id,
    action: 'configure',
    title: 'デフォルトバックエンドURLを設定',
    description: 'デフォルトのバックエンドURL（本番環境）を設定します。',
    parameters: { 
      backendUrl: 'https://climbing-web-app-bolt-932280363930.asia-northeast1.run.app' 
    },
    confirmationRequired: true,
    riskLevel: 'medium',
    estimatedTime: 1,
    steps: [
      'localStorage に backend_url を設定',
      '接続テストを実行',
      '設定の保存を確認'
    ],
    rollbackPossible: true
  };
};

/**
 * 設定関連の修復提案
 */
const createConfigurationRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  if (issue.title.includes('応答が遅すぎます')) {
    return {
      issueId: issue.id,
      action: 'update',
      title: 'タイムアウト設定を調整',
      description: 'エンドポイントのタイムアウト時間を延長します。',
      parameters: { timeout: 30000 }, // 30秒
      confirmationRequired: false,
      riskLevel: 'low',
      estimatedTime: 1,
      steps: [
        'エンドポイント設定を更新',
        'タイムアウト時間を30秒に延長',
        '設定の適用を確認'
      ],
      rollbackPossible: true
    };
  }

  return {
    issueId: issue.id,
    action: 'reset',
    title: '設定をリセット',
    description: 'エンドポイント設定をデフォルト値にリセットします。',
    parameters: {},
    confirmationRequired: true,
    riskLevel: 'medium',
    estimatedTime: 2,
    steps: [
      '現在の設定をバックアップ',
      'デフォルト設定を適用',
      '動作確認テストを実行'
    ],
    rollbackPossible: true
  };
};

/**
 * データ形式関連の修復提案
 */
const createDataFormatRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  return {
    issueId: issue.id,
    action: 'regenerate',
    title: 'テストデータを再生成',
    description: 'より適切な形式のテストデータを生成します。',
    parameters: { endpoint: issue.endpoint },
    confirmationRequired: false,
    riskLevel: 'low',
    estimatedTime: 2,
    steps: [
      'エンドポイント仕様を確認',
      '適切な形式のテストデータを生成',
      '新しいデータでテストを実行'
    ],
    rollbackPossible: false
  };
};

/**
 * ネットワーク関連の修復提案
 */
const createNetworkRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  return {
    issueId: issue.id,
    action: 'validate',
    title: 'ネットワーク接続を確認',
    description: 'ネットワーク接続とサーバーの状態を確認します。',
    parameters: {},
    confirmationRequired: false,
    riskLevel: 'low',
    estimatedTime: 3,
    steps: [
      'インターネット接続を確認',
      'バックエンドサーバーの状態を確認',
      'CORS設定を確認',
      '代替接続方法を提案'
    ],
    rollbackPossible: false
  };
};

/**
 * サーバー関連の修復提案
 */
const createServerRepairSuggestion = (
  suggestionId: string,
  issue: RepairableIssue
): AutoRepairSuggestion => {
  return {
    issueId: issue.id,
    action: 'validate',
    title: 'サーバー状態を確認',
    description: 'バックエンドサーバーの詳細な状態を確認します。',
    parameters: {},
    confirmationRequired: false,
    riskLevel: 'low',
    estimatedTime: 5,
    steps: [
      'サーバーのヘルスチェックを実行',
      'ログを確認してエラーの詳細を調査',
      '管理者への連絡を推奨',
      '代替手順を提案'
    ],
    rollbackPossible: false
  };
};

/**
 * 修復を実行
 */
export const applyRepairSuggestion = async (
  suggestion: AutoRepairSuggestion
): Promise<RepairResult> => {
  const startTime = Date.now();
  const changes: RepairChange[] = [];

  try {
    switch (suggestion.action) {
      case 'configure':
        return await applyConfigure(suggestion, changes);
      case 'update':
        return await applyUpdate(suggestion, changes);
      case 'reset':
        return await applyReset(suggestion, changes);
      case 'validate':
        return await applyValidate(suggestion, changes);
      case 'regenerate':
        return await applyRegenerate(suggestion, changes);
      case 'retry':
        return await applyRetry(suggestion, changes);
      default:
        throw new Error(`未対応のアクション: ${suggestion.action}`);
    }
  } catch (error) {
    return {
      issueId: suggestion.issueId,
      suggestionId: `suggestion-${suggestion.issueId}`,
      success: false,
      appliedAt: new Date(),
      timeTaken: (Date.now() - startTime) / 1000,
      changes,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * 設定アクションを実行
 */
const applyConfigure = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  if (suggestion.parameters.model) {
    // OpenAIモデルを設定
    const oldValue = localStorage.getItem('openai_model');
    localStorage.setItem('openai_model', suggestion.parameters.model);
    changes.push({
      type: 'config',
      target: 'openai_model',
      oldValue,
      newValue: suggestion.parameters.model,
      reversible: true
    });
  }

  if (suggestion.parameters.backendUrl) {
    // バックエンドURLを設定
    const oldValue = localStorage.getItem('backend_url');
    localStorage.setItem('backend_url', suggestion.parameters.backendUrl);
    changes.push({
      type: 'config',
      target: 'backend_url',
      oldValue,
      newValue: suggestion.parameters.backendUrl,
      reversible: true
    });
  }

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes,
    rollbackData: changes.filter(c => c.reversible).map(c => ({ target: c.target, value: c.oldValue }))
  };
};

/**
 * 更新アクションを実行
 */
const applyUpdate = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  if (suggestion.parameters.timeout) {
    // タイムアウト設定を更新
    const configKey = `timeout_${suggestion.issueId.split('-')[0]}`;
    const oldValue = localStorage.getItem(configKey);
    localStorage.setItem(configKey, suggestion.parameters.timeout.toString());
    changes.push({
      type: 'config',
      target: configKey,
      oldValue,
      newValue: suggestion.parameters.timeout,
      reversible: true
    });
  }

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes,
    rollbackData: changes.filter(c => c.reversible).map(c => ({ target: c.target, value: c.oldValue }))
  };
};

/**
 * リセットアクションを実行
 */
const applyReset = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  // 関連する設定をリセット
  const keysToReset = ['timeout_', 'retry_count_', 'custom_headers_'];
  const backupData: any = {};

  keysToReset.forEach(prefix => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        backupData[key] = localStorage.getItem(key);
        localStorage.removeItem(key);
        changes.push({
          type: 'config',
          target: key,
          oldValue: backupData[key],
          newValue: null,
          reversible: true
        });
      }
    }
  });

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes,
    rollbackData: backupData
  };
};

/**
 * 検証アクションを実行
 */
const applyValidate = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  // 検証は実際の変更を行わないため、changesは空
  // 検証結果をログに記録
  console.log(`検証アクション実行: ${suggestion.title}`);

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes
  };
};

/**
 * 再生成アクションを実行
 */
const applyRegenerate = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  // テストデータの再生成（実際の実装では新しいテストデータを生成）
  const cacheKey = `test_data_${suggestion.parameters.endpoint}`;
  const oldValue = localStorage.getItem(cacheKey);
  const newTestData = { regenerated: true, timestamp: Date.now() };
  localStorage.setItem(cacheKey, JSON.stringify(newTestData));

  changes.push({
    type: 'data',
    target: cacheKey,
    oldValue,
    newValue: newTestData,
    reversible: true
  });

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes,
    rollbackData: { [cacheKey]: oldValue }
  };
};

/**
 * 再試行アクションを実行
 */
const applyRetry = async (
  suggestion: AutoRepairSuggestion,
  changes: RepairChange[]
): Promise<RepairResult> => {
  const startTime = Date.now();

  // 再試行カウンターを更新
  const retryKey = `retry_count_${suggestion.issueId}`;
  const currentCount = parseInt(localStorage.getItem(retryKey) || '0');
  const newCount = currentCount + 1;
  localStorage.setItem(retryKey, newCount.toString());

  changes.push({
    type: 'config',
    target: retryKey,
    oldValue: currentCount,
    newValue: newCount,
    reversible: true
  });

  return {
    issueId: suggestion.issueId,
    suggestionId: `suggestion-${suggestion.issueId}`,
    success: true,
    appliedAt: new Date(),
    timeTaken: (Date.now() - startTime) / 1000,
    changes
  };
};

/**
 * 修復結果を検証
 */
export const validateRepairResult = async (result: RepairResult): Promise<boolean> => {
  if (!result.success) {
    return false;
  }

  // 変更が正しく適用されているかを確認
  for (const change of result.changes) {
    if (change.type === 'config') {
      const currentValue = localStorage.getItem(change.target);
      if (change.newValue === null && currentValue !== null) {
        return false;
      }
      if (change.newValue !== null && currentValue !== String(change.newValue)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * 修復をロールバック
 */
export const rollbackRepair = async (result: RepairResult): Promise<boolean> => {
  if (!result.rollbackData) {
    return false;
  }

  try {
    // ロールバックデータを使用して元の状態に戻す
    if (Array.isArray(result.rollbackData)) {
      // 配列形式のロールバックデータ
      for (const item of result.rollbackData) {
        if (item.value === null) {
          localStorage.removeItem(item.target);
        } else {
          localStorage.setItem(item.target, item.value);
        }
      }
    } else {
      // オブジェクト形式のロールバックデータ
      for (const [key, value] of Object.entries(result.rollbackData)) {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, String(value));
        }
      }
    }

    return true;
  } catch (error) {
    console.error('ロールバックに失敗しました:', error);
    return false;
  }
}; 