import WebSocket from 'ws';
import { AnySignalMessage } from '../types/events';

/**
 * A signaling channel abstraction over WebSocket.
 * Allows subscribing to message types and handles message queuing before connection.
 */
export class SignalingChannel {
  private socket: WebSocket;
  private listeners = new Map<string, ((data: any) => void)[]>();
  private isConnected = false;
  // Queue of messages to be sent once the WebSocket connection is open
  private messageQueue: AnySignalMessage[] = [];

  constructor(serverUrl: string) {
    this.socket = new WebSocket(serverUrl);

    // Handle incoming messages from the server
    this.socket.on('message', data => {
      const parsed = JSON.parse(data.toString()) as AnySignalMessage;
      this.emit(parsed.type, parsed);
    });

    // On successful connection, mark as connected and flush queued messages
    this.socket.on('open', () => {
      this.isConnected = true;
      // Flush all messages that were queued before connection opened
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        this.socket.send(JSON.stringify(message));
      }
      this.emit('open', {});
    });

    // Forward error events
    this.socket.on('error', err => {
      this.emit('error', err);
    });

    // Handle connection close
    this.socket.on('close', () => {
      this.isConnected = false;
      this.emit('close', {});
    });
  }

  /**
   * Send a message to the server. If not connected, queue it until connection is ready.
   */
  send(message: AnySignalMessage) {
    if (this.isConnected) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Send a message only after connection is ready. Returns a Promise.
   */
  async sendWhenReady(message: AnySignalMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        this.socket.send(JSON.stringify(message));
        return resolve();
      }

      // If not yet connected, wait for 'open' or fail on 'error'
      const onOpen = () => {
        this.socket.send(JSON.stringify(message));
        this.off('open', onOpen);
        this.off('error', onError);
        resolve();
      };

      const onError = (error: any) => {
        this.off('open', onOpen);
        this.off('error', onError);
        reject(error);
      };

      this.on('open', onOpen);
      this.on('error', onError);
    });
  }

  /**
   * Subscribe to a message type (e.g., 'joined', 'newProducer', 'error').
   */
  on(type: string, callback: (data: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  /**
   * Unsubscribe from a specific message type.
   */
  off(type: string, callback: (data: any) => void) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Internal method to trigger all listeners of a given message type.
   */
  private emit(type: string, data: any) {
    const handlers = this.listeners.get(type) || [];
    for (const fn of handlers) fn(data);
  }

  /**
   * Returns whether the socket is currently connected.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
