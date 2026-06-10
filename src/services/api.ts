import type {
  UploadConfig,
  Task,
  QueueStats,
  ChunkUploadInit,
  TaskOptions,
} from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  getHealth: () => request<{ status: string; uptime: number }>('/health'),

  getConfig: () => request<UploadConfig>('/config'),

  getTasks: (status?: string) =>
    request<Task[]>(status ? `/tasks?status=${status}` : '/tasks'),

  getTask: (id: string) => request<Task>(`/tasks/${id}`),

  pauseTask: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}/pause`, { method: 'POST' }),

  resumeTask: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}/resume`, { method: 'POST' }),

  cancelTask: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}/cancel`, { method: 'POST' }),

  retryTask: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}/retry`, { method: 'POST' }),

  getStats: () => request<QueueStats>('/stats'),

  pauseQueue: () =>
    request<{ success: boolean }>('/queue/pause', { method: 'POST' }),

  resumeQueue: () =>
    request<{ success: boolean }>('/queue/resume', { method: 'POST' }),

  validateBatch: (files: { name: string; size: number }[]) =>
    request<{ valid: boolean; errors?: any[] }>('/validate/batch', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  initiateChunkUpload: (fileName: string, fileSize: number, totalChunks: number) =>
    request<ChunkUploadInit>('/upload/init', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileSize, totalChunks }),
    }),

  async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    onProgress?: (loaded: number) => void
  ): Promise<{ uploadId: string; chunkIndex: number; received: number; total: number; progress: number }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/upload/chunk/${uploadId}?chunkIndex=${chunkIndex}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(chunk);
    });
  },

  completeChunkUpload: (uploadId: string) =>
    request<{
      uploadId: string;
      fileName: string;
      originalName: string;
      filePath: string;
      fileSize: number;
      status: string;
    }>(`/upload/complete/${uploadId}`, { method: 'POST' }),

  cancelChunkUpload: (uploadId: string) =>
    request<{ success: boolean; error?: string }>(`/upload/cancel/${uploadId}`, {
      method: 'POST',
    }),

  getUploadStatus: (uploadId: string) =>
    request<{
      uploadId: string;
      fileName: string;
      status: string;
      received: number;
      total: number;
      progress: number;
    }>(`/upload/status/${uploadId}`),

  processCompress: (uploadId: string, options?: TaskOptions) =>
    request<{ taskId: string; status: string }>('/process/compress', {
      method: 'POST',
      body: JSON.stringify({ uploadId, options }),
    }),

  processConvert: (uploadId: string, format: string, options?: TaskOptions) =>
    request<{ taskId: string; status: string }>('/process/convert', {
      method: 'POST',
      body: JSON.stringify({ uploadId, format, options }),
    }),

  processResize: (uploadId: string, resize: any, options?: TaskOptions) =>
    request<{ taskId: string; status: string }>('/process/resize', {
      method: 'POST',
      body: JSON.stringify({ uploadId, resize, options }),
    }),

  processBatch: (uploadIds: string[], taskType: string, options?: TaskOptions) =>
    request<{ taskIds: any[]; total: number }>('/process/batch', {
      method: 'POST',
      body: JSON.stringify({ uploadIds, taskType, options }),
    }),

  downloadFile: (fileName: string) => {
    const link = document.createElement('a');
    link.href = `${API_BASE}/download/${fileName}`;
    link.download = fileName;
    link.click();
  },

  batchDownload: (taskIds: string[]) =>
    request<{ batchId: string; zipPath: string; fileCount: number; failedTasks: any[]; size: number }>(
      '/batch/download',
      {
        method: 'POST',
        body: JSON.stringify({ taskIds }),
      }
    ),

  getBatchDownloadUrl: (batchId: string) =>
    `${API_BASE}/batch/download/${batchId}`,

  clearCompletedTasks: () =>
    request<{ success: boolean }>('/tasks/clear', { method: 'DELETE' }),
};

export default api;
