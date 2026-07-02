export enum IPCMessageTypeObject {
  Create = 0x01,
  Destroy = 0x02,
  /** H→C: objectId, x:FLOAT, y:FLOAT, z:FLOAT, facing:FLOAT (low tick rate; client interpolates) */
  Transform = 0x03,
  /** H→C: objectId, animIndex:INTEGER, animName:STRING (resolved 2DA clip — host RNG picks it) */
  Animation = 0x04,
  /** H→C: objectId, currentHP:INTEGER, maxHP:INTEGER */
  HP = 0x05,
  /** H→C: attackerId, targetId, result:INTEGER, damage:INTEGER (pre-mitigation display value), isRanged:INTEGER */
  CombatEvent = 0x06,
  /** H→C: objectId */
  Death = 0x07,
  /** H→C: objectId, field:INTEGER, value:INTEGER (door openState, saber powered, etc.) */
  State = 0x08,
}