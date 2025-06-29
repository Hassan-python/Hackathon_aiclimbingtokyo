import { LoaderIcon, Activity, Zap } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  variant?: 'default' | 'pulse' | 'bounce';
  size?: 'sm' | 'md' | 'lg';
}

const LoadingSpinner = ({ 
  message = "読み込み中...", 
  variant = 'default',
  size = 'md'
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const containerClasses = {
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-8'
  };

  const textClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const renderSpinner = () => {
    switch (variant) {
      case 'pulse':
        return (
          <div className="relative">
            <Activity className={`${sizeClasses[size]} text-emerald-500 animate-pulse`} />
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          </div>
        );
      case 'bounce':
        return (
          <div className="flex space-x-1">
            <div className={`w-2 h-2 bg-emerald-500 rounded-full animate-bounce`}></div>
            <div className={`w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-100`}></div>
            <div className={`w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-200`}></div>
          </div>
        );
      default:
        return <LoaderIcon className={`${sizeClasses[size]} text-emerald-500 animate-spin`} />;
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center ${containerClasses[size]} space-y-3`}>
      {/* Animated background */}
      <div className="relative">
        {renderSpinner()}
        {variant === 'default' && (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full animate-pulse opacity-10 scale-125"></div>
        )}
      </div>
      
      {/* Message with typing animation */}
      <div className={`${textClasses[size]} text-gray-600 font-medium text-center`}>
        <span className="inline-block animate-pulse">{message}</span>
        <span className="inline-block animate-ping ml-1">.</span>
      </div>
      
      {/* Progress bar animation */}
      <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full animate-pulse transform origin-left scale-x-0 animate-[scale-x_1.5s_ease-in-out_infinite]"></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;