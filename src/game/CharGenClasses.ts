import { GameEngineType } from "@/enums/engine/GameEngineType";
import { GameState } from "@/GameState";

export interface CharGenClassInterface {
  id: number;
  strings: {
    name: number,
    gender: number,
    description: number,
  },
  appearances: number[]
}

export const CharGenClasses: {[key: number]: CharGenClassInterface} = {
  0: {
    id: 2,
    strings: {
      name: 135,
      gender: 358,
      description: 32109
    },
    appearances: [136, 139, 142, 145, 148, 151, 154, 157, 160, 163, 166, 169, 172, 175, 178]
  },
  1: {
    id: 1,
    strings: {
      name: 133,
      gender: 358,
      description: 32110
    },
    appearances: [137, 140, 143, 146, 149, 152, 155, 158, 161, 164, 167, 170, 173, 175, 179]
  },
  2: {
    id: 0,
    strings: {
      name: 134,
      gender: 358,
      description: 32111
    },
    appearances: [138, 141, 144, 147, 150, 153, 156, 159, 162, 165, 168, 171, 174, 177, 180]
  },
  3: {
    id: 0,
    strings: {
      name: 134,
      gender: 359,
      description: 32111
    },
    appearances: [93, 96, 99, 102, 105, 108, 111, 114, 117, 120, 123, 126, 129, 132, 135]
  },
  4: {
    id: 1,
    strings: {
      name: 133,
      gender: 359,
      description: 32110
    },
    appearances: [92, 95, 98, 101, 104, 107, 110, 113, 116, 119, 122, 125, 128, 131, 134]
  },
  5: {
    id: 2,
    strings: {
      name: 135,
      gender: 359,
      description: 32109
    },
    appearances: [91, 94, 97, 100, 103, 106, 109, 112, 115, 118, 121, 124, 127, 130, 133]
  }
};

/**
 * TSL (KotOR II) player appearance pools.
 *
 * These are appearance.2da rows for the playable Human "medium build" bodies
 * (labels P_MAL_*_MED_* / P_FEM_*_MED_*), using the neutral-alignment variant of
 * each face — i.e. the `appearancenumber` column of every `forpc == 1` row in
 * TSL's portraits.2da. (Each PC face occupies three consecutive appearance rows:
 * appearance_s / appearancenumber / appearance_l for the dark / neutral / light
 * side bodies; a freshly created character is neutral, so we seed the neutral
 * row.) Verified against a live TSL install. Unlike K1, appearance is not tied to
 * class in TSL, so all three Jedi classes share the same gender-appropriate pool.
 */
const TSL_MALE_APPEARANCES = [137, 140, 143, 146, 152, 155, 158, 161, 164, 167, 170, 173, 176, 179, 544, 579];
const TSL_FEMALE_APPEARANCES = [92, 95, 98, 101, 104, 107, 110, 113, 116, 119, 122, 125, 128, 134, 547, 664, 667];

/**
 * TSL class-selection slots. The three classes are the Jedi classes
 * (classes.2da rows 3/4/5): Jedi Guardian, Jedi Consular, Jedi Sentinel. Slots
 * 0–2 are the male presets and 3–5 the female presets (gender is derived from
 * the slot index by CharGenManager.GetPlayerTemplate). Name/description string
 * refs come straight from TSL's classes.2da; gender refs (358 Male / 359 Female)
 * match K1.
 */
export const CharGenClassesTSL: {[key: number]: CharGenClassInterface} = {
  0: { // Jedi Guardian (Male)
    id: 3,
    strings: { name: 353, gender: 358, description: 1311 },
    appearances: TSL_MALE_APPEARANCES
  },
  1: { // Jedi Consular (Male)
    id: 4,
    strings: { name: 354, gender: 358, description: 1312 },
    appearances: TSL_MALE_APPEARANCES
  },
  2: { // Jedi Sentinel (Male)
    id: 5,
    strings: { name: 355, gender: 358, description: 1313 },
    appearances: TSL_MALE_APPEARANCES
  },
  3: { // Jedi Guardian (Female)
    id: 3,
    strings: { name: 353, gender: 359, description: 1311 },
    appearances: TSL_FEMALE_APPEARANCES
  },
  4: { // Jedi Consular (Female)
    id: 4,
    strings: { name: 354, gender: 359, description: 1312 },
    appearances: TSL_FEMALE_APPEARANCES
  },
  5: { // Jedi Sentinel (Female)
    id: 5,
    strings: { name: 355, gender: 359, description: 1313 },
    appearances: TSL_FEMALE_APPEARANCES
  }
};

/**
 * Returns the character-generation class table for the active game. K1 uses the
 * three base classes (Soldier/Scout/Scoundrel); TSL uses the three Jedi classes.
 * Defaults to the running game (GameState.GameKey) but accepts an explicit key.
 */
export function getCharGenClasses(gameKey: GameEngineType = GameState.GameKey): {[key: number]: CharGenClassInterface} {
  return gameKey === GameEngineType.TSL ? CharGenClassesTSL : CharGenClasses;
}
