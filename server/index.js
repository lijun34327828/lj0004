import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { setupRoutes, initializeUploadDirs, setupTaskQueueEvents } from './routes.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

setupRoutes(app);
setupTaskQueueEvents();

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
  });
});

async function startServer() {
  try {
    await initializeUploadDirs();
    console.log('Upload directories initialized');

    app.listen(config.port, () => {
      console.log(`Image processing server running on port ${config.port}`);
      console.log(`Upload directory: ${config.uploadDir}`);
      console.log(`Output directory: ${config.outputDir}`);
      console.log(`Max batch size: ${config.maxBatchSize}`);
      console.log(`Max file size: ${config.maxFileSize / 1024 / 1024}MB`);
      console.log(`Max concurrent tasks: ${config.maxConcurrentTasks}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
