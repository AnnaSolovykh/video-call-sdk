import { SignalingChannel } from './SignalingChannel';

/**
 * SDK client for managing connection to a video call via signaling server.
 * Handles signaling, joining a room, and reacting to media events.
 */
export class VideoCallClient {
  private signaling: SignalingChannel;

  constructor(serverUrl: string) {
    // Initialize the signaling channel
    this.signaling = new SignalingChannel(serverUrl);
  }

  /**
   * Joins a video call room with a given roomId and userId.
   * Sets up event listeners and sends a 'join' message once signaling is ready.
   */
  async joinCall(roomId: string, userId: string): Promise<void> {
    // Register handlers for expected server events
    this.signaling.on('joined', data => {
      console.log(`[VideoCallClient] Joined room: ${data.roomId}`);
    });

    this.signaling.on('newProducer', data => {
      console.log(`[VideoCallClient] New producer from user ${data.userId}`);
    });

    // Send 'join' message once WebSocket is ready
    try {
      await this.signaling.sendWhenReady({ type: 'join', roomId, userId });
    } catch (error) {
      console.error('Failed to join call:', error);
      throw error;
    }
  }
}