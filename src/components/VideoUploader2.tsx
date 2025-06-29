import React, { useState, useRef } from 'react';
import { Upload, X, FileVideo, Clock, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { FullVideoInfo } from '../types';
import { uploadFullVideo } from '../api/analysisService';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

interface VideoUploader2Props {
  onVideoUploaded: (videoInfo: FullVideoInfo) => void;
}

const VideoUploader2 = ({ onVideoUploaded }: VideoUploader2Props) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // ファイルサイズチェック（100MB制限 - HTTP/2対応により拡張）
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (selectedFile.size > maxSize) {
        toast.error(t('newFeature.fullUploader.errors.fileSize', { 
          currentSize: formatFileSize(selectedFile.size) 
        }));
        return;
      }
      
      // ファイル形式チェック
      if (!selectedFile.type.startsWith('video/')) {
        toast.error(t('newFeature.fullUploader.errors.fileType'));
        return;
      }
      
      handleFile(selectedFile);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
    
    // ファイルサイズチェック (100MB - HTTP/2対応により拡張)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_FILE_SIZE) {
      setError(t('newFeature.fullUploader.errors.fileSize', { 
        currentSize: formatFileSize(file.size) 
      }));
      return;
    }
    
    // ファイル形式チェック
    if (!file.type.startsWith('video/')) {
      setError(t('newFeature.fullUploader.errors.fileType'));
      return;
    }
    
    try {
      setIsLoading(true);
      
      const videoInfo = await uploadFullVideo(file, (progress) => {
        setUploadProgress(progress);
      });
      
      setSuccess(true);
      setTimeout(() => {
        onVideoUploaded(videoInfo);
      }, 500); // Brief success animation before proceeding
    } catch (error) {
      let errorMessage = t('newFeature.fullUploader.errors.uploadFailed');
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      // 特定のエラーケースに対する詳細なメッセージ
      if (errorMessage.includes('413') || errorMessage.includes('Content Too Large')) {
        errorMessage = t('newFeature.fullUploader.errors.fileSize', { 
          currentSize: formatFileSize(file.size) 
        });
      } else if (errorMessage.includes('400') || errorMessage.includes('30 seconds')) {
        errorMessage = t('newFeature.fullUploader.errors.fileSize');
      } else if (errorMessage.includes('CORS') || errorMessage.includes('Network Error')) {
        errorMessage = t('newFeature.fullUploader.errors.networkError');
      } else if (errorMessage.includes('405')) {
        errorMessage = t('newFeature.fullUploader.errors.serviceUnavailable');
      }
      
      setError(errorMessage);
      console.error('Error uploading full video:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearError = () => {
    setError(null);
  };

  const getProgressStage = () => {
    if (uploadProgress < 30) return t('newFeature.fullUploader.progress.uploading');
    if (uploadProgress < 80) return t('newFeature.fullUploader.progress.optimizing');
    if (uploadProgress < 100) return t('newFeature.fullUploader.progress.finishing');
    return t('newFeature.fullUploader.progress.complete');
  };

  return (
    <div className="space-y-4">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 transform ${
          isDragging 
            ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg' 
            : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 hover:scale-[1.01]'
        } ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'} relative overflow-hidden`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        {/* Background animation */}
        {isDragging && (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-emerald-600/20 animate-pulse"></div>
        )}
        
        <input 
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="video/*"
          onChange={handleFileInputChange}
          disabled={isLoading}
        />
        
        {/* Icon with animation */}
        <div className="relative">
          {success ? (
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 animate-bounce" />
          ) : (
            <Upload className={`mx-auto h-12 w-12 transition-all duration-300 ${
              isDragging ? 'text-emerald-500 scale-110' : 'text-gray-400'
            } ${isLoading ? 'animate-pulse' : ''}`} />
          )}
          
          {/* Success glow effect */}
          {success && (
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          )}
        </div>
        
        <h3 className={`mt-2 text-sm font-medium transition-colors duration-300 ${
          success ? 'text-emerald-700' : 'text-gray-900'
        }`}>
          {success ? t('newFeature.fullUploader.status.complete') : t('newFeature.fullUploader.title')}
        </h3>
        
        <div className="mt-1 text-xs text-gray-500 space-y-1">
          <p className={`transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {t('newFeature.fullUploader.description')}
          </p>
          <div className="flex justify-center items-center gap-4">
            <p className="flex items-center justify-center gap-2">
              <FileVideo className="h-4 w-4" />
              {t('newFeature.fullUploader.constraints.duration')}
            </p>
            <p className="flex items-center justify-center gap-2">
              <Database className="h-4 w-4" />
              {t('newFeature.fullUploader.constraints.optimization')}
            </p>
          </div>
        </div>
        
        {/* Progress section with enhanced animations */}
        {isLoading && (
          <div className="mt-4 space-y-3">
            {/* Main progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${uploadProgress}%` }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"></div>
              </div>
            </div>
            
            {/* Stage indicator */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600 font-medium animate-pulse">
                {getProgressStage()}
              </span>
              <span className="text-emerald-600 font-bold">
                {uploadProgress}%
              </span>
            </div>
            
            {/* Stage-specific icons */}
            <div className="flex justify-center space-x-4 mt-3">
              <div className={`flex items-center space-x-1 transition-all duration-300 ${
                uploadProgress < 30 ? 'text-emerald-500 scale-110' : 'text-gray-400'
              }`}>
                <Upload className="h-4 w-4" />
                <span className="text-xs">{t('newFeature.fullUploader.progress.uploading')}</span>
              </div>
              <div className={`flex items-center space-x-1 transition-all duration-300 ${
                uploadProgress >= 30 && uploadProgress < 80 ? 'text-emerald-500 scale-110' : 'text-gray-400'
              }`}>
                <Database className="h-4 w-4" />
                <span className="text-xs">{t('newFeature.fullUploader.progress.optimizing')}</span>
              </div>
              <div className={`flex items-center space-x-1 transition-all duration-300 ${
                uploadProgress >= 80 ? 'text-emerald-500 scale-110' : 'text-gray-400'
              }`}>
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs">{t('newFeature.fullUploader.progress.complete')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Enhanced error display */}
      {error && (
        <div className="animate-[slideIn_0.3s_ease-out] bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400 animate-pulse" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">{t('newFeature.common.error')}</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
            <div className="ml-auto pl-3">
              <button
                type="button"
                onClick={handleClearError}
                className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 transition-colors duration-200"
              >
                <span className="sr-only">Close</span>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="animate-[slideIn_0.3s_ease-out] bg-emerald-50 border border-emerald-200 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-emerald-500 animate-pulse" />
            <span className="ml-2 text-sm font-medium text-emerald-800">
              {t('newFeature.fullUploader.status.complete')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUploader2; 