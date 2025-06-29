import React, { useState } from 'react';
import { useBackendIntegrity } from '../hooks/useBackendIntegrity';
import { EndpointResult, EndpointStatus } from '../types/integrity';
import { CheckCircle, XCircle } from 'lucide-react';
import { testUploadAnalysisFlow } from '../api/integrityService';

// Phase 2: 拡張されたバックエンド整合性チェックパネル

const BackendIntegrityPanel: React.FC = () => {
  const {
    endpoints,
    isChecking,
    checkingEndpoint,
    checkEndpoint,
    checkAllEndpoints,
    resetEndpoint,
    resetAllEndpoints,
    statistics,
    // Phase 2: 新機能
    apiKeyStatus,
    performanceHistory,
    checkAllEndpointsSmart,
    generateHealthReport,
    getPerformanceTrend
  } = useBackendIntegrity();

  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [showHealthReport, setShowHealthReport] = useState(false);
  const [healthReport, setHealthReport] = useState<any>(null);
  
  // Phase 3: アップロード→分析フローテスト
  const [isTestingFlow, setIsTestingFlow] = useState(false);
  const [flowTestResult, setFlowTestResult] = useState<any>(null);

  // ステータス別の色とアイコン
  const getStatusDisplay = (status: EndpointStatus) => {
    switch (status) {
      case 'success':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: '✅', label: '正常' };
      case 'warning':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '⚠️', label: '警告' };
      case 'error':
        return { color: 'text-red-600', bg: 'bg-red-100', icon: '❌', label: 'エラー' };
      case 'checking':
        return { color: 'text-blue-600', bg: 'bg-blue-100', icon: '🔄', label: 'チェック中' };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: '⚪', label: '未チェック' };
    }
  };

  // Phase 2: 重要度別の色
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-50';
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Phase 2: パフォーマンスステータスの色
  const getPerformanceColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-700';
      case 'good': return 'text-green-600';
      case 'acceptable': return 'text-yellow-600';
      case 'slow': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Phase 2: 健全性レポート生成
  const handleGenerateHealthReport = async () => {
    try {
      setShowHealthReport(true);
      const report = await generateHealthReport();
      setHealthReport(report);
    } catch (error) {
      console.error('Failed to generate health report:', error);
    }
  };

  // Phase 3: アップロード→分析フローテスト
  const handleFlowTest = async () => {
    setIsTestingFlow(true);
    setFlowTestResult(null);
    
    try {
      console.log('[UI] アップロード→分析フローテストを開始');
      const result = await testUploadAnalysisFlow();
      setFlowTestResult(result);
      console.log('[UI] フローテスト完了:', result);
    } catch (error) {
      console.error('[UI] フローテスト中にエラー:', error);
      setFlowTestResult({
        uploadSuccess: false,
        analysisSuccess: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsTestingFlow(false);
    }
  };

  // Phase 2: APIキー状態表示
  const renderApiKeyStatus = () => (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">APIキー状態</h3>
      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            {apiKeyStatus.geminiApiKey ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <span className="font-medium">Gemini API</span>
          </div>
          <span className="text-sm text-gray-600">
            {apiKeyStatus.geminiApiKey ? '設定済み' : '未設定'}
          </span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <XCircle className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-500">OpenAI API</span>
          </div>
          <span className="text-sm text-gray-500">
            使用しない
          </span>
        </div>
      </div>
      
      {apiKeyStatus.openaiModel && (
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium">OpenAI Model:</span> {apiKeyStatus.openaiModel}
        </div>
      )}
    </div>
  );

  // Phase 2: 拡張統計情報表示
  const renderExtendedStatistics = () => (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-800 mb-3">システム状態</h3>
      
      {/* 基本統計 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className={`text-2xl font-bold ${
            statistics.overallStatus === 'healthy' ? 'text-green-600' :
            statistics.overallStatus === 'degraded' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {Math.round((statistics.success / statistics.total) * 100)}%
          </div>
          <div className="text-sm text-gray-600">成功率</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {Math.round(statistics.avgResponseTime)}ms
          </div>
          <div className="text-sm text-gray-600">平均応答時間</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${
            statistics.criticalIssues > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {statistics.criticalIssues}
          </div>
          <div className="text-sm text-gray-600">重大な問題</div>
        </div>
      </div>

      {/* 詳細統計 */}
      <div className="grid grid-cols-5 gap-2 text-sm">
        <div className="text-center">
          <div className="text-green-600 font-semibold">{statistics.success}</div>
          <div className="text-gray-600">正常</div>
        </div>
        <div className="text-center">
          <div className="text-yellow-600 font-semibold">{statistics.warning}</div>
          <div className="text-gray-600">警告</div>
        </div>
        <div className="text-center">
          <div className="text-red-600 font-semibold">{statistics.error}</div>
          <div className="text-gray-600">エラー</div>
        </div>
        <div className="text-center">
          <div className="text-blue-600 font-semibold">{statistics.checking}</div>
          <div className="text-gray-600">チェック中</div>
        </div>
        <div className="text-center">
          <div className="text-gray-600 font-semibold">{statistics.unchecked}</div>
          <div className="text-gray-600">未チェック</div>
        </div>
      </div>

      {/* Phase 2: 追加情報 */}
      {statistics.authIssues > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 rounded text-sm text-yellow-800">
          ⚠️ {statistics.authIssues}個のエンドポイントで認証問題が発生しています
        </div>
      )}
    </div>
  );

  // Phase 3: アップロード→分析フローテスト結果表示
  const renderFlowTestResult = () => {
    if (!flowTestResult) return null;

    return (
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-3">🎬 アップロード→分析フローテスト結果</h3>
        
        <div className="space-y-3">
          {/* アップロード結果 */}
          <div className="flex items-center space-x-2">
            {flowTestResult.uploadSuccess ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <span className="font-medium">動画アップロード:</span>
            <span className={flowTestResult.uploadSuccess ? 'text-green-600' : 'text-red-600'}>
              {flowTestResult.uploadSuccess ? '成功' : '失敗'}
            </span>
          </div>

          {/* 分析結果 */}
          <div className="flex items-center space-x-2">
            {flowTestResult.analysisSuccess ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <span className="font-medium">分析実行:</span>
            <span className={flowTestResult.analysisSuccess ? 'text-green-600' : 'text-red-600'}>
              {flowTestResult.analysisSuccess ? '成功' : '失敗'}
            </span>
          </div>

          {/* ブロブ名 */}
          {flowTestResult.blobName && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">使用されたファイル:</span> {flowTestResult.blobName}
            </div>
          )}

          {/* エラー情報 */}
          {flowTestResult.error && (
            <div className="p-2 bg-red-50 rounded text-sm text-red-800">
              <span className="font-medium">エラー:</span> {flowTestResult.error}
            </div>
          )}

          {/* デバッグ情報 */}
          {flowTestResult.debugInfo && (
            <div className="mt-3">
              <details className="text-sm">
                <summary className="font-medium cursor-pointer text-blue-700">🔍 デバッグ情報を表示</summary>
                <div className="mt-2 p-3 bg-white rounded border">
                  <div className="space-y-2 text-xs">
                    <div><span className="font-medium">ステップ:</span> {flowTestResult.debugInfo.step}</div>
                    <div><span className="font-medium">ファイル名:</span> {flowTestResult.debugInfo.fileName}</div>
                    <div><span className="font-medium">ファイルサイズ:</span> {flowTestResult.debugInfo.fileSize}バイト</div>
                    
                    {flowTestResult.debugInfo.uploadStatus && (
                      <div className="p-2 bg-red-50 rounded">
                        <div><span className="font-medium">アップロードステータス:</span> {flowTestResult.debugInfo.uploadStatus}</div>
                        <div><span className="font-medium">ステータステキスト:</span> {flowTestResult.debugInfo.uploadStatusText}</div>
                        {flowTestResult.debugInfo.uploadDuration && (
                          <div><span className="font-medium">アップロード時間:</span> {flowTestResult.debugInfo.uploadDuration}ms</div>
                        )}
                      </div>
                    )}
                    
                    {flowTestResult.debugInfo.error && (
                      <div className="p-2 bg-red-50 rounded">
                        <div><span className="font-medium">エラー詳細:</span></div>
                        <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(flowTestResult.debugInfo.error, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                  
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-600">完全なデバッグ情報</summary>
                    <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap bg-gray-100 p-2 rounded">
                      {JSON.stringify(flowTestResult.debugInfo, null, 2)}
                    </pre>
                  </details>
                </div>
              </details>
            </div>
          )}

          {/* 分析結果詳細 */}
          {flowTestResult.analysisResult && (
            <div className="mt-3">
              <details className="text-sm">
                <summary className="font-medium cursor-pointer text-blue-700">分析結果詳細を表示</summary>
                <div className="mt-2 p-2 bg-white rounded border text-xs">
                  <pre className="whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(flowTestResult.analysisResult, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}

          {/* 総合評価 */}
          <div className={`p-3 rounded-lg ${
            flowTestResult.uploadSuccess && flowTestResult.analysisSuccess
              ? 'bg-green-100 text-green-800'
              : flowTestResult.uploadSuccess
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            <span className="font-medium">
              {flowTestResult.uploadSuccess && flowTestResult.analysisSuccess
                ? '✅ アップロードした動画が正常に分析されました'
                : flowTestResult.uploadSuccess
                ? '⚠️ アップロードは成功しましたが、分析に問題があります'
                : '❌ アップロードまたは分析に失敗しました'
              }
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Phase 2: エラー分析表示
  const renderErrorAnalysis = (endpoint: EndpointResult) => {
    if (!endpoint.errorAnalysis) return null;

    return (
      <div className="mt-3 p-3 bg-red-50 rounded-lg">
        <h5 className="font-medium text-red-900 mb-2">エラー分析</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <span className="font-medium mr-2">カテゴリ:</span>
            <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(endpoint.errorAnalysis.severity)}`}>
              {endpoint.errorAnalysis.category}
            </span>
          </div>
          <div>
            <span className="font-medium">説明:</span> {endpoint.errorAnalysis.description}
          </div>
          <div>
            <span className="font-medium">影響:</span> {endpoint.errorAnalysis.impact}
          </div>
          <div>
            <span className="font-medium">考えられる原因:</span>
            <ul className="list-disc list-inside ml-4 mt-1">
              {endpoint.errorAnalysis.possibleCauses.map((cause, index) => (
                <li key={index} className="text-gray-700">{cause}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  // Phase 2: パフォーマンス分析表示
  const renderPerformanceAnalysis = (endpoint: EndpointResult) => {
    if (!endpoint.performanceMetrics) return null;

    const trend = getPerformanceTrend(endpoint.name);

    return (
      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
        <h5 className="font-medium text-blue-900 mb-2">パフォーマンス分析</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>応答時間:</span>
            <span className={`font-medium ${getPerformanceColor(endpoint.performanceMetrics.benchmark.status)}`}>
              {endpoint.performanceMetrics.responseTime}ms
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>期待値:</span>
            <span className="text-gray-600">{endpoint.performanceMetrics.benchmark.expected}ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span>ステータス:</span>
            <span className={`font-medium ${getPerformanceColor(endpoint.performanceMetrics.benchmark.status)}`}>
              {endpoint.performanceMetrics.benchmark.status}
            </span>
          </div>
          {trend && (
            <div className="flex items-center justify-between">
              <span>トレンド:</span>
              <span className={`font-medium ${
                trend.trend === 'improving' ? 'text-green-600' :
                trend.trend === 'degrading' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {trend.trend === 'improving' ? '改善中' :
                 trend.trend === 'degrading' ? '悪化中' : '安定'}
                ({trend.improvement > 0 ? '+' : ''}{Math.round(trend.improvement)}%)
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Phase 2: 修復提案表示
  const renderRepairSuggestions = (endpoint: EndpointResult) => {
    if (!endpoint.suggestions || endpoint.suggestions.length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-green-50 rounded-lg">
        <h5 className="font-medium text-green-900 mb-2">修復提案</h5>
        <div className="space-y-3">
          {endpoint.suggestions.map((suggestion, index) => (
            <div key={index} className="border-l-4 border-green-400 pl-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-green-800">{suggestion.title}</span>
                <span className={`text-xs px-2 py-1 rounded ${getSeverityColor(suggestion.priority)}`}>
                  {suggestion.priority}
                </span>
              </div>
              <p className="text-sm text-green-700 mb-2">{suggestion.description}</p>
              <div className="text-xs text-green-600">
                <span className="font-medium">推定時間:</span> {suggestion.estimatedTime}
              </div>
              <details className="mt-2">
                <summary className="text-xs text-green-600 cursor-pointer">手順を表示</summary>
                <ol className="list-decimal list-inside mt-1 text-xs text-green-700 space-y-1">
                  {suggestion.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
              </details>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">バックエンド整合性チェック</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleFlowTest}
            disabled={isTestingFlow}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {isTestingFlow ? 'テスト中...' : '🎬 フローテスト'}
          </button>
          <button
            onClick={checkAllEndpointsSmart}
            disabled={isChecking}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {isChecking ? 'チェック中...' : 'スマートチェック'}
          </button>
          <button
            onClick={checkAllEndpoints}
            disabled={isChecking}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {isChecking ? 'チェック中...' : '全てチェック'}
          </button>
          <button
            onClick={resetAllEndpoints}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            リセット
          </button>
          <button
            onClick={handleGenerateHealthReport}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
          >
            健全性レポート
          </button>
        </div>
      </div>

      {/* Phase 2: APIキー状態 */}
      {renderApiKeyStatus()}

      {/* Phase 2: 拡張統計情報 */}
      {renderExtendedStatistics()}

      {/* エンドポイント一覧 */}
      <div className="space-y-4">
        {endpoints.map((endpoint) => {
          const statusDisplay = getStatusDisplay(endpoint.status);
          const isExpanded = expandedEndpoint === endpoint.name;
          const isCurrentlyChecking = checkingEndpoint === endpoint.name;

          return (
            <div key={endpoint.name} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{statusDisplay.icon}</span>
                  <div>
                    <h3 className="font-medium text-gray-800">{endpoint.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className={statusDisplay.color}>{statusDisplay.label}</span>
                      {endpoint.responseTime && (
                        <span>応答時間: {endpoint.responseTime}ms</span>
                      )}
                      {endpoint.lastChecked && (
                        <span>最終チェック: {endpoint.lastChecked.toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => checkEndpoint(endpoint.name)}
                    disabled={isCurrentlyChecking}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isCurrentlyChecking ? 'チェック中...' : 'チェック'}
                  </button>
                  <button
                    onClick={() => resetEndpoint(endpoint.name)}
                    className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                  >
                    リセット
                  </button>
                  <button
                    onClick={() => setExpandedEndpoint(isExpanded ? null : endpoint.name)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {isExpanded ? '折りたたむ' : '詳細'}
                  </button>
                </div>
              </div>

              {/* 詳細情報 */}
              {isExpanded && (
                <div className="mt-4 space-y-4">
                  {/* 基本情報 */}
                  {endpoint.statusCode && (
                    <div>
                      <span className="font-medium">ステータスコード:</span> {endpoint.statusCode}
                    </div>
                  )}
                  
                  {endpoint.error && (
                    <div className="p-3 bg-red-50 rounded">
                      <span className="font-medium text-red-800">エラー:</span>
                      <div className="text-red-700 mt-1">{endpoint.error}</div>
                    </div>
                  )}

                  {/* Phase 2: エラー分析 */}
                  {renderErrorAnalysis(endpoint)}

                  {/* Phase 2: パフォーマンス分析 */}
                  {renderPerformanceAnalysis(endpoint)}

                  {/* Phase 2: 修復提案 */}
                  {renderRepairSuggestions(endpoint)}

                  {/* APIレスポンス */}
                  {endpoint.response && (
                    <div>
                      <span className="font-medium">レスポンス:</span>
                      <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(endpoint.response, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Phase 2: 健全性レポート */}
      {showHealthReport && healthReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-96 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">システム健全性レポート</h3>
              <button
                onClick={() => setShowHealthReport(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">全体的な健全性:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-sm ${
                    healthReport.overallHealth === 'healthy' ? 'bg-green-100 text-green-800' :
                    healthReport.overallHealth === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {healthReport.overallHealth}
                  </span>
                </div>
                <div>
                  <span className="font-medium">平均応答時間:</span>
                  <span className="ml-2">{Math.round(healthReport.summary.avgResponseTime)}ms</span>
                </div>
              </div>

              {healthReport.recommendations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">推奨事項:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {healthReport.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="text-gray-700">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 使用方法 */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-900 mb-2">使用方法</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>🎬 フローテスト:</strong> アップロード→分析の完全なフローをテスト（分析後自動削除対応）</li>
          <li>• <strong>スマートチェック:</strong> APIキー状態を考慮した最適化されたテスト</li>
          <li>• <strong>全てチェック:</strong> 全エンドポイントの基本チェック</li>
          <li>• <strong>個別チェック:</strong> 特定のエンドポイントのみをテスト</li>
          <li>• <strong>詳細表示:</strong> エラー分析、パフォーマンス分析、修復提案を確認</li>
          <li>• <strong>健全性レポート:</strong> システム全体の包括的な分析結果</li>
        </ul>
      </div>

      {/* Phase 3: アップロード→分析フローテスト結果表示 */}
      {renderFlowTestResult()}
    </div>
  );
};

export default BackendIntegrityPanel; 