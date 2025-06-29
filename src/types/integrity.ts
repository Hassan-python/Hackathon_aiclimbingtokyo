// バックエンド整合性チェック機能の型定義

export type EndpointStatus = 'success' | 'warning' | 'error' | 'checking' | 'unchecked';

export interface EndpointInfo {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  critical: boolean; // システム全体に影響するかどうか
}

export interface EndpointResult {
  name: string;
  status: EndpointStatus;
  responseTime?: number;
  lastChecked?: Date;
  response?: any;
  error?: string;
  statusCode?: number;
  // Phase 2: 拡張フィールド
  errorAnalysis?: ErrorAnalysis;
  performanceMetrics?: PerformanceMetrics;
  suggestions?: RepairSuggestion[];
}

export interface CheckResult {
  endpoint: string;
  timestamp: Date;
  status: number;
  responseTime: number;
  success: boolean;
  error?: string;
  response?: any;
  // Phase 2: 拡張フィールド
  errorAnalysis?: ErrorAnalysis;
  performanceMetrics?: PerformanceMetrics;
  suggestions?: RepairSuggestion[];
  partialSuccess?: boolean; // アップロード成功、後処理失敗などの部分的成功
  skipped?: boolean; // テストがスキップされた場合
  skipReason?: string; // スキップの理由
}

export interface IntegrityReport {
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  results: CheckResult[];
  summary: {
    total: number;
    success: number;
    warning: number;
    error: number;
  };
}

export interface EndpointConfig {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  testData?: any;
  timeout: number;
  expectedStatus: number[];
  critical: boolean;
  // Phase 2: スマートテスト設定
  requiresAuth?: boolean;
  smartTestEnabled?: boolean;
  mockDataGenerator?: () => any;
}

// Phase 2: APIキー検出
export interface ApiKeyStatus {
  geminiApiKey: boolean;
  openaiApiKey: boolean;
  openaiModel: string | null;
}

// Phase 2: エラー分析
export interface ErrorAnalysis {
  category: 'network' | 'authentication' | 'validation' | 'server' | 'timeout' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  possibleCauses: string[];
  impact: string;
}

// Phase 2: パフォーマンス分析
export interface PerformanceMetrics {
  responseTime: number;
  benchmark: {
    expected: number;
    status: 'excellent' | 'good' | 'acceptable' | 'slow' | 'critical';
  };
  trend?: {
    average: number;
    improvement: number; // 前回比較での改善率（%）
  };
}

// Phase 2: 修復提案
export interface RepairSuggestion {
  type: 'configuration' | 'authentication' | 'network' | 'data' | 'server';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  steps: string[];
  autoFixable: boolean;
  estimatedTime: string;
}

// Phase 2: スマートテストデータ生成
export interface SmartTestData {
  endpoint: string;
  data: any;
  headers?: Record<string, string>;
  description: string;
  requiresApiKey: boolean;
}

// Phase 1で使用する基本的なエンドポイント設定
export const ENDPOINT_CONFIGS: EndpointConfig[] = [
  {
    name: '/chroma-status',
    url: '/chroma-status',
    method: 'GET',
    timeout: 10000,
    expectedStatus: [200],
    critical: true,
    requiresAuth: false,
    smartTestEnabled: true
  },
  {
    name: '/upload-full-video',
    url: '/upload-full-video',
    method: 'POST',
    timeout: 30000,
    expectedStatus: [200],
    critical: true,
    requiresAuth: false,
    smartTestEnabled: true
  },
  {
    name: '/analyze',
    url: '/analyze',
    method: 'POST',
    timeout: 30000,
    expectedStatus: [200],
    critical: false,
    requiresAuth: true,
    smartTestEnabled: true
  },
  {
    name: '/analyze-range',
    url: '/analyze-range',
    method: 'POST',
    timeout: 30000,
    expectedStatus: [200],
    critical: false,
    requiresAuth: true,
    smartTestEnabled: true
  },
  {
    name: '/logs',
    url: '/logs',
    method: 'GET',
    timeout: 10000,
    expectedStatus: [200],
    critical: false,
    requiresAuth: false,
    smartTestEnabled: true
  }
];

