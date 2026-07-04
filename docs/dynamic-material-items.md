# Dynamic Material Items

Generated materials are resolved dynamically. Do not add every generated material to `ITEM_DEFINITIONS`.

## Item Ids

Material item ids use:

```text
generated-material:<materialId>
```

Examples:

```text
generated-material:element:iron
generated-material:element:carbon
generated-material:generated:g1:abc123
```

Modified material tool ids use:

```text
modified-tool:<baseToolId>:<materialId>
```

Examples:

```text
modified-tool:tool:pickaxe:generated:g1:abc123
modified-tool:tool:axe:element:iron
```

## Resolution

`src/items/MaterialItemResolver.ts` owns material item helpers:

- `itemIdForMaterial(materialId)`
- `materialIdFromItemId(itemId)`
- `isGeneratedMaterialItemId(itemId)`
- `generatedMaterialItemDefinitionFor(itemId, resolver)`

`ItemRegistry` resolves static item definitions first. If an id is dynamic, it asks the optional material resolver for the material name and stats. Missing materials resolve as `Unknown Material` instead of crashing.

Dynamic material item definitions use:

- `kind: "generated_material"`
- `maxStackSize: 64`
- `placeable: false`
- `materialId`
- `displayName` from the material definition, or `Unknown Material`

## Inventory and Storage

Inventory stores dynamic item ids exactly as strings, so save/load does not need special item schema branches. Stack merging works by item id, so generated material items stack to 64 like other stackable items.

Material storage is separate from the hotbar and stores material ids plus quantities. It is serialized in `runtime.materialStorage` and can be shown from the codex/storage UI.

## Crafting Uses

Generated material crafting is computed from capabilities:

- high `toolGrade` can produce tool upgrades.
- high `buildingGrade` can stabilize into blocks.
- high `magicFocusGrade` can produce a magic core placeholder.
- high `explosiveGrade` can produce an explosive compound placeholder.
- high `conductorGrade` can produce a circuit placeholder.
- high `fuelGrade` is marked for fuel use later.

The assembler path can combine a base tool and material into a `modified-tool:<baseToolId>:<materialId>` item. Modified tools inherit the base tool kind and derive speed, durability, and danger markers from material stats.

## UI Visuals

Generated material item icons should use deterministic swatches from `MaterialVisuals`. Unknown dynamic material ids use a safe fallback swatch and label.
