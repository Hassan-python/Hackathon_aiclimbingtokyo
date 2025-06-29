import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Clock, Scissors, Smartphone } from 'lucide-react';
import { FullVideoInfo, VideoRange } from '../types';
import { useTranslation } from 'react-i18next';

interface VideoRangeSelectorProps {
  videoInfo: FullVideoInfo;
  onRangeSelected: (range: VideoRange) => void;
  maxRangeDuration?: number;
}

const VideoRangeSelector = ({ 
  videoInfo, 
  onRangeSelected, 
  maxRangeDuration = 3.0 
}: VideoRangeSelectorProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isMobile, setIsMobile] = useState(false);
  
  // Range selection state
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // API Base URL for video preview
  const API_BASE_URL = 'https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app';
  
  // Create full video URL
  const videoUrl = videoInfo.previewUrl.startsWith('http') 
    ? videoInfo.previewUrl 
    : `${API_BASE_URL}${videoInfo.previewUrl}`;

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    // Update range when video duration changes
    if (duration > 0) {
      // 動画の実際の長さを考慮してendTimeを設定
      const maxPossibleEndTime = Math.min(startTime + maxRangeDuration, duration);
      const newEndTime = Math.min(maxPossibleEndTime, duration);
      
      // endTimeが変更された場合のみ更新
      if (newEndTime !== endTime) {
        setEndTime(newEndTime);
        onRangeSelected({ startTime, endTime: newEndTime });
      }
    }
  }, [duration, startTime, maxRangeDuration, endTime, onRangeSelected]);

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      
      // 動画の実際の長さとmaxRangeDurationの小さい方を使用
      const actualEndTime = Math.min(maxRangeDuration, videoDuration);
      setEndTime(actualEndTime);
      
      // 初期範囲を親コンポーネントに通知
      onRangeSelected({ startTime: 0, endTime: actualEndTime });
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video loading error:', e);
    console.error('Video URL:', videoUrl);
    console.error('Video info:', videoInfo);
  };

  const handleVideoLoadStart = () => {
    console.log('Video load started:', videoUrl);
  };

  const handleVideoCanPlay = () => {
    console.log('Video can play:', videoUrl);
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleReset = () => {
    handleSeek(startTime);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Enhanced mobile-friendly range bar interaction
  const getEventPosition = (e: React.MouseEvent | React.TouchEvent): number => {
    if (!rangeRef.current || !duration) return 0;
    
    const rect = rangeRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    return percentage * duration;
  };

  const handleRangeInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const timeAtClick = getEventPosition(e);
    
    // 動画の長さを考慮して適切な範囲を設定
    const maxPossibleDuration = Math.min(maxRangeDuration, duration);
    const newStartTime = Math.max(0, Math.min(timeAtClick, duration - maxPossibleDuration));
    const newEndTime = Math.min(newStartTime + maxPossibleDuration, duration);
    
    setStartTime(newStartTime);
    setEndTime(newEndTime);
    handleSeek(newStartTime);
    onRangeSelected({ startTime: newStartTime, endTime: newEndTime });
  };

  const handleRangeHandleStart = (type: 'start' | 'end') => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(type);
  };

  // Combined mouse and touch event handlers
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !rangeRef.current || !duration) return;
      
      const rect = rangeRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const mouseX = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
      const timeAtMouse = percentage * duration;
      
      if (isDragging === 'start') {
        const newStartTime = Math.max(0, Math.min(timeAtMouse, endTime - 0.1));
        setStartTime(newStartTime);
        onRangeSelected({ startTime: newStartTime, endTime });
      } else if (isDragging === 'end') {
        // 動画の長さを考慮して最大範囲を制限
        const maxPossibleDuration = Math.min(maxRangeDuration, duration);
        const maxEndTime = Math.min(startTime + maxPossibleDuration, duration);
        const newEndTime = Math.max(startTime + 0.1, Math.min(timeAtMouse, maxEndTime));
        setEndTime(newEndTime);
        onRangeSelected({ startTime, endTime: newEndTime });
      }
    };

    const handleEnd = () => {
      setIsDragging(null);
    };

    if (isDragging) {
      // Add both mouse and touch listeners
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, startTime, endTime, duration, maxRangeDuration]);

  const startPercentage = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercentage = duration > 0 ? (endTime / duration) * 100 : 0;
  const currentPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const rangeDuration = endTime - startTime;

  return (
    <div className="space-y-4">
      {/* Mobile indicator */}
      {isMobile && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Smartphone className="h-4 w-4" />
          <span>{t('newFeature.rangeSelector.mobileOptimized')}</span>
        </div>
      )}

      {/* Video Preview - Mobile responsive */}
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <video 
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onLoadedMetadata={handleVideoLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onError={handleVideoError}
          onLoadStart={handleVideoLoadStart}
          onCanPlay={handleVideoCanPlay}
          playsInline // Important for mobile
          controls={isMobile} // Native controls on mobile for better UX
        />
      </div>

      {/* Metadata Display - Responsive layout */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
        <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'}`}>
          <span>{t('newFeature.rangeSelector.metadata.compressionRatio', { 
            ratio: videoInfo.metadata.compressionRatio.toFixed(1) 
          })}</span>
          <span>{formatFileSize(videoInfo.metadata.optimizedSize)}</span>
        </div>
      </div>

      {/* Playback Controls - Mobile optimized */}
      <div className={`flex items-center gap-4 ${isMobile ? 'justify-center' : ''}`}>
        <button
          onClick={handlePlayPause}
          className={`flex items-center justify-center ${isMobile ? 'w-16 h-16' : 'w-12 h-12'} bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors touch-manipulation`}
        >
          {isPlaying ? <Pause className={`${isMobile ? 'h-8 w-8' : 'h-6 w-6'}`} /> : <Play className={`${isMobile ? 'h-8 w-8' : 'h-6 w-6'}`} />}
        </button>
        
        <button
          onClick={handleReset}
          className={`flex items-center justify-center ${isMobile ? 'w-12 h-12' : 'w-10 h-10'} bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full transition-colors touch-manipulation`}
        >
          <RotateCcw className={`${isMobile ? 'h-6 w-6' : 'h-5 w-5'}`} />
        </button>

        <div className="flex items-center gap-2">
          <span className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-sm'}`}>{t('newFeature.rangeSelector.controls.speed')}:</span>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className={`px-2 py-1 border rounded ${isMobile ? 'text-base' : 'text-sm'} touch-manipulation`}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1.0x</option>
            <option value={1.5}>1.5x</option>
            <option value={2.0}>2.0x</option>
          </select>
        </div>
      </div>

      {/* Range Selection - Enhanced for mobile */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Scissors className="h-4 w-4" />
          <span>{t('newFeature.rangeSelector.title', { maxDuration: maxRangeDuration })}</span>
        </div>
        
        {/* Range Bar - Touch optimized */}
        <div 
          ref={rangeRef}
          className={`relative w-full bg-gray-200 rounded cursor-pointer touch-manipulation ${isMobile ? 'h-12' : 'h-8'}`}
          onMouseDown={handleRangeInteractionStart}
          onTouchStart={handleRangeInteractionStart}
        >
          {/* Full timeline */}
          <div className="absolute inset-0 rounded" />
          
          {/* Selected range */}
          <div 
            className="absolute top-0 h-full bg-emerald-400 rounded transition-all duration-200"
            style={{
              left: `${startPercentage}%`,
              width: `${endPercentage - startPercentage}%`
            }}
          />
          
          {/* Current time indicator */}
          <div 
            className={`absolute top-0 h-full bg-red-500 z-10 transition-all duration-100 ${isMobile ? 'w-1' : 'w-1'}`}
            style={{ left: `${currentPercentage}%` }}
          />
          
          {/* Start handle - Touch friendly */}
          <div 
            className={`absolute top-1/2 bg-emerald-600 border-2 border-white rounded cursor-grab active:cursor-grabbing transform -translate-y-1/2 z-20 transition-all duration-200 ${isMobile ? 'w-6 h-8' : 'w-4 h-6'} touch-manipulation`}
            style={{ left: `${startPercentage}%`, marginLeft: `${isMobile ? '-12px' : '-8px'}` }}
            onMouseDown={handleRangeHandleStart('start')}
            onTouchStart={handleRangeHandleStart('start')}
          />
          
          {/* End handle - Touch friendly */}
          <div 
            className={`absolute top-1/2 bg-emerald-600 border-2 border-white rounded cursor-grab active:cursor-grabbing transform -translate-y-1/2 z-20 transition-all duration-200 ${isMobile ? 'w-6 h-8' : 'w-4 h-6'} touch-manipulation`}
            style={{ left: `${endPercentage}%`, marginLeft: `${isMobile ? '-12px' : '-8px'}` }}
            onMouseDown={handleRangeHandleStart('end')}
            onTouchStart={handleRangeHandleStart('end')}
          />
        </div>

        {/* Time Info - Responsive layout */}
        <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'} text-sm text-gray-600`}>
          <div className={`flex ${isMobile ? 'flex-col gap-1' : 'items-center gap-4'}`}>
            <span>{t('newFeature.rangeSelector.timeInfo.start', { time: formatTime(startTime) })}</span>
            <span>{t('newFeature.rangeSelector.timeInfo.end', { time: formatTime(endTime) })}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {t('newFeature.rangeSelector.timeInfo.range', { duration: rangeDuration.toFixed(1) })}
            </span>
          </div>
          <span>{t('newFeature.rangeSelector.timeInfo.current', { time: formatTime(currentTime) })}</span>
        </div>
      </div>
    </div>
  );
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default VideoRangeSelector; 