import { taskQueue } from './taskQueue.js';

const sseClients = new Map();

function setupSSEConnection(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(':ok\n\n');

  const clientId = Date.now() + '-' + Math.random().toString(36).slice(2);
  sseClients.set(clientId, res);

  const heartbeartInterval = setInterval(() => {
    if (res.writableEnded) return;
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeartInterval);
    sseClients.delete(clientId);
  });

  sendInitialState(res);

  return clientId;
}

function sendInitialState(res) {
  const stats = taskQueue.getQueueStats();
  const tasks = taskQueue.getAllTasks();

  res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  res.write(`event: tasks\ndata: ${JSON.stringify(tasks)}\n\n`);
}

function broadcastEvent(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const [clientId, res] of sseClients) {
    if (res.writableEnded) {
      sseClients.delete(clientId);
      continue;
    }
    try {
      res.write(message);
    } catch (e) {
      sseClients.delete(clientId);
    }
  }
}

function setupTaskQueueEvents() {
  taskQueue.on('task-added', (taskId) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-added', task);
    broadcastStats();
  });

  taskQueue.on('task-started', (taskId) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-started', task);
    broadcastStats();
  });

  taskQueue.on('task-progress', (taskId, progress) => {
    broadcastEvent('task-progress', { id: taskId, progress });
  });

  taskQueue.on('task-completed', (taskId, task) => {
    const serialized = taskQueue.serializeTask(task);
    broadcastEvent('task-completed', serialized);
    broadcastStats();
  });

  taskQueue.on('task-failed', (taskId, task) => {
    const serialized = taskQueue.serializeTask(task);
    broadcastEvent('task-failed', serialized);
    broadcastStats();
  });

  taskQueue.on('task-paused', (taskId) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-paused', task);
    broadcastStats();
  });

  taskQueue.on('task-resumed', (taskId) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-resumed', task);
    broadcastStats();
  });

  taskQueue.on('task-cancelled', (taskId) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-cancelled', task);
    broadcastStats();
  });

  taskQueue.on('task-retry', (taskId, retryCount) => {
    const task = taskQueue.getTask(taskId);
    broadcastEvent('task-retry', { id: taskId, retryCount, task });
    broadcastStats();
  });

  taskQueue.on('task-timeout', (taskId, task) => {
    const serialized = taskQueue.serializeTask(task);
    broadcastEvent('task-timeout', serialized);
    broadcastStats();
  });

  taskQueue.on('queue-paused', () => {
    broadcastEvent('queue-paused', { paused: true });
  });

  taskQueue.on('queue-resumed', () => {
    broadcastEvent('queue-resumed', { paused: false });
  });
}

function broadcastStats() {
  const stats = taskQueue.getQueueStats();
  broadcastEvent('stats', stats);
}

function getClientCount() {
  return sseClients.size;
}

export {
  setupSSEConnection,
  broadcastEvent,
  setupTaskQueueEvents,
  broadcastStats,
  getClientCount,
};
