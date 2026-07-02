# KotOR.js Co-op / Net Play — Design & Architecture

Status: **IN PROGRESS** (v1 implementation started 2026-07-01). Target baseline: **KotOR 2 / TSL** first (netcode lives in shared `src/`, not `src/game/{kotor,tsl}`, so K1 follows for free; only menus/test-scenario are game-specific).

## 0. Decisions locked (2026-07-01, with the user)

| Question | Decision |
|---|---|
| Transport | **Standalone Node WS relay** (`scripts/coop-server.js`): host + clients all connect to it; it routes `IPCMessage` frames by session. Can later grow into a dedicated server. |
| v1 control surface | **Move + fight + UI ownership gating** — click-to-move, attack, use doors/placeables, AND equipment/level-up/character-sheet locked to the locally owned character. |
| Join flow | **Minimal in-game UI now**: TSL main-menu Host/Join Co-op buttons + a party-claim screen (not URL-param plumbing only). |
| Pause | **Synchronized pause** — any player pausing pauses the host sim for everyone; host `EngineState.PAUSED` is authoritative and replicates. |
| Co-op player clicks dialog NPC | **Blocked + in-game popup** ("Only the party leader can speak to them") via the existing in-game feedback popup UX. Conversations stay 100% host-initiated in v1. |
| Loot | **Shared pool** — any player loots, one global inventory; only equipment/level-up screens are ownership-gated. |
| Reference test | **Peragus (101PER/106PER) with harness-injected Kreia/Atton**, second browser claims one, fight mining droids together. Two Playwright browser contexts against one relay. |

## 1. Goal & scope

Shared-campaign **drop-in co-op for up to 3 players**, mapping onto KotOR's party model: the host plays the campaign normally; each connecting player **takes control of one of the host's active party members**. This is co-op (one shared story, host-authoritative), **not** PvP or MMO.

Why this is a good fit / why it's feasible here:
- KotOR is **party-based** — "co-op" = "a human drives a party member instead of the companion AI." Max active party in K1 is **3** (leader + 2), so 3 players is the natural cap.
- The original engine authors **scaffolded a client-server split**: `src/worker/server.ts` (`OdysseyServer`, an explicit "stub for the eventual server worker that will handle the game server logic"), `src/server/ipc/IPCMessage` (binary message protocol with `toBuffer`/`fromBuffer`), server-side `GameObject`/`AreaObject`/`Module` (`src/server/object/`), and message-type taxonomies (`src/enums/server/ipc/IPCMessageType{,Area,Module,Object,Script}.ts`). We implement this seam rather than invent one.
- **Player intent is already a serializable command stream**: `ActionFactory` actions (move/attack/cast/open-door/dialog) on each creature's action queue, plus `CombatRound`. Replicating "what a player wants to do" = replicating queued Actions.
- **Full game state is already GFF-serializable** (the save system) → initial-state sync / late join.

## 2. Authority model

**Host-authoritative.** Exactly one process (the host) runs the real simulation — `GameState`, the NWScript VM, combat resolution, AI, RNG (`Dice`/`Math.random`), triggers, scripts. `GameState` is a static singleton, so there is only ever **one authoritative sim**; connecting clients are **thin** (render + input + their own UI).

- All RNG and NWScript run **only** on the host. (This rules out lockstep — which the non-deterministic `Math.random` in `Dice` would break anyway — and matches the authoritative design the `OdysseyServer` stub assumes.)
- Clients never mutate world state directly. They send **commands** (intent) and receive **state deltas + events**.
- Transport: a **WebSocket** (or WebRTC data channel) carrying the existing `IPCMessage` binary protocol. The `OdysseyServer` worker can host locally (Web Worker) or be promoted to a remote node server later; the protocol is transport-agnostic.

## 3. Player & control-ownership model

Three "control slots", each bound to one **active party member** (`PartyManager.party[i]`):

| Slot | Default owner | Controls |
|---|---|---|
| 0 | Host | The main PC (party leader) |
| 1 | Co-op player A (when connected & assigned) | One chosen party member |
| 2 | Co-op player B (when connected & assigned) | One chosen party member |

