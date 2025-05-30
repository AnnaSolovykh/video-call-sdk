import * as mediasoupClient from 'mediasoup-client';
import { TypedEventEmitter } from '../../utils/TypedEventEmitter';
import { RemoteConsumer } from '../../types/media';
import { MediaEvents } from '../../types/events';

/**
 * Manages media capture, streaming, and remote video consumption.
 */
export class MediaManager extends TypedEventEmitter<MediaEvents> {
  private localVideoProducer?: mediasoupClient.types.Producer;
  private savedMediaStream?: MediaStream;
  private wasVideoActive = false;

  // Remote participants management
  private remoteConsumers = new Map<string, RemoteConsumer>();

  constructor() {
    super();
  }

  /**
   * Start video capture and create producer.
   */
  async startVideo(sendTransport: mediasoupClient.types.Transport): Promise<void> {
    if (this.localVideoProducer) {
      console.log('[MediaManager] Video already active');
      return;
    }

    try {
      console.log('[MediaManager] Requesting camera access...');

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

      console.log('[MediaManager] Creating video producer...');
      this.localVideoProducer = await sendTransport.produce({
        track: videoTrack,
        encodings: [{ maxBitrate: 500000 }, { maxBitrate: 1000000 }, { maxBitrate: 2000000 }],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      this.wasVideoActive = true;
      console.log(`[MediaManager] Video producer created: ${this.localVideoProducer.id}`);
      this.emit('localVideoStarted', { producer: this.localVideoProducer });

      // Handle transport close
      this.localVideoProducer.on('transportclose', () => {
        console.log('[MediaManager] Video producer transport closed');
        this.localVideoProducer = undefined;
        this.emit('localVideoStopped');
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MediaManager] Failed to start video:', errorMessage);
      throw error;
    }
  }

  /**
   * Stop video capture and close producer.
   */
  async stopVideo(): Promise<void> {
    if (this.localVideoProducer) {
      this.localVideoProducer.close();
      this.localVideoProducer = undefined;
      this.wasVideoActive = false;
      console.log('[MediaManager] Video stopped');
      this.emit('localVideoStopped');
    }
  }

  /**
   * Create consumer for remote participant's video.
   */
  async createConsumer(
    recvTransport: mediasoupClient.types.Transport,
    consumerData: any,
    producerId: string,
    userId: string
  ): Promise<void> {
    try {
      console.log(`[MediaManager] Creating consumer for producer ${producerId}`);

      const consumer = await recvTransport.consume({
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

      console.log(`[MediaManager] Consumer created for ${userId}: ${consumer.id}`);
      this.emit('remoteVideoStarted', { userId, producerId, track: consumer.track });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MediaManager] Failed to create consumer:', errorMessage);
      throw error;
    }
  }

  /**
   * Remove consumer for closed producer.
   */
  removeConsumer(producerId: string, userId: string): void {
    const consumerInfo = this.remoteConsumers.get(producerId);
    if (consumerInfo) {
      consumerInfo.consumer.close();
      this.remoteConsumers.delete(producerId);
      this.emit('remoteVideoStopped', { userId, producerId });
      console.log(`[MediaManager] Removed consumer for closed producer ${producerId}`);
    }
  }

  /**
   * Cleanup all media resources.
   */
  async cleanup(): Promise<void> {
    console.log('[MediaManager] Cleaning up media resources...');

    // Close all remote consumers
    for (const [producerId, consumerInfo] of this.remoteConsumers) {
      try {
        consumerInfo.consumer.close();
        this.emit('remoteVideoStopped', {
          userId: consumerInfo.userId,
          producerId,
        });
      } catch (error) {
        console.error(`[MediaManager] Failed to close consumer ${producerId}:`, error);
      }
    }
    this.remoteConsumers.clear();

    // Close local media stream
    if (this.savedMediaStream) {
      this.savedMediaStream.getTracks().forEach(track => track.stop());
      this.savedMediaStream = undefined;
    }

    this.localVideoProducer = undefined;
  }

  /**
   * Restore video after reconnection if it was active.
   */
  async restoreVideoIfNeeded(sendTransport: mediasoupClient.types.Transport): Promise<void> {
    if (this.wasVideoActive && !this.localVideoProducer) {
      try {
        await this.startVideo(sendTransport);
      } catch (error) {
        console.error('[MediaManager] Failed to restore video after reconnection:', error);
      }
    }
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

  /**
   * Check if local video is active.
   */
  get hasLocalVideo(): boolean {
    return !!this.localVideoProducer;
  }

  /**
   * Get number of remote participants.
   */
  get remoteParticipantCount(): number {
    return this.remoteConsumers.size;
  }

  /**
   * Check if video was active (for reconnection state).
   */
  get videoWasActive(): boolean {
    return this.wasVideoActive;
  }
}