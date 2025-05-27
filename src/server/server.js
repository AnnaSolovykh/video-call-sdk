const WebSocket = require('ws');

// Create a WebSocket server on port 3001
const wss = new WebSocket.Server({ port: 3001 });

/**
 * Handle new client connections.
 */
wss.on('connection', ws => {
  /**
   * Handle messages from the client.
   */
  ws.on('message', msg => {
    const data = JSON.parse(msg);

    if (data.type === 'join') {
      // Respond to the client confirming they joined the room
      ws.send(JSON.stringify({ type: 'joined', roomId: data.roomId }));

      // Simulate presence of another user with a video stream after 1 second
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: 'newProducer',
            userId: 'user-xyz',
            producerId: 'fake-producer-id',
          })
        );
      }, 1000);
    }
  });
});

console.log('Signaling server running on ws://localhost:3001');
