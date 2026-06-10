export interface UploadConfig {
  maxBatchSize: number;
  maxFileSize: number;
  chunkSize: number;
  supportedFormats: string[];
  maxConcurrentTasks: number;
  taskTimeout: number;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'validating';
  progress: number;
  uploadId?: string;
  error?: string;
  taskId?: string;
}

export interface Task {
  id: string;
  type: 'compress' | 'convert' | 'resize';
  fileName: string;
  originalName: string;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  retries: number;
  result?: TaskResult;
  options: TaskOptions;
}

export type TaskStatus =
  | 'pending'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface TaskResult {
  outputPath: string;
  outputSize: number;
  originalSize: number;
  compressionRatio: number;
  width: number;
  height: number;
  format: string;
  quality: number;
  strategy: string;
  fileName: string;
  displayName: string;
  downloadUrl: string;
}

export interface TaskOptions {
  format?: string;
  quality?: number;
  resize?: ResizeOptions;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  maxWidth?: number;
  maxHeight?: number;
  scale?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  paused: number;
  timeout: number;
  queueSize: number;
  maxConcurrent: number;
  isPaused: boolean;
}

export interface ChunkUploadInit {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

export type ProcessType = 'compress' | 'convert' | 'resize';
