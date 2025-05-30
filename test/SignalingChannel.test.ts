import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalingChannel } from '../src/sdk/SignalingChannel';
import { MockWebSocket } from '../src/types/test';

let mockWebSocketInstance: MockWebSocket;

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(() => mockWebSocketInstance)
}));

describe('SignalingChannel', () => {
  let signaling: SignalingChannel;

  beforeEach(() => {
    mockWebSocketInstance = {
      readyState: 0,
      sentMessages: [] as string[],
      listeners: new Map<string, Function[]>(),
      
      send: vi.fn().mockImplementation(function(this: any, data: string) {
        if (this.readyState !== 1) {
          throw new Error('WebSocket is not open');
        }
        this.sentMessages.push(data);
      }),
      
      on: vi.fn().mockImplementation(function(this: any, event: string, callback: Function) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
      }),
      
      simulateOpen() {
        this.readyState = 1;
        this.listeners.get('open')?.forEach((cb: Function) => cb());
      },
      
      simulateMessage(data: any) {
        const buffer = Buffer.from(JSON.stringify(data));
        this.listeners.get('message')?.forEach((cb: Function) => cb(buffer));
      },
      
      simulateError(error: Error) {
        this.listeners.get('error')?.forEach((cb: Function) => cb(error));
      },
      
      simulateClose() {
        this.readyState = 3;
        this.listeners.get('close')?.forEach((cb: Function) => cb());
      }
    };
  });

  describe('Message Queuing', () => {
    it('queues messages before connection is open', () => {
      signaling = new SignalingChannel('ws://test');
      
      // Use any type for test flexibility
      const message = { type: 'hello', data: 'world' } as any;
      signaling.send(message);
      
      // Access private property for testing
      const messageQueue = (signaling as any).messageQueue;
      expect(messageQueue).toHaveLength(1);
      expect(messageQueue[0]).toEqual({ type: 'hello', data: 'world' });
      expect(mockWebSocketInstance.sentMessages).toHaveLength(0);
    });

    it('sends queued messages when connection opens', () => {
      signaling = new SignalingChannel('ws://test');
      
      const msg1 = { type: 'msg1' } as any;
      const msg2 = { type: 'msg2' } as any;
      
      signaling.send(msg1);
      signaling.send(msg2);
      
      const messageQueue = (signaling as any).messageQueue;
      expect(messageQueue).toHaveLength(2);
      
      mockWebSocketInstance.simulateOpen();
      
      expect(messageQueue).toHaveLength(0);
      expect(mockWebSocketInstance.sentMessages).toHaveLength(2);
      expect(mockWebSocketInstance.sentMessages[0]).toBe('{"type":"msg1"}');
      expect(mockWebSocketInstance.sentMessages[1]).toBe('{"type":"msg2"}');
    });

    it('sends messages immediately when connection is already open', () => {
      signaling = new SignalingChannel('ws://test');
      
      mockWebSocketInstance.simulateOpen();
      
      const message = { type: 'immediate' } as any;
      signaling.send(message);
      
      const messageQueue = (signaling as any).messageQueue;
      expect(messageQueue).toHaveLength(0);
      expect(mockWebSocketInstance.sentMessages).toHaveLength(1);
      expect(mockWebSocketInstance.sentMessages[0]).toBe('{"type":"immediate"}');
    });
  });

  describe('sendWhenReady', () => {
    it('resolves immediately if connection is open', async () => {
      signaling = new SignalingChannel('ws://test');
      
      mockWebSocketInstance.simulateOpen();
      
      const message = { type: 'test' } as any;
      await expect(signaling.sendWhenReady(message)).resolves.toBeUndefined();
      expect(mockWebSocketInstance.sentMessages).toHaveLength(1);
    });

    it('waits for connection to open', async () => {
      signaling = new SignalingChannel('ws://test');
      
      const message = { type: 'test' } as any;
      const promise = signaling.sendWhenReady(message);
      
      setTimeout(() => mockWebSocketInstance.simulateOpen(), 10);
      
      await expect(promise).resolves.toBeUndefined();
      expect(mockWebSocketInstance.sentMessages).toHaveLength(1);
    });

    it('rejects on connection error', async () => {
      signaling = new SignalingChannel('ws://test');
      
      const message = { type: 'test' } as any;
      const promise = signaling.sendWhenReady(message);
      
      const error = new Error('Connection failed');
      setTimeout(() => mockWebSocketInstance.simulateError(error), 10);
      
      await expect(promise).rejects.toThrow('Connection failed');
    });
  });

  describe('Event Handling', () => {
    it('emits events from WebSocket messages', () => {
      signaling = new SignalingChannel('ws://test');
      
      const mockHandler = vi.fn();
      signaling.on('test-event', mockHandler);
      
      mockWebSocketInstance.simulateMessage({ type: 'test-event', data: 'hello' });
      
      expect(mockHandler).toHaveBeenCalledWith({ type: 'test-event', data: 'hello' });
    });

    it('emits open/close/error events', () => {
      signaling = new SignalingChannel('ws://test');
      
      const openHandler = vi.fn();
      const closeHandler = vi.fn();
      const errorHandler = vi.fn();
      
      signaling.on('open', openHandler);
      signaling.on('close', closeHandler);
      signaling.on('error', errorHandler);
      
      mockWebSocketInstance.simulateOpen();
      expect(openHandler).toHaveBeenCalled();
      
      mockWebSocketInstance.simulateClose();
      expect(closeHandler).toHaveBeenCalled();
      
      const error = new Error('Test error');
      mockWebSocketInstance.simulateError(error);
      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('allows removing event listeners', () => {
      signaling = new SignalingChannel('ws://test');
      
      const handler = vi.fn();
      signaling.on('test', handler);
      signaling.off('test', handler);
      
      mockWebSocketInstance.simulateMessage({ type: 'test' });
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Connection State', () => {
    it('tracks connection state correctly', () => {
      signaling = new SignalingChannel('ws://test');
      
      expect(signaling.connected).toBe(false);
      
      mockWebSocketInstance.simulateOpen();
      expect(signaling.connected).toBe(true);
      
      mockWebSocketInstance.simulateClose();
      expect(signaling.connected).toBe(false);
    });
  });
});