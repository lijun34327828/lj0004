import React from 'react';
import type { QueueStats } from '../types';

interface StatsPanelProps {
  stats: QueueStats;
  uploadStats?: {
    total: number;
    uploading: number;
    completed: number;
    pending: number;
    error: number;
  };
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats, uploadStats }) => {
  const statItems = [
    { label: '总任务', value: stats.total, color: 'text-gray-700', bgColor: 'bg-gray-100' },
    { label: '等待中', value: stats.pending, color: 'text-gray-600', bgColor: 'bg-gray-100' },
    { label: '处理中', value: stats.processing, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { label: '已完成', value: stats.completed, color: 'text-green-600', bgColor: 'bg-green-100' },
    { label: '失败', value: stats.failed + stats.timeout, color: 'text-red-600', bgColor: 'bg-red-100' },
    { label: '已暂停', value: stats.paused, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">队列状态</h3>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {statItems.slice(0, 6).map((item) => (
          <div key={item.label} className="text-center p-2 rounded-lg bg-gray-50">
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">并发数</span>
          <span className="font-medium text-gray-700">
            {stats.processing} / {stats.maxConcurrent}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{
              width: `${stats.total > 0 ? (stats.processing / stats.maxConcurrent) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {stats.isPaused && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700 text-center">⚠️ 队列已暂停</p>
        </div>
      )}

      {uploadStats && uploadStats.total > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">上传状态</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-sm font-bold text-gray-700">{uploadStats.total}</p>
              <p className="text-xs text-gray-500">总数</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600">{uploadStats.uploading}</p>
              <p className="text-xs text-gray-500">上传中</p>
            </div>
            <div>
              <p className="text-sm font-bold text-green-600">{uploadStats.completed}</p>
              <p className="text-xs text-gray-500">完成</p>
            </div>
            <div>
              <p className="text-sm font-bold text-red-600">{uploadStats.error}</p>
              <p className="text-xs text-gray-500">失败</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsPanel;
