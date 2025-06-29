import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AnalysisResultProps {
  advice: string;
}

const AnalysisResult = memo(({ advice }: AnalysisResultProps) => {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-center mb-4">
        <Lightbulb className="mr-2 h-6 w-6 text-amber-500" />
        <h2 className="text-xl font-semibold">{t('result.title')}</h2>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="prose prose-emerald max-w-none">
          <ReactMarkdown>{advice}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

AnalysisResult.displayName = 'AnalysisResult';

export default AnalysisResult;