**Ownership transfer rules (per the spec):**
- When a co-op player connects and **selects a party member**, control of that member transfers to them. The host can **no longer**: control that member's movement/actions, open its **equipment**, or **level it up**.
- A co-op player may **only**: control their assigned character, and access **that character's** equipment / level-up / character sheet. They cannot control or manage any other party member.
- Unassigned/AI party members behave as normal companion AI under host authority.

**Inventory nuance (engine reality):** in KotOR the *item pool* is shared (`InventoryManager.inventory` is a single global list); only **equipment** (`creature.equipment`) and **level-up/skills/feats** are per-character. So the gate is: a player can open the **equipment & level-up screens only for their owned character**; the shared loot pool itself is common (design choice: allow all players to draw from the shared pool, or lock pickups — default: shared pool, per-character equip only).

**Authority tag:** add an `ownerPeerId` (or `controlSlot`) to `ModuleCreature` for party members. The host uses it to (a) route an incoming command to the right creature, (b) skip companion-AI for human-owned members, and (c) gate UI on each client.

## 4. Networking architecture

```
            ┌─────────────────────────── HOST (authoritative) ──────────────────────────┐
            │  GameState (sim)  ·  NWScript VM  ·  CombatRound  ·  PartyManager  ·  AI    │
            │        ▲ commands                                   │ state deltas/events  │
            │        │                                            ▼                      │
            │   OdysseyServer (src/worker/server.ts) ── IPCMessage binary protocol ──────┤
            └────────┼────────────────────────────────────────────────────────┼─────────┘
        WebSocket/WebRTC                                              WebSocket/WebRTC
            ┌────────▼─────────┐                                    ┌──────────▼─────────┐
            │  Client A (thin) │                                    │  Client B (thin)   │
            │  render + input  │                                    │  render + input    │
            │  own char UI     │                                    │  own char UI       │
            └──────────────────┘                                    └────────────────────┘
```

- **Up-stream (client→host):** `Command` messages — movement intent, "use object N", "attack object N", "equip item X on my char", "level-up choice", "select party member K", "request conversation with N".
- **Down-stream (host→clients):** `State`/`Event` messages keyed by the existing IPC taxonomy:
  - **Object** (`IPCMessageTypeObject`): spawn/despawn, position+facing, animation state, HP/combat events, equipment changes, door/placeable open state.
  - **Area** (`IPCMessageTypeArea`): area-level changes, ambient/state.
  - **Module** (`IPCMessageTypeModule`): module load/transition directives ("load `end_m01aa`, you're being dragged along").
  - **Script** (`IPCMessageTypeScript`): selected script-driven events the clients must react to (bark text, journal updates, cutscene cues).
- **Replication is delta/event-based, not full snapshots per frame** (full GFF snapshots are only for **initial sync / late join**). Position/anim at a low tick rate with client-side interpolation; discrete events (HP, door, equip, death) sent reliably.

## 5. Input & command flow

1. Client gathers input (click-to-move, action-menu choice) and emits a **Command** (reuse the `Action` vocabulary: `ActionMoveToPoint`, `ActionPhysicalAttacks`, `ActionUseObject`, …).
2. Host validates (is this peer the owner of that creature? is the action legal?) and **enqueues the Action on the owned creature's action queue** — i.e., it flows through the *existing* action/combat pipeline unchanged.
3. The host simulates; resulting state changes replicate back down as Object/Area events.
4. Clients render owned + remote creatures from replicated state, each with **its own camera** following its character (today there is a single `FollowerCamera`; co-op needs a camera instance per client — only the local one matters on each client).

## 6. UI / menu additions

