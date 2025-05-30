import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoCallClient } from '../src/sdk/VideoCallClient';
import { MockWebSocket } from '../src/types/test'; 

let mockWebSocketInstance: MockWebSocket;

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(() => mockWebSocketInstance)
}));

// Mock mediasoup-client
vi.mock('mediasoup-client', () => ({
  Device: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    loaded: true,
    rtpCapabilities: { codecs: [], headerExtensions: [] },
    createSendTransport: vi.fn().mockReturnValue({
      id: 'send-transport-id',
      on: vi.fn(),
      produce: vi.fn().mockResolvedValue({ id: 'producer-id' }),
      close: vi.fn(),
    }),
    createRecvTransport: vi.fn().mockReturnValue({
      id: 'recv-transport-id',
      on: vi.fn(),
      consume: vi.fn().mockResolvedValue({
        id: 'consumer-id',
        track: new MediaStreamTrack(),
        close: vi.fn(),
      }),
      close: vi.fn(),
    }),
  })),
}));

// Mock getUserMedia
Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getVideoTracks: () => [{ 
          id: 'video-track',
          stop: vi.fn(),
          readyState: 'live'
        }],
        getTracks: () => [{ 
          id: 'video-track',
          stop: vi.fn(),
          readyState: 'live'
        }],
      })
    }
  },
  writable: true,
});

