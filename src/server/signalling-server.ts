// @ts-nocheck
// Signaling server for video call SDK testing
const WebSocket = require('ws');

// Fake data for testing
const FAKE_RTP_CAPABILITIES = {
  codecs: [
    {
      mimeType: 'video/VP8',
      kind: 'video',
      clockRate: 90000,
    },
  ],
  headerExtensions: [],
};

const FAKE_TRANSPORT_PARAMS = {
  iceParameters: {
    usernameFragment: 'fake-ufrag',
    password: 'fake-password',
    iceLite: true,
  },
  iceCandidates: [
    {
      foundation: 'udpcandidate',
      ip: '127.0.0.1',
      port: 44444,
      priority: 1015875583,
      protocol: 'udp',
      type: 'host',
    },
  ],
  dtlsParameters: {
    role: 'auto',
    fingerprints: [
      {
        algorithm: 'sha-256',
        value:
          'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      },
    ],
  },
};

const wss = new WebSocket.Server({ port: 3001 });

console.log('Signaling Server started on ws://localhost:3001');

wss.on('connection', ws => {
  console.log('New client connected');

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg.toString());
      console.log(`Received: ${data.type}`);

      // Echo responses for each message type
      switch (data.type) {
        case 'join':
          // Confirm join and send capabilities
          ws.send(
            JSON.stringify({
              type: 'joined',
              roomId: data.roomId,
              userId: data.userId,
            })
          );

          setTimeout(() => {
            ws.send(
              JSON.stringify({
                type: 'routerRtpCapabilities',
                rtpCapabilities: FAKE_RTP_CAPABILITIES,
              })
            );
          }, 100);
          break;

        case 'createWebRtcTransport':
          // Send fake transport parameters
          ws.send(
            JSON.stringify({
              type: 'webRtcTransportCreated',
              transportId: 'fake-transport-' + Date.now(),
              ...FAKE_TRANSPORT_PARAMS,
            })
          );
          break;

        case 'connectTransport':
          // Confirm transport connection
          ws.send(
            JSON.stringify({
              type: 'transportConnected',
              transportId: data.transportId,
            })
          );
          break;

        case 'produce':
          // Confirm producer creation
          ws.send(
            JSON.stringify({
              type: 'producerCreated',
              producerId: 'fake-producer-' + Date.now(),
              kind: data.kind,
            })
          );
          break;

        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', error => {
    console.error('WebSocket error:', error);
  });
});

console.log('Supported message types:');
console.log('  • join → joined + routerRtpCapabilities');
console.log('  • createWebRtcTransport → webRtcTransportCreated');
console.log('  • connectTransport → transportConnected');
console.log('  • produce → producerCreated');
