/**
 * NetMode — co-op/netplay role of this process.
 *
 * NONE   = single-player (default); no netcode active.
 * HOST   = this process runs the authoritative simulation and replicates
 *          state to connected co-op clients.
 * CLIENT = thin client: renders locally-loaded module assets but mirrors the
 *          host's authoritative state; sends Command intents, never simulates.
 */
export enum NetMode {
  NONE = 0,
  HOST = 1,
  CLIENT = 2,
}
