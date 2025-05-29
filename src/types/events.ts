import { RtpCapabilities, RtpParameters } from 'mediasoup-client/lib/RtpParameters';
import { DtlsParameters } from 'mediasoup-client/lib/Transport';
import * as mediasoupClient from 'mediasoup-client';
import { vi } from 'vitest';

// Base signaling message structure
export type SignalMessage = {
  type: string;
  [key: string]: any;
};

// === Client to Server Messages ===

export type JoinRoomMessage = {
  type: 'join';
  roomId: string;
  userId: string;
};

export type CreateWebRtcTransportMessage = {
  type: 'createWebRtcTransport';
  consuming: boolean; // false for send transport, true for recv transport
  forceTcp?: boolean;
};

export type ConnectTransportMessage = {
  type: 'connectTransport';
  transportId: string;
  dtlsParameters: DtlsParameters;
};

export type ProduceMessage = {
  type: 'produce';
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  appData?: Record<string, any>;
};

export type ConsumeMessage = {
  type: 'consume';
  transportId: string;
  producerId: string;
  rtpCapabilities: RtpCapabilities;
};

// === Server to Client Messages ===

export type JoinedRoomMessage = {
  type: 'joined';
  roomId: string;
  userId: string;
  peers: Array<{
    userId: string;
    producers: Array<{
      id: string;
      kind: 'audio' | 'video';
    }>;
  }>;
};

export type RouterRtpCapabilitiesMessage = {
  type: 'routerRtpCapabilities';
  rtpCapabilities: RtpCapabilities;
};

export type WebRtcTransportCreatedMessage = {
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
};

export type TransportConnectedMessage = {
  type: 'transportConnected';
  transportId: string;
};

export type ProducerCreatedMessage = {
  type: 'producerCreated';
  producerId: string;
  kind: 'audio' | 'video';
};

export type NewProducerMessage = {
  type: 'newProducer';
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
};

export type ConsumerCreatedMessage = {
  type: 'consumerCreated';
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
};

export type ProducerClosedMessage = {
  type: 'producerClosed';
  producerId: string;
  userId: string;
};

export type ErrorMessage = {
  type: 'error';
  message: string;
  code?: string;
};

// === Union Types for Type Safety ===

export type ClientToServerMessage =
  | JoinRoomMessage
  | CreateWebRtcTransportMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ConsumeMessage;

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

// Test-only message types for flexibility in tests
export type TestMessage = {
  type: string;
  [key: string]: any;
};

export type AnySignalMessage = ClientToServerMessage | ServerToClientMessage | TestMessage;

// === Event Handler Types ===

export type VideoCallEventMap = {
  // Connection events
  connected: void;
  disconnected: void;
  error: Error;

  // Room events
  joined: { roomId: string; userId: string };
  peerJoined: { userId: string };
  peerLeft: { userId: string };

  // Media events
  localVideoStarted: { producer: any }; // mediasoup Producer type
  localVideoStopped: void;
  remoteVideoStarted: { userId: string; consumer: any }; // mediasoup Consumer type
  remoteVideoStopped: { userId: string };
  remoteAudioStarted: { userId: string; consumer: any };
  remoteAudioStopped: { userId: string };
};

export interface VideoCallEvents {
  connected: void;
  disconnected: void;
  error: Error;
  joined: { roomId: string; userId: string };
  deviceReady: void;
  localVideoStarted: { producer: mediasoupClient.types.Producer };
  localVideoStopped: void;
  remoteVideoStarted: { userId: string; producerId: string; track: MediaStreamTrack };
  remoteVideoStopped: { userId: string; producerId: string };
  participantJoined: { userId: string };
  participantLeft: { userId: string };
  reconnecting: void;
  reconnected: void;
  reconnectionFailed: Error;
}

export interface ConnectionStatus {
  connected: boolean;
  deviceReady: boolean;
  inRoom: boolean;
  hasVideo: boolean;
  remoteParticipants: number;
  queueSize: number;
  processing: boolean;
  reconnecting: boolean;
}

// === Mocks ===

export interface MockWebSocket {
  readyState: number;
  sentMessages: string[];
  listeners: Map<string, Function[]>;
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  simulateOpen(): void;
  simulateMessage(data: any): void;
  simulateError(error: Error): void;
  simulateClose(): void;
}
