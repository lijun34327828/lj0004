import React from 'react';
import type { Task, TaskStatus } from '../types';

interface TaskListProps {
  tasks: Task[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDownload: (task: Task) => void;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDownload,
}) => {
  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusConfig = (status: TaskStatus) => {
    const configs: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
      pending: { label: '等待中', color: 'text-gray-600', bgColor: 'bg-gray-100' },
      processing: { label: '处理中', color: 'text-blue-600', bgColor: 'bg-blue-100' },
      paused: { label: '已暂停', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
      completed: { label: '已完成', color: 'text-green-600', bgColor: 'bg-green-100' },
      failed: { label: '失败', color: 'text-red-600', bgColor: 'bg-red-100' },
      cancelled: { label: '已取消', color: 'text-gray-500', bgColor: 'bg-gray-100' },
      timeout: { label: '超时', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    };
    return configs[status];
  };

  const getTaskTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      compress: '压缩',
      convert: '格式转换',
      resize: '调整尺寸',
    };
    return labels[type] || type;
  };

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-gray-500">暂无任务</p>
        <p className="text-sm text-gray-400 mt-1">上传图片并开始处理以查看任务列表</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <h3 className="text-sm font-medium text-gray-700">
            任务列表 ({tasks.length})
          </h3>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {tasks.map((task) => {
          const statusConfig = getStatusConfig(task.status);
          const isSelected = selectedIds.has(task.id);

          return (
            <div
              key={task.id}
              className={`
                flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0
                transition-colors
                ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(task.id)}
                className="w-4 h-4 text-blue-600 rounded"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {task.originalName}
                  </p>
                  <span className={`
                    px-2 py-0.5 text-xs font-medium rounded-full
                    ${statusConfig.color} ${statusConfig.bgColor}
                  `}>
                    {statusConfig.label}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-600 rounded-full">
                    {getTaskTypeLabel(task.type)}
                  </span>
                </div>

                {task.status === 'processing' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>处理进度</span>
                      <span>{task.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {task.result && task.status === 'completed' && (
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span>压缩: {task.result.compressionRatio}%</span>
                    <span>{formatSize(task.result.originalSize)} → {formatSize(task.result.outputSize)}</span>
                    <span>{task.result.width} × {task.result.height}</span>
                  </div>
                )}

                {task.error && (
                  <p className="text-xs text-red-500 mt-1 truncate">{task.error}</p>
                )}

                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>创建: {formatTime(task.createdAt)}</span>
                  {task.startedAt && <span>开始: {formatTime(task.startedAt)}</span>}
                  {task.completedAt && <span>完成: {formatTime(task.completedAt)}</span>}
                  {task.retries > 0 && <span className="text-orange-500">重试 {task.retries} 次</span>}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {task.status === 'pending' && (
                  <button
                    onClick={() => onPause(task.id)}
                    className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 rounded transition-colors"
                    title="暂停"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {task.status === 'paused' && (
                  <button
                    onClick={() => onResume(task.id)}
                    className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded transition-colors"
                    title="继续"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {(task.status === 'failed' || task.status === 'timeout') && (
                  <button
                    onClick={() => onRetry(task.id)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                    title="重试"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}

                {(task.status === 'pending' || task.status === 'processing' || task.status === 'paused') && (
                  <button
                    onClick={() => onCancel(task.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="取消"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {task.status === 'completed' && (
                  <button
                    onClick={() => onDownload(task)}
                    className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded transition-colors"
                    title="下载"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskList;
