import { SignalingChannel } from './SignalingChannel';
import { EventQueue } from '../utils/EventQueue';
import { TypedEventEmitter } from '../utils/TypedEventEmitter';
import * as mediasoupClient from 'mediasoup-client';
import { ConnectionStatus, VideoCallEvents } from '../types/events';

/**
 * SDK client for managing connection to a video call via signaling server.
 * Handles signaling, joining a room, and managing mediasoup transports for media streaming.
 */
export class VideoCallClient extends TypedEventEmitter<VideoCallEvents> {
  private signaling: SignalingChannel;
  private eventQueue: EventQueue;

  private device?: mediasoupClient.Device;
  private sendTransport?: mediasoupClient.types.Transport;
  private recvTransport?: mediasoupClient.types.Transport;
  private localVideoProducer?: mediasoupClient.types.Producer;

  // Remote participants management
  private remoteConsumers = new Map<
    string,
    {
      userId: string;
      producerId: string;
      consumer: mediasoupClient.types.Consumer;
      track: MediaStreamTrack;
    }
  >();

  private roomId?: string;
  private userId?: string;
  private serverUrl: string;

  // Reconnection state
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer?: NodeJS.Timeout;

  // State preservation for reconnection
  private wasVideoActive = false;
  private savedMediaStream?: MediaStream;

  constructor(serverUrl: string) {
    super();
    this.serverUrl = serverUrl;
    this.signaling = new SignalingChannel(serverUrl);
    this.eventQueue = new EventQueue();

    // Set up signaling event handlers - only once in constructor
    this.setupSignalingEvents();
  }

  /**
   * Set up signaling event handlers.
   * Called only once in constructor to prevent duplicate listeners.
   */
  private setupSignalingEvents(): void {
    this.signaling.on('open', () => {
      console.log('[VideoCallClient] Signaling connected');

      if (this.isReconnecting) {
        this.handleReconnectionSuccess();
      } else {
        this.emit('connected');
      }
    });

    this.signaling.on('close', () => {
      console.log('[VideoCallClient] Signaling disconnected');

      if (!this.isReconnecting) {
        this.emit('disconnected');
        this.initiateReconnection();
      }
    });

    this.signaling.on('error', error => {
      console.error('[VideoCallClient] Signaling error:', error);
      this.emit('error', error);

      if (!this.isReconnecting) {
        this.initiateReconnection();
      }
    });

    this.signaling.on('joined', data => {
      console.log(`[VideoCallClient] Joined room: ${data.roomId}`);
      this.emit('joined', { roomId: data.roomId, userId: data.userId });
    });

    this.signaling.on('newProducer', async data => {
      console.log(`[VideoCallClient] New producer from user ${data.userId}`);
      this.emit('participantJoined', { userId: data.userId });

      await this.eventQueue.add(async () => {
        await this.handleNewProducer(data.producerId, data.userId);
      });
    });

    this.signaling.on('producerClosed', async data => {
      console.log(`[VideoCallClient] Producer closed: ${data.producerId} from ${data.userId}`);
      this.emit('participantLeft', { userId: data.userId });

      await this.eventQueue.add(async () => {
        await this.handleProducerClosed(data.producerId, data.userId);
      });
    });

    this.signaling.on('routerRtpCapabilities', async data => {
      console.log('[VideoCallClient] Received router RTP capabilities');
      await this.eventQueue.add(async () => {
        try {
          await this.initializeDevice(data.rtpCapabilities);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[VideoCallClient] Device initialization failed:', errorMessage);
        }
      });
    });
  }

  /**
   * Joins a video call room with a given roomId and userId.
   * Improved version without duplicate event listeners.
   */
  async joinCall(roomId: string, userId: string): Promise<void> {
    if (this.roomId && this.userId) {
      throw new Error('Already in a call. Call leaveCall() first.');
    }

    this.roomId = roomId;
    this.userId = userId;

    try {
      await this.signaling.sendWhenReady({ type: 'join', roomId, userId });
      console.log(`[VideoCallClient] Join request sent for room: ${roomId}`);
    } catch (error) {
      this.roomId = undefined;
      this.userId = undefined;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to join call:', errorMessage);
      throw error;
    }
  }

  /**
   * Leave the current call and cleanup all resources.
   */
  async leaveCall(): Promise<void> {
    console.log('[VideoCallClient] Leaving call...');

    // Stop reconnection attempts
    this.stopReconnection();

    // Stop video if active
    if (this.localVideoProducer) {
      await this.stopVideo();
    }

    // Cleanup all resources
    await this.cleanup();

    // Reset state
    this.roomId = undefined;
    this.userId = undefined;
    this.wasVideoActive = false;

    console.log('[VideoCallClient] Left call successfully');
  }

