import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TerrainMaterial,
  isCollisionSolidMaterial,
} from "../geometry/terrainChunk.ts";
import { PLAYER_EYE_HEIGHT } from "../input/FirstPersonCamera.ts";
import {
  itemDefinitionFor,
  placeableMaterialForItem,
  type ItemDefinition,
} from "../items/ItemRegistry.ts";
import {
  type VoxelPosition,
  type VoxelRaycastHit,
  worldToAxial,
} from "../world/InfiniteTerrain.ts";
import {
  blockDefinitionFor,
  materialProcessingStationTypeForBlock,
  workbenchTypeForBlock,
} from "../world/blocks.ts";
import type { MaterialProcessingStationType } from "../materials/MaterialTypes.ts";
import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";
import type { GameMode } from "./gameMode.ts";

export const BLOCK_PLACEMENT_REACH = 6;

export type BlockPlacementFailureReason =
  | "missing_target"
  | "out_of_reach"
  | "air"
  | "non_placeable_item"
  | "unstabilized_material"
  | "unloaded"
  | "occupied"
  | "inside_player"
  | "missing_inventory";

export type BlockPlacementWorld = Readonly<{
  materialAt: (q: number, r: number, level: number) => TerrainMaterial;
  isColumnLoaded?: (q: number, r: number) => boolean;
}>;

export type BlockPlacementInput = Readonly<{
  target: Readonly<{
    adjacent: VoxelPosition | null;
    distance: VoxelRaycastHit["distance"];
  }> | null;
  selectedItemId: string | null;
  selectedItem?: ItemDefinition | null;
  selectedMaterial?: TerrainMaterial | null;
  playerPosition: readonly [number, number, number];
  world: BlockPlacementWorld;
  mode: GameMode;
  selectedStackCount?: number;
  maximumReach?: number;
}>;

export type BlockPlacementSuccess = Readonly<{
  ok: true;
  position: VoxelPosition;
  material: TerrainMaterial;
  consumeItem: boolean;
}>;

export type BlockPlacementFailure = Readonly<{
  ok: false;
  reason: BlockPlacementFailureReason;
  message: string;
}>;

export type BlockPlacementResult =
  BlockPlacementSuccess | BlockPlacementFailure;

export type MaterialStationInteractionInput = Readonly<{
  target: Pick<VoxelRaycastHit, "voxel" | "material" | "distance"> | null;
  maximumReach?: number;
}>;

export type MaterialStationInteractionSuccess = Readonly<{
  ok: true;
  stationType: MaterialProcessingStationType;
  position: VoxelPosition;
}>;

export type MaterialStationInteractionFailure = Readonly<{
  ok: false;
  reason: "missing_target" | "out_of_reach" | "not_station";
}>;

export type MaterialStationInteractionResult =
  MaterialStationInteractionSuccess | MaterialStationInteractionFailure;

export type WorkbenchInteractionInput = MaterialStationInteractionInput;

export type WorkbenchInteractionSuccess = Readonly<{
  ok: true;
  workbenchType: WorkbenchType;
  position: VoxelPosition;
}>;

export type WorkbenchInteractionFailure = Readonly<{
  ok: false;
  reason: "missing_target" | "out_of_reach" | "not_workbench";
}>;

export type WorkbenchInteractionResult =
  WorkbenchInteractionSuccess | WorkbenchInteractionFailure;

export type PlacedBlockInteraction =
  | Readonly<{
      kind: "material_combiner";
      stationType: MaterialProcessingStationType;
      position: VoxelPosition;
    }>
  | Readonly<{
      kind: "workbench";
      workbenchType: Exclude<WorkbenchType, "element_combiner">;
      position: VoxelPosition;
    }>;

const FAILURE_MESSAGES: Record<BlockPlacementFailureReason, string> = {
  missing_target: "Aim at a block first.",
  out_of_reach: "Too far away.",
  air: "Cannot place air.",
  non_placeable_item: "Select a placeable block.",
  unstabilized_material: "Stabilize this material before placing it.",
  unloaded: "That area is not loaded yet.",
  occupied: "That space is already blocked.",
  inside_player: "Cannot place inside yourself.",
  missing_inventory: "No blocks left.",
};

function fail(reason: BlockPlacementFailureReason): BlockPlacementFailure {
  return {
    ok: false,
    reason,
    message: FAILURE_MESSAGES[reason],
  };
}

export function validateMaterialStationInteraction(
  input: MaterialStationInteractionInput,
): MaterialStationInteractionResult {
  if (!input.target) {
    return { ok: false, reason: "missing_target" };
  }

  if (input.target.distance > (input.maximumReach ?? BLOCK_PLACEMENT_REACH)) {
    return { ok: false, reason: "out_of_reach" };
  }

  const stationType = materialProcessingStationTypeForBlock(
    input.target.material,
  );

  if (!stationType) {
    return { ok: false, reason: "not_station" };
  }

  return {
    ok: true,
    stationType,
    position: input.target.voxel,
  };
}

