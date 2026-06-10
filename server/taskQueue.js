import { config } from './config.js';
import { EventEmitter } from 'events';

const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
};

class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.pendingQueue = [];
    this.runningTasks = new Set();
    this.maxConcurrent = config.maxConcurrentTasks;
    this.isPaused = false;
    this.taskTimeouts = new Map();
  }

  addTask(task) {
    if (this.tasks.size >= config.queueMaxSize) {
      throw new Error('Queue is full. Please wait for some tasks to complete.');
    }

    const taskId = task.id;
    this.tasks.set(taskId, {
      ...task,
      status: TASK_STATUS.PENDING,
      progress: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      retries: 0,
      maxRetries: 3,
    });

    this.pendingQueue.push(taskId);
    this.emit('task-added', taskId);
    this.processQueue();

    return taskId;
  }

  processQueue() {
    if (this.isPaused) return;
    if (this.runningTasks.size >= this.maxConcurrent) return;
    if (this.pendingQueue.length === 0) return;

    const taskId = this.pendingQueue.shift();
    const task = this.tasks.get(taskId);

    if (!task || task.status !== TASK_STATUS.PENDING) {
      this.processQueue();
      return;
    }

    this.executeTask(taskId);
  }

  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = TASK_STATUS.PROCESSING;
    task.startedAt = Date.now();
    this.runningTasks.add(taskId);
    this.emit('task-started', taskId, task);

    const timeoutId = setTimeout(() => {
      this.handleTimeout(taskId);
    }, config.taskTimeout);
    this.taskTimeouts.set(taskId, timeoutId);

    try {
      const result = await task.handler(task, (progress) => {
        const t = this.tasks.get(taskId);
        if (t && t.status === TASK_STATUS.PROCESSING) {
          t.progress = Math.min(100, Math.max(0, progress));
          this.emit('task-progress', taskId, t.progress);
        }
      });

      if (this.tasks.get(taskId)?.status === TASK_STATUS.CANCELLED) {
        return;
      }

      task.status = TASK_STATUS.COMPLETED;
      task.progress = 100;
      task.completedAt = Date.now();
      task.result = result;
      this.emit('task-completed', taskId, task);
    } catch (error) {
      if (this.tasks.get(taskId)?.status === TASK_STATUS.CANCELLED) {
        return;
      }

      task.error = error.message;
      task.retries = (task.retries || 0) + 1;

      if (task.retries < task.maxRetries) {
        task.status = TASK_STATUS.PENDING;
        this.pendingQueue.unshift(taskId);
        this.emit('task-retry', taskId, task.retries);
      } else {
        task.status = TASK_STATUS.FAILED;
        task.completedAt = Date.now();
        this.emit('task-failed', taskId, task);
      }
    } finally {
      this.clearTaskTimeout(taskId);
      this.runningTasks.delete(taskId);
      this.processQueue();
    }
  }

  handleTimeout(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== TASK_STATUS.PROCESSING) return;

    task.status = TASK_STATUS.TIMEOUT;
    task.error = 'Task timed out';
    task.completedAt = Date.now();
    this.emit('task-timeout', taskId, task);
    this.runningTasks.delete(taskId);
    this.processQueue();
  }

  clearTaskTimeout(taskId) {
    const timeoutId = this.taskTimeouts.get(taskId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.taskTimeouts.delete(taskId);
    }
  }

  pauseTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === TASK_STATUS.PENDING) {
      task.status = TASK_STATUS.PAUSED;
      const idx = this.pendingQueue.indexOf(taskId);
      if (idx > -1) this.pendingQueue.splice(idx, 1);
      this.emit('task-paused', taskId);
      return true;
    }

    return false;
  }

  resumeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== TASK_STATUS.PAUSED) return false;

    task.status = TASK_STATUS.PENDING;
    this.pendingQueue.push(taskId);
    this.emit('task-resumed', taskId);
    this.processQueue();
    return true;
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.PAUSED) {
      task.status = TASK_STATUS.CANCELLED;
      const idx = this.pendingQueue.indexOf(taskId);
      if (idx > -1) this.pendingQueue.splice(idx, 1);
      this.emit('task-cancelled', taskId);
      return true;
    }

    if (task.status === TASK_STATUS.PROCESSING) {
      task.status = TASK_STATUS.CANCELLED;
      task.error = 'Task cancelled';
      this.clearTaskTimeout(taskId);
      this.emit('task-cancelled', taskId);
      return true;
    }

    return false;
  }

  retryTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== TASK_STATUS.FAILED && task.status !== TASK_STATUS.TIMEOUT) {
      return false;
    }

    task.status = TASK_STATUS.PENDING;
    task.progress = 0;
    task.error = null;
    task.retries = 0;
    task.result = null;
    task.startedAt = null;
    task.completedAt = null;
    this.pendingQueue.push(taskId);
    this.emit('task-retry', taskId, 0);
    this.processQueue();
    return true;
  }

  getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return this.serializeTask(task);
  }

  getAllTasks() {
    return Array.from(this.tasks.values()).map(t => this.serializeTask(t));
  }

  getTasksByStatus(status) {
    return Array.from(this.tasks.values())
      .filter(t => t.status === status)
      .map(t => this.serializeTask(t));
  }

  getQueueStats() {
    const stats = {
      total: this.tasks.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      paused: 0,
      timeout: 0,
      queueSize: this.pendingQueue.length,
      maxConcurrent: this.maxConcurrent,
      isPaused: this.isPaused,
    };

    for (const task of this.tasks.values()) {
      if (stats.hasOwnProperty(task.status)) {
        stats[task.status]++;
      }
    }

    return stats;
  }

  pauseQueue() {
    this.isPaused = true;
    this.emit('queue-paused');
  }

  resumeQueue() {
    this.isPaused = false;
    this.emit('queue-resumed');
    this.processQueue();
  }

  serializeTask(task) {
    return {
      id: task.id,
      type: task.type,
      fileName: task.fileName,
      originalName: task.originalName,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      retries: task.retries,
      result: task.result,
      options: task.options,
    };
  }

  clearCompleted() {
    for (const [id, task] of this.tasks) {
      if (task.status === TASK_STATUS.COMPLETED ||
          task.status === TASK_STATUS.FAILED ||
          task.status === TASK_STATUS.CANCELLED ||
          task.status === TASK_STATUS.TIMEOUT) {
        this.tasks.delete(id);
      }
    }
  }
}

const taskQueue = new TaskQueue();
export { taskQueue, TASK_STATUS };
