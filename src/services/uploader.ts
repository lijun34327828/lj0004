import { v4 as uuidv4 } from 'uuid';
import api from './api';
import type { FileItem } from '../types';

export interface UploadProgress {
  fileId: string;
  progress: number;
  speed?: number;
  uploadedBytes?: number;
}

export interface UploadCallbacks {
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (fileItem: FileItem) => void;
  onError?: (fileItem: FileItem, error: string) => void;
  onStatusChange?: (fileItem: FileItem) => void;
}

class ChunkUploader {
  private files: Map<string, FileItem> = new Map();
  private activeUploads: Set<string> = new Set();
  private maxConcurrentUploads = 3;
  private callbacks: UploadCallbacks = {};
  private chunkSize = 2 * 1024 * 1024;

  constructor() {}

  setConfig(config: { chunkSize?: number; maxConcurrentUploads?: number }) {
    if (config.chunkSize) this.chunkSize = config.chunkSize;
    if (config.maxConcurrentUploads) this.maxConcurrentUploads = config.maxConcurrentUploads;
  }

  setCallbacks(callbacks: UploadCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  addFile(file: File): FileItem {
    const id = uuidv4();
    const fileItem: FileItem = {
      id,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
    };
    this.files.set(id, fileItem);
    return fileItem;
  }

  addFiles(files: FileList | File[]): FileItem[] {
    const fileArray = Array.from(files);
    return fileArray.map((f) => this.addFile(f));
  }

  removeFile(fileId: string) {
    const fileItem = this.files.get(fileId);
    if (fileItem?.uploadId) {
      api.cancelChunkUpload(fileItem.uploadId).catch(() => {});
    }
    this.activeUploads.delete(fileId);
    this.files.delete(fileId);
  }

  getFile(fileId: string): FileItem | undefined {
    return this.files.get(fileId);
  }

  getAllFiles(): FileItem[] {
    return Array.from(this.files.values());
  }

  async validateFiles(fileIds?: string[]): Promise<{ valid: boolean; errors: any[] }> {
    const filesToValidate = fileIds
      ? fileIds.map((id) => this.files.get(id)!).filter(Boolean)
      : Array.from(this.files.values());

    const validationList = filesToValidate.map((f) => ({
      name: f.name,
      size: f.size,
    }));

    try {
      const result = await api.validateBatch(validationList);
      return {
        valid: result.valid,
        errors: result.errors || [],
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [{ error: error.message }],
      };
    }
  }

  async uploadFile(fileId: string): Promise<FileItem> {
    const fileItem = this.files.get(fileId);
    if (!fileItem) throw new Error('File not found');
    if (fileItem.status === 'uploading') return fileItem;
    if (fileItem.status === 'completed') return fileItem;

    fileItem.status = 'uploading';
    fileItem.progress = 0;
    this.activeUploads.add(fileId);
    this.notifyStatusChange(fileItem);

    try {
      const totalChunks = Math.ceil(fileItem.size / this.chunkSize);
      const initResult = await api.initiateChunkUpload(
        fileItem.name,
        fileItem.size,
        totalChunks
      );

      fileItem.uploadId = initResult.uploadId;

      let uploadedBytes = 0;
      const startTime = Date.now();

      for (let i = 0; i < totalChunks; i++) {
        if (fileItem.status !== 'uploading') {
          break;
        }

        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, fileItem.size);
        const chunk = fileItem.file.slice(start, end);

        await api.uploadChunk(
          initResult.uploadId,
          i,
          chunk,
          (chunkLoaded) => {
            const totalUploaded = uploadedBytes + chunkLoaded;
            const progress = Math.round((totalUploaded / fileItem.size) * 100);
            fileItem.progress = progress;

            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? totalUploaded / elapsed : 0;

            this.callbacks.onProgress?.({
              fileId,
              progress,
              speed,
              uploadedBytes: totalUploaded,
            });
          }
        );

        uploadedBytes += chunk.size;
        fileItem.progress = Math.round((uploadedBytes / fileItem.size) * 100);
      }

      if (fileItem.status !== 'uploading') {
        throw new Error('Upload cancelled');
      }

      await api.completeChunkUpload(initResult.uploadId);

      fileItem.status = 'completed';
      fileItem.progress = 100;

      this.notifyStatusChange(fileItem);
      this.callbacks.onComplete?.(fileItem);

      return fileItem;
    } catch (error: any) {
      fileItem.status = 'error';
      fileItem.error = error.message;
      this.notifyStatusChange(fileItem);
      this.callbacks.onError?.(fileItem, error.message);
      throw error;
    } finally {
      this.activeUploads.delete(fileId);
      this.processQueue();
    }
  }

  async uploadAll(fileIds?: string[]): Promise<FileItem[]> {
    const filesToUpload = fileIds
      ? fileIds.map((id) => this.files.get(id)!).filter(Boolean)
      : Array.from(this.files.values()).filter((f) => f.status !== 'completed');

    const pendingFiles = filesToUpload.filter(
      (f) => f.status === 'pending' || f.status === 'error'
    );

    pendingFiles.forEach((f) => {
      f.status = 'pending';
      f.progress = 0;
      this.notifyStatusChange(f);
    });

    this.processQueue();

    return filesToUpload;
  }

  private processQueue() {
    const pendingFiles = Array.from(this.files.values()).filter(
      (f) => f.status === 'pending'
    );

    const availableSlots = this.maxConcurrentUploads - this.activeUploads.size;

    for (let i = 0; i < availableSlots && i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      this.uploadFile(file.id).catch(() => {});
    }
  }

  cancelUpload(fileId: string) {
    const fileItem = this.files.get(fileId);
    if (!fileItem) return;

    if (fileItem.uploadId) {
      api.cancelChunkUpload(fileItem.uploadId).catch(() => {});
    }

    fileItem.status = 'pending';
    fileItem.progress = 0;
    this.activeUploads.delete(fileId);
    this.notifyStatusChange(fileItem);
  }

  retryUpload(fileId: string) {
    const fileItem = this.files.get(fileId);
    if (!fileItem) return;

    fileItem.status = 'pending';
    fileItem.error = undefined;
    fileItem.progress = 0;
    this.notifyStatusChange(fileItem);
    this.processQueue();
  }

  private notifyStatusChange(fileItem: FileItem) {
    this.callbacks.onStatusChange?.(fileItem);
  }

  clearCompleted() {
    const completedIds = Array.from(this.files.values())
      .filter((f) => f.status === 'completed')
      .map((f) => f.id);

    completedIds.forEach((id) => this.files.delete(id));
  }

  clearAll() {
    Array.from(this.files.keys()).forEach((id) => this.removeFile(id));
    this.files.clear();
    this.activeUploads.clear();
  }

  getUploadStats() {
    const files = Array.from(this.files.values());
    return {
      total: files.length,
      uploading: files.filter((f) => f.status === 'uploading').length,
      completed: files.filter((f) => f.status === 'completed').length,
      pending: files.filter((f) => f.status === 'pending').length,
      error: files.filter((f) => f.status === 'error').length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      uploadedSize: files.reduce(
        (sum, f) => sum + Math.round((f.size * f.progress) / 100),
        0
      ),
    };
  }
}

export const chunkUploader = new ChunkUploader();
export default chunkUploader;
