import { SignalingChannel } from './SignalingChannel';
import * as mediasoupClient from 'mediasoup-client';

/**
 * SDK client for managing connection to a video call via signaling server.
 * Handles signaling, joining a room, and managing mediasoup transports for media streaming.
 */
export class VideoCallClient {
  private signaling: SignalingChannel;

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

  constructor(serverUrl: string) {
    this.signaling = new SignalingChannel(serverUrl);
  }

  /**
   * Joins a video call room with a given roomId and userId.
   * Sets up event listeners, sends join message, and initializes mediasoup device.
   */
  async joinCall(roomId: string, userId: string): Promise<void> {
    this.roomId = roomId;
    this.userId = userId;

    this.signaling.on('joined', data => {
      console.log(`[VideoCallClient] Joined room: ${data.roomId}`);
    });

    this.signaling.on('newProducer', async data => {
      console.log(`[VideoCallClient] New producer from user ${data.userId}`);
      await this.handleNewProducer(data.producerId, data.userId);
    });

    this.signaling.on('routerRtpCapabilities', async data => {
      console.log('[VideoCallClient] Received router RTP capabilities');
      try {
        await this.initializeDevice(data.rtpCapabilities);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VideoCallClient] Device initialization failed:', errorMessage);
      }
    });

    try {
      await this.signaling.sendWhenReady({ type: 'join', roomId, userId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to join call:', errorMessage);
      throw error;
    }
  }

  /**
   * Start video capture and begin sending video to other participants.
   * Requests camera access, creates send transport, and starts video production.
   */
  async startVideo(): Promise<void> {
    if (!this.isReady) {
      throw new Error(
        'Client not ready. Call joinCall() first and wait for device initialization.'
      );
    }

    try {
      console.log('[VideoCallClient] Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

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
        encodings: [
          { maxBitrate: 500000 }, // 0.5 Mbps
          { maxBitrate: 1000000 }, // 1 Mbps
          { maxBitrate: 2000000 }, // 2 Mbps
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      console.log(`[VideoCallClient] Video producer created: ${this.localVideoProducer.id}`);

      this.localVideoProducer.on('transportclose', () => {
        console.log('[VideoCallClient] Video producer transport closed');
        this.localVideoProducer = undefined;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to start video:', errorMessage);
      throw error;
    }
  }

  /**
   * Stop video capture and close video producer.
   */
  async stopVideo(): Promise<void> {
    if (this.localVideoProducer) {
      this.localVideoProducer.close();
      this.localVideoProducer = undefined;
      console.log('[VideoCallClient] Video stopped');
    }
  }

  /**
   * Handle new producer from remote participant.
   * Creates consumer to receive their video stream.
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
   * Initialize mediasoup device with server's RTP capabilities.
   * This must be done before creating any transports.
   */
  private async initializeDevice(rtpCapabilities: any): Promise<void> {
    try {
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('[VideoCallClient] Device initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      console.error('[VideoCallClient] Failed to initialize device:', errorMessage);
      // No need to throw error - this is expected in Node.js environment
      // In a real browser environment, this would work
      if (errorName === 'UnsupportedError') {
        console.log('[VideoCallClient] Device not supported in current environment (Node.js)');
      }
    }
  }

  /**
   * Create a WebRTC send transport for media transmission.
   * Requests transport parameters from server and sets up transport events.
   */
  private async createSendTransport(): Promise<void> {
    try {
      console.log('[VideoCallClient] Creating send transport...');

      // Request transport creation from server
      await new Promise<void>((resolve, reject) => {
        // Listen for transport creation response
        this.signaling.on('webRtcTransportCreated', async transportData => {
          try {
            // Create mediasoup send transport
            this.sendTransport = this.device!.createSendTransport({
              id: transportData.transportId,
              iceParameters: transportData.iceParameters,
              iceCandidates: transportData.iceCandidates,
              dtlsParameters: transportData.dtlsParameters,
              sctpParameters: transportData.sctpParameters,
            });

            // Handle transport connection
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

            // Handle producer creation
            this.sendTransport.on(
              'produce',
              async ({ kind, rtpParameters, appData }, callback, errback) => {
                try {
                  const response = await new Promise<any>((resolveProducer, rejectProducer) => {
                    this.signaling.on('producerCreated', data => {
                      resolveProducer(data);
                    });

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
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.signaling.sendWhenReady({
          type: 'createWebRtcTransport',
          consuming: false,
          forceTcp: false,
        });
      });
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

      await new Promise<void>((resolve, reject) => {
        this.signaling.on('webRtcTransportCreated', async transportData => {
          try {
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
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.signaling.sendWhenReady({
          type: 'createWebRtcTransport',
          consuming: true,
          forceTcp: false,
        });
      });
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

      await new Promise<void>((resolve, reject) => {
        this.signaling.on('consumerCreated', async consumerData => {
          try {
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
            console.log(`[VideoCallClient] Remote video track available for ${userId}`);

            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.signaling.sendWhenReady({
          type: 'consume',
          transportId: this.recvTransport!.id,
          producerId,
          rtpCapabilities: this.device!.rtpCapabilities,
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create consumer:', errorMessage);
      throw error;
    }
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
  get connectionStatus() {
    return {
      connected: this.signaling.connected,
      deviceReady: this.device?.loaded || false,
      inRoom: !!this.roomId,
      hasVideo: !!this.localVideoProducer,
      remoteParticipants: this.remoteConsumers.size,
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
