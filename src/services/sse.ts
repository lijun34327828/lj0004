type EventCallback = (data: any) => void;

class SSEService {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private url = '/api/events';

  connect() {
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      return;
    }

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        console.log('[SSE] Connected');
        this.reconnectAttempts = 0;
        this.emit('connected', null);
      };

      this.eventSource.onerror = (error) => {
        console.error('[SSE] Error:', error);
        this.emit('error', error);

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleReconnect();
        }
      };

      this.setupDefaultListeners();
    } catch (error) {
      console.error('[SSE] Failed to connect:', error);
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSE] Max reconnect attempts reached');
      this.emit('disconnected', null);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, Math.min(delay, 30000));
  }

  private setupDefaultListeners() {
    if (!this.eventSource) return;

    const events = [
      'stats',
      'tasks',
      'task-added',
      'task-started',
      'task-progress',
      'task-completed',
      'task-failed',
      'task-paused',
      'task-resumed',
      'task-cancelled',
      'task-retry',
      'task-timeout',
      'queue-paused',
      'queue-resumed',
      'heartbeat',
    ];

    events.forEach((event) => {
      this.eventSource!.addEventListener(event, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit(event, data);
        } catch (err) {
          console.error(`[SSE] Failed to parse ${event} data:`, err);
        }
      });
    });
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[SSE] Listener error for ${event}:`, err);
        }
      });
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.reconnectAttempts = 0;
    }
  }

  isConnected() {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

export const sseService = new SSEService();
export default sseService;
