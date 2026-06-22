import { describe, test, expect } from "@jest/globals";
import {
  applyDamageImmunity,
  absorbDamageByType,
  applyFlatDamageReduction,
  mitigateDamage,
  DamageResistanceShield,
  DamageImmunity,
  DamageReducer,
} from "@/combat/CombatMath";
import { DamageType } from "@/enums/combat/DamageType";

/**
 * Dump-cited mitigation math (swkotor2.exe FUN_006adec0 tail:
 * Immunity % -> Resistance -> Reduction).
 */
describe("CombatMath - damage mitigation", () => {

  describe("applyDamageImmunity (stage 1, FUN_00542e00)", () => {
    test("50% immunity halves damage", () => {
      expect(applyDamageImmunity(10, 50)).toBe(5);
    });
    test("100% immunity removes all damage", () => {
      expect(applyDamageImmunity(10, 100)).toBe(0);
    });
    test("negative pct is vulnerability (adds damage)", () => {
      expect(applyDamageImmunity(10, -50)).toBe(15);
    });
    test("a positive immunity always removes at least 1", () => {
      // floor(5 * 10 / 100) = 0, but pct > 0 forces reduction >= 1
      expect(applyDamageImmunity(10, 5)).toBe(9);
    });
    test("pct is clamped to [-100, +100]", () => {
      expect(applyDamageImmunity(10, 150)).toBe(0);   // clamp 100
      expect(applyDamageImmunity(10, -150)).toBe(20); // clamp -100
    });
    test("zero damage stays zero", () => {
      expect(applyDamageImmunity(0, 50)).toBe(0);
    });
  });

  describe("absorbDamageByType (stage 2, FUN_00541fd0)", () => {
    test("an unlimited-pool shield absorbs perHit of the matching type", () => {
      const perType: number[] = [];
      perType[DamageType.ENERGY] = 10;
      const shields: DamageResistanceShield[] = [
        { flags: 1 << DamageType.ENERGY, perHit: 5, pool: 0 }, // pool <= 0 == unlimited
      ];
      const resisted = absorbDamageByType(perType, shields);
      expect(resisted).toBe(5);
      expect(perType[DamageType.ENERGY]).toBe(5);
    });
    test("the pool depletes and caps absorption", () => {
      const perType: number[] = [];
      perType[DamageType.ENERGY] = 10;
      const shields: DamageResistanceShield[] = [
        { flags: 1 << DamageType.ENERGY, perHit: 5, pool: 3 },
      ];
      const resisted = absorbDamageByType(perType, shields);
      expect(resisted).toBe(3);
      expect(shields[0].pool).toBe(0);
      expect(perType[DamageType.ENERGY]).toBe(7);
    });
    test("a shield only absorbs damage types it covers", () => {
      const perType: number[] = [];
      perType[DamageType.FIRE] = 10;
      const shields: DamageResistanceShield[] = [
        { flags: 1 << DamageType.COLD, perHit: 5, pool: 0 },
      ];
      expect(absorbDamageByType(perType, shields)).toBe(0);
      expect(perType[DamageType.FIRE]).toBe(10);
    });
  });

  describe("applyFlatDamageReduction (stage 3, FUN_00541430)", () => {
    test("DR applies when the attack power is below the required power", () => {
      const reducers: DamageReducer[] = [{ amount: 5, power: 1, pool: 0 }];
      expect(applyFlatDamageReduction(10, 0, reducers)).toBe(5);
    });
    test("DR is penetrated when attack power >= required power", () => {
      const reducers: DamageReducer[] = [{ amount: 5, power: 1, pool: 0 }];
      expect(applyFlatDamageReduction(10, 1, reducers)).toBe(0);
    });
    test("the pool caps and depletes the reduction", () => {
      const reducers: DamageReducer[] = [{ amount: 5, power: 5, pool: 2 }];
      expect(applyFlatDamageReduction(10, 0, reducers)).toBe(2);
      expect(reducers[0].pool).toBe(0);
    });
  });

  describe("mitigateDamage (full pipeline)", () => {
    test("with no mitigation, returns the full per-type total", () => {
      const perType: number[] = [];
      perType[DamageType.SLASHING] = 8;
      perType[DamageType.PHYSICAL] = 3; // e.g. STR mod
      expect(mitigateDamage(perType, [], [], [], 0)).toBe(11);
    });
    test("floor-1 PRE: a connecting hit with zero damage still deals 1", () => {
      expect(mitigateDamage([], [], [], [], 0)).toBe(1);
    });
    test("resistance reduces the matching type", () => {
      const perType: number[] = [];
      perType[DamageType.ENERGY] = 10;
      const shields: DamageResistanceShield[] = [
        { flags: 1 << DamageType.ENERGY, perHit: 5, pool: 0 },
      ];
      expect(mitigateDamage(perType, [], shields, [], 0)).toBe(5);
    });
    test("immunity applies before resistance, per type", () => {
      const perType: number[] = [];
      perType[DamageType.FIRE] = 10;
      const immunities: DamageImmunity[] = [{ flags: 1 << DamageType.FIRE, pct: 50 }];
      expect(mitigateDamage(perType, immunities, [], [], 0)).toBe(5);
    });
    test("ordering: immunity then resistance then reduction", () => {
      const perType: number[] = [];
      perType[DamageType.ENERGY] = 20;
      const immunities: DamageImmunity[] = [{ flags: 1 << DamageType.ENERGY, pct: 50 }]; // 20 -> 10
      const shields: DamageResistanceShield[] = [
        { flags: 1 << DamageType.ENERGY, perHit: 4, pool: 0 }, // 10 -> 6
      ];
      const reducers: DamageReducer[] = [{ amount: 2, power: 1, pool: 0 }]; // 6 -> 4
      expect(mitigateDamage(perType, immunities, shields, reducers, 0)).toBe(4);
    });
    test("floor-0 POST: over-reduction clamps to zero", () => {
      const perType: number[] = [];
      perType[DamageType.SLASHING] = 2;
      const reducers: DamageReducer[] = [{ amount: 5, power: 1, pool: 0 }];
      expect(mitigateDamage(perType, [], [], reducers, 0)).toBe(0);
    });
  });
});
