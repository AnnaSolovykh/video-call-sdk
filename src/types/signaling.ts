import { RtpCapabilities, RtpParameters } from 'mediasoup-client/lib/RtpParameters';
import { DtlsParameters } from 'mediasoup-client/lib/Transport';

/**
 * Base signaling message structure
 */
export interface SignalMessage {
  type: string;
  [key: string]: unknown;
}

// === Client to Server Messages ===

export interface JoinRoomMessage {
  type: 'join';
  roomId: string;
  userId: string;
}

export interface CreateWebRtcTransportMessage {
  type: 'createWebRtcTransport';
  consuming: boolean; // false for send transport, true for recv transport
  forceTcp?: boolean;
}

export interface ConnectTransportMessage {
  type: 'connectTransport';
  transportId: string;
  dtlsParameters: DtlsParameters;
}

export interface ProduceMessage {
  type: 'produce';
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  appData?: Record<string, unknown>;
}

export interface ConsumeMessage {
  type: 'consume';
  transportId: string;
  producerId: string;
  rtpCapabilities: RtpCapabilities;
}

export type ClientToServerMessage =
  | JoinRoomMessage
  | CreateWebRtcTransportMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ConsumeMessage;

// === Server to Client Messages ===

export interface JoinedRoomMessage {
  type: 'joined';
  roomId: string;
  userId: string;
  peers?: Array<{
    userId: string;
    producers: Array<{
      id: string;
      kind: 'audio' | 'video';
    }>;
  }>;
}

export interface RouterRtpCapabilitiesMessage {
  type: 'routerRtpCapabilities';
  rtpCapabilities: RtpCapabilities;
}

export interface WebRtcTransportCreatedMessage {
  type: 'webRtcTransportCreated';
  transportId: string;
  iceParameters: {
    usernameFragment: string;
    password: string;
    iceLite?: boolean;
  };
  iceCandidates: Array<{
    foundation: string;
    ip: string;
    port: number;
    priority: number;
    protocol: 'udp' | 'tcp';
    type: 'host' | 'srflx' | 'prflx' | 'relay';
  }>;
  dtlsParameters: DtlsParameters;
  sctpParameters?: {
    port: number;
    OS: number;
    MIS: number;
    maxMessageSize: number;
  };
}

export interface TransportConnectedMessage {
  type: 'transportConnected';
  transportId: string;
}

export interface ProducerCreatedMessage {
  type: 'producerCreated';
  producerId: string;
  kind: 'audio' | 'video';
}

export interface NewProducerMessage {
  type: 'newProducer';
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
}

export interface ConsumerCreatedMessage {
  type: 'consumerCreated';
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
}

export interface ProducerClosedMessage {
  type: 'producerClosed';
  producerId: string;
  userId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export type ServerToClientMessage =
  | JoinedRoomMessage
  | RouterRtpCapabilitiesMessage
  | WebRtcTransportCreatedMessage
  | TransportConnectedMessage
  | ProducerCreatedMessage
  | NewProducerMessage
  | ConsumerCreatedMessage
  | ProducerClosedMessage
  | ErrorMessage;

/**
 * Union type for all signaling messages
 */
export type AnySignalMessage = ClientToServerMessage | ServerToClientMessage;

/**
 * Test message type for flexible testing
 */
export interface TestSignalMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Combined type for production and testing
 */
export type SignalMessageUnion = AnySignalMessage | TestSignalMessage;

/**
 * Flexible message type for SignalingChannel
 * Allows both strict types and test messages
 */
export type FlexibleSignalMessage = {
  type: string;
  [key: string]: unknown;
};