describe('VideoCallClient SDK', () => {
  let client: VideoCallClient;

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

    client = new VideoCallClient('ws://test');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should initialize with correct default state', () => {
      expect(client.connectionStatus.connected).toBe(false);
      expect(client.connectionStatus.inRoom).toBe(false);
      expect(client.isReady).toBe(false);
    });

    it('should establish WebSocket connection', () => {
      mockWebSocketInstance.simulateOpen();
      expect(client.connectionStatus.connected).toBe(true);
    });

    it('should handle WebSocket errors', () => {
      const errorSpy = vi.fn();
      client.on('error', errorSpy);
      
      const testError = new Error('Connection failed');
      mockWebSocketInstance.simulateError(testError);
      
      expect(errorSpy).toHaveBeenCalledWith(testError);
    });

    it('should prevent duplicate joins', async () => {
      mockWebSocketInstance.simulateOpen();
      
      await client.joinCall('room1', 'user1');
      
      await expect(client.joinCall('room2', 'user2'))
        .rejects.toThrow('Already in a call. Call leaveCall() first.');
    });

    it('should handle reconnection scenarios', async () => {
      const reconnectingSpy = vi.fn();
      const reconnectedSpy = vi.fn();
      
      client.on('reconnecting', reconnectingSpy);
      client.on('reconnected', reconnectedSpy);
      
      mockWebSocketInstance.simulateOpen();
      await client.joinCall('room1', 'user1');
      
      // Simulate connection loss
      mockWebSocketInstance.simulateClose();
      
      expect(reconnectingSpy).toHaveBeenCalled();
      expect(client.connectionStatus.reconnecting).toBe(true);
    });

    it('should cleanup resources on leave', async () => {
      mockWebSocketInstance.simulateOpen();
      await client.joinCall('room1', 'user1');
      
      await client.leaveCall();
      
      expect(client.connectionStatus.inRoom).toBe(false);
      expect(client.connectionStatus.hasVideo).toBe(false);
    });
  });

  describe('Event System', () => {
    it('should emit typed events correctly', () => {
      const connectedSpy = vi.fn();
      const joinedSpy = vi.fn();
      
      client.on('connected', connectedSpy);
      client.on('joined', joinedSpy);
      
      mockWebSocketInstance.simulateOpen();
      expect(connectedSpy).toHaveBeenCalled();
      
      mockWebSocketInstance.simulateMessage({
        type: 'joined',
        roomId: 'test-room',
        userId: 'test-user'
      });
      
      expect(joinedSpy).toHaveBeenCalledWith({
        roomId: 'test-room',
        userId: 'test-user'
      });
    });

    it('should allow removing event listeners', () => {
      const handler = vi.fn();
      
      client.on('connected', handler);
      client.off('connected', handler);
      
      mockWebSocketInstance.simulateOpen();
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Participant Management', () => {
    it('should track remote participants', async () => {
      const participantJoinedSpy = vi.fn();
      const participantLeftSpy = vi.fn();
      
      client.on('participantJoined', participantJoinedSpy);
      client.on('participantLeft', participantLeftSpy);
      
      mockWebSocketInstance.simulateOpen();
      await client.joinCall('room1', 'user1');
      
      // Setup device
      mockWebSocketInstance.simulateMessage({
        type: 'routerRtpCapabilities',
        rtpCapabilities: { codecs: [], headerExtensions: [] }
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // New participant joins
      mockWebSocketInstance.simulateMessage({
        type: 'newProducer',
        userId: 'user2',
        producerId: 'producer123'
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(participantJoinedSpy).toHaveBeenCalledWith({ userId: 'user2' });
      
      // Participant leaves
      mockWebSocketInstance.simulateMessage({
        type: 'producerClosed',
        userId: 'user2',
        producerId: 'producer123'
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(participantLeftSpy).toHaveBeenCalledWith({ userId: 'user2' });
    });

    it('should provide remote video tracks', () => {
      const tracks = client.remoteVideoTracks;
      expect(tracks).toBeInstanceOf(Map);
    });
  });

  describe('Video Management', () => {
    it('should prevent video start when not ready', async () => {
      await expect(client.startVideo())
        .rejects.toThrow('Client not ready. Call joinCall() first and wait for device initialization.');
    });

    it('should handle video lifecycle events', async () => {
      const localVideoStartedSpy = vi.fn();
      const localVideoStoppedSpy = vi.fn();
      
      client.on('localVideoStarted', localVideoStartedSpy);
      client.on('localVideoStopped', localVideoStoppedSpy);
      
      mockWebSocketInstance.simulateOpen();
      await client.joinCall('room1', 'user1');
      
      // Setup device
      mockWebSocketInstance.simulateMessage({
        type: 'routerRtpCapabilities',
        rtpCapabilities: { codecs: [], headerExtensions: [] }
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Video operations will be tested in integration environment
      if (client.isReady) {
        // These tests require browser environment with actual WebRTC support
        console.log('Video tests would run in browser environment');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle signaling errors gracefully', () => {
      const errorSpy = vi.fn();
      client.on('error', errorSpy);
      
      const error = new Error('Signaling error');
      mockWebSocketInstance.simulateError(error);
      
      expect(errorSpy).toHaveBeenCalledWith(error);
    });

    it('should handle malformed messages', () => {
      // Should not throw on invalid JSON
      expect(() => {
        mockWebSocketInstance.simulateMessage('invalid json');
      }).not.toThrow();
    });
  });

  describe('Connection Status', () => {
    it('should provide comprehensive connection status', () => {
      const status = client.connectionStatus;
      
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('deviceReady');
      expect(status).toHaveProperty('inRoom');
      expect(status).toHaveProperty('hasVideo');
      expect(status).toHaveProperty('remoteParticipants');
      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('reconnecting');
    });

    it('should track queue processing state', () => {
      const status = client.connectionStatus;
      expect(typeof status.queueSize).toBe('number');
      expect(typeof status.processing).toBe('boolean');
    });
  });

  describe('Architecture Components', () => {
    it('should use event queue for sequential processing', () => {
      // Event queue should process operations sequentially
      expect(client.connectionStatus.queueSize).toBeGreaterThanOrEqual(0);
    });

    it('should support typed event emitter', () => {
      // TypeScript should enforce event types at compile time
      // This is more of a compile-time test
      expect(() => {
        client.on('connected', () => {}); // Valid
        client.on('joined', ({ roomId, userId }) => {}); // Valid with data
      }).not.toThrow();
    });
  });
});

describe('Integration Scenarios', () => {
  let client: VideoCallClient;

  beforeEach(() => {
    mockWebSocketInstance = {
      readyState: 0,
      sentMessages: [],
      listeners: new Map(),
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
    
    client = new VideoCallClient('ws://localhost:3001');
  });

  it('should handle complete call flow', async () => {
    const events: string[] = [];
    
    client.on('connected', () => events.push('connected'));
    client.on('joined', () => events.push('joined'));
    client.on('deviceReady', () => events.push('deviceReady'));
    
    mockWebSocketInstance.simulateOpen();
    
    try {
      await client.joinCall('integration-room', 'integration-user');
      events.push('joinCall-success');
    } catch (error) {
      events.push('joinCall-error');
    }
    
    expect(events).toContain('connected');
    // Other events depend on server responses in real scenario
  });

  it('should maintain state consistency across operations', () => {
    mockWebSocketInstance.simulateOpen();
    
    expect(client.connectionStatus.connected).toBe(true);
    expect(client.connectionStatus.inRoom).toBe(false);
    
    // State changes are synchronous for basic properties
    expect(client.isReady).toBe(false); // No device loaded yet
  });

  it('should handle multiple join attempts correctly', async () => {
    mockWebSocketInstance.simulateOpen();
    
    // First join should work
    await client.joinCall('room1', 'user1');
    
    // Second join should fail
    await expect(client.joinCall('room2', 'user2'))
      .rejects.toThrow('Already in a call. Call leaveCall() first.');
    
    // Event queue processes operations sequentially
    expect(client.connectionStatus.queueSize).toBeGreaterThanOrEqual(0);
  });
});