import React from 'react';
import type { FileItem } from '../types';

interface FileListProps {
  files: FileItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const FileList: React.FC<FileListProps> = ({ files, onRemove, onRetry }) => {
  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  const getStatusColor = (status: FileItem['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'uploading':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      case 'validating':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusText = (status: FileItem['status']) => {
    switch (status) {
      case 'completed':
        return '上传完成';
      case 'uploading':
        return '上传中...';
      case 'error':
        return '上传失败';
      case 'validating':
        return '校验中...';
      case 'pending':
        return '等待上传';
      default:
        return status;
    }
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700">
          上传文件列表 ({files.length})
        </h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                <span className={`w-2 h-2 rounded-full ${getStatusColor(file.status)}`} />
                <span className="text-xs text-gray-500">{getStatusText(file.status)}</span>
              </div>
              {file.status === 'uploading' && (
                <div className="mt-2">
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{file.progress}%</p>
                </div>
              )}
              {file.error && (
                <p className="text-xs text-red-500 mt-1">{file.error}</p>
              )}
            </div>

            <div className="flex items-center gap-1">
              {file.status === 'error' && onRetry && (
                <button
                  onClick={() => onRetry(file.id)}
                  className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                  title="重试"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="移除"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileList;