export function validateWorkbenchInteraction(
  input: WorkbenchInteractionInput,
): WorkbenchInteractionResult {
  if (!input.target) {
    return { ok: false, reason: "missing_target" };
  }

  if (input.target.distance > (input.maximumReach ?? BLOCK_PLACEMENT_REACH)) {
    return { ok: false, reason: "out_of_reach" };
  }

  const workbenchType = workbenchTypeForBlock(input.target.material);

  if (!workbenchType) {
    return { ok: false, reason: "not_workbench" };
  }

  return {
    ok: true,
    workbenchType,
    position: input.target.voxel,
  };
}

export function placedBlockInteractionForTarget(
  input: MaterialStationInteractionInput,
): PlacedBlockInteraction | null {
  const station = validateMaterialStationInteraction(input);

  if (station.ok) {
    return {
      kind: "material_combiner",
      stationType: station.stationType,
      position: station.position,
    };
  }

  const workbench = validateWorkbenchInteraction(input);

  if (!workbench.ok) {
    return null;
  }

  if (workbench.workbenchType === "element_combiner") {
    return {
      kind: "material_combiner",
      stationType: "combiner",
      position: workbench.position,
    };
  }

  return {
    kind: "workbench",
    workbenchType: workbench.workbenchType,
    position: workbench.position,
  };
}

export function playerIntersectsPlacementVoxel(
  placement: VoxelPosition,
  playerPosition: readonly [number, number, number],
): boolean {
  const [playerX, playerY, playerZ] = playerPosition;
  const playerHex = worldToAxial(playerX, playerZ);
  const playerFeetLevel = Math.floor(
    (playerY - PLAYER_EYE_HEIGHT - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT,
  );

  return (
    placement.q === playerHex.q &&
    placement.r === playerHex.r &&
    placement.level >= playerFeetLevel &&
    placement.level <= playerFeetLevel + 2
  );
}

function selectedPlacementMaterial(
  selectedItemId: string | null,
  selectedMaterial: TerrainMaterial | null | undefined,
): TerrainMaterial | null {
  if (selectedMaterial !== undefined) {
    return selectedMaterial;
  }

  return selectedItemId ? placeableMaterialForItem(selectedItemId) : null;
}

function selectedItemDefinition(
  selectedItemId: string | null,
  selectedItem: ItemDefinition | null | undefined,
): ItemDefinition | null {
  if (selectedItem !== undefined) {
    return selectedItem;
  }

  return selectedItemId ? itemDefinitionFor(selectedItemId) : null;
}

export function validateBlockPlacement(
  input: BlockPlacementInput,
): BlockPlacementResult {
  const adjacent = input.target?.adjacent ?? null;

  if (!input.target || !adjacent) {
    return fail("missing_target");
  }

  if (input.target.distance > (input.maximumReach ?? BLOCK_PLACEMENT_REACH)) {
    return fail("out_of_reach");
  }

  if (adjacent.level < 0) {
    return fail("unloaded");
  }

  const material = selectedPlacementMaterial(
    input.selectedItemId,
    input.selectedMaterial,
  );

  if (material === TerrainMaterial.Air) {
    return fail("air");
  }

  const selectedItem = selectedItemDefinition(
    input.selectedItemId,
    input.selectedItem,
  );

  if (material === null) {
    if (selectedItem?.kind === "generated_material") {
      return fail("unstabilized_material");
    }

    return fail("non_placeable_item");
  }

  const block = blockDefinitionFor(material);

  if (
    !block.placeable ||
    (selectedItem?.placeable === false &&
      material !== TerrainMaterial.DynamicMaterial)
  ) {
    return fail("non_placeable_item");
  }

  if (
    input.world.isColumnLoaded &&
    !input.world.isColumnLoaded(adjacent.q, adjacent.r)
  ) {
    return fail("unloaded");
  }

  if (
    isCollisionSolidMaterial(
      input.world.materialAt(adjacent.q, adjacent.r, adjacent.level),
    )
  ) {
    return fail("occupied");
  }

  if (playerIntersectsPlacementVoxel(adjacent, input.playerPosition)) {
    return fail("inside_player");
  }

  if (
    input.mode === "survival" &&
    Math.max(0, input.selectedStackCount ?? 0) < 1
  ) {
    return fail("missing_inventory");
  }

  return {
    ok: true,
    position: adjacent,
    material,
    consumeItem: input.mode === "survival",
  };
}
