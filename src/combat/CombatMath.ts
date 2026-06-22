import { DamageType } from "@/enums/combat/DamageType";

/**
 * CombatMath
 *
 * Pure, unit-testable combat math ported from the decompiled KotOR II retail
 * binary (swkotor2.exe; Ghidra project at C:\Users\Alec\kotor-re). The damage
 * mitigation pipeline below is the dump-cited port of the tail of FUN_006adec0
 * (the weapon-hit damage routine), which applies three sequential mitigation
 * stages to the assembled damage total in the order
 *   Immunity %  ->  Resistance  ->  Reduction
 * via the target creature's vtable slots +0xac / +0xa8 / +0xa4.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file CombatMath.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */

/**
 * A Damage Resistance shield (energy / Force / droid shield). Covers a damage
 * type T when (flags & (1 << T)). Built by EffectForceShield from forceshields.2da
 * (damageflags / resistance / amount) and by the EffectDamageResistance routine.
 */
export interface DamageResistanceShield {
  /** Damage-type flag mask; covers damage type T when (flags & (1 << T)). */
  flags: number;
  /** Points of damage removed per hit, per covered type. */
  perHit: number;
  /** Remaining absorption pool; <= 0 means unlimited. Mutated as damage is absorbed. */
  pool: number;
}

/**
 * A Damage Immunity / Vulnerability accumulator entry. Covers a damage type T
 * when (flags & (1 << T)). pct > 0 is immunity, pct < 0 is vulnerability.
 */
export interface DamageImmunity {
  /** Damage-type flag mask; covers damage type T when (flags & (1 << T)). */
  flags: number;
  /** Signed percent: positive = immunity, negative = vulnerability. */
  pct: number;
}

/**
 * A universal flat Damage Reduction effect ("DR n/+power"). Applies a flat amount
 * unless the attack's penetration power beats the required power. Pooled.
 */
export interface DamageReducer {
  /** Flat points of damage removed. */
  amount: number;
  /** Required penetration power; DR applies only when attackPower < power. */
  power: number;
  /** Remaining pool; <= 0 means unlimited. Mutated as damage is reduced. */
  pool: number;
}

/**
 * Stage 1 - Damage Immunity / Vulnerability (dump FUN_00542e00, vtable +0xac).
 * ```c
 * int reduction = pct * damage / 100;          // positive = immunity, negative = vulnerability
 * if (pct > 0 && reduction < 1) reduction = 1; // a positive immunity always removes >= 1
 * return damage - reduction;                   // = damage * (100 - pct) / 100
 * ```
 * pct is clamped here to [-100, +100] (the dump accumulator FUN_00543260 clamps to
 * the same range before this stage sees it).
 */
export function applyDamageImmunity(dmg: number, pct: number): number {
  if (dmg <= 0) return 0;
  let p = pct | 0;
  if (p > 100) p = 100;
  if (p < -100) p = -100;
  // C integer division truncates toward zero (Math.trunc), NOT toward -inf. This
  // matters for negative pct (vulnerability): Math.floor would make the negative
  // reduction one larger in magnitude on inexact division, over-applying damage by 1.
  let reduction = Math.trunc((p * dmg) / 100);
  if (p > 0 && reduction < 1) reduction = 1;
  const result = dmg - reduction;
  return result < 0 ? 0 : result;
}

/**
 * Stage 2 - Damage Resistance (dump FUN_00541fd0, vtable +0xa8). Type-keyed,
 * pooled absorption: for each damage type, the largest matching resistance shield
 * removes up to `perHit` points, depleting its `pool`. Mutates `perTypeDamage`
 * (reduces absorbed types) and each `shield.pool` in place. Returns total absorbed.
 *
 * Damage types map to flags as (1 << type). Only the real damage types (0..12)
 * are type-resistable; slots 13/14 (base/physical totals) are not considered.
 */
export function absorbDamageByType(perTypeDamage: number[], shields: DamageResistanceShield[]): number {
  let resisted = 0;
  for (let type = 0; type < perTypeDamage.length && type <= 12; type++) {
    let dmg = perTypeDamage[type] | 0;
    if (dmg <= 0) continue;
    const flag = 1 << type;
    // The dump (FUN_00541fd0) applies only the SINGLE largest matching resistance
    // effect per damage type, not the sum of all matching effects. Pick the covering
    // shield with the largest perHit, then absorb from just that one (pool <= 0 ==
    // unlimited; a finite pool caps and depletes).
    let best: DamageResistanceShield | undefined;
    for (const shield of shields) {
      if (!((shield.flags | 0) & flag)) continue;
      if ((shield.perHit | 0) <= 0) continue;
      if (!best || (shield.perHit | 0) > (best.perHit | 0)) best = shield;
    }
    if (!best) continue;
    let absorb = Math.min(dmg, best.perHit | 0);
    const pool = best.pool | 0;
    if (pool > 0) {
      absorb = Math.min(absorb, pool);
      best.pool = pool - absorb;
    }
    if (absorb <= 0) continue;
    dmg -= absorb;
    resisted += absorb;
    perTypeDamage[type] = dmg;
  }
  return resisted;
}

