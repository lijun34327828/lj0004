import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: 8634,
  uploadDir: path.join(__dirname, '..', 'temp', 'uploads'),
  outputDir: path.join(__dirname, '..', 'temp', 'output'),
  taskDir: path.join(__dirname, '..', 'temp', 'tasks'),
  maxBatchSize: 50,
  maxFileSize: 50 * 1024 * 1024,
  chunkSize: 2 * 1024 * 1024,
  supportedFormats: ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'tiff'],
  maxConcurrentTasks: 3,
  taskTimeout: 300000,
  queueMaxSize: 200,
  compression: {
    quality: {
      low: 60,
      medium: 80,
      high: 92,
    },
    sizeThresholds: {
      small: 500 * 1024,
      medium: 2 * 1024 * 1024,
      large: 10 * 1024 * 1024,
    },
    dimensionThresholds: {
      small: { width: 800, height: 800 },
      medium: { width: 2000, height: 2000 },
      large: { width: 4000, height: 4000 },
    },
  },
};
