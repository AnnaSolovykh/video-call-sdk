import { VideoCallClient } from '../src/sdk/VideoCallClient';

/**
 * Example usage of the VideoCallClient SDK.
 * Connects to the signaling server and joins a video call room.
 */
async function test() {
  // Initialize the SDK with the signaling server URL
  const client = new VideoCallClient('ws://localhost:3001');

  try {
    // Attempt to join the room
    await client.joinCall('room-alpha', 'user-abc');
    console.log('Successfully joined the call');
  } catch (error) {
    console.error('Failed to join call:', error);
  }
}

test();
