import { useState, useCallback, useEffect } from 'react';
import { EndpointResult, EndpointStatus, ENDPOINT_CONFIGS, ApiKeyStatus } from '../types/integrity';
import { integrityService } from '../api/integrityService';
import { detectApiKeys } from '../utils/smartTestUtils';

// Phase 2: 拡張された状態管理フック

export const useBackendIntegrity = () => {
  const [endpoints, setEndpoints] = useState<EndpointResult[]>(() => 
    ENDPOINT_CONFIGS.map(config => ({
      name: config.name,
      status: 'unchecked' as EndpointStatus,
      lastChecked: undefined,
      responseTime: undefined,
      response: undefined,
      error: undefined,
      statusCode: undefined,
      // Phase 2: 拡張フィールド
      errorAnalysis: undefined,
      performanceMetrics: undefined,
      suggestions: undefined
    }))
  );
  
  const [isChecking, setIsChecking] = useState(false);
  const [checkingEndpoint, setCheckingEndpoint] = useState<string | null>(null);
  
  // Phase 2: APIキー状態の監視
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>(() => detectApiKeys());
  
  // Phase 2: パフォーマンス履歴の管理
  const [performanceHistory, setPerformanceHistory] = useState<Record<string, number[]>>({});

  // Phase 2: APIキー状態の定期チェック
  useEffect(() => {
    const checkApiKeys = () => {
      const newStatus = detectApiKeys();
      setApiKeyStatus(newStatus);
    };

    // 初回チェック
    checkApiKeys();

    // 5秒ごとにAPIキー状態をチェック
    const interval = setInterval(checkApiKeys, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // 個別エンドポイントのチェック（Phase 2対応）
  const checkEndpoint = useCallback(async (endpointName: string) => {
    const config = ENDPOINT_CONFIGS.find(c => c.name === endpointName);
    if (!config) {
      console.error(`Unknown endpoint: ${endpointName}`);
      return;
    }

    setCheckingEndpoint(endpointName);
    
    // ステータスを「チェック中」に更新
    setEndpoints(prev => prev.map(ep => 
      ep.name === endpointName 
        ? { ...ep, status: 'checking' as EndpointStatus }
        : ep
    ));

    try {
      const result = await integrityService.checkEndpoint(config);
      
      // Phase 2: パフォーマンス履歴を更新
      if (result.responseTime) {
        setPerformanceHistory(prev => ({
          ...prev,
          [endpointName]: [...(prev[endpointName] || []), result.responseTime!].slice(-10) // 最新10件を保持
        }));
      }
      
      // 結果に基づいてステータスを決定
      let status: EndpointStatus;
      if (result.success) {
        status = 'success';
      } else if (result.status >= 400 && result.status < 500) {
        status = 'warning';
      } else {
        status = 'error';
      }

      // 結果を更新（Phase 2の拡張フィールドを含む）
      setEndpoints(prev => prev.map(ep => 
        ep.name === endpointName 
          ? {
              ...ep,
              status,
              responseTime: result.responseTime,
              lastChecked: result.timestamp,
              response: result.response,
              error: result.error,
              statusCode: result.status,
              // Phase 2: 拡張フィールド
              errorAnalysis: result.errorAnalysis,
              performanceMetrics: result.performanceMetrics,
              suggestions: result.suggestions
            }
          : ep
      ));
    } catch (error: any) {
      // エラー時の処理
      setEndpoints(prev => prev.map(ep => 
        ep.name === endpointName 
          ? {
              ...ep,
              status: 'error' as EndpointStatus,
              lastChecked: new Date(),
              error: error.message || 'Unknown error',
              statusCode: 0
            }
          : ep
      ));
    } finally {
      setCheckingEndpoint(null);
    }
  }, []);

  // 全エンドポイントの一括チェック
  const checkAllEndpoints = useCallback(async () => {
    setIsChecking(true);
    
    try {
      // 順次実行（Phase 1では並列実行は避ける）
      for (const config of ENDPOINT_CONFIGS) {
        await checkEndpoint(config.name);
        // 少し間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error during bulk check:', error);
    } finally {
      setIsChecking(false);
    }
  }, [checkEndpoint]);

  // Phase 2: スマートチェック（APIキー状態を考慮）
  const checkAllEndpointsSmart = useCallback(async () => {
    setIsChecking(true);
    
    try {
      const currentApiKeys = detectApiKeys();
      
      for (const config of ENDPOINT_CONFIGS) {
        // APIキーが必要なエンドポイントで、APIキーが設定されていない場合はスキップ
        if (config.requiresAuth && !currentApiKeys.geminiApiKey && !currentApiKeys.openaiApiKey) {
          setEndpoints(prev => prev.map(ep => 
            ep.name === config.name 
              ? {
                  ...ep,
                  status: 'warning' as EndpointStatus,
                  lastChecked: new Date(),
                  error: 'APIキーが設定されていません',
                  statusCode: 0,
                  errorAnalysis: {
                    category: 'authentication',
                    severity: 'high',
                    description: 'APIキーが設定されていません',
                    possibleCauses: ['GeminiまたはOpenAIのAPIキーが必要'],
                    impact: '認証が必要な機能が利用できません'
                  }
                }
              : ep
          ));
          continue;
        }
        
        await checkEndpoint(config.name);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error during smart bulk check:', error);
    } finally {
      setIsChecking(false);
    }
  }, [checkEndpoint]);

  // エンドポイントの結果をリセット
  const resetEndpoint = useCallback((endpointName: string) => {
    setEndpoints(prev => prev.map(ep => 
      ep.name === endpointName 
        ? {
            ...ep,
            status: 'unchecked' as EndpointStatus,
            responseTime: undefined,
            lastChecked: undefined,
            response: undefined,
            error: undefined,
            statusCode: undefined,
            // Phase 2: 拡張フィールドもリセット
            errorAnalysis: undefined,
            performanceMetrics: undefined,
            suggestions: undefined
          }
        : ep
    ));
  }, []);

  // 全エンドポイントをリセット
  const resetAllEndpoints = useCallback(() => {
    setEndpoints(prev => prev.map(ep => ({
      ...ep,
      status: 'unchecked' as EndpointStatus,
      responseTime: undefined,
      lastChecked: undefined,
      response: undefined,
      error: undefined,
      statusCode: undefined,
      // Phase 2: 拡張フィールドもリセット
      errorAnalysis: undefined,
      performanceMetrics: undefined,
      suggestions: undefined
    })));
    
    // パフォーマンス履歴もクリア
    setPerformanceHistory({});
  }, []);

  // 統計情報の計算（Phase 2拡張）
  const getStatistics = useCallback(() => {
    const total = endpoints.length;
    const success = endpoints.filter(ep => ep.status === 'success').length;
    const warning = endpoints.filter(ep => ep.status === 'warning').length;
    const error = endpoints.filter(ep => ep.status === 'error').length;
    const checking = endpoints.filter(ep => ep.status === 'checking').length;
    const unchecked = endpoints.filter(ep => ep.status === 'unchecked').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (error > 0) {
      overallStatus = 'unhealthy';
    } else if (warning > 0) {
      overallStatus = 'degraded';
    } else if (success === total) {
      overallStatus = 'healthy';
    } else {
      overallStatus = 'degraded';
    }

    // Phase 2: 拡張統計情報
    const avgResponseTime = endpoints
      .filter(ep => ep.responseTime)
      .reduce((sum, ep) => sum + (ep.responseTime || 0), 0) / 
      endpoints.filter(ep => ep.responseTime).length || 0;

    const criticalIssues = endpoints.filter(ep => 
      ep.errorAnalysis?.severity === 'critical'
    ).length;

    const authIssues = endpoints.filter(ep => 
      ep.errorAnalysis?.category === 'authentication'
    ).length;

    return {
      total,
      success,
      warning,
      error,
      checking,
      unchecked,
      overallStatus,
      // Phase 2: 拡張統計
      avgResponseTime,
      criticalIssues,
      authIssues,
      hasApiKeys: apiKeyStatus.geminiApiKey || apiKeyStatus.openaiApiKey
    };
  }, [endpoints, apiKeyStatus]);

  // Phase 2: 健全性レポート生成
  const generateHealthReport = useCallback(async () => {
    return await integrityService.generateHealthReport();
  }, []);

  // Phase 2: パフォーマンストレンド取得
  const getPerformanceTrend = useCallback((endpointName: string) => {
    const history = performanceHistory[endpointName] || [];
    if (history.length < 2) return null;

    const recent = history.slice(-3);
    const older = history.slice(-6, -3);
    
    if (older.length === 0) return null;

    const recentAvg = recent.reduce((sum, time) => sum + time, 0) / recent.length;
    const olderAvg = older.reduce((sum, time) => sum + time, 0) / older.length;
    
    const improvement = ((olderAvg - recentAvg) / olderAvg) * 100;
    
    return {
      improvement,
      trend: improvement > 5 ? 'improving' : improvement < -5 ? 'degrading' : 'stable'
    };
  }, [performanceHistory]);

  return {
    // Phase 1: 既存の機能
    endpoints,
    isChecking,
    checkingEndpoint,
    checkEndpoint,
    checkAllEndpoints,
    resetEndpoint,
    resetAllEndpoints,
    statistics: getStatistics(),
    
    // Phase 2: 新機能
    apiKeyStatus,
    performanceHistory,
    checkAllEndpointsSmart,
    generateHealthReport,
    getPerformanceTrend
  };
}; 