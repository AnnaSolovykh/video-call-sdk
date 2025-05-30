import { SignalingChannel } from '../SignalingChannel';
import { TypedEventEmitter } from '../../utils/TypedEventEmitter';
import { ConnectionEvents } from '../../types/events';

/**
 * Manages WebSocket connection, signaling, and reconnection logic.
 */
export class ConnectionManager extends TypedEventEmitter<ConnectionEvents> {
  private signaling: SignalingChannel;
  private serverUrl: string;

  // Reconnection state
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer?: NodeJS.Timeout;

  // Call state for reconnection
  private roomId?: string;
  private userId?: string;

  constructor(serverUrl: string) {
    super();
    this.serverUrl = serverUrl;
    this.signaling = new SignalingChannel(serverUrl);
    this.setupSignalingEvents();
  }

  /**
   * Join a video call room.
   */
  async joinRoom(roomId: string, userId: string): Promise<void> {
    if (this.roomId && this.userId) {
      throw new Error('Already in a call. Call leaveCall() first.');
    }

    this.roomId = roomId;
    this.userId = userId;

    try {
      await this.signaling.sendWhenReady({ type: 'join', roomId, userId });
      console.log(`[ConnectionManager] Join request sent for room: ${roomId}`);
    } catch (error) {
      this.roomId = undefined;
      this.userId = undefined;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to join room:', errorMessage);
      throw error;
    }
  }

  /**
   * Leave the current room.
   */
  async leaveRoom(): Promise<void> {
    console.log('[ConnectionManager] Leaving room...');
    
    this.stopReconnection();
    this.roomId = undefined;
    this.userId = undefined;
    
    console.log('[ConnectionManager] Left room successfully');
  }

  /**
   * Send message to signaling server.
   */
  async sendMessage(message: any): Promise<void> {
    await this.signaling.sendWhenReady(message);
  }

  /**
   * Get connection status.
   */
  get connected(): boolean {
    return this.signaling.connected;
  }

  get reconnecting(): boolean {
    return this.isReconnecting;
  }

  get currentRoom(): { roomId?: string; userId?: string } {
    return { roomId: this.roomId, userId: this.userId };
  }

  /**
   * Set up signaling event handlers.
   */
  private setupSignalingEvents(): void {
    this.signaling.on('open', () => {
      console.log('[ConnectionManager] Signaling connected');

      if (this.isReconnecting) {
        this.handleReconnectionSuccess();
      } else {
        this.emit('connected');
      }
    });

    this.signaling.on('close', () => {
      console.log('[ConnectionManager] Signaling disconnected');

      if (!this.isReconnecting) {
        this.emit('disconnected');
        this.initiateReconnection();
      }
    });

    this.signaling.on('error', error => {
      console.error('[ConnectionManager] Signaling error:', error);
      this.emit('error', error);

      if (!this.isReconnecting) {
        this.initiateReconnection();
      }
    });

    // Forward all signaling events
    this.signaling.on('joined', data => {
      console.log(`[ConnectionManager] Joined room: ${data.roomId}`);
      this.emit('joined', { roomId: data.roomId, userId: data.userId });
    });

    this.signaling.on('routerRtpCapabilities', data => {
      console.log('[ConnectionManager] Received router RTP capabilities');
      this.emit('routerRtpCapabilities', { rtpCapabilities: data.rtpCapabilities });
    });

    this.signaling.on('newProducer', data => {
      console.log(`[ConnectionManager] New producer from user ${data.userId}`);
      this.emit('newProducer', { producerId: data.producerId, userId: data.userId });
    });

    this.signaling.on('producerClosed', data => {
      console.log(`[ConnectionManager] Producer closed: ${data.producerId} from ${data.userId}`);
      this.emit('producerClosed', { producerId: data.producerId, userId: data.userId });
    });

    // Forward transport and producer events
    this.signaling.on('webRtcTransportCreated', data => this.emit('webRtcTransportCreated', data));
    this.signaling.on('transportConnected', data => this.emit('transportConnected', data));
    this.signaling.on('producerCreated', data => this.emit('producerCreated', data));
    this.signaling.on('consumerCreated', data => this.emit('consumerCreated', data));
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
    console.log('[ConnectionManager] Initiating reconnection...');

    this.attemptReconnection();
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ConnectionManager] Max reconnection attempts reached');
      this.isReconnecting = false;
      this.emit('reconnectionFailed', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000;

    console.log(
      `[ConnectionManager] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`
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
        console.error('[ConnectionManager] Reconnection attempt failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  /**
   * Handle successful reconnection.
   */
  private async handleReconnectionSuccess(): Promise<void> {
    console.log('[ConnectionManager] Reconnection successful');

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
    } catch (error) {
      console.error('[ConnectionManager] Failed to restore state after reconnection:', error);
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
}