import { useState, useEffect, useCallback, memo } from 'react';
import { Play, LoaderIcon } from 'lucide-react';
import { VideoInfo, AnalysisSettings, AnalysisProgress } from '../types';
import { useTranslation } from 'react-i18next';

interface AnalysisFormProps {
  videoInfo: VideoInfo | null;
  onSubmit: (settings: AnalysisSettings) => void;
  isAnalyzing: boolean;
  progress: AnalysisProgress;
}

const AnalysisForm = memo(({ videoInfo, onSubmit, isAnalyzing, progress }: AnalysisFormProps) => {
  const { t } = useTranslation();
  const [problemType, setProblemType] = useState('');
  const [crux, setCrux] = useState('');
  const [startTime, setStartTime] = useState(0);
  
  useEffect(() => {
    if (videoInfo) {
      setStartTime(0);
    }
  }, [videoInfo]);
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoInfo?.gcsBlobName || !problemType.trim() || !crux.trim()) {
      return;
    }
    
    onSubmit({
      problemType: problemType.trim(),
      crux: crux.trim(),
      startTime,
      gcsBlobName: videoInfo.gcsBlobName
    });
  }, [problemType, crux, startTime, onSubmit, videoInfo]);

  const getProgressMessage = () => {
    switch (progress.stage) {
      case 'upload':
        return t('uploader.processing');
      case 'compression':
        return t('uploader.compressing');
      case 'analysis':
        return t('analysis.button.analyzing');
      default:
        return '';
    }
  };

  const isFormValid = videoInfo?.gcsBlobName && problemType.trim() && crux.trim();
  
  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6 space-y-6 shadow-lg">
      <div className="space-y-4">
        <div>
          <label htmlFor="problem-type" className="block text-sm font-medium text-gray-100 mb-2">
            {t('analysis.problemType.label')}
          </label>
          <select
            id="problem-type"
            value={problemType}
            onChange={(e) => setProblemType(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            disabled={isAnalyzing}
          >
            <option value="">{t('newFeature.rangeAnalysis.form.problemType.placeholder')}</option>
            <option value="スラブ">{t('newFeature.rangeAnalysis.form.problemType.options.slab')}</option>
            <option value="垂壁">{t('newFeature.rangeAnalysis.form.problemType.options.vertical')}</option>
            <option value="オーバーハング">{t('newFeature.rangeAnalysis.form.problemType.options.overhang')}</option>
            <option value="ルーフ">{t('newFeature.rangeAnalysis.form.problemType.options.roof')}</option>
            <option value="マントル">{t('newFeature.rangeAnalysis.form.problemType.options.mantle')}</option>
            <option value="ダイノ">{t('newFeature.rangeAnalysis.form.problemType.options.dyno')}</option>
            <option value="ランジ">{t('newFeature.rangeAnalysis.form.problemType.options.lunge')}</option>
            <option value="デッド">{t('newFeature.rangeAnalysis.form.problemType.options.deadpoint')}</option>
            <option value="その他">{t('newFeature.rangeAnalysis.form.problemType.options.other')}</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="crux" className="block text-sm font-medium text-gray-100 mb-2">
            {t('analysis.crux.label')}
            <span className="block mt-1 text-xs text-gray-300">
              {t('analysis.crux.description')}
            </span>
          </label>
          <textarea
            id="crux"
            value={crux}
            onChange={(e) => setCrux(e.target.value)}
            placeholder={t('analysis.crux.placeholder')}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 h-24 resize-none"
            disabled={isAnalyzing}
            required
          />
        </div>
        
        <div>
          <label htmlFor="start-time" className="block text-sm font-medium text-gray-100">
            {t('analysis.startTime.label')}
          </label>
          <div className="mt-1 flex items-center">
            <input
              type="range"
              id="start-time"
              min={0}
              max={videoInfo?.duration || 0}
              step={0.1}
              value={startTime}
              onChange={(e) => setStartTime(parseFloat(e.target.value))}
              className={`block w-full mr-3 bg-gray-800 ${!videoInfo ? 'opacity-50' : ''}`}
              disabled={!videoInfo}
            />
            <span className="text-sm text-gray-300 w-16 text-right">
              {startTime.toFixed(1)}{t('analysis.startTime.seconds')}
            </span>
          </div>
        </div>
        
        <div className="pt-4">
          <button
            type="submit"
            disabled={isAnalyzing || !isFormValid}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-white font-medium transition-colors ${
              isFormValid && !isAnalyzing
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-gray-700 cursor-not-allowed'
            }`}
          >
            {isAnalyzing ? (
              <>
                <LoaderIcon className="h-5 w-5 animate-spin" />
                {getProgressMessage()}
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                {t('analysis.button.start')}
              </>
            )}
          </button>
        </div>

        {isAnalyzing && (
          <div className="space-y-2">
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-300 text-center">
              {progress.progress}% - {getProgressMessage()}
            </p>
          </div>
        )}
      </div>
    </form>
  );
});

AnalysisForm.displayName = 'AnalysisForm';

export default AnalysisForm;