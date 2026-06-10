import { useState, useEffect, useCallback, useRef } from 'react';
import UploadZone from '../components/UploadZone';
import FileList from '../components/FileList';
import TaskList from '../components/TaskList';
import ControlPanel from '../components/ControlPanel';
import StatsPanel from '../components/StatsPanel';
import api from '../services/api';
import { sseService } from '../services/sse';
import chunkUploader from '../services/uploader';
import type { Task, QueueStats, FileItem, ProcessType, TaskOptions } from '../types';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    paused: 0,
    timeout: 0,
    queueSize: 0,
    maxConcurrent: 3,
    isPaused: false,
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [processType, setProcessType] = useState<ProcessType>('compress');
  const [taskOptions, setTaskOptions] = useState<TaskOptions>({
    format: 'jpeg',
    quality: undefined,
  });

  const handleProcessTypeChange = useCallback((type: ProcessType) => {
    setProcessType(type);
    if (type === 'resize' && !taskOptions.resize) {
      setTaskOptions((prev) => ({
        ...prev,
        resize: {
          maxWidth: 1920,
          maxHeight: 1080,
        },
      }));
    }
  }, [taskOptions.resize]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({
    maxBatchSize: 50,
    maxFileSize: 50 * 1024 * 1024,
    chunkSize: 2 * 1024 * 1024,
    supportedFormats: ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'tiff'],
    maxConcurrentTasks: 3,
    taskTimeout: 300000,
  });
  const [uploadStats, setUploadStats] = useState({
    total: 0,
    uploading: 0,
    completed: 0,
    pending: 0,
    error: 0,
    totalSize: 0,
    uploadedSize: 0,
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
        chunkUploader.setConfig({
          chunkSize: cfg.chunkSize,
          maxConcurrentUploads: 3,
        });
      } catch (e) {
        console.error('Failed to get config:', e);
      }

      try {
        const [tasksData, statsData] = await Promise.all([
          api.getTasks(),
          api.getStats(),
        ]);
        setTasks(tasksData);
        setStats(statsData);
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }

      sseService.connect();
    };

    init();

    return () => {
      sseService.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleTaskAdded = (task: Task) => {
      setTasks((prev) => [task, ...prev]);
    };

    const handleTaskProgress = (data: { id: string; progress: number }) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === data.id ? { ...t, progress: data.progress } : t
        )
      );
    };

    const handleTaskCompleted = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleTaskFailed = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleTaskPaused = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleTaskResumed = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleTaskCancelled = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleTaskTimeout = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    };

    const handleStats = (newStats: QueueStats) => {
      setStats(newStats);
    };

    sseService.on('task-added', handleTaskAdded);
    sseService.on('task-progress', handleTaskProgress);
    sseService.on('task-completed', handleTaskCompleted);
    sseService.on('task-failed', handleTaskFailed);
    sseService.on('task-paused', handleTaskPaused);
    sseService.on('task-resumed', handleTaskResumed);
    sseService.on('task-cancelled', handleTaskCancelled);
    sseService.on('task-timeout', handleTaskTimeout);
    sseService.on('stats', handleStats);

    return () => {
      sseService.off('task-added', handleTaskAdded);
      sseService.off('task-progress', handleTaskProgress);
      sseService.off('task-completed', handleTaskCompleted);
      sseService.off('task-failed', handleTaskFailed);
      sseService.off('task-paused', handleTaskPaused);
      sseService.off('task-resumed', handleTaskResumed);
      sseService.off('task-cancelled', handleTaskCancelled);
      sseService.off('task-timeout', handleTaskTimeout);
      sseService.off('stats', handleStats);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setUploadStats(chunkUploader.getUploadStats());
      setFiles(chunkUploader.getAllFiles());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handleFilesSelected = useCallback((fileList: FileList) => {
    const newFiles = chunkUploader.addFiles(fileList);
    setFiles(chunkUploader.getAllFiles());

    chunkUploader.uploadAll(newFiles.map((f) => f.id)).catch((err) => {
      console.error('Upload error:', err);
    });
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    chunkUploader.removeFile(id);
    setFiles(chunkUploader.getAllFiles());
  }, []);

  const handleRetryFile = useCallback((id: string) => {
    chunkUploader.retryUpload(id);
    setFiles(chunkUploader.getAllFiles());
  }, []);

  const handleStartProcessing = useCallback(async () => {
    const completedFiles = chunkUploader
      .getAllFiles()
      .filter((f) => f.status === 'completed' && f.uploadId);

    if (completedFiles.length === 0) {
      alert('请先上传文件');
      return;
    }

    setIsProcessing(true);

    try {
      const uploadIds = completedFiles
        .filter((f) => f.uploadId)
        .map((f) => f.uploadId!);

      let finalOptions = { ...taskOptions };
      if (processType === 'resize' && !finalOptions.resize) {
        finalOptions.resize = {
          maxWidth: 1920,
          maxHeight: 1080,
        };
      }

      const result = await api.processBatch(uploadIds, processType, finalOptions);

      chunkUploader.clearCompleted();
      setFiles(chunkUploader.getAllFiles());

      const successCount = result.taskIds.filter((t) => t.taskId).length;
      const failCount = result.taskIds.filter((t) => t.error).length;

      if (failCount > 0) {
        alert(`成功创建 ${successCount} 个任务，失败 ${failCount} 个`);
      }
    } catch (err: any) {
      alert('创建任务失败: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [processType, taskOptions]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const completedIds = tasks
      .filter((t) => t.status === 'completed')
      .map((t) => t.id);

    const allSelected = completedIds.every((id) => selectedTaskIds.has(id));

    if (allSelected) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(completedIds));
    }
  }, [tasks, selectedTaskIds]);

  const handlePauseTask = useCallback(async (id: string) => {
    try {
      await api.pauseTask(id);
    } catch (err: any) {
      alert('暂停失败: ' + err.message);
    }
  }, []);

  const handleResumeTask = useCallback(async (id: string) => {
    try {
      await api.resumeTask(id);
    } catch (err: any) {
      alert('恢复失败: ' + err.message);
    }
  }, []);

  const handleCancelTask = useCallback(async (id: string) => {
    if (!confirm('确定要取消此任务吗？')) return;
    try {
      await api.cancelTask(id);
    } catch (err: any) {
      alert('取消失败: ' + err.message);
    }
  }, []);

  const handleRetryTask = useCallback(async (id: string) => {
    try {
      await api.retryTask(id);
    } catch (err: any) {
      alert('重试失败: ' + err.message);
    }
  }, []);

  const handleDownloadTask = useCallback((task: Task) => {
    if (task.result?.downloadUrl) {
      const link = document.createElement('a');
      link.href = task.result.downloadUrl;
      link.download = task.result.displayName || task.originalName;
      link.click();
    }
  }, []);

  const handleToggleQueue = useCallback(async () => {
    try {
      if (stats.isPaused) {
        await api.resumeQueue();
      } else {
        await api.pauseQueue();
      }
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  }, [stats.isPaused]);

  const handleBatchDownload = useCallback(async () => {
    const completedTaskIds = Array.from(selectedTaskIds).filter((id) => {
      const task = tasks.find((t) => t.id === id);
      return task?.status === 'completed';
    });

    if (completedTaskIds.length === 0) {
      alert('请选择已完成的任务');
      return;
    }

    try {
      const result = await api.batchDownload(completedTaskIds);
      const downloadUrl = api.getBatchDownloadUrl(result.batchId);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `processed-images-${result.batchId}.zip`;
      link.click();
    } catch (err: any) {
      alert('打包下载失败: ' + err.message);
    }
  }, [selectedTaskIds, tasks]);

  const handleClearCompleted = useCallback(async () => {
    if (!confirm('确定要清除所有已完成的任务吗？')) return;
    try {
      await api.clearCompletedTasks();
      const tasksData = await api.getTasks();
      setTasks(tasksData);
      setSelectedTaskIds(new Set());
    } catch (err: any) {
      alert('清除失败: ' + err.message);
    }
  }, []);

  const selectedCompletedCount = Array.from(selectedTaskIds).filter((id) => {
    const task = tasks.find((t) => t.id === id);
    return task?.status === 'completed';
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">图片批量处理工具</h1>
                <p className="text-xs text-gray-500">智能压缩 · 格式转换 · 批量处理</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${sseService.isConnected() ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm text-gray-500">
                {sseService.isConnected() ? '已连接' : '未连接'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <UploadZone
              onFilesSelected={handleFilesSelected}
              maxFiles={config.maxBatchSize}
              maxFileSize={config.maxFileSize}
              supportedFormats={config.supportedFormats}
            />

            {files.length > 0 && (
              <FileList
                files={files}
                onRemove={handleRemoveFile}
                onRetry={handleRetryFile}
              />
            )}

            <TaskList
              tasks={tasks}
              selectedIds={selectedTaskIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onPause={handlePauseTask}
              onResume={handleResumeTask}
              onCancel={handleCancelTask}
              onRetry={handleRetryTask}
              onDownload={handleDownloadTask}
            />
          </div>

          <div className="space-y-6">
            <StatsPanel stats={stats} uploadStats={uploadStats.total > 0 ? uploadStats : undefined} />
            <ControlPanel
              processType={processType}
              onProcessTypeChange={handleProcessTypeChange}
              options={taskOptions}
              onOptionsChange={setTaskOptions}
              onStartProcessing={handleStartProcessing}
              isProcessing={isProcessing}
              uploadCount={
                chunkUploader.getAllFiles().filter((f) => f.status === 'completed').length
              }
              queuePaused={stats.isPaused}
              onToggleQueue={handleToggleQueue}
              onBatchDownload={handleBatchDownload}
              selectedCount={selectedCompletedCount}
              onClearCompleted={handleClearCompleted}
            />

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">使用说明</h3>
              <ul className="text-xs text-gray-500 space-y-2">
                <li className="flex gap-2">
                  <span className="text-blue-500">1.</span>
                  <span>拖拽或点击选择图片文件</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">2.</span>
                  <span>选择处理类型和参数</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">3.</span>
                  <span>点击开始处理，支持批量操作</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">4.</span>
                  <span>处理完成后可单独或批量下载</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
