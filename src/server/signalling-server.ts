import WebSocket from 'ws';
import { 
  ClientToServerMessage, 
  ServerToClientMessage,
  JoinRoomMessage,
  CreateWebRtcTransportMessage,
  ConnectTransportMessage,
  ProduceMessage,
  ConsumeMessage
} from '../types/signaling';
import { RtpCapabilities, RtpParameters } from 'mediasoup-client/lib/RtpParameters';

/**
 * Fake RTP capabilities for testing
 */
const FAKE_RTP_CAPABILITIES: RtpCapabilities = {
  codecs: [
    {
      mimeType: 'video/VP8',
      kind: 'video',
      clockRate: 90000,
      channels: 1,
      parameters: {},
      rtcpFeedback: [],
    },
  ],
  headerExtensions: [
    {
      uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
      kind: 'video',
      preferredId: 1,
      preferredEncrypt: false,
      direction: 'sendrecv',
    },
  ],
};

/**
 * Fake transport parameters for testing
 */
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
      protocol: 'udp' as const,
      type: 'host' as const,
    },
  ],
  dtlsParameters: {
    role: 'auto' as const,
    fingerprints: [
      {
        algorithm: 'sha-256' as const,
        value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      },
    ],
  },
};

/**
 * Create fake RTP parameters for testing
 */
function createFakeRtpParameters(): RtpParameters {
  return {
    codecs: [
      {
        mimeType: 'video/VP8',
        payloadType: 96,
        clockRate: 90000,
        parameters: {},
        rtcpFeedback: [],
      },
    ],
    headerExtensions: [
      {
        uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
        id: 1,
        encrypt: false,
        parameters: {},
      },
    ],
    encodings: [
      {
        ssrc: Math.floor(Math.random() * 1000000),
      },
    ],
    rtcp: {
      cname: `fake-cname-${Date.now()}`,
      reducedSize: true,
    },
  };
}

/**
 * Type guard to check if message is a valid client message
 */
function isValidClientMessage(data: unknown): data is ClientToServerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string'
  );
}

/**
 * Create WebSocket server for signaling
 */
const wss = new WebSocket.Server({ port: 3001 });

console.log('Signaling Server started on ws://localhost:3001');

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');

  ws.on('message', (msg: WebSocket.Data) => {
    try {
      const data: unknown = JSON.parse(msg.toString());
      
      if (!isValidClientMessage(data)) {
        console.error('Invalid message format:', data);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          code: 'INVALID_MESSAGE'
        } satisfies ServerToClientMessage));
        return;
      }

      console.log(`Received: ${data.type}`);

      // Handle different message types
      switch (data.type) {
        case 'join':
          handleJoinMessage(ws, data);
          break;
        case 'createWebRtcTransport':
          handleCreateTransportMessage(ws, data);
          break;
        case 'connectTransport':
          handleConnectTransportMessage(ws, data);
          break;
        case 'produce':
          handleProduceMessage(ws, data);
          break;
        case 'consume':
          handleConsumeMessage(ws, data);
          break;
        default:
          console.log(`Unknown message type: ${(data as { type: string }).type}`);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${(data as { type: string }).type}`,
            code: 'UNKNOWN_MESSAGE_TYPE'
          } satisfies ServerToClientMessage));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to parse message',
        code: 'PARSE_ERROR'
      } satisfies ServerToClientMessage));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error);
  });
});

/**
 * Handle join room message
 */
function handleJoinMessage(ws: WebSocket, data: JoinRoomMessage): void {
  // Confirm join
  const joinedMessage: ServerToClientMessage = {
    type: 'joined',
    roomId: data.roomId,
    userId: data.userId,
  };
  ws.send(JSON.stringify(joinedMessage));

  // Send RTP capabilities after a delay
  setTimeout(() => {
    const capabilitiesMessage: ServerToClientMessage = {
      type: 'routerRtpCapabilities',
      rtpCapabilities: FAKE_RTP_CAPABILITIES,
    };
    ws.send(JSON.stringify(capabilitiesMessage));
  }, 100);
}

/**
 * Handle create WebRTC transport message
 */
function handleCreateTransportMessage(ws: WebSocket, data: CreateWebRtcTransportMessage): void {
  const transportMessage: ServerToClientMessage = {
    type: 'webRtcTransportCreated',
    transportId: `fake-transport-${Date.now()}`,
    ...FAKE_TRANSPORT_PARAMS,
  };
  ws.send(JSON.stringify(transportMessage));
}

/**
 * Handle connect transport message
 */
function handleConnectTransportMessage(ws: WebSocket, data: ConnectTransportMessage): void {
  const connectedMessage: ServerToClientMessage = {
    type: 'transportConnected',
    transportId: data.transportId,
  };
  ws.send(JSON.stringify(connectedMessage));
}

/**
 * Handle produce message
 */
function handleProduceMessage(ws: WebSocket, data: ProduceMessage): void {
  const producerMessage: ServerToClientMessage = {
    type: 'producerCreated',
    producerId: `fake-producer-${Date.now()}`,
    kind: data.kind,
  };
  ws.send(JSON.stringify(producerMessage));
}

/**
 * Handle consume message
 */
function handleConsumeMessage(ws: WebSocket, data: ConsumeMessage): void {
  const consumerMessage: ServerToClientMessage = {
    type: 'consumerCreated',
    consumerId: `fake-consumer-${Date.now()}`,
    producerId: data.producerId,
    kind: 'video',
    rtpParameters: createFakeRtpParameters(),
  };
  ws.send(JSON.stringify(consumerMessage));
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down signaling server...');
  wss.close(() => {
    console.log('Signaling server closed');
    process.exit(0);
  });
});

console.log('Supported message types:');
console.log(' • join → joined + routerRtpCapabilities');
console.log(' • createWebRtcTransport → webRtcTransportCreated');
console.log(' • connectTransport → transportConnected');
console.log(' • produce → producerCreated');
console.log(' • consume → consumerCreated');