import { EventQueue } from '../utils/EventQueue';
import { TypedEventEmitter } from '../utils/TypedEventEmitter';
import { ConnectionStatus, VideoCallEvents } from '../types/events';
import { ConnectionManager } from './managers/ConnectionManager';
import { DeviceManager } from './managers/DeviceManager';
import { MediaManager } from './managers/MediaManager';

/**
 * Main SDK client for managing video calls.
 * Orchestrates connection, device, and media managers.
 */
export class VideoCallClient extends TypedEventEmitter<VideoCallEvents> {
  private connectionManager: ConnectionManager;
  private mediaManager: MediaManager;
  private deviceManager: DeviceManager;
  private eventQueue: EventQueue;

  constructor(serverUrl: string) {
    super();
    
    // Initialize managers
    this.connectionManager = new ConnectionManager(serverUrl);
    this.mediaManager = new MediaManager();
    this.deviceManager = new DeviceManager(this.connectionManager);
    this.eventQueue = new EventQueue();

    this.setupEventHandlers();
  }

  /**
   * Join a video call room.
   */
  async joinCall(roomId: string, userId: string): Promise<void> {
    await this.connectionManager.joinRoom(roomId, userId);
  }

  /**
   * Leave the current call and cleanup all resources.
   */
  async leaveCall(): Promise<void> {
    console.log('[VideoCallClient] Leaving call...');

    // Stop video if active
    if (this.mediaManager.hasLocalVideo) {
      await this.stopVideo();
    }

    // Cleanup all resources
    await this.cleanup();

    console.log('[VideoCallClient] Left call successfully');
  }

  /**
   * Start video capture and streaming.
   */
  async startVideo(): Promise<void> {
    return this.eventQueue.add(async () => {
      if (!this.isReady) {
        throw new Error(
          'Client not ready. Call joinCall() first and wait for device initialization.'
        );
      }

      // Create send transport if needed
      const sendTransport = await this.deviceManager.createSendTransport();
      
      // Start video through media manager
      await this.mediaManager.startVideo(sendTransport);
    });
  }

  /**
   * Stop video capture.
   */
  async stopVideo(): Promise<void> {
    await this.mediaManager.stopVideo();
  }

  /**
   * Cleanup all resources and connections.
   */
  private async cleanup(): Promise<void> {
    console.log('[VideoCallClient] Cleaning up resources...');

    await this.connectionManager.leaveRoom();
    await this.mediaManager.cleanup();
    await this.deviceManager.cleanup();
  }

  /**
   * Setup event handlers between managers.
   */
  private setupEventHandlers(): void {
    // Connection events
    this.connectionManager.on('connected', () => {
      console.log('[VideoCallClient] Connected');
      this.emit('connected');
    });

    this.connectionManager.on('disconnected', () => {
      console.log('[VideoCallClient] Disconnected');
      this.emit('disconnected');
    });

    this.connectionManager.on('joined', (data) => {
      console.log(`[VideoCallClient] Joined room: ${data.roomId}`);
      this.emit('joined', data);
    });

    this.connectionManager.on('error', (error) => {
      console.error('[VideoCallClient] Connection error:', error);
      this.emit('error', error);
    });

    this.connectionManager.on('reconnecting', () => {
      console.log('[VideoCallClient] Reconnecting...');
      this.emit('reconnecting');
    });

    this.connectionManager.on('reconnected', async () => {
      console.log('[VideoCallClient] Reconnected');
      this.emit('reconnected');
      
      // Restore video if it was active
      if (this.mediaManager.videoWasActive && this.deviceManager.sendTransportInstance) {
        await this.mediaManager.restoreVideoIfNeeded(this.deviceManager.sendTransportInstance);
      }
    });

    this.connectionManager.on('reconnectionFailed', (error) => {
      console.error('[VideoCallClient] Reconnection failed');
      this.emit('reconnectionFailed', error);
    });

    // Device initialization
    this.connectionManager.on('routerRtpCapabilities', async (data) => {
      await this.eventQueue.add(async () => {
        try {
          await this.deviceManager.initializeDevice(data.rtpCapabilities);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[VideoCallClient] Device initialization failed:', errorMessage);
        }
      });
    });

    // Device events
    this.deviceManager.on('deviceReady', () => {
      console.log('[VideoCallClient] Device ready');
      this.emit('deviceReady');
    });

    // Media events
    this.mediaManager.on('localVideoStarted', (data) => {
      console.log('[VideoCallClient] Local video started');
      this.emit('localVideoStarted', data);
    });

    this.mediaManager.on('localVideoStopped', () => {
      console.log('[VideoCallClient] Local video stopped');
      this.emit('localVideoStopped');
    });

    this.mediaManager.on('remoteVideoStarted', (data) => {
      console.log(`[VideoCallClient] Remote video started from ${data.userId}`);
      this.emit('remoteVideoStarted', data);
    });

    this.mediaManager.on('remoteVideoStopped', (data) => {
      console.log(`[VideoCallClient] Remote video stopped from ${data.userId}`);
      this.emit('remoteVideoStopped', data);
    });

    // Handle new producers
    this.connectionManager.on('newProducer', async (data) => {
      console.log(`[VideoCallClient] New producer from user ${data.userId}`);
      this.emit('participantJoined', { userId: data.userId });

      await this.eventQueue.add(async () => {
        await this.handleNewProducer(data.producerId, data.userId);
      });
    });

    // Handle producer closed
    this.connectionManager.on('producerClosed', async (data) => {
      console.log(`[VideoCallClient] Producer closed: ${data.producerId} from ${data.userId}`);
      this.emit('participantLeft', { userId: data.userId });

      await this.eventQueue.add(async () => {
        this.mediaManager.removeConsumer(data.producerId, data.userId);
      });
    });
  }

  /**
   * Handle new producer from remote participant.
   */
  private async handleNewProducer(producerId: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoCallClient] Handling new producer ${producerId} from ${userId}`);

      if (!this.deviceManager.isReady) {
        throw new Error('Device not ready for consuming');
      }

      // Create receive transport if needed
      const recvTransport = await this.deviceManager.createRecvTransport();

      // Get consumer data from signaling server
      const consumerData = await this.deviceManager.getConsumerData(producerId);

      // Create consumer through media manager
      await this.mediaManager.createConsumer(recvTransport, consumerData, producerId, userId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VideoCallClient] Failed to handle new producer:`, errorMessage);
    }
  }

  /**
   * Check if the client is ready to start media operations.
   */
  get isReady(): boolean {
    const { roomId, userId } = this.connectionManager.currentRoom;
    return !!(this.deviceManager.isReady && roomId && userId);
  }

  /**
   * Get current connection status.
   */
  get connectionStatus(): ConnectionStatus {
    const { roomId } = this.connectionManager.currentRoom;
    return {
      connected: this.connectionManager.connected,
      deviceReady: this.deviceManager.isReady,
      inRoom: !!roomId,
      hasVideo: this.mediaManager.hasLocalVideo,
      remoteParticipants: this.mediaManager.remoteParticipantCount,
      queueSize: this.eventQueue.size,
      processing: this.eventQueue.isProcessing,
      reconnecting: this.connectionManager.reconnecting,
    };
  }

  /**
   * Get remote video tracks for UI consumption.
   */
  get remoteVideoTracks() {
    return this.mediaManager.remoteVideoTracks;
  }
}