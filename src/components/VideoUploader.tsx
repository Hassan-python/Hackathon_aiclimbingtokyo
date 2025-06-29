import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { VideoInfo } from '../types';
import { uploadVideo } from '../api/analysisService';
import { useTranslation } from 'react-i18next';

interface VideoUploaderProps {
  onVideoUploaded: (videoInfo: VideoInfo) => void;
}

const VideoUploader = ({ onVideoUploaded }: VideoUploaderProps) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        resolve(video.duration);
        video.remove();
      };
      
      video.onerror = () => {
        reject(t('uploader.error.generic'));
        video.remove();
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFile = async (file: File) => {
    setError(null);
    setUploadProgress(0);
    
    if (!file.type.startsWith('video/')) {
      setError(t('uploader.error.videoOnly'));
      return;
    }
    
    try {
      const duration = await getVideoDuration(file);
      
      if (duration >= 6) {
        setError(t('uploader.error.duration'));
        return;
      }
      
      setIsLoading(true);
      
      const videoInfo = await uploadVideo(file, (progress) => {
        setUploadProgress(progress);
      });
      
      onVideoUploaded(videoInfo);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('uploader.error.generic'));
      console.error('Error loading video:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearError = () => {
    setError(null);
  };

  return (
    <div>
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center ${
          isDragging 
            ? 'border-emerald-500 bg-emerald-50' 
            : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50'
        } transition-colors cursor-pointer relative`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="video/*"
          onChange={handleFileInputChange}
        />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          {t('uploader.title')}
        </h3>
        
        <p className="mt-1 text-xs text-gray-500">
          {t('uploader.description')}
        </p>
        
        {isLoading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {uploadProgress < 100 ? t('uploader.processing') : t('uploader.complete')}
            </p>
          </div>
        )}
      </div>
      
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <X className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{t('uploader.error.title')}</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  type="button"
                  onClick={handleClearError}
                  className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
                >
                  <span className="sr-only">Close</span>
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;