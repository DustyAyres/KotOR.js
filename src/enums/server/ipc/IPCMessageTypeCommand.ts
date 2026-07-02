/**
 * Command sub-types (IPCMessageType.Command) — client→host player intent for
 * the co-op-owned party member. The host validates ownership (sender peerId
 * === creature.ownerPeerId) and routes through the existing Action pipeline.
 * See .planning/COOP-NETPLAY-DESIGN.md Appendix A.
 */
export enum IPCMessageTypeCommand {
  /** C→H: x:FLOAT, y:FLOAT, z:FLOAT, run:INTEGER — path to a world point (ActionMoveToPoint) */
  MoveTo = 0x01,
  /** C→H: targetObjectId:OBJECT_ID — attackCreature on the owned member */
  Attack = 0x02,
  /** C→H: targetObjectId:OBJECT_ID — use door/placeable (actionOpenDoor/actionUseObject) */
  UseObject = 0x03,
  /**
   * C→H: heading:FLOAT (world-space radians), run:INTEGER — held-key steering.
   * The engine's WASD movement is direct per-frame velocity (not an Action), so
   * clients stream their world-space heading at a tick rate; the host re-applies
   * force/facing each sim tick until MoveStop or staleness timeout.
   */
  MoveDir = 0x04,
  /** C→H: (no params) — stop held-key steering */
  MoveStop = 0x05,
  /** C→H: (no params) — clear the owned member's action queue (cancel) */
  ClearActions = 0x06,
}