- **Main menu:** "Host Co-op Game" and "Join Co-op Game" (address/lobby code). Net status indicator.
- **Lobby / slot assignment:** show the 3 control slots and the current party; connecting players pick an available party member (**character-select**).
- **In-game gating** (the load-bearing UI rule): the **equipment menu, level-up/character sheet, and party-control** are filtered to the **locally owned** character. On the host, owned-by-others members are read-only (can't equip/level/command them). On a client, only its own character's screens are reachable.
- **Party selection menu:** when a player must (re)choose a character (on join, or after their character leaves the story — see §9).
- Net HUD: who controls whom, connection state, host-paused indicator.

## 7. Conversations & cutscenes (per spec)

KotOR conversations are single-player and modal (`CutsceneManager.startConversation(dialog, owner, listener)`, one camera, party freezes). Co-op policy:

- **Host ↔ NPC conversation:** only the **host's PC** can initiate a conversation with an NPC that requires dialog. When the host enters a conversation, **co-op players become spectators** — their client switches to the conversation camera and shows the same dialog/cutscene the host sees (replicate the active `DLGObject` node, camera, and entry/reply state via Script/Object messages). Co-op players' input is suspended for the duration (they watch).
- **Co-op players cannot start NPC (dialog) conversations.** If a co-op player clicks an NPC that requires conversation, **control switches to the host's PC** for that interaction (the host's character is the one who "talks"), i.e. the request is forwarded to the host PC rather than starting a dialog the co-op player drives. (Alternative we may pick during impl: simply no-op with a "the leader must speak to them" prompt.)
- **Host interacting with a co-op-controlled party member:** still allowed and **plays as a cutscene** (party/companion conversation between the host PC and that companion). The co-op player who owns that companion watches the cutscene (and we may let them advance/▸ their own replies if the conversation is a two-party companion dialog — open question).
- Implementation: conversations remain **host-driven**; clients receive a "conversation active" state (participants, current node, camera) and render it; client input gates to dialog-reply selection only for the participant(s).

## 8. Module transitions

