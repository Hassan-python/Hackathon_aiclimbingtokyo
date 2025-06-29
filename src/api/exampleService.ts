import axios from 'axios';
import i18next from 'i18next';

const API_BASE_URL = 'https://climbing-web-app-bolt-aqbqg2qzda-an.a.run.app';

// ヘッダーの設定
const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'X-Language': i18next.language || 'ja', // 現在の言語設定をヘッダーに含める
  };
};

// GETリクエストの例
export const fetchData = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/example`, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
    throw new Error('Failed to fetch data');
  }
};

// POSTリクエストの例
export const sendData = async (data: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/example`, data, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
    throw new Error('Failed to send data');
  }
};

// ファイルアップロードの例
export const uploadFile = async (file: File, onProgress?: (progress: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        ...getHeaders(),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress?.(percentCompleted);
        }
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Upload error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
    throw new Error('Failed to upload file');
  }
};