import React, { useState, useCallback, useRef } from 'react';

interface UploadZoneProps {
  onFilesSelected: (files: FileList) => void;
  maxFiles?: number;
  maxFileSize?: number;
  supportedFormats?: string[];
  disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesSelected,
  maxFiles = 50,
  maxFileSize = 50 * 1024 * 1024,
  supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'tiff'],
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(false);
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = 'copy';
  }, [disabled]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        if (files.length > maxFiles) {
          alert(`单次最多上传 ${maxFiles} 个文件`);
          return;
        }
        onFilesSelected(files);
      }
    },
    [disabled, maxFiles, onFilesSelected]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        if (files.length > maxFiles) {
          alert(`单次最多上传 ${maxFiles} 个文件`);
          return;
        }
        onFilesSelected(files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [maxFiles, onFilesSelected]
  );

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
  };

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/30'}
        ${isDragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white'}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={supportedFormats.map((f) => `.${f}`).join(',')}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-4">
        <div className={`
          w-16 h-16 rounded-full flex items-center justify-center transition-colors
          ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}
        `}>
          <svg
            className={`w-8 h-8 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <div>
          <p className="text-lg font-medium text-gray-700">
            {isDragOver ? '释放文件开始上传' : '拖拽图片到此处或点击上传'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            支持 {supportedFormats.map((f) => f.toUpperCase()).join('、')} 格式
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>单次最多 {maxFiles} 个文件</span>
          <span>单文件最大 {formatSize(maxFileSize)}</span>
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/5 rounded-xl pointer-events-none" />
      )}
    </div>
  );
};

export default UploadZone;