  /**
   * Start video capture and begin sending video to other participants.
   * Requests camera access, creates send transport, and starts video production.
   */
  async startVideo(): Promise<void> {
    return this.eventQueue.add(async () => {
      if (!this.isReady) {
        throw new Error(
          'Client not ready. Call joinCall() first and wait for device initialization.'
        );
      }

      if (this.localVideoProducer) {
        console.log('[VideoCallClient] Video already active');
        return;
      }

      try {
        console.log('[VideoCallClient] Requesting camera access...');

        // Reuse saved stream if available (for reconnection)
        let stream = this.savedMediaStream;
        if (!stream || stream.getTracks().every(track => track.readyState === 'ended')) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false,
          });
          this.savedMediaStream = stream;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error('No video track found in media stream');
        }

        if (!this.sendTransport) {
          await this.createSendTransport();
        }

        console.log('[VideoCallClient] Creating video producer...');
        this.localVideoProducer = await this.sendTransport!.produce({
          track: videoTrack,
          encodings: [{ maxBitrate: 500000 }, { maxBitrate: 1000000 }, { maxBitrate: 2000000 }],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
        });

        this.wasVideoActive = true;
        console.log(`[VideoCallClient] Video producer created: ${this.localVideoProducer.id}`);
        this.emit('localVideoStarted', { producer: this.localVideoProducer });

        // Handle transport close
        this.localVideoProducer.on('transportclose', () => {
          console.log('[VideoCallClient] Video producer transport closed');
          this.localVideoProducer = undefined;
          this.emit('localVideoStopped');
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to start video:', errorMessage);
        throw error;
      }
    });
  }

  /**
   * Stop video capture and close video producer.
   */
  async stopVideo(): Promise<void> {
    if (this.localVideoProducer) {
      this.localVideoProducer.close();
      this.localVideoProducer = undefined;
      this.wasVideoActive = false;
      console.log('[VideoCallClient] Video stopped');
      this.emit('localVideoStopped');
    }
  }

  /**
   * Initiate reconnection process with exponential backoff.
   */
  private initiateReconnection(): void {
    if (this.isReconnecting || !this.roomId || !this.userId) {
      return;
    }

    this.isReconnecting = true;
    this.emit('reconnecting');
    console.log('[VideoCallClient] Initiating reconnection...');

    this.attemptReconnection();
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[VideoCallClient] Max reconnection attempts reached');
      this.isReconnecting = false;
      this.emit('reconnectionFailed', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000;

    console.log(
      `[VideoCallClient] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        // Create new signaling connection
        this.signaling = new SignalingChannel(this.serverUrl);
        this.setupSignalingEvents();

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Reconnection timeout'));
          }, 10000);

          this.signaling.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });

          this.signaling.on('error', error => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      } catch (error) {
        console.error('[VideoCallClient] Reconnection attempt failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  /**
   * Handle successful reconnection.
   */
  private async handleReconnectionSuccess(): Promise<void> {
    console.log('[VideoCallClient] Reconnection successful');

    try {
      // Rejoin the room
      if (this.roomId && this.userId) {
        await this.signaling.sendWhenReady({
          type: 'join',
          roomId: this.roomId,
          userId: this.userId,
        });
      }

      // Reset reconnection state
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.stopReconnection();

      this.emit('reconnected');

      // Restore video if it was active
      if (this.wasVideoActive && !this.localVideoProducer) {
        try {
          await this.startVideo();
        } catch (error) {
          console.error('[VideoCallClient] Failed to restore video after reconnection:', error);
        }
      }
    } catch (error) {
      console.error('[VideoCallClient] Failed to restore state after reconnection:', error);
      this.attemptReconnection();
    }
  }

  /**
   * Stop reconnection attempts.
   */
  private stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Handle new producer from remote participant.
   */
  private async handleNewProducer(producerId: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoCallClient] Handling new producer ${producerId} from ${userId}`);

      if (!this.device || !this.device.loaded) {
        throw new Error('Device not ready for consuming');
      }

      if (!this.recvTransport) {
        await this.createRecvTransport();
      }

      await this.createConsumer(producerId, userId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VideoCallClient] Failed to handle new producer:`, errorMessage);
    }
  }

  /**
   * Handle producer closed event from remote participant.
   */
  private async handleProducerClosed(producerId: string, userId: string): Promise<void> {
    const consumerInfo = this.remoteConsumers.get(producerId);
    if (consumerInfo) {
      consumerInfo.consumer.close();
      this.remoteConsumers.delete(producerId);
      this.emit('remoteVideoStopped', { userId, producerId });
      console.log(`[VideoCallClient] Removed consumer for closed producer ${producerId}`);
    }
  }

  /**
   * Initialize mediasoup device with server's RTP capabilities.
   */
  private async initializeDevice(rtpCapabilities: any): Promise<void> {
    try {
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('[VideoCallClient] Device initialized successfully');
      this.emit('deviceReady');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      console.error('[VideoCallClient] Failed to initialize device:', errorMessage);

      if (errorName === 'UnsupportedError') {
        console.log('[VideoCallClient] Device not supported in current environment (Node.js)');
      }
    }
  }

  /**
   * Create a WebRTC send transport for media transmission.
   */
  private async createSendTransport(): Promise<void> {
    try {
      console.log('[VideoCallClient] Creating send transport...');

      const transportData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Transport creation timeout'));
        }, 10000);

        this.signaling.on('webRtcTransportCreated', data => {
          clearTimeout(timeout);
          resolve(data);
        });

        this.signaling.sendWhenReady({
          type: 'createWebRtcTransport',
          consuming: false,
          forceTcp: false,
        });
      });

      this.sendTransport = this.device!.createSendTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      });

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.signaling.sendWhenReady({
            type: 'connectTransport',
            transportId: this.sendTransport!.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error instanceof Error ? error : new Error('Unknown error'));
        }
      });

      this.sendTransport.on(
        'produce',
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const response = await new Promise<any>((resolve, reject) => {
              this.signaling.on('producerCreated', resolve);

              this.signaling.sendWhenReady({
                type: 'produce',
                transportId: this.sendTransport!.id,
                kind,
                rtpParameters,
                appData,
              });
            });

            callback({ id: response.producerId });
          } catch (error) {
            errback(error instanceof Error ? error : new Error('Unknown error'));
          }
        }
      );

      console.log('[VideoCallClient] Send transport created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create send transport:', errorMessage);
      throw error;
    }
  }

  /**
   * Create a WebRTC receive transport for media consumption.
   */
  private async createRecvTransport(): Promise<void> {
    try {
      console.log('[VideoCallClient] Creating receive transport...');

      const transportData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Transport creation timeout'));
        }, 10000);

        this.signaling.on('webRtcTransportCreated', data => {
          clearTimeout(timeout);
          resolve(data);
        });

        this.signaling.sendWhenReady({
          type: 'createWebRtcTransport',
          consuming: true,
          forceTcp: false,
        });
      });

      this.recvTransport = this.device!.createRecvTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      });

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.signaling.sendWhenReady({
            type: 'connectTransport',
            transportId: this.recvTransport!.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error instanceof Error ? error : new Error('Unknown error'));
        }
      });

      console.log('[VideoCallClient] Receive transport created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create receive transport:', errorMessage);
      throw error;
    }
  }

  /**
   * Create consumer for specific producer to receive media stream.
   */
  private async createConsumer(producerId: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoCallClient] Creating consumer for producer ${producerId}`);

      const consumerData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Consumer creation timeout'));
        }, 10000);

        this.signaling.on('consumerCreated', data => {
          clearTimeout(timeout);
          resolve(data);
        });

        this.signaling.sendWhenReady({
          type: 'consume',
          transportId: this.recvTransport!.id,
          producerId,
          rtpCapabilities: this.device!.rtpCapabilities,
        });
      });

      const consumer = await this.recvTransport!.consume({
        id: consumerData.consumerId,
        producerId: consumerData.producerId,
        kind: consumerData.kind,
        rtpParameters: consumerData.rtpParameters,
      });

      this.remoteConsumers.set(producerId, {
        userId,
        producerId,
        consumer,
        track: consumer.track,
      });

      console.log(`[VideoCallClient] Consumer created for ${userId}: ${consumer.id}`);
      this.emit('remoteVideoStarted', { userId, producerId, track: consumer.track });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create consumer:', errorMessage);
      throw error;
    }
  }

  /**
   * Cleanup all resources and connections.
   */
  private async cleanup(): Promise<void> {
    console.log('[VideoCallClient] Cleaning up resources...');

    // Close all remote consumers
    for (const [producerId, consumerInfo] of this.remoteConsumers) {
      try {
        consumerInfo.consumer.close();
        this.emit('remoteVideoStopped', {
          userId: consumerInfo.userId,
          producerId,
        });
      } catch (error) {
        console.error(`Failed to close consumer ${producerId}:`, error);
      }
    }
    this.remoteConsumers.clear();

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = undefined;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = undefined;
    }

    // Close local media stream
    if (this.savedMediaStream) {
      this.savedMediaStream.getTracks().forEach(track => track.stop());
      this.savedMediaStream = undefined;
    }

    this.localVideoProducer = undefined;
    this.device = undefined;
  }

  /**
   * Check if the client is ready to start media operations.
   */
  get isReady(): boolean {
    return !!(this.device && this.device.loaded && this.roomId && this.userId);
  }

  /**
   * Get current connection status.
   */
  get connectionStatus(): ConnectionStatus {
    return {
      connected: this.signaling.connected,
      deviceReady: this.device?.loaded || false,
      inRoom: !!this.roomId,
      hasVideo: !!this.localVideoProducer,
      remoteParticipants: this.remoteConsumers.size,
      queueSize: this.eventQueue.size,
      processing: this.eventQueue.isProcessing,
      reconnecting: this.isReconnecting,
    };
  }

  /**
   * Get remote video tracks for UI consumption.
   */
  get remoteVideoTracks() {
    const tracks = new Map<string, { userId: string; track: MediaStreamTrack }>();
    for (const [producerId, consumer] of this.remoteConsumers) {
      tracks.set(producerId, {
        userId: consumer.userId,
        track: consumer.track,
      });
    }
    return tracks;
  }
}
