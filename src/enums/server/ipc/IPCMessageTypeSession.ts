/**
 * Session sub-types (IPCMessageType.Session) — co-op handshake, slot
 * claiming, and synchronized pause. See .planning/COOP-NETPLAY-DESIGN.md
 * Appendix A.
 */
export enum IPCMessageTypeSession {
  /** C→H: protocolVersion:INTEGER, clientName:STRING */
  Hello = 0x01,
  /** H→C: peerId:INTEGER, protocolVersion:INTEGER, hostModule:STRING, partySize:INTEGER */
  Welcome = 0x02,
  /** ↔: t:INTEGER (sender timestamp, ms, int32-truncated) */
  Ping = 0x03,
  /** ↔: t:INTEGER (echoed from Ping) */
  Pong = 0x04,
  /** C→H: partyMemberIndex:INTEGER */
  ClaimSlot = 0x05,
  /** H→C broadcast: peerId:INTEGER, objectId:OBJECT_ID, partyMemberIndex:INTEGER */
  SlotAssigned = 0x06,
  /** ↔: paused:INTEGER — host is authoritative on EngineState.PAUSED */
  SetPause = 0x07,
  /** H→C broadcast: peerId:INTEGER — a claimed slot was released (disconnect/story removal) */
  SlotReleased = 0x08,
}
