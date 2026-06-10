import path from 'path';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';

const UPLOAD_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const chunkUploads = new Map();

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function initializeUploadDirs() {
  await ensureDir(config.uploadDir);
  await ensureDir(config.outputDir);
  await ensureDir(config.taskDir);
}

function validateFile(fileName, fileSize) {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  const supportedExts = [...config.supportedFormats];

  if (!supportedExts.includes(ext)) {
    return {
      valid: false,
      error: `不支持的文件格式: ${ext}。支持的格式: ${supportedExts.join(', ')}`,
    };
  }

  if (fileSize > config.maxFileSize) {
    return {
      valid: false,
      error: `文件大小超过限制。最大: ${config.maxFileSize / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

function validateBatch(files) {
  if (files.length > config.maxBatchSize) {
    return {
      valid: false,
      error: `单批次文件数量超过限制。最大: ${config.maxBatchSize} 个文件`,
    };
  }

  const results = files.map(f => validateFile(f.name, f.size));
  const invalid = results.filter(r => !r.valid);

  if (invalid.length > 0) {
    return {
      valid: false,
      errors: invalid.map((r, i) => ({ file: files[i].name, error: r.error })),
    };
  }

  return { valid: true };
}

async function initiateChunkUpload(fileName, fileSize, totalChunks) {
  const validation = validateFile(fileName, fileSize);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const uploadId = uuidv4();
  const ext = path.extname(fileName);
  const tempDir = path.join(config.uploadDir, uploadId);
  await fs.mkdir(tempDir, { recursive: true });

  chunkUploads.set(uploadId, {
    uploadId,
    fileName,
    originalName: fileName,
    fileSize,
    totalChunks,
    receivedChunks: new Set(),
    tempDir,
    status: UPLOAD_STATUS.UPLOADING,
    createdAt: Date.now(),
    ext,
  });

  return {
    uploadId,
    chunkSize: config.chunkSize,
    totalChunks,
  };
}

async function uploadChunk(uploadId, chunkIndex, chunkBuffer, chunkSize) {
  const upload = chunkUploads.get(uploadId);
  if (!upload) {
    throw new Error('Upload session not found');
  }

  if (upload.status !== UPLOAD_STATUS.UPLOADING) {
    throw new Error(`Upload is in ${upload.status} state`);
  }

  if (chunkIndex < 0 || chunkIndex >= upload.totalChunks) {
    throw new Error('Invalid chunk index');
  }

  const chunkPath = path.join(upload.tempDir, `chunk-${chunkIndex}`);
  await fs.writeFile(chunkPath, chunkBuffer);

  upload.receivedChunks.add(chunkIndex);

  const progress = Math.round((upload.receivedChunks.size / upload.totalChunks) * 100);

  return {
    uploadId,
    chunkIndex,
    received: upload.receivedChunks.size,
    total: upload.totalChunks,
    progress,
  };
}

async function completeChunkUpload(uploadId) {
  const upload = chunkUploads.get(uploadId);
  if (!upload) {
    throw new Error('Upload session not found');
  }

  if (upload.receivedChunks.size !== upload.totalChunks) {
    throw new Error('Not all chunks received');
  }

  const finalFileName = `${uuidv4()}${upload.ext}`;
  const finalPath = path.join(config.uploadDir, finalFileName);
  const writeStream = createWriteStream(finalPath);

  await new Promise((resolve, reject) => {
    let index = 0;

    const writeNext = () => {
      if (index >= upload.totalChunks) {
        writeStream.end();
        return;
      }

      const chunkPath = path.join(upload.tempDir, `chunk-${index}`);
      const readStream = createReadStream(chunkPath);

      readStream.pipe(writeStream, { end: false });
      readStream.on('end', () => {
        index++;
        writeNext();
      });
      readStream.on('error', reject);
    };

    writeNext();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  await fs.rm(upload.tempDir, { recursive: true, force: true });

  upload.status = UPLOAD_STATUS.COMPLETED;
  upload.finalPath = finalPath;
  upload.finalName = finalFileName;

  const stat = await fs.stat(finalPath);

  chunkUploads.delete(uploadId);

  return {
    uploadId,
    fileName: finalFileName,
    originalName: upload.originalName,
    filePath: finalPath,
    fileSize: stat.size,
    status: UPLOAD_STATUS.COMPLETED,
  };
}

async function cancelChunkUpload(uploadId) {
  const upload = chunkUploads.get(uploadId);
  if (!upload) {
    return { success: false, error: 'Upload session not found' };
  }

  try {
    await fs.rm(upload.tempDir, { recursive: true, force: true });
  } catch (e) {
    // ignore cleanup errors
  }

  chunkUploads.delete(uploadId);
  return { success: true };
}

function getChunkUploadStatus(uploadId) {
  const upload = chunkUploads.get(uploadId);
  if (!upload) return null;

  return {
    uploadId,
    fileName: upload.originalName,
    status: upload.status,
    received: upload.receivedChunks.size,
    total: upload.totalChunks,
    progress: Math.round((upload.receivedChunks.size / upload.totalChunks) * 100),
  };
}

async function handleDirectUpload(fileName, fileBuffer, originalName) {
  const ext = path.extname(fileName).toLowerCase();
  const finalFileName = `${uuidv4()}${ext}`;
  const finalPath = path.join(config.uploadDir, finalFileName);

  await fs.writeFile(finalPath, fileBuffer);

  return {
    fileName: finalFileName,
    originalName: originalName || fileName,
    filePath: finalPath,
    fileSize: fileBuffer.length,
  };
}

export {
  initializeUploadDirs,
  validateFile,
  validateBatch,
  initiateChunkUpload,
  uploadChunk,
  completeChunkUpload,
  cancelChunkUpload,
  getChunkUploadStatus,
  handleDirectUpload,
  ensureDir,
  UPLOAD_STATUS,
};