/**
 * Stage 3 - Damage Reduction (dump FUN_00541430, vtable +0xa4). Universal flat DR:
 * subtracts a flat amount from the running total unless the attack's penetration
 * power beats the DR's required power (the "DR n/+power" mechanic). Pooled. Mutates
 * each `reducer.pool` in place. Returns the total reduced (to subtract from `total`).
 */
export function applyFlatDamageReduction(total: number, attackPower: number, reducers: DamageReducer[]): number {
  let reduced = 0;
  let remaining = total;
  const power = attackPower | 0;
  for (const r of reducers) {
    if (remaining <= 0) break;
    const amount = r.amount | 0;
    if (amount <= 0) continue;
    if (power >= (r.power | 0)) continue; // penetration beats the DR -> no reduction
    let amt = Math.min(remaining, amount);
    const pool = r.pool | 0;
    if (pool > 0) {
      amt = Math.min(amt, pool);
      r.pool = pool - amt;
    }
    if (amt <= 0) continue;
    remaining -= amt;
    reduced += amt;
  }
  return reduced;
}

/**
 * Full damage mitigation pipeline - the tail of FUN_006adec0:
 *   floor-1 (pre) -> Immunity % -> Resistance -> Reduction -> floor-0 (post)
 *
 * `perTypeDamage` is indexed by {@link DamageType} (slots 0..14). Immunity (per
 * type, accumulated Increase - Decrease, clamped) and Resistance apply to the real
 * damage types (0..12); the base/physical totals (13/14) bypass them and are only
 * touched by the universal flat Reduction stage. Mutates the `shields` / `reducers`
 * pools in place. Returns the final HP loss (>= 0).
 */
export function mitigateDamage(
  perTypeDamage: number[],
  immunities: DamageImmunity[],
  shields: DamageResistanceShield[],
  reducers: DamageReducer[],
  attackPower: number,
  damageTypeMask: number = 0,
): number {
  const dmg: number[] = [];
  for (let t = 0; t <= 14; t++) {
    const v = perTypeDamage[t] | 0;
    dmg[t] = v > 0 ? v : 0;
  }

  // The dump assembles the WHOLE swing (dice + STR + Power Attack + Weapon Spec) into
  // one typed total before the type-keyed mitigation stages. KotOR.js puts the typeless
  // physical bonuses in BASE (13) / PHYSICAL (14); fold them into the hit's primary
  // damage type (lowest set bit of the mask) so immunity / resistance act on the whole
  // swing, not just the weapon dice. With no typed damage (mask 0) they stay untyped and
  // only flat Reduction touches them.
  const primaryType = damageTypeMask ? lowestSetBitIndex(damageTypeMask) : -1;
  const foldTarget = (primaryType >= 0 && primaryType <= 12) ? primaryType : -1;
  if (foldTarget >= 0) {
    dmg[foldTarget] += dmg[DamageType.BASE] + dmg[DamageType.PHYSICAL];
    dmg[DamageType.BASE] = 0;
    dmg[DamageType.PHYSICAL] = 0;
  }

  // floor-1 PRE: a connecting hit always deals >= 1 before mitigation. The guaranteed
  // point goes to the primary damage type (so immunity / resistance can act on it, per
  // the dump) when the hit is typed, else to the typeless BASE slot.
  let pre = 0;
  for (let t = 0; t <= 14; t++) pre += dmg[t];
  if (pre < 1) dmg[foldTarget >= 0 ? foldTarget : DamageType.BASE] = 1;

  // Stage 1 - Immunity %, per real damage type (0..12).
  for (let t = 0; t <= 12; t++) {
    if (dmg[t] <= 0) continue;
    let pct = 0;
    const flag = 1 << t;
    for (const im of immunities) {
      if ((im.flags | 0) & flag) pct += im.pct | 0;
    }
    dmg[t] = applyDamageImmunity(dmg[t], pct);
  }

  // Stage 2 - Resistance, pooled per type.
  absorbDamageByType(dmg, shields);

  // Stage 3 - flat Reduction on the running total.
  let total = 0;
  for (let t = 0; t <= 14; t++) total += dmg[t];
  total -= applyFlatDamageReduction(total, attackPower, reducers);

  // floor-0 POST.
  return total < 0 ? 0 : total;
}

/** Index (0-based) of the lowest set bit of a positive mask, e.g. 0b10100 -> 2. */
function lowestSetBitIndex(mask: number): number {
  const m = mask | 0;
  if (m === 0) return -1;
  return Math.log2(m & -m);
}
