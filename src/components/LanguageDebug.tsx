import { useTranslation } from 'react-i18next';
import i18next from 'i18next';

const LanguageDebug = () => {
  const { i18n } = useTranslation();
  
  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Language Debug Info</h3>
      <div className="space-y-1 text-xs text-gray-600">
        <p>i18next.language: {i18next.language}</p>
        <p>i18n.language: {i18n.language}</p>
        <p>navigator.language: {navigator.language}</p>
      </div>
    </div>
  );
};

export default LanguageDebug;