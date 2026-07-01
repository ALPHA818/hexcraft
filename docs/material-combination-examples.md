# Material Combination Examples

These examples describe the current deterministic material-combination behavior. Exact generated ids depend on the material config seed, deterministic version, station type, and parent ids. Names and tags are deterministic for the same inputs.

## Basic Examples

| Parents             | Expected theme                    | Typical tags                                   | Notes                                                    |
| ------------------- | --------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Fire + Iron         | Embersteel style forged metal     | `fire`, `forged`, `metal`                      | Requires metallurgical research in survival when locked. |
| Water + Earth       | Clay or mud style material        | `clay`, `earth`, `water`                       | Useful starter example for non-metal reactions.          |
| Crystal + Magic     | Enchanted arcane crystal          | `arcane`, `crystal`, `magic`                   | Strong magic focus capability.                           |
| Toxic + Organic     | Poison compound or venom resin    | `organic`, `poison`, `toxic`                   | High biological and danger relevance.                    |
| Radioactive + Metal | Unstable irradiated alloy         | `alloy`, `metal`, `radioactive`, `unstable`    | Escalates to radiological research.                      |
| Gas + Fire          | Explosive compound or blast vapor | `explosive`, `fire`, `gas`, `fuel`, `unstable` | Can produce UI-only unstable outcomes when enabled.      |

## Recursive Example

1. Combine Fire + Iron.
2. The result is a first-generation fire metal such as Embersteel.
3. Combine Embersteel + Crystal.
4. The result is second-generation, deterministic, and generally has higher rarity pressure than generation one.

Recursive materials also receive stability pressure from:

- generation depth
- extreme stats
- hazardous tags such as `unstable`, `radioactive`, `toxic`, `explosive`, `arcane`, and `void`

This keeps deep recursive crafting meaningful without allowing every chain to become purely better.

## Station Examples

The processing station is part of the recipe key.

| Parents             | Station        | Expected difference                                                                   |
| ------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Iron + Carbon       | `combiner`     | Default behavior and legacy recipe fallback.                                          |
| Iron + Carbon       | `forge`        | Different recipe key, forged naming, higher metal/hardness leaning stats.             |
| Crystal + Magic     | `infuser`      | Arcane leaning tags and magic/conductivity modifier pressure.                         |
| Silicon + Oxygen    | `crystallizer` | Crystal leaning tags and crystal stat pressure.                                       |
| Toxic + Water       | `distiller`    | Liquid/gas leaning result with distilled tags.                                        |
| Radioactive + Metal | `stabilizer`   | Stability pressure can be countered by station modifiers, but danger remains visible. |

Only the combiner UI exists today. Other station types are architecture hooks for future UI and crafting stations.

## Research Examples

| Material or reaction trait                                  | Tier            |
| ----------------------------------------------------------- | --------------- |
| Metal, metallic, alloy, forged                              | `metallurgical` |
| Crystal or crystalline                                      | `crystalline`   |
| Toxic, poison, alchemical                                   | `alchemical`    |
| Gas, volatile, explosive, high heat                         | `volatile`      |
| Magic, arcane, void, very high magic                        | `arcane`        |
| Radioactive, radiological, uranium, very high radioactivity | `radiological`  |

Creative mode ignores research requirements. Survival mode blocks locked combinations and returns a readable message such as:

```text
Requires Metallurgical Research
```

## Unstable Outcome Examples

When `unstableCombinationsCanFail` is disabled, valid combinations succeed.

When enabled, unstable combinations can deterministically produce UI-only failure outcomes:

- failed reaction that consumes ingredients
- weaker byproduct placeholder
- player damage placeholder
- small explosion placeholder
- toxic cloud placeholder

Terrain damage is intentionally not implemented yet.

## Capability Examples

| Material shape             | Strong capability                        |
| -------------------------- | ---------------------------------------- |
| Hard metal alloy           | `toolGrade`, `weaponGrade`, `armorGrade` |
| Magic crystal              | `magicFocusGrade`                        |
| Fire gas                   | `explosiveGrade`, `fuelGrade`            |
| Conductive metal           | `conductorGrade`                         |
| Radioactive metal          | `reactorGrade`                           |
| Stable hard stone or metal | `buildingGrade`                          |
| Organic toxic material     | `biologicalGrade`                        |

Capabilities are computed from stats and tags. They are not persisted.

## Balance Score Examples

| Material shape                      | Score effect                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| High radioactivity                  | Raises danger score.                                             |
| Low stability                       | Raises danger score.                                             |
| High hardness and metal             | Raises usefulness score.                                         |
| High rarity and strong capabilities | Raises value score.                                              |
| Deep generation                     | Raises rarity pressure and value pressure, but lowers stability. |

Balance scores are computed values:

- `valueScore`
- `dangerScore`
- `usefulnessScore`

They are shown in the Material Codex and can be used by future gameplay systems.

## Biome Discovery Examples

Biome trace discovery does not create full blocks yet. It discovers base elements or traces through mining/exploration events.

| Source   | Trace affinity                       |
| -------- | ------------------------------------ |
| Desert   | Silicon, sulfur, sodium              |
| Cave     | Silicon with crystal tags, uranium   |
| Forest   | Carbon, oxygen, nitrogen, phosphorus |
| Beach    | Silicon, sodium, chlorine            |
| Swamp    | Carbon, oxygen, sulfur, nitrogen     |
| Badlands | Iron, sulfur, silicon                |

Trace drops are rare and capped at one material item per event to avoid flooding inventory.

## Item Examples

Any material known to the registry can become an item id:

```text
generated-material:element:iron
generated-material:generated:g1:<hash>
```

The item system resolves those ids through the material registry. Unknown generated material item ids are rejected cleanly.

Stable generated material items can become placeable dynamic material blocks. The terrain stores the block as `DynamicMaterial` and saves the material id as metadata.

## Save/Load Examples

Generated material persistence saves:

- material id
- name
- generation
- parents
- rarity
- stats
- tags
- required research tier
- station type
- discovery metadata
- recipe key history

Computed visuals, capabilities, and balance scores are intentionally not saved. They are recomputed from the material definition after load.

Old saves without `materialCodex` load with default base material discovery. Old combiner recipes without station keys still resolve through the legacy combiner fallback.
