import * as mediasoupClient from 'mediasoup-client';
import { TypedEventEmitter } from '../../utils/TypedEventEmitter';
import { ConnectionManager } from './ConnectionManager';
import { DeviceEvents } from '../../types/events';

/**
 * Manages mediasoup device initialization and WebRTC transport creation.
 */
export class DeviceManager extends TypedEventEmitter<DeviceEvents> {
  private device?: mediasoupClient.Device;
  private sendTransport?: mediasoupClient.types.Transport;
  private recvTransport?: mediasoupClient.types.Transport;
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    super();
    this.connectionManager = connectionManager;
  }

  /**
   * Initialize mediasoup device with server's RTP capabilities.
   */
  async initializeDevice(rtpCapabilities: any): Promise<void> {
    try {
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('[DeviceManager] Device initialized successfully');
      this.emit('deviceReady');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      console.error('[DeviceManager] Failed to initialize device:', errorMessage);

      if (errorName === 'UnsupportedError') {
        console.log('[DeviceManager] Device not supported in current environment (Node.js)');
      }
      throw error;
    }
  }

  /**
   * Create a WebRTC send transport for media transmission.
   */
  async createSendTransport(): Promise<mediasoupClient.types.Transport> {
    if (!this.device || !this.device.loaded) {
      throw new Error('Device not initialized');
    }

    if (this.sendTransport) {
      return this.sendTransport;
    }

    try {
      console.log('[DeviceManager] Creating send transport...');

      const transportData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Transport creation timeout'));
        }, 10000);

        const handler = (data: any) => {
          clearTimeout(timeout);
          this.connectionManager.off('webRtcTransportCreated', handler);
          resolve(data);
        };

        this.connectionManager.on('webRtcTransportCreated', handler);

        this.connectionManager.sendMessage({
          type: 'createWebRtcTransport',
          consuming: false,
          forceTcp: false,
        });
      });

      this.sendTransport = this.device.createSendTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      });

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.connectionManager.sendMessage({
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
              const handler = (data: any) => {
                this.connectionManager.off('producerCreated', handler);
                resolve(data);
              };

              this.connectionManager.on('producerCreated', handler);

              this.connectionManager.sendMessage({
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

      console.log('[DeviceManager] Send transport created successfully');
      this.emit('transportCreated', { transport: this.sendTransport, type: 'send' });
      return this.sendTransport;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DeviceManager] Failed to create send transport:', errorMessage);
      throw error;
    }
  }

  /**
   * Create a WebRTC receive transport for media consumption.
   */
  async createRecvTransport(): Promise<mediasoupClient.types.Transport> {
    if (!this.device || !this.device.loaded) {
      throw new Error('Device not initialized');
    }

    if (this.recvTransport) {
      return this.recvTransport;
    }

    try {
      console.log('[DeviceManager] Creating receive transport...');

      const transportData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Transport creation timeout'));
        }, 10000);

        const handler = (data: any) => {
          clearTimeout(timeout);
          this.connectionManager.off('webRtcTransportCreated', handler);
          resolve(data);
        };

        this.connectionManager.on('webRtcTransportCreated', handler);

        this.connectionManager.sendMessage({
          type: 'createWebRtcTransport',
          consuming: true,
          forceTcp: false,
        });
      });

      this.recvTransport = this.device.createRecvTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      });

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.connectionManager.sendMessage({
            type: 'connectTransport',
            transportId: this.recvTransport!.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error instanceof Error ? error : new Error('Unknown error'));
        }
      });

      console.log('[DeviceManager] Receive transport created successfully');
      this.emit('transportCreated', { transport: this.recvTransport, type: 'recv' });
      return this.recvTransport;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DeviceManager] Failed to create receive transport:', errorMessage);
      throw error;
    }
  }

  /**
   * Get consumer data from signaling server.
   */
  async getConsumerData(producerId: string): Promise<any> {
    if (!this.device || !this.device.loaded) {
      throw new Error('Device not initialized');
    }

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Consumer creation timeout'));
      }, 10000);

      const handler = (data: any) => {
        clearTimeout(timeout);
        this.connectionManager.off('consumerCreated', handler);
        resolve(data);
      };

      this.connectionManager.on('consumerCreated', handler);

      this.connectionManager.sendMessage({
        type: 'consume',
        transportId: this.recvTransport!.id,
        producerId,
        rtpCapabilities: this.device!.rtpCapabilities,
      });
    });
  }

  /**
   * Cleanup all transports.
   */
  async cleanup(): Promise<void> {
    console.log('[DeviceManager] Cleaning up transports...');

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = undefined;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = undefined;
    }

    this.device = undefined;
  }

  /**
   * Check if device is ready.
   */
  get isReady(): boolean {
    return !!(this.device && this.device.loaded);
  }

  /**
   * Get send transport.
   */
  get sendTransportInstance(): mediasoupClient.types.Transport | undefined {
    return this.sendTransport;
  }

  /**
   * Get receive transport.
   */
  get recvTransportInstance(): mediasoupClient.types.Transport | undefined {
    return this.recvTransport;
  }
}