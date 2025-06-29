import { useState } from 'react';
import { Play, LoaderIcon } from 'lucide-react';
import { FullVideoInfo, RangeAnalysisSettings, VideoRange, AnalysisProgress } from '../types';
import { useTranslation } from 'react-i18next';

interface RangeAnalysisFormProps {
  videoInfo: FullVideoInfo | null;
  selectedRange: VideoRange;
  onSubmit: (settings: RangeAnalysisSettings) => void;
  isAnalyzing: boolean;
  progress: AnalysisProgress;
}

const RangeAnalysisForm = ({ 
  videoInfo, 
  selectedRange, 
  onSubmit, 
  isAnalyzing, 
  progress 
}: RangeAnalysisFormProps) => {
  const { t } = useTranslation();
  const [problemType, setProblemType] = useState('');
  const [crux, setCrux] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoInfo || !problemType.trim() || !crux.trim()) {
      return;
    }

    const settings: RangeAnalysisSettings = {
      problemType: problemType.trim(),
      crux: crux.trim(),
      startTime: selectedRange.startTime,
      endTime: selectedRange.endTime,
      gcsBlobName: videoInfo.gcsBlobName
    };

    onSubmit(settings);
  };

  const isFormValid = videoInfo && problemType.trim() && crux.trim();
  const rangeDuration = selectedRange.endTime - selectedRange.startTime;

  const getProgressText = () => {
    switch (progress.stage) {
      case 'upload':
        return t('newFeature.rangeAnalysis.progress.uploading');
      case 'compression':
        return t('newFeature.rangeAnalysis.progress.compression');
      case 'analysis':
        return t('newFeature.rangeAnalysis.progress.analysis');
      default:
        return '';
    }
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6 space-y-6 shadow-lg">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-100">
          {t('newFeature.rangeAnalysis.title')}
        </h3>
        <div className="text-sm text-gray-300">
          {t('newFeature.rangeAnalysis.rangeInfo', {
            start: selectedRange.startTime.toFixed(1),
            end: selectedRange.endTime.toFixed(1),
            duration: rangeDuration.toFixed(1)
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="problemType" className="block text-sm font-medium text-gray-100 mb-2">
            {t('newFeature.rangeAnalysis.form.problemType.label')}
          </label>
          <select
            id="problemType"
            value={problemType}
            onChange={(e) => setProblemType(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            disabled={isAnalyzing}
            required
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
            {t('newFeature.rangeAnalysis.form.crux.label')}
          </label>
          <textarea
            id="crux"
            value={crux}
            onChange={(e) => setCrux(e.target.value)}
            placeholder={t('newFeature.rangeAnalysis.form.crux.placeholder')}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 h-24 resize-none"
            disabled={isAnalyzing}
            required
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={!isFormValid || isAnalyzing}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-white font-medium transition-colors ${
              isFormValid && !isAnalyzing
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-gray-700 cursor-not-allowed'
            }`}
          >
            {isAnalyzing ? (
              <>
                <LoaderIcon className="h-5 w-5 animate-spin" />
                {getProgressText()}
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                {t('newFeature.rangeAnalysis.form.submit')}
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
              {progress.progress}% - {getProgressText()}
            </p>
          </div>
        )}
      </form>

      {!videoInfo && (
        <div className="text-center py-8 text-gray-300">
          {t('newFeature.rangeAnalysis.noVideo')}
        </div>
      )}
    </div>
  );
};

export default RangeAnalysisForm;