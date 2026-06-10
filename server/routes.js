import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { taskQueue, TASK_STATUS } from './taskQueue.js';
import {
  processImage,
  validateImage,
} from './imageProcessor.js';
import {
  initializeUploadDirs,
  validateFile,
  validateBatch,
  initiateChunkUpload,
  uploadChunk,
  completeChunkUpload,
  cancelChunkUpload,
  getChunkUploadStatus,
  ensureDir,
} from './uploadHandler.js';
import {
  setupSSEConnection,
  setupTaskQueueEvents,
} from './sseHandler.js';
import { createBatchZip, streamZipFile } from './batchDownload.js';

async function createImageTask(filePath, fileName, originalName, taskType, options) {
  const taskId = uuidv4();

  const ext = options.format ? `.${options.format}` : path.extname(fileName);
  const outputFileName = `${uuidv4()}${ext}`;
  const outputPath = path.join(config.outputDir, outputFileName);

  const handler = async (task, onProgress) => {
    try {
      const result = await processImage(filePath, outputPath, options, onProgress);

      const displayName = `${path.basename(originalName, path.extname(originalName))}_processed${ext}`;

      return {
        ...result,
        fileName: outputFileName,
        displayName,
        downloadUrl: `/api/download/${outputFileName}`,
      };
    } catch (error) {
      try {
        await fs.access(outputPath);
        await fs.unlink(outputPath);
      } catch (e) {
        // ignore
      }
      throw error;
    }
  };

  taskQueue.addTask({
    id: taskId,
    type: taskType,
    fileName,
    originalName,
    filePath,
    outputPath,
    options,
    handler,
  });

  return taskId;
}

function setupRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      maxBatchSize: config.maxBatchSize,
      maxFileSize: config.maxFileSize,
      chunkSize: config.chunkSize,
      supportedFormats: config.supportedFormats,
      maxConcurrentTasks: config.maxConcurrentTasks,
      taskTimeout: config.taskTimeout,
    });
  });

  app.get('/api/events', (req, res) => {
    setupSSEConnection(req, res);
  });

  app.get('/api/tasks', (req, res) => {
    const { status } = req.query;
    if (status) {
      res.json(taskQueue.getTasksByStatus(status));
    } else {
      res.json(taskQueue.getAllTasks());
    }
  });

  app.get('/api/tasks/:id', (req, res) => {
    const task = taskQueue.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  });

  app.post('/api/tasks/:id/pause', (req, res) => {
    const success = taskQueue.pauseTask(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot pause task' });
    }
    res.json({ success: true });
  });

  app.post('/api/tasks/:id/resume', (req, res) => {
    const success = taskQueue.resumeTask(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot resume task' });
    }
    res.json({ success: true });
  });

  app.post('/api/tasks/:id/cancel', (req, res) => {
    const success = taskQueue.cancelTask(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot cancel task' });
    }
    res.json({ success: true });
  });

  app.post('/api/tasks/:id/retry', (req, res) => {
    const success = taskQueue.retryTask(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot retry task' });
    }
    res.json({ success: true });
  });

  app.get('/api/stats', (req, res) => {
    res.json(taskQueue.getQueueStats());
  });

  app.post('/api/queue/pause', (req, res) => {
    taskQueue.pauseQueue();
    res.json({ success: true });
  });

  app.post('/api/queue/resume', (req, res) => {
    taskQueue.resumeQueue();
    res.json({ success: true });
  });

  app.post('/api/validate/batch', (req, res) => {
    const { files } = req.body;
    const result = validateBatch(files);
    res.json(result);
  });

  app.post('/api/upload/init', async (req, res) => {
    try {
      const { fileName, fileSize, totalChunks } = req.body;
      const result = await initiateChunkUpload(fileName, fileSize, totalChunks);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/upload/chunk/:uploadId', async (req, res) => {
    try {
      const { uploadId } = req.params;
      const { chunkIndex } = req.query;
      const chunks = [];

      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const result = await uploadChunk(uploadId, parseInt(chunkIndex), buffer, buffer.length);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/upload/complete/:uploadId', async (req, res) => {
    try {
      const { uploadId } = req.params;
      const result = await completeChunkUpload(uploadId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/upload/cancel/:uploadId', async (req, res) => {
    try {
      const { uploadId } = req.params;
      const result = await cancelChunkUpload(uploadId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/upload/status/:uploadId', (req, res) => {
    const status = getChunkUploadStatus(req.params.uploadId);
    if (!status) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    res.json(status);
  });

  app.post('/api/process/compress', async (req, res) => {
    try {
      const { uploadId, fileName, originalName, options } = req.body;

      let filePath, finalFileName, finalOriginalName;

      if (uploadId) {
        const uploadResult = await completeChunkUpload(uploadId);
        filePath = uploadResult.filePath;
        finalFileName = uploadResult.fileName;
        finalOriginalName = uploadResult.originalName;
      } else {
        return res.status(400).json({ error: 'uploadId is required' });
      }

      const validation = await validateImage(filePath);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const taskId = await createImageTask(
        filePath,
        finalFileName,
        finalOriginalName,
        'compress',
        options || {}
      );

      res.json({ taskId, status: 'queued' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/process/convert', async (req, res) => {
    try {
      const { uploadId, fileName, originalName, options, format } = req.body;

      let filePath, finalFileName, finalOriginalName;

      if (uploadId) {
        const uploadResult = await completeChunkUpload(uploadId);
        filePath = uploadResult.filePath;
        finalFileName = uploadResult.fileName;
        finalOriginalName = uploadResult.originalName;
      } else {
        return res.status(400).json({ error: 'uploadId is required' });
      }

      const validation = await validateImage(filePath);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const taskId = await createImageTask(
        filePath,
        finalFileName,
        finalOriginalName,
        'convert',
        { ...(options || {}), format }
      );

      res.json({ taskId, status: 'queued' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/process/resize', async (req, res) => {
    try {
      const { uploadId, fileName, originalName, options, resize } = req.body;

      let filePath, finalFileName, finalOriginalName;

      if (uploadId) {
        const uploadResult = await completeChunkUpload(uploadId);
        filePath = uploadResult.filePath;
        finalFileName = uploadResult.fileName;
        finalOriginalName = uploadResult.originalName;
      } else {
        return res.status(400).json({ error: 'uploadId is required' });
      }

      const validation = await validateImage(filePath);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const taskId = await createImageTask(
        filePath,
        finalFileName,
        finalOriginalName,
        'resize',
        { ...(options || {}), resize }
      );

      res.json({ taskId, status: 'queued' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/process/batch', async (req, res) => {
    try {
      const { uploadIds, taskType, options } = req.body;

      if (!uploadIds || !Array.isArray(uploadIds)) {
        return res.status(400).json({ error: 'uploadIds must be an array' });
      }

      if (uploadIds.length > config.maxBatchSize) {
        return res.status(400).json({
          error: `Batch size exceeds maximum of ${config.maxBatchSize}`,
        });
      }

      const taskIds = [];

      for (const uploadId of uploadIds) {
        try {
          const uploadResult = await completeChunkUpload(uploadId);
          const validation = await validateImage(uploadResult.filePath);

          if (!validation.valid) {
            taskIds.push({
              uploadId,
              error: validation.error,
            });
            continue;
          }

          const taskId = await createImageTask(
            uploadResult.filePath,
            uploadResult.fileName,
            uploadResult.originalName,
            taskType || 'compress',
            options || {}
          );

          taskIds.push({
            uploadId,
            taskId,
            status: 'queued',
          });
        } catch (err) {
          taskIds.push({
            uploadId,
            error: err.message,
          });
        }
      }

      res.json({ taskIds, total: taskIds.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/download/:fileName', async (req, res) => {
    try {
      const { fileName } = req.params;
      const filePath = path.join(config.outputDir, fileName);

      await fs.access(filePath);
      res.download(filePath);
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  });

  app.post('/api/batch/download', async (req, res) => {
    try {
      const { taskIds } = req.body;

      if (!taskIds || !Array.isArray(taskIds)) {
        return res.status(400).json({ error: 'taskIds must be an array' });
      }

      const result = await createBatchZip(taskIds, taskQueue);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/batch/download/:batchId', async (req, res) => {
    try {
      const { batchId } = req.params;
      const zipPath = path.join(config.outputDir, `batch-${batchId}.zip`);

      await fs.access(zipPath);
      streamZipFile(res, zipPath, `processed-images-${batchId}.zip`);
    } catch (error) {
      res.status(404).json({ error: 'Batch not found' });
    }
  });

  app.delete('/api/tasks/clear', (req, res) => {
    taskQueue.clearCompleted();
    res.json({ success: true });
  });
}

export { setupRoutes, initializeUploadDirs, setupTaskQueueEvents, createImageTask };
