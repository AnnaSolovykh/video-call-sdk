import * as mediasoupClient from 'mediasoup-client';

/**
 * Media kinds supported by the SDK
 */
export type MediaKind = 'audio' | 'video';

/**
 * Remote consumer information
 */
export interface RemoteConsumer {
  userId: string;
  producerId: string;
  consumer: mediasoupClient.types.Consumer;
  track: MediaStreamTrack;
}

/**
 * Video encoding settings
 */
export interface VideoEncodingSettings {
  maxBitrate: number;
}

/**
 * Video codec options
 */
export interface VideoCodecOptions {
  videoGoogleStartBitrate: number;
}

/**
 * Media constraints for getUserMedia
 */
export interface MediaConstraints {
  video?: MediaTrackConstraints | boolean;
  audio?: MediaTrackConstraints | boolean;
}

/**
 * Default video constraints
 */
export const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: 640,
  height: 480,
};

/**
 * Default video encodings for SVC
 */
export const DEFAULT_VIDEO_ENCODINGS: VideoEncodingSettings[] = [
  { maxBitrate: 500000 },   // Low quality
  { maxBitrate: 1000000 },  // Medium quality
  { maxBitrate: 2000000 },  // High quality
];

/**
 * Default codec options
 */
export const DEFAULT_CODEC_OPTIONS: VideoCodecOptions = {
  videoGoogleStartBitrate: 1000,
};

/**
 * Participant information
 */
export interface Participant {
  userId: string;
  producers: string[];
  joinedAt: Date;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * Call state enumeration
 */
export type CallState = 
  | 'idle'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/**
 * Media statistics
 */
export interface MediaStats {
  bytesSent?: number;
  bytesReceived?: number;
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
  fractionLost?: number;
  jitter?: number;
  roundTripTime?: number;
}