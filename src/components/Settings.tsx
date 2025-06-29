import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings as SettingsIcon, Activity, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { LogManager } from '../api/analysisService';

interface SettingsProps {
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warning';
  message: string;
  endpoint?: string;
}

export const Settings = ({ 
  debugMode, 
  setDebugMode, 
}: SettingsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // LogManagerからログを取得し、リアルタイム更新を設定
  useEffect(() => {
    // 初期ログを取得
    setLogs(LogManager.getLogs());
    
    // ログの変更を監視
    const unsubscribe = LogManager.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    return unsubscribe;
  }, []);

  const clearLogs = () => {
    LogManager.clearLogs();
  };

  const getLogLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const handleToggle = () => {
    console.log('Settings button clicked, current isOpen:', isOpen);
    setIsOpen(!isOpen);
    console.log('Settings panel will be:', !isOpen ? 'open' : 'closed');
  };
  
  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="設定を開く"
      >
        <SettingsIcon className="h-5 w-5 text-gray-500" />
      </button>
      
      {/* デバッグ用の表示状態インジケーター */}
      {isOpen && (
        <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></div>
      )}
      
      {/* ポータルを使用して設定パネルをbody直下に表示 */}
      {isOpen && createPortal(
        <>
          {/* オーバーレイ */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-30" 
            style={{ zIndex: 2147483646 }}
            onClick={() => {
              console.log('Overlay clicked, closing settings panel');
              setIsOpen(false);
            }}
          />
          
          {/* 設定パネル */}
          <div 
            className="fixed top-4 right-4 w-[500px] bg-white rounded-lg shadow-2xl border-2 border-gray-300"
            style={{ 
              zIndex: 2147483647, // 最大値
              maxHeight: '80vh',
              overflow: 'hidden'
            }}
          >
            {/* ヘッダー - 閉じるボタン付き */}
            <div className="flex items-center justify-between p-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">設定</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            {/* タブヘッダー */}
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 px-4 py-3 text-sm font-medium ${
                  activeTab === 'settings'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <SettingsIcon className="h-4 w-4 inline mr-2" />
                設定
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex-1 px-4 py-3 text-sm font-medium ${
                  activeTab === 'logs'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Activity className="h-4 w-4 inline mr-2" />
                ログ ({logs.length})
              </button>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto">
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900 mb-3">デバッグ設定</h3>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-gray-700">デバッグモード</span>
                      <div className="text-xs text-gray-500 mt-1">
                        バックエンド整合性チェック機能を有効にします
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={debugMode}
                        onChange={() => {
                          console.log('Debug mode toggled:', !debugMode);
                          setDebugMode(!debugMode);
                        }}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
                    <strong>使用方法:</strong><br/>
                    1. デバッグモードをONにする<br/>
                    2. 動画をアップロードまたは分析を実行<br/>
                    3. ページ下部に「バックエンド整合性チェック」パネルが表示される
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">API呼び出しログ</h3>
                    <button
                      onClick={clearLogs}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      クリア
                    </button>
                  </div>
                  
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-4">
                        ログがありません
                        <div className="mt-1 text-gray-400">
                          動画アップロードを試すとエラーログが表示されます
                        </div>
                      </div>
                    ) : (
                      logs.map((log, index) => (
                        <div
                          key={index}
                          className={`text-xs p-2 rounded border-l-2 ${getLogLevelColor(log.level)}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{log.level.toUpperCase()}</span>
                            <span className="text-gray-500">{log.timestamp}</span>
                          </div>
                          <div className="mt-1 break-words">{log.message}</div>
                          {log.endpoint && (
                            <div className="text-gray-500 mt-1 font-mono text-xs">
                              {log.endpoint}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};