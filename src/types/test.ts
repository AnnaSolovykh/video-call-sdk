import { vi } from 'vitest';

/**
 * Test-only message types for flexibility in tests
 */
export interface TestMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Mock WebSocket implementation for testing
 */
export interface MockWebSocket {
  readyState: number;
  sentMessages: string[];
  listeners: Map<string, Function[]>;
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  simulateOpen(): void;
  simulateMessage(data: unknown): void;
  simulateError(error: Error): void;
  simulateClose(): void;
}

/**
 * WebSocket ready states
 */
export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

/**
 * Test utilities type
 */
export interface TestUtils {
  createMockWebSocket(): MockWebSocket;
  createMockMediaStream(): MediaStream;
  createMockMediaStreamTrack(): MediaStreamTrack;
  waitForEvent<T>(target: EventTarget, event: string, timeout?: number): Promise<T>;
}

/**
 * Mock transport for testing
 */
export interface MockTransport {
  id: string;
  on: ReturnType<typeof vi.fn>;
  produce: ReturnType<typeof vi.fn>;
  consume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/**
 * Mock producer for testing
 */
export interface MockProducer {
  id: string;
  track: MediaStreamTrack;
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/**
 * Mock consumer for testing
 */
export interface MockConsumer {
  id: string;
  track: MediaStreamTrack;
  producerId: string;
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/**
 * Test scenario configuration
 */
export interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<void>;
  cleanup: () => Promise<void>;
  expectedEvents: string[];
  timeout: number;
}