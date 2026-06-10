import React from 'react';
import type { ProcessType, TaskOptions, ResizeOptions } from '../types';

interface ControlPanelProps {
  processType: ProcessType;
  onProcessTypeChange: (type: ProcessType) => void;
  options: TaskOptions;
  onOptionsChange: (options: TaskOptions) => void;
  onStartProcessing: () => void;
  isProcessing: boolean;
  uploadCount: number;
  queuePaused: boolean;
  onToggleQueue: () => void;
  onBatchDownload: () => void;
  selectedCount: number;
  onClearCompleted: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  processType,
  onProcessTypeChange,
  options,
  onOptionsChange,
  onStartProcessing,
  isProcessing,
  uploadCount,
  queuePaused,
  onToggleQueue,
  onBatchDownload,
  selectedCount,
  onClearCompleted,
}) => {
  const processTypes: { value: ProcessType; label: string; icon: string }[] = [
    { value: 'compress', label: '智能压缩', icon: '📦' },
    { value: 'convert', label: '格式转换', icon: '🔄' },
    { value: 'resize', label: '调整尺寸', icon: '📐' },
  ];

  const formatOptions = ['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'];

  const handleQualityChange = (quality: number) => {
    onOptionsChange({ ...options, quality });
  };

  const handleFormatChange = (format: string) => {
    onOptionsChange({ ...options, format });
  };

  const handleResizeChange = (resize: Partial<ResizeOptions>) => {
    onOptionsChange({
      ...options,
      resize: {
        ...(options.resize || {}),
        ...resize,
      },
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
      <h3 className="text-lg font-semibold text-gray-800">处理设置</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          处理类型
        </label>
        <div className="grid grid-cols-3 gap-2">
          {processTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onProcessTypeChange(type.value)}
              className={`
                px-3 py-2 text-sm rounded-lg border transition-all
                ${processType === type.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <span className="text-lg">{type.icon}</span>
              <p className="mt-1">{type.label}</p>
            </button>
          ))}
        </div>
      </div>

      {processType === 'compress' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            压缩质量: {options.quality || '自适应'}
          </label>
          <input
            type="range"
            min="10"
            max="100"
            value={options.quality || 80}
            onChange={(e) => handleQualityChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>低质量</span>
            <span>自适应</span>
            <span>高质量</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            提示: 使用自适应算法会根据图片尺寸和内容智能选择最佳压缩参数
          </p>
        </div>
      )}

      {(processType === 'convert' || processType === 'compress') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            输出格式
          </label>
          <div className="grid grid-cols-3 gap-2">
            {formatOptions.map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleFormatChange(fmt)}
                className={`
                  px-3 py-1.5 text-sm rounded border transition-colors
                  ${(options.format || 'jpeg') === fmt
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }
                `}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {processType === 'resize' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              调整方式
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={options.resize?.maxWidth ? 'max' : options.resize?.scale ? 'scale' : 'custom'}
              onChange={(e) => {
                if (e.target.value === 'max') {
                  onOptionsChange({
                    ...options,
                    resize: { maxWidth: 1920, maxHeight: 1080 },
                  });
                } else if (e.target.value === 'scale') {
                  onOptionsChange({
                    ...options,
                    resize: { scale: 0.5 },
                  });
                } else {
                  onOptionsChange({
                    ...options,
                    resize: { width: 800, height: 600 },
                  });
                }
              }}
            >
              <option value="max">限制最大尺寸</option>
              <option value="scale">按比例缩放</option>
              <option value="custom">自定义尺寸</option>
            </select>
          </div>

          {options.resize?.maxWidth !== undefined && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">最大宽度 (px)</label>
                <input
                  type="number"
                  value={options.resize.maxWidth || ''}
                  onChange={(e) => handleResizeChange({ maxWidth: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">最大高度 (px)</label>
                <input
                  type="number"
                  value={options.resize.maxHeight || ''}
                  onChange={(e) => handleResizeChange({ maxHeight: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {options.resize?.scale !== undefined && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                缩放比例: {Math.round((options.resize.scale || 0) * 100)}%
              </label>
              <input
                type="range"
                min="10"
                max="200"
                value={(options.resize.scale || 0.5) * 100}
                onChange={(e) => handleResizeChange({ scale: Number(e.target.value) / 100 })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {options.resize?.width !== undefined && !options.resize?.maxWidth && !options.resize?.scale && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">宽度 (px)</label>
                <input
                  type="number"
                  value={options.resize.width || ''}
                  onChange={(e) => handleResizeChange({ width: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">高度 (px)</label>
                <input
                  type="number"
                  value={options.resize.height || ''}
                  onChange={(e) => handleResizeChange({ height: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-gray-200 space-y-3">
        <button
          onClick={onStartProcessing}
          disabled={uploadCount === 0 || isProcessing}
          className={`
            w-full py-2.5 px-4 rounded-lg font-medium text-white transition-colors
            ${uploadCount === 0 || isProcessing
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }
          `}
        >
          {isProcessing ? '处理中...' : `开始处理 (${uploadCount} 个文件)`}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onToggleQueue}
            className={`
              py-2 px-3 rounded-lg text-sm font-medium transition-colors
              ${queuePaused
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              }
            `}
          >
            {queuePaused ? '▶ 恢复队列' : '⏸ 暂停队列'}
          </button>

          <button
            onClick={onBatchDownload}
            disabled={selectedCount === 0}
            className={`
              py-2 px-3 rounded-lg text-sm font-medium transition-colors
              ${selectedCount === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              }
            `}
          >
            📦 批量下载 ({selectedCount})
          </button>
        </div>

        <button
          onClick={onClearCompleted}
          className="w-full py-2 px-3 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          清除已完成任务
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
