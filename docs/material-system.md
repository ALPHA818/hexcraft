# Material System

Hexcraft's material system is a deterministic, save-owned progression layer for base elements, generated materials, discovery, research, visuals, item integration, and codex display.

The core rule is that material logic stays data-first and DOM-free. UI modules render computed material state, but they do not generate materials or own persistence.

## Ownership

| Area            | Owner                                                                          | Notes                                                                                                        |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Base elements   | `src/materials/BaseElements.ts`                                                | Periodic base materials with deterministic stats and tags.                                                   |
| Combination     | `src/materials/MaterialCombiner.ts`                                            | Creates generated materials from two parents and a station.                                                  |
| Reaction rules  | `src/materials/MaterialReactions.ts`                                           | Resolves deterministic reaction names, tags, stat modifiers, rarity, and unstable outcomes.                  |
| Stats           | `src/materials/MaterialStats.ts`                                               | Combines parent stats with seeded variation.                                                                 |
| Stations        | `src/materials/MaterialStations.ts`                                            | Defines station types and station stat/name/tag modifiers.                                                   |
| Research        | `src/materials/MaterialResearch.ts`                                            | Gates locked materials and reactions in survival mode. Creative ignores research locks.                      |
| Balance         | `src/materials/MaterialBalance.ts`                                             | Computes value, danger, and usefulness scores, and applies recursive stability pressure.                     |
| Capabilities    | `src/materials/MaterialCapabilities.ts`                                        | Computes tool, weapon, armor, fuel, magic, conductor, explosive, reactor, building, and biological grades.   |
| Visuals         | `src/materials/MaterialVisuals.ts`                                             | Computes deterministic colors and render material properties.                                                |
| Biome discovery | `src/materials/MaterialBiomeAffinities.ts` and `src/game/MaterialDropRules.ts` | Applies rare biome/cave trace discovery during mining/exploration.                                           |
| Registry        | `src/materials/MaterialRegistry.ts`                                            | Runtime lookup for base materials, generated materials, discoveries, and recipe results.                     |
| Persistence     | `src/save/WorldSaveTypes.ts` and `src/save/WorldSaveManager.ts`                | Serializes and restores material codex, research state, generated materials, recipes, and old-save defaults. |
| Items           | `src/items/ItemRegistry.ts` and `src/items/ItemStack.ts`                       | Resolves `generated-material:<materialId>` item ids through a material registry.                             |
| UI              | `src/ui/MaterialCodexPanel.ts` and `src/ui/MaterialStatsView.ts`               | Displays discovered materials, stats, balance scores, capabilities, tags, and recipe history.                |

## Determinism

Generated material behavior is deterministic for a given:

- material ids
- parent order setting
- processing station
- material config seed
- deterministic version
- reaction rules

Important helpers:

- `recipeKeyForMaterialIds(...)` includes the processing station type.
- `stableHashString(...)`, `stableHashFloat(...)`, and `stableHashChoice(...)` are used for seeded variation.
- `combineMaterialStats(...)` uses the recipe key and config seed.
- `generatedMaterialName(...)`, visual palettes, unstable outcome rolls, and discovery timestamps are stable.

Avoid `Math.random()` in material logic. Add deterministic tests whenever new generation behavior is added.

## Generation Flow

1. `combineMaterials(parentA, parentB, registry, config, researchContext, stationType)` normalizes config and creates a station-aware recipe key.
2. Parent ids are canonicalized unless `orderMatters` is enabled.
3. Parents are validated against the registry and max generation depth.
4. Survival research locks are checked for parent materials.
5. Preliminary stats are combined to resolve a reaction.
6. Survival research locks are checked for the reaction.
7. Final stats are recombined with reaction modifiers.
8. Station modifiers are applied.
9. Recursive balance pressure lowers stability for high generation depth, extreme stats, and hazardous tags.
10. Tags are derived from parents, reaction, final stats, and station.
11. Required research tier is derived from reaction, stats, tags, and escalation rules.
12. Existing recipe results are reused.
13. Optional unstable outcomes can fail before material creation when enabled.
14. The generated material is registered and the recipe result is stored.

## Processing Stations

Supported station types:

- `combiner`
- `forge`
- `crystallizer`
- `distiller`
- `stabilizer`
- `infuser`
- `assembler`