// Phase 2: パフォーマンスベンチマーク
export const PERFORMANCE_BENCHMARKS: Record<string, number> = {
  '/chroma-status': 1000,      // 1秒以内
  '/upload-full-video': 5000,  // 5秒以内（軽量テスト）
  '/analyze': 10000,           // 10秒以内
  '/analyze-range': 10000,     // 10秒以内
  '/logs': 2000                // 2秒以内
};

// Phase 3: 自動修復機能の型定義

// 修復可能な問題
export interface RepairableIssue {
  id: string;
  type: 'api_key' | 'environment' | 'configuration' | 'data_format' | 'network' | 'server';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  endpoint: string;
  autoFixable: boolean;
  estimatedTime: number; // 分
  detectedAt: Date;
  relatedError?: ErrorAnalysis;
}

// 自動修復提案
export interface AutoRepairSuggestion {
  issueId: string;
  action: 'configure' | 'update' | 'reset' | 'validate' | 'regenerate' | 'retry';
  title: string;
  description: string;
  parameters: Record<string, any>;
  confirmationRequired: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedTime: number; // 分
  steps: string[];
  rollbackPossible: boolean;
}

// 修復結果
export interface RepairResult {
  issueId: string;
  suggestionId: string;
  success: boolean;
  appliedAt: Date;
  timeTaken: number; // 秒
  changes: RepairChange[];
  error?: string;
  rollbackData?: any;
}

// 修復変更
export interface RepairChange {
  type: 'config' | 'data' | 'environment' | 'cache';
  target: string;
  oldValue?: any;
  newValue: any;
  reversible: boolean;
}

// 自動修復エンジン
export interface AutoRepairEngine {
  detectIssues: () => Promise<RepairableIssue[]>;
  suggestFixes: (issues: RepairableIssue[]) => Promise<AutoRepairSuggestion[]>;
  applyFix: (suggestion: AutoRepairSuggestion) => Promise<RepairResult>;
  validateFix: (result: RepairResult) => Promise<boolean>;
  rollbackFix: (result: RepairResult) => Promise<boolean>;
  getRepairHistory: () => Promise<RepairResult[]>;
}

// Phase 3: リアルタイム監視の型定義

// アラート条件
export interface AlertCondition {
  id: string;
  name: string;
  metric: 'response_time' | 'error_rate' | 'availability' | 'success_rate';
  threshold: number;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  duration: number; // 継続時間（秒）
  enabled: boolean;
  endpoints: string[]; // 空の場合は全エンドポイント
  createdAt: Date;
}

// システムメトリクス
export interface SystemMetrics {
  timestamp: Date;
  uptime: number; // 秒
  errorRate: number; // 0-1
  avgResponseTime: number; // ms
  peakResponseTime: number; // ms
  requestCount: number;
  successCount: number;
  endpointMetrics: Record<string, EndpointMetrics>;
}

// エンドポイント別メトリクス
export interface EndpointMetrics {
  endpoint: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  lastChecked: Date;
  availability: number; // 0-1
}

// アラート
export interface Alert {
  id: string;
  conditionId: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  endpoint?: string;
  currentValue: number;
  threshold: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

// リアルタイム監視システム
export interface RealtimeMonitor {
  startMonitoring: (interval: number) => void;
  stopMonitoring: () => void;
  isMonitoring: () => boolean;
  addAlert: (condition: AlertCondition) => Promise<void>;
  removeAlert: (conditionId: string) => Promise<void>;
  getAlerts: () => Promise<Alert[]>;
  acknowledgeAlert: (alertId: string, acknowledgedBy: string) => Promise<void>;
  getMetrics: () => Promise<SystemMetrics>;
  getMetricsHistory: (timeRange: TimeRange) => Promise<SystemMetrics[]>;
}

// Phase 3: 高度なテストシナリオの型定義

// テストデータ
export interface TestData {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: any;
  files?: File[];
  metadata: {
    description: string;
    realistic: boolean;
    requiresAuth: boolean;
    expectedStatus: number[];
    tags: string[];
  };
}

// バリデーションルール
export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom';
  value?: any;
  message: string;
}

