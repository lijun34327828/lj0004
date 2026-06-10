import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { ensureDir } from './uploadHandler.js';

async function createBatchZip(taskIds, taskQueue) {
  const batchId = uuidv4();
  const zipPath = path.join(config.outputDir, `batch-${batchId}.zip`);

  await ensureDir(config.outputDir);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  let includedCount = 0;
  const failedTasks = [];

  for (const taskId of taskIds) {
    const task = taskQueue.tasks.get(taskId);
    if (!task || task.status !== 'completed' || !task.result) {
      failedTasks.push({ id: taskId, reason: 'Task not completed' });
      continue;
    }

    const filePath = task.result.outputPath;
    if (!filePath) {
      failedTasks.push({ id: taskId, reason: 'No output file' });
      continue;
    }

    try {
      await fs.promises.access(filePath);
      archive.file(filePath, { name: task.result.fileName || path.basename(filePath) });
      includedCount++;
    } catch (e) {
      failedTasks.push({ id: taskId, reason: 'File not found' });
    }
  }

  await archive.finalize();

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      resolve({
        batchId,
        zipPath,
        fileCount: includedCount,
        failedTasks,
        size: archive.pointer(),
      });
    });

    output.on('error', reject);
  });
}

function streamZipFile(res, zipPath, fileName) {
  const stat = fs.statSync(zipPath);

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName || 'processed-images.zip')}"`,
    'Content-Length': stat.size,
  });

  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);
}

export { createBatchZip, streamZipFile };