The combiner is the default and preserves legacy recipe loading. Recipe keys include station type, so the same parents can produce different results in different stations.

Station UIs are intentionally not implemented yet. Station behavior is currently architecture and data only.

## Research

Research tiers:

- `metallurgical`
- `crystalline`
- `alchemical`
- `volatile`
- `arcane`
- `radiological`

Creative mode ignores research requirements. Survival mode enforces them for parent materials, reactions, and generated results.

Very high magic or `void`/arcane tags escalate to `arcane`. Very high radioactivity or radiological/radioactive tags escalate to `radiological`, even if a reaction would otherwise request a lower tier.

## Balance Scores

`MaterialBalance.ts` computes:

- `valueScore`
- `dangerScore`
- `usefulnessScore`

These are derived values, not saved fields. They are deterministic and can be recomputed from material stats, tags, rarity, and generation.

Recursive balance rules:

- Rarity generally increases with generation depth.
- Stability decreases with generation depth, extreme stats, and hazardous tags.
- Low stability, radioactivity, toxicity, explosive traits, and void traits increase danger.
- Hardness, metal, stability, and capability grades increase usefulness.

## Capabilities

`MaterialCapabilities.ts` computes:

- `weaponGrade`
- `toolGrade`
- `armorGrade`
- `fuelGrade`
- `magicFocusGrade`
- `conductorGrade`
- `explosiveGrade`
- `reactorGrade`
- `buildingGrade`
- `biologicalGrade`

Capabilities are derived values, not saved fields. They are shown in the Material Codex and are ready for future gameplay systems.

## Visuals

`MaterialVisuals.ts` exposes:

- `baseColor`
- `accentColor`
- `roughness`
- `metallic`
- `emissiveStrength`
- `alpha`

Dynamic material blocks use tinted placeholder texture data through render/terrain plumbing. Generated material item icons use CSS swatches first, with color data derived from the same deterministic visual helper.

Magic, crystal, and radioactive materials can glow later through `emissiveStrength`. Terrain-damaging effects are not implemented for unstable reactions yet.

## Discovery

Biome affinity rules live in `MaterialBiomeAffinities.ts`.

Examples:

- desert: silicon and sulfur traces
- cave: crystal-tagged silicon and uranium traces
- forest: carbon, oxygen, and organic traces

Mining and exploration can discover one trace per event at most. `materialTraceDiscoveryChance` in `MaterialConfig.ts` controls the chance. Trace rolls are deterministic from world seed and event key.

## Persistence

Save/load owns persistence.

`serializeMaterialCodex(registry, unlockedResearchTiers)` writes:

- discovered material ids
- generated materials
- recipe result history with parent ids and station type
- unlocked research tiers

`materialRegistryFromSerializedCodex(...)` restores:

- base materials
- discovered material ids
- generated material definitions
- stored recipe keys

`WorldSaveManager` persists the material codex inside the existing world runtime save state. Base elements are loaded from code, while generated materials, discoveries, recipe results, and research tiers are saved per world. Old saves without a material codex load with defaults, and old saves with separate material research are migrated into `materialCodex.unlockedResearchTiers`.

Do not persist computed values such as visuals, capabilities, value score, danger score, or usefulness score. Recompute them from saved material definitions.

## Item Integration

Generated and base element material items use:

```text
generated-material:<materialId>
```

`ItemRegistry` resolves these through a `MaterialItemResolver`, usually a `MaterialRegistry`.

Stabilized generated materials with sufficient stability can be placeable as `TerrainMaterial.DynamicMaterial`. Dynamic material block metadata stores the material id separately from the terrain material id.

## UI Boundaries

The Material Codex displays:

- discovered materials
- raw stats
- balance scores
- capability grades
- tags
- parents
- known child recipe results

UI code should not call generation helpers such as `combineMaterials(...)` in production code. Tests may call them to create fixtures.

Mobile usability is handled through responsive codex and inventory CSS. The codex collapses to one column on narrow screens and hides mobile controls while open.

## Final Integration Checks

The final cleanup pass checks:

- `npm run format`
- `npm run format:check`
- `npm test`
- `npm run build`
- static TypeScript import cycle scan
- no DOM/browser APIs in `src/materials`
- material generation remains outside UI production code
- persistence remains in save/load code
- dynamic material item resolution tests pass
- old save tests pass
- creative and survival tests pass
