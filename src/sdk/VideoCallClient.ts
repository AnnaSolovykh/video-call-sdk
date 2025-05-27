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
  private localVideoProducer?: mediasoupClient.types.Producer;

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

    // Register handlers for expected server events
    this.signaling.on('joined', data => {
      console.log(`[VideoCallClient] Joined room: ${data.roomId}`);
    });

    this.signaling.on('newProducer', data => {
      console.log(`[VideoCallClient] New producer from user ${data.userId}`);
    });

    // Handle router RTP capabilities from server (needed for mediasoup device initialization)
    this.signaling.on('routerRtpCapabilities', async data => {
      console.log('[VideoCallClient] Received router RTP capabilities');
      try {
        await this.initializeDevice(data.rtpCapabilities);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VideoCallClient] Device initialization failed:', errorMessage);
      }
    });

    // Send 'join' message once WebSocket is ready
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
      // Get user's camera stream
      console.log('[VideoCallClient] Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track found in media stream');
      }

      // Create send transport if not exists
      if (!this.sendTransport) {
        await this.createSendTransport();
      }

      // Create video producer
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

      // Handle producer events
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

        // Request transport from server
        this.signaling.sendWhenReady({
          type: 'createWebRtcTransport',
          consuming: false, // false = send transport
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
    };
  }
}
