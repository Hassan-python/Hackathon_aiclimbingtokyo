import { useState, lazy, Suspense, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import VideoUploader2 from './components/VideoUploader2';
import VideoRangeSelector from './components/VideoRangeSelector';
import AnalysisForm from './components/AnalysisForm';
import RangeAnalysisForm from './components/RangeAnalysisForm';
import LoadingSpinner from './components/LoadingSpinner';
import DebugPanel from './components/DebugPanel';
import BackendIntegrityPanel from './components/BackendIntegrityPanel';
import { Settings } from './components/Settings';
import LanguageDebug from './components/LanguageDebug';
import { VideoInfo, FullVideoInfo, AnalysisSettings, RangeAnalysisSettings, AnalysisResponse, AnalysisProgress, VideoRange } from './types';
import { uploadAndAnalyze, uploadFullVideoAndAnalyzeRange } from './api/analysisService';
import { useTranslation } from 'react-i18next';

const AnalysisResult = lazy(() => import('./components/AnalysisResult'));

function App() {
  const { t } = useTranslation();
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  
  // 機能切り替え用のstate
  const [useNewFeature, setUseNewFeature] = useState(false);
  
  // 既存機能用のstate
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  
  // 新機能用のstate
  const [fullVideoInfo, setFullVideoInfo] = useState<FullVideoInfo | null>(null);
  const [selectedRange, setSelectedRange] = useState<VideoRange>({ startTime: 0, endTime: 3.0 });
  
  // 共通のstate
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [currentAdvice, setCurrentAdvice] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({ stage: 'upload', progress: 0 });

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleVideoUpload = (info: VideoInfo) => {
    setVideoInfo(info);
    setAnalysisResult(null);
    setCurrentAdvice('');
  };

  const handleFullVideoUpload = (info: FullVideoInfo) => {
    setFullVideoInfo(info);
    setAnalysisResult(null);
    setCurrentAdvice('');
    // デフォルトの範囲を動画の実際の長さに基づいて設定
    const actualEndTime = Math.min(3.0, info.duration);
    setSelectedRange({ 
      startTime: 0, 
      endTime: actualEndTime
    });
  };

  const handleRangeSelection = (range: VideoRange) => {
    setSelectedRange(range);
  };

  const handleStartAnalysis = async (settings: AnalysisSettings) => {
    if (!videoInfo) {
      toast.error(t('errors.uploadVideo'));
      return;
    }
    
    setIsAnalyzing(true);
    setCurrentAdvice('');
    try {
      console.log('Starting analysis with settings:', settings);
      const result = await uploadAndAnalyze(
        videoInfo,
        settings,
        (progress: AnalysisProgress) => {
          console.log('Analysis progress:', progress);
          setAnalysisProgress(progress);
        }
      );
      setAnalysisResult(result);
      setCurrentAdvice(result.advice);
      toast.success(t('result.complete'));
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error 
        ? error.message
        : t('errors.unexpectedError');
      
      toast.error(errorMessage, {
        autoClose: 10000,
        position: isMobile ? "top-center" : "top-center",
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ stage: 'upload', progress: 0 });
    }
  };

  const handleStartRangeAnalysis = async (settings: RangeAnalysisSettings) => {
    if (!fullVideoInfo) {
      toast.error(t('newFeature.rangeAnalysis.noVideo'));
      return;
    }
    
    setIsAnalyzing(true);
    setCurrentAdvice('');
    try {
      console.log('Starting range analysis with settings:', settings);
      const result = await uploadFullVideoAndAnalyzeRange(
        fullVideoInfo,
        settings,
        (progress: AnalysisProgress) => {
          console.log('Range analysis progress:', progress);
          setAnalysisProgress(progress);
        }
      );
      setAnalysisResult(result);
      setCurrentAdvice(result.advice);
      toast.success(t('result.complete'));
    } catch (error) {
      console.error('Range analysis error:', error);
      const errorMessage = error instanceof Error 
        ? error.message
        : t('errors.unexpectedError');
      
      toast.error(errorMessage, {
        autoClose: 10000,
        position: isMobile ? "top-center" : "top-center",
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ stage: 'upload', progress: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950">
      <Header />
      
      <main className={`container mx-auto px-4 py-8 ${isMobile ? 'px-2 py-4' : ''}`}>
        {/* 機能切り替えボタン - Mobile responsive */}
        <div className="mb-6 flex justify-center">
          <div className={`bg-gray-800/80 backdrop-blur-sm rounded-lg p-1 border border-gray-700 shadow-lg ${isMobile ? 'w-full max-w-sm' : ''}`}>
            <button
              onClick={() => setUseNewFeature(false)}
              className={`${isMobile ? 'w-full' : ''} px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                !useNewFeature 
                  ? 'bg-emerald-500 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t('uploader.title')} (5{t('analysis.startTime.seconds')})
            </button>
            <button
              onClick={() => setUseNewFeature(true)}
              className={`${isMobile ? 'w-full mt-1' : ''} px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                useNewFeature 
                  ? 'bg-emerald-500 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t('newFeature.common.newFeature')}（{t('newFeature.common.fullVideoUpload')}+{t('newFeature.common.rangeSelection')}）
            </button>
          </div>
        </div>

        {/* Main content - Stack vertically on mobile */}
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-col lg:flex-row'} gap-6`}>
          <div className={`${isMobile ? 'w-full' : 'lg:w-1/2'}`}>
            {useNewFeature ? (
              <>
                <h2 className={`font-semibold mb-4 text-gray-100 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  {t('newFeature.fullUploader.title')}
                </h2>
                <VideoUploader2 onVideoUploaded={handleFullVideoUpload} />
                
                {fullVideoInfo && (
                  <div className="mt-6">
                    <h3 className={`font-semibold mb-4 text-gray-100 ${isMobile ? 'text-base' : 'text-lg'}`}>
                      {t('newFeature.common.videoPreview')}と{t('newFeature.common.rangeSelection')}
                    </h3>
                    <VideoRangeSelector 
                      videoInfo={fullVideoInfo}
                      onRangeSelected={handleRangeSelection}
                      maxRangeDuration={3.0}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className={`font-semibold mb-4 text-gray-100 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  {t('uploader.title')}
                </h2>
                <VideoUploader onVideoUploaded={handleVideoUpload} />
                
                {videoInfo && (
                  <div className="mt-6">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video 
                        src={videoInfo.url} 
                        controls 
                        className="w-full h-full object-contain"
                        playsInline // Important for mobile
                      ></video>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                      {t('analysis.duration', { duration: videoInfo.duration.toFixed(2) })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className={`${isMobile ? 'w-full' : 'lg:w-1/2'}`}>
            <div className={`${isMobile ? '' : 'sticky top-4'}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`font-semibold text-gray-100 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  {useNewFeature ? t('newFeature.rangeAnalysis.title') : t('analysis.title')}
                </h2>
                <Settings 
                  debugMode={debugMode} 
                  setDebugMode={setDebugMode}
                />
              </div>
              
              {useNewFeature ? (
                <RangeAnalysisForm
                  videoInfo={fullVideoInfo}
                  selectedRange={selectedRange}
                  onSubmit={handleStartRangeAnalysis}
                  isAnalyzing={isAnalyzing}
                  progress={analysisProgress}
                />
              ) : (
                <AnalysisForm 
                  videoInfo={videoInfo}
                  onSubmit={handleStartAnalysis}
                  isAnalyzing={isAnalyzing}
                  progress={analysisProgress}
                />
              )}
            </div>
          </div>
        </div>
        
        {/* Results section - Mobile responsive */}
        {(currentAdvice || analysisResult) && (
          <div className="mt-8">
            <hr className="border-gray-800 my-6" />
            <Suspense fallback={<LoadingSpinner />}>
              <AnalysisResult advice={currentAdvice || analysisResult?.advice || ''} />
            </Suspense>
            
            {debugMode && (
              <>
                <BackendIntegrityPanel />
                <DebugPanel 
                  geminiAnalysis={analysisResult?.geminiAnalysis}
                  sources={analysisResult?.sources || []}
                  retrievedKnowledge={analysisResult?.retrievedKnowledge}
                />
              </>
            )}
          </div>
        )}
      </main>
      
      {debugMode && <LanguageDebug />}
      
      {/* Toast configuration - Mobile optimized */}
      <ToastContainer
        position={isMobile ? "top-center" : "bottom-right"}
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        toastClassName={isMobile ? "text-sm" : ""}
        bodyClassName={isMobile ? "text-sm" : ""}
      />
    </div>
  );
}

export default App;