// バリデーション結果
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// バリデーションエラー
export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  actualValue?: any;
  expectedValue?: any;
}

// バリデーション警告
export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// テストステップ
export interface TestStep {
  id: string;
  name: string;
  action: 'request' | 'validate' | 'wait' | 'setup' | 'cleanup' | 'assert';
  endpoint?: string;
  data?: any;
  validation?: ValidationRule[];
  timeout?: number;
  retryCount?: number;
  continueOnError?: boolean;
  expectedResult?: any;
}

// テストシナリオ
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'integration' | 'performance' | 'security' | 'custom';
  steps: TestStep[];
  expectedOutcome: ExpectedResult;
  cleanup: CleanupAction[];
  timeout: number;
  retryPolicy: RetryPolicy;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 期待される結果
export interface ExpectedResult {
  overallSuccess: boolean;
  minSuccessRate: number; // 0-1
  maxResponseTime: number; // ms
  requiredEndpoints: string[];
  forbiddenErrors: string[];
}

// クリーンアップアクション
export interface CleanupAction {
  type: 'delete' | 'reset' | 'restore' | 'clear';
  target: string;
  data?: any;
}

// リトライポリシー
export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number; // ms
  maxDelay: number; // ms
  retryableErrors: string[];
}

// シナリオ結果
export interface ScenarioResult {
  scenarioId: string;
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  stepResults: StepResult[];
  metrics: ScenarioMetrics;
  errors: ScenarioError[];
  warnings: ScenarioWarning[];
}

// ステップ結果
export interface StepResult {
  stepId: string;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  responseTime: number;
  result?: any;
  error?: string;
  retryCount: number;
}

// シナリオメトリクス
export interface ScenarioMetrics {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalTime: number; // ms
  avgStepTime: number; // ms
  successRate: number; // 0-1
}

// シナリオエラー
export interface ScenarioError {
  stepId?: string;
  type: 'setup' | 'execution' | 'validation' | 'cleanup' | 'timeout';
  message: string;
  details?: any;
  recoverable: boolean;
}

// シナリオ警告
export interface ScenarioWarning {
  stepId?: string;
  type: 'performance' | 'data' | 'configuration' | 'deprecation';
  message: string;
  suggestion?: string;
}

// テストシナリオエンジン
export interface TestScenarioEngine {
  generateRealisticData: (endpoint: string) => Promise<TestData>;
  validateTestData: (data: TestData) => Promise<ValidationResult>;
  createMockEnvironment: () => Promise<MockEnvironment>;
  runScenario: (scenario: TestScenario) => Promise<ScenarioResult>;
  getScenarios: () => Promise<TestScenario[]>;
  createScenario: (scenario: Omit<TestScenario, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TestScenario>;
  updateScenario: (id: string, updates: Partial<TestScenario>) => Promise<TestScenario>;
  deleteScenario: (id: string) => Promise<void>;
}

// モック環境
export interface MockEnvironment {
  id: string;
  name: string;
  baseUrl: string;
  endpoints: MockEndpoint[];
  globalHeaders: Record<string, string>;
  globalDelay: number; // ms
  active: boolean;
}

// モックエンドポイント
export interface MockEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  response: MockResponse;
  delay?: number; // ms
  errorRate?: number; // 0-1
}

// モックレスポンス
export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  dynamic?: boolean;
}

// Phase 3: 時間範囲
export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
} 