- The **host's PC is the leader**; co-op players' characters are party members, so when the host transitions modules, the co-op characters are **dragged along like companion party members** (the party travels together). The host issues a **Module** message ("load module M at waypoint W"); each client tears down its current area view and loads the new module's render state from the host's replication (or loads the module assets locally and syncs object state).
- No independent module exploration in v1 — the party is co-located (matches KotOR's design and avoids instancing). Co-op players cannot leave the host's module on their own.

## 9. Character lifecycle (story removal → reselect)

- KotOR removes party members for story reasons (temporary or permanent). When a **co-op-controlled member is removed from the active party**, that co-op player is **detached** and must **select a new available party member** (back to the party-selection menu). If no controllable member is available (e.g., a solo-PC stretch), the co-op player **spectates the host** until a member becomes available.
- Conversely, when a new recruit joins, it becomes an available slot a waiting co-op player can claim.
- Edge cases to handle: a co-op player's character is force-removed mid-action/mid-combat; ownership must release cleanly and any queued Actions for that creature drop.

## 10. Combat & active-pause

KotOR uses **active-pause** (pause to queue actions). You can't pause the world for one player in co-op. Options (decide during impl):
- **Real-time** combat for co-op sessions (no pause), OR
- **Synchronized pause** — any player pausing pauses the host sim for everyone (simplest, preserves the KotOR feel; the host's `EngineState.PAUSED` is the single source of truth and replicates).
Default recommendation: **synchronized pause** (host-authoritative `State == PAUSED`), since combat resolution already lives in host-side `CombatRound`s.

## 11. Engine touch-points (where the work lands — shared `src/`)

- `src/worker/server.ts` (`OdysseyServer`) — implement `HandleMessageFromClient` / `SendMessageToClient`; add a WebSocket/WebRTC transport binding.
- `src/server/ipc/IPCMessage*`, `src/enums/server/ipc/*` — flesh out the message set (Command up-stream + Object/Area/Module/Script down-stream); `src/server/object/{GameObject,AreaObject,Module}` for the server-side replicated view.
- `GameState` — net-mode flag; route input vs. authoritative sim; replicate `Mode`/`State` (pause).
- `PartyManager` — control-slot ownership (`ownerPeerId` per active member), assignment/reassignment, MakeLeader semantics under co-op.
- `ModuleCreature` — `ownerPeerId`/`controlSlot`; skip companion-AI when human-owned (`updateCombat`/heartbeat); apply remote Actions to the owned creature.
- `CutsceneManager` — replicate active conversation state (participants, current `DLGNode`, camera) to spectator clients; gate reply input by participant.
- `GameState.LoadModule` — module-transition replication ("drag" clients along).
- Menus (`src/game/kotor/menu/`) — MainMenu host/join, lobby/party-select, and **gate** `MenuEquipment` / level-up / character sheet to the locally owned character. (Per-game menus, mirrored to TSL later.)
- Save/GFF (`SaveGame`, `ModuleCreature.save`) — reused for **initial full-state sync** on join.

## 12. Phased roadmap

1. **Transport + echo** — WebSocket bound to `OdysseyServer`; client connects; `IPCMessage` round-trips. No game state yet.
2. **Read-only mirror** — host replicates the leader + nearby objects (position/anim) to a connected client that *renders* the host's module (its own camera, no control). Proves replication.
3. **Owned movement** — client claims a party member; movement Commands flow client→host→action-queue; both see each other move. Companion-AI suppressed for owned members.
4. **Shared combat** — replicate HP/combat events + death; synchronized pause; co-op character fights (reuse the enemy-AI/combat work already on this branch).
5. **UI ownership gating** — equipment/level-up/character-sheet locked to owned character; lobby + party-select menus.
6. **Conversations** — host-driven dialog with co-op spectating; co-op→NPC switches to host PC; host↔companion cutscene.
7. **Module transitions** — drag co-op players along.
8. **Character lifecycle** — story removal → reselect; recruit → claimable slot.
9. **Polish/late-join** — GFF initial-state sync, reconnection, K2 parity.

A compelling **PoC milestone** = phases 1–4 (walk the Endar Spire together + shared combat), deferring conversations/transitions/lifecycle. The WEB_TEST harness + `CombatArena` make this directly testable (two browser contexts against one host).

## 13. Open questions / risks

- **Companion two-party dialogs**: when the host talks *to* a co-op-owned companion, can the co-op player pick that companion's replies, or is it purely host-driven? (Lean: host-driven in v1.)
- **Co-op→NPC interaction**: hard "switch to host PC" vs. soft "leader must speak" prompt — pick during impl.
- **Shared loot pool vs. per-player pickups** (§3 inventory nuance).
- **Tick rate / interpolation** budget for position/anim over the network.
- **NWScript PC-centric routines** (`GetFirstPC`, party helpers, cutscene scripts) assume one player — keep PC-centric logic host-side; audit routines that branch on "the player".
- **Determinism not required** (authoritative host), but **latency/jitter** handling (client prediction for own movement?) is the main feel risk.
- **Static-singleton `GameState`** means the host can't trivially run two independent sims — fine for host-authoritative, but a dedicated headless server would need the sim to run without a renderer (the WEB_TEST/worker path is a start).

---
*Cross-refs: the WEB_TEST harness + CombatArena (`.planning/WEB-TEST-HARNESS.md`, `.planning/combat-arena.js`) for two-client testing; the action/combat fixes on `parity/tsl-fixes` that make co-op combat actually resolve.*

## Appendix A — PoC wire protocol (phases 1–4)

Concrete `IPCMessage` set for the "walk the Endar Spire together + shared combat" PoC, built on the **existing** framing:

- **Message frame** (`src/server/ipc/IPCMessage.ts`): `type:u16` (category) · `subType:u16` (specific msg) · `paramCount:u16`, then params. All little-endian.
- **Param frame** (`IPCMessageParam.ts`): `dataType:u32` · `len:u32` · `value[len]`. `dataType ∈ IPCDataType` = VOID/INTEGER(i32)/FLOAT(f32)/STRING(utf8)/OBJECT_ID(treat as i32 game object id).

**New top-level categories to add to `IPCMessageType`** (alongside existing Object/Area/Module/Script/Debug): `Session` (handshake/slots/pause) and `Command` (client→host intent). Down-stream world state reuses **Object**/**Module**. Add the sub-type enums noted below.

Legend: **C→H** client→host, **H→C** host→client. Params listed in order.

### Phase 1 — transport + handshake (category `Session`)
| Dir | type.subType | Params |
|---|---|---|
| C→H | Session.Hello (0x01) | `protocolVersion:INTEGER`, `clientName:STRING` |
| H→C | Session.Welcome (0x02) | `peerId:INTEGER`, `hostModule:STRING`, `partySize:INTEGER` |
| ↔ | Session.Ping/Pong (0x03/0x04) | `t:INTEGER` (rtt/keepalive) |

### Phase 2 — read-only mirror (category `Object`, existing Create/Destroy; + `Module`)
| Dir | type.subType | Params |
|---|---|---|
| H→C | Module.Load | `resref:STRING`, `waypoint:STRING` *(client loads assets, awaits object sync)* |
| H→C | Object.Create (0x01) | `objectId:OBJECT_ID`, `objType:INTEGER`, `templateResRef:STRING`, `x:FLOAT`,`y:FLOAT`,`z:FLOAT`, `facing:FLOAT` |
| H→C | Object.Destroy (0x02) | `objectId:OBJECT_ID` |
| H→C | Object.Transform (0x03) | `objectId:OBJECT_ID`, `x:FLOAT`,`y:FLOAT`,`z:FLOAT`, `facing:FLOAT` *(low tick rate; client interpolates)* |
| H→C | Object.Animation (0x04) | `objectId:OBJECT_ID`, `animId:INTEGER` |

### Phase 3 — owned movement (`Session` claim + `Command`)
| Dir | type.subType | Params |
|---|---|---|
| C→H | Session.ClaimSlot (0x05) | `partyMemberIndex:INTEGER` |
| H→C | Session.SlotAssigned (0x06) | `peerId:INTEGER`, `objectId:OBJECT_ID`, `slot:INTEGER` *(broadcast; sets ModuleCreature.ownerPeerId, suppresses companion AI)* |
| C→H | Command.MoveTo (0x01) | `x:FLOAT`,`y:FLOAT`,`z:FLOAT`, `run:INTEGER` *(host validates owner, enqueues ActionMoveToPoint on owned creature)* |

### Phase 4 — shared combat + synchronized pause (`Command` + `Object` + `Session`)
| Dir | type.subType | Params |
|---|---|---|
| C→H | Command.Attack (0x02) | `targetObjectId:OBJECT_ID` *(host enqueues attackCreature on owned creature)* |
| C→H | Command.UseObject (0x03) | `targetObjectId:OBJECT_ID` *(door/placeable)* |
| H→C | Object.HP (0x05) | `objectId:OBJECT_ID`, `currentHP:INTEGER`, `maxHP:INTEGER` |
| H→C | Object.CombatEvent (0x06) | `attackerId:OBJECT_ID`, `targetId:OBJECT_ID`, `result:INTEGER`, `damage:INTEGER` *(drives feedback/text/anim)* |
| H→C | Object.Death (0x07) | `objectId:OBJECT_ID` |
| H→C | Object.State (0x08) | `objectId:OBJECT_ID`, `field:INTEGER`, `value:INTEGER` *(door openState, locked, etc.)* |
| ↔ | Session.SetPause (0x07) | `paused:INTEGER` *(host is authoritative on EngineState.PAUSED; any client request round-trips through host then broadcasts)* |

### Authority/validation rules (host)
- Every `Command.*` is validated: the sending `peerId` must equal the target creature's `ownerPeerId`; illegal/unowned commands are dropped.
- Host never trusts client positions — it simulates and echoes authoritative `Object.Transform`. (Client may locally predict its **own** movement and reconcile.)
- Object ids are the host's `ModuleObject.id`; clients key their replicated view by it.
- Initial/late join: send `Module.Load` then a burst of `Object.Create` for the area (or a GFF snapshot via a `Session.Snapshot` VOID param) before resuming deltas.

### Not in PoC (later phases)
Conversations (host-driven dialog replication via `Script`/`Object` + reply gating), module-transition drag-along beyond a single `Module.Load`, character-removal reselect, equipment/level-up ownership gating, and reconnection. See §7–§9.
