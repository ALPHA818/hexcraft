# Dynamic Material Blocks

Dynamic material blocks let generated materials become placeable without adding infinite terrain enum values.

## Block Model

The world uses one generic terrain material:

```text
dynamic_material_block
```

Its user-facing fallback display name is:

```text
Stabilized Material
```

The actual procedural material is stored separately as voxel metadata:

```text
voxelKey -> materialId
```

This keeps chunk meshes, block ids, save formats, and renderer fallback paths bounded.

## Placement

When the selected item is `generated-material:<materialId>`, placement rules can convert it to the generic dynamic material block. The terrain edit stores `TerrainMaterial.DynamicMaterial`, and the dynamic material metadata stores the material id for that voxel.

Invalid or empty material ids are ignored safely.

## Mining

Mining a dynamic material block:

- removes the generic block.
- removes the dynamic metadata.
- drops `generated-material:<materialId>` when the material id resolves.

If metadata is missing or invalid, mining stays safe and does not crash.

## Save and Load

Dynamic block metadata persists with terrain edits in the existing world save. There is no separate dynamic block database.

The saved terrain edit format can include a dynamic material id for dynamic material blocks. On load, `InfiniteTerrain` restores both the generic block and the material metadata.

## Display and Rendering

Target block UI asks the dynamic material resolver for the material name. If the material cannot be resolved, the display name is:

```text
Unknown Stabilized Material
```

The first renderer implementation uses the generic dynamic material texture with deterministic tint data where supported. WebGPU/WebGL fallback must remain safe if tint data is unavailable.
