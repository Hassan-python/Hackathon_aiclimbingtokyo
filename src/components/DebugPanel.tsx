import { Bug, Book, Activity, Database, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Source } from '../types';
import { useTranslation } from 'react-i18next';
import { checkChromaStatus, getBackendLogs } from '../api/analysisService';

interface DebugPanelProps {
  geminiAnalysis: string | null;
  sources: Source[];
  retrievedKnowledge?: string;
}

interface BackendLogEntry {
  timestamp: string;
  severity: string;
  message: string;
}

const DebugPanel = ({ geminiAnalysis, sources, retrievedKnowledge }: DebugPanelProps) => {
  const { t } = useTranslation();
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const [chromaStatus, setChromaStatus] = useState<string>('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  
  // バックエンドログ関連の状態
  const [backendLogs, setBackendLogs] = useState<BackendLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const toggleSource = (index: number) => {
    if (expandedSource === index) {
      setExpandedSource(null);
    } else {
      setExpandedSource(index);
    }
  };

  const fetchChromaStatus = async () => {
    setIsCheckingStatus(true);
    setStatusError(null);
    try {
      const response = await checkChromaStatus();
      setChromaStatus(response.status);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to check ChromaDB status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const fetchBackendLogs = async () => {
    setIsLoadingLogs(true);
    setLogsError(null);
    try {
      const response = await getBackendLogs(50);
      setBackendLogs(response.logs);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : 'Failed to fetch backend logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'ERROR':
        return 'text-red-600';
      case 'WARNING':
        return 'text-yellow-600';
      case 'INFO':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  useEffect(() => {
    fetchChromaStatus();
  }, []);
  
  return (
    <div className="mt-8 space-y-6">
      {/* ChromaDB Status Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Database className="mr-2 h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-medium">{t('debug.chromaStatus.title')}</h3>
          </div>
          <button
            onClick={fetchChromaStatus}
            disabled={isCheckingStatus}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            {t('debug.chromaStatus.refresh')}
          </button>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          {isCheckingStatus ? (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm text-gray-600">{t('debug.chromaStatus.checking')}</span>
            </div>
          ) : statusError ? (
            <div className="text-red-600 text-sm">{statusError}</div>
          ) : (
            <div className="text-sm">
              {chromaStatus.startsWith('✅') ? (
                <div className="text-emerald-600">{chromaStatus}</div>
              ) : (
                <div className="text-red-600">{chromaStatus}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Section */}
      <div>
        <div className="flex items-center mb-3">
          <Activity className="mr-2 h-5 w-5 text-emerald-500" />
          <h3 className="text-lg font-medium">{t('debug.progress.title')}</h3>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-sm">{t('debug.progress.videoUpload')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-sm">{t('debug.progress.frameExtraction')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-sm">{t('debug.progress.geminiAnalysis')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-sm">{t('debug.progress.adviceGeneration')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Retrieved Knowledge */}
      {retrievedKnowledge && (
        <div>
          <div className="flex items-center mb-3">
            <Database className="mr-2 h-5 w-5 text-indigo-500" />
            <h3 className="text-lg font-medium">{t('debug.retrievedKnowledge.title')}</h3>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-800">{retrievedKnowledge}</pre>
          </div>
        </div>
      )}

      {/* Gemini Analysis */}
      {geminiAnalysis && (
        <div>
          <div className="flex items-center mb-3">
            <Bug className="mr-2 h-5 w-5 text-purple-500" />
            <h3 className="text-lg font-medium">{t('debug.geminiAnalysis.title')}</h3>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-800">{geminiAnalysis}</pre>
            
            {/* References Section */}
            {sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {t('debug.references.title')}
                </h4>
                <div className="space-y-2">
                  {sources.map((source, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-md">
                      <button
                        onClick={() => toggleSource(index)}
                        className="flex items-center justify-between w-full px-3 py-2 text-left"
                      >
                        <span className="font-medium text-sm text-gray-600">
                          {source.name}
                        </span>
                        <span className="text-gray-400">
                          {expandedSource === index ? '▲' : '▼'}
                        </span>
                      </button>
                      
                      {expandedSource === index && (
                        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
                          <pre className="whitespace-pre-wrap text-sm text-gray-600">{source.content}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Knowledge Sources */}
      {sources.length > 0 && (
        <div>
          <div className="flex items-center mb-3">
            <Book className="mr-2 h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-medium">{t('debug.sources.title')}</h3>
          </div>
          
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div key={index} className="bg-gray-50 border border-gray-200 rounded-md">
                <button
                  onClick={() => toggleSource(index)}
                  className="flex items-center justify-between w-full px-4 py-3 text-left"
                >
                  <span className="font-medium text-sm">{t('debug.sources.source')} {index + 1}: {source.name}</span>
                  <span className="text-gray-500">
                    {expandedSource === index ? '▲' : '▼'}
                  </span>
                </button>
                
                {expandedSource === index && (
                  <div className="px-4 py-3 border-t border-gray-200">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">{source.content}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backend Logs Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Bug className="mr-2 h-5 w-5 text-red-500" />
            <h3 className="text-lg font-medium">バックエンドログ</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="px-3 py-1 text-sm rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {showLogs ? '非表示' : '表示'}
            </button>
            {showLogs && (
              <button
                onClick={fetchBackendLogs}
                disabled={isLoadingLogs}
                className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                更新
              </button>
            )}
          </div>
        </div>
        
        {showLogs && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-sm text-gray-600">ログを取得中...</span>
              </div>
            ) : logsError ? (
              <div className="text-red-600 text-sm">{logsError}</div>
            ) : backendLogs.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {backendLogs.map((log, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded p-2 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{log.timestamp}</span>
                      <span className={`text-xs font-medium ${getSeverityColor(log.severity)}`}>
                        {log.severity}
                      </span>
                    </div>
                    <div className="text-gray-800 break-words">
                      {log.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center py-4">
                ログがありません
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugPanel;