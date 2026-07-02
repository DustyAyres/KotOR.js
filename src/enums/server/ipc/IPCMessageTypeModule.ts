export enum IPCMessageTypeModule {
  LoadStart = 0x01,
  LoadEnd = 0x02,
  Unload = 0x03,
  AreaList = 0x04,
  /** H→C: resref:STRING, waypoint:STRING — load this module and await object sync (drag-along) */
  Load = 0x05,
}