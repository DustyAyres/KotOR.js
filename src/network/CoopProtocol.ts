/**
 * Co-op wire-protocol constants shared by the browser netcode and mirrored by
 * the Node relay (scripts/coop-server.js — plain JS, keep in sync by hand).
 *
 * Relay envelope: every binary WebSocket frame is [peerId:u16 LE][IPCMessage bytes].
 *  - frame arriving AT the host:   peerId = sender client id
 *  - frame sent BY the host:       peerId = target client id (BROADCAST = all)
 *  - frame arriving AT a client:   peerId = sender (always HOST_PEER_ID)
 *  - peerId CONTROL_PEER_ID: payload is UTF-8 JSON relay-control, not an IPCMessage
 */
export const COOP_PROTOCOL_VERSION = 1;

export const HOST_PEER_ID = 0x0000;
export const BROADCAST_PEER_ID = 0xffff;
export const CONTROL_PEER_ID = 0xfffe;

/** Default port of the Node co-op relay (scripts/coop-server.js). */
export const COOP_DEFAULT_PORT = 8090;

/** Default session code when none is supplied (single-session LAN play). */
export const COOP_DEFAULT_SESSION = 'DEFAULT';

/** Relay-control JSON message (peerId == CONTROL_PEER_ID frames). */
export interface ICoopControlMessage {
  event: 'welcome' | 'joined' | 'left' | 'host-left' | 'error';
  peerId?: number;
  session?: string;
  hostConnected?: boolean;
  message?: string;
}

export type CoopRole = 'host' | 'client';
