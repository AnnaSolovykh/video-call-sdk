import * as mediasoupClient from 'mediasoup-client';
import { 
  WebRtcTransportCreatedMessage, 
  TransportConnectedMessage, 
  ProducerCreatedMessage, 
  ConsumerCreatedMessage,
} from './signaling';

// === Main SDK Events ===

/**
 * Events emitted by VideoCallClient
 */
export interface VideoCallEvents {
  // Connection events
  connected: void;
  disconnected: void;
  error: Error;
  
  // Room events
  joined: { roomId: string; userId: string };
  
  // Device events
  deviceReady: void;
  
  // Local media events
  localVideoStarted: { producer: mediasoupClient.types.Producer };
  localVideoStopped: void;
  
  // Remote media events
  remoteVideoStarted: { userId: string; producerId: string; track: MediaStreamTrack };
  remoteVideoStopped: { userId: string; producerId: string };
  
  // Participant events
  participantJoined: { userId: string };
  participantLeft: { userId: string };
  
  // Reconnection events
  reconnecting: void;
  reconnected: void;
  reconnectionFailed: Error;
}

/**
 * Connection status information
 */
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

// === Manager-specific Events ===

/**
 * Events emitted by ConnectionManager
 */
export interface ConnectionEvents {
  // Basic connection
  connected: void;
  disconnected: void;
  error: Error;
  
  // Room management
  joined: { roomId: string; userId: string };
  
  // Signaling events with proper types
  routerRtpCapabilities: { rtpCapabilities: mediasoupClient.types.RtpCapabilities };
  newProducer: { producerId: string; userId: string };
  producerClosed: { producerId: string; userId: string };
  
  // Transport events with proper types
  webRtcTransportCreated: WebRtcTransportCreatedMessage;
  transportConnected: TransportConnectedMessage;
  producerCreated: ProducerCreatedMessage;
  consumerCreated: ConsumerCreatedMessage;
  
  // Reconnection events
  reconnecting: void;
  reconnected: void;
  reconnectionFailed: Error;
}

/**
 * Events emitted by MediaManager
 */
export interface MediaEvents {
  localVideoStarted: { producer: mediasoupClient.types.Producer };
  localVideoStopped: void;
  remoteVideoStarted: { userId: string; producerId: string; track: MediaStreamTrack };
  remoteVideoStopped: { userId: string; producerId: string };
}

/**
 * Events emitted by DeviceManager
 */
export interface DeviceEvents {
  deviceReady: void;
  transportCreated: { transport: mediasoupClient.types.Transport; type: 'send' | 'recv' };
}