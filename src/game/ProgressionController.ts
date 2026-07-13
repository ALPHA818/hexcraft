import type { Recipe } from "../crafting/RecipeTypes.ts";
import { isModifiedToolItemId, type ItemId } from "../items/ItemRegistry.ts";
import type { GameMode } from "./gameMode.ts";

export const PROGRESSION_SAVE_VERSION = 1;

export const PROGRESSION_OBJECTIVES = [
  {
    id: "collect_wood",
    title: "Collect wood",
    description: "Break a tree block and pick up wood.",
  },
  {
    id: "craft_planks",
    title: "Craft planks",
    description: "Turn wood into planks at a basic workbench.",
  },
  {
    id: "craft_basic_workbench",
    title: "Craft a basic workbench",
    description: "Build the first crafting station.",
  },
  {
    id: "craft_sticks",
    title: "Craft sticks",
    description: "Make sticks for simple tools.",
  },
  {
    id: "craft_pickaxe",
    title: "Craft a pickaxe",
    description: "Craft a pickaxe for stone and ore.",
  },
  {
    id: "mine_stone",
    title: "Mine stone",
    description: "Collect stone from underground or exposed rock.",
  },
  {
    id: "mine_coal",
    title: "Mine coal",
    description: "Collect coal from coal ore.",
  },
  {
    id: "discover_carbon",
    title: "Discover carbon",
    description: "Discover carbon from coal or material traces.",
  },
  {
    id: "craft_element_combiner",
    title: "Craft an element combiner",
    description: "Build the station used for material reactions.",
  },
  {
    id: "combine_first_materials",
    title: "Combine two materials",
    description: "Create your first generated material.",
  },
  {
    id: "store_generated_material",
    title: "Store a generated material",
    description: "Move a generated material into material storage.",
  },
  {
    id: "upgrade_first_tool",
    title: "Upgrade a tool",
    description: "Use a generated material to craft a modified tool.",
  },
] as const;

export type ProgressionObjectiveId =
  (typeof PROGRESSION_OBJECTIVES)[number]["id"];

export type ProgressionObjective = Readonly<{
  id: ProgressionObjectiveId;
  title: string;
  description: string;
}>;

export type ProgressionObjectiveView = ProgressionObjective &
  Readonly<{
    completed: boolean;
  }>;

export type SerializedProgression = Readonly<{
  version: typeof PROGRESSION_SAVE_VERSION;
  completedObjectiveIds: readonly ProgressionObjectiveId[];
  hidden: boolean;
}>;

export type ProgressionEvent =
  | Readonly<{
      type: "objective_completed";
      objective: ProgressionObjective;
    }>
  | Readonly<{
      type: "visibility_changed";
      hidden: boolean;
    }>;

export type ProgressionControllerOptions = Readonly<{
  mode?: GameMode;
  state?: SerializedProgression | null;
  onChange?: (event: ProgressionEvent) => void;
}>;

const OBJECTIVES_BY_ID: ReadonlyMap<
  ProgressionObjectiveId,
  ProgressionObjective
> = new Map(
  PROGRESSION_OBJECTIVES.map((objective) => [objective.id, objective]),
);

const RECIPE_OBJECTIVES: Readonly<Record<string, ProgressionObjectiveId>> = {
  wood_to_planks: "craft_planks",
  basic_workbench: "craft_basic_workbench",
  planks_to_sticks: "craft_sticks",
  wooden_pickaxe: "craft_pickaxe",
  element_combiner_station: "craft_element_combiner",
};

const ITEM_COLLECTION_OBJECTIVES: Readonly<
  Partial<Record<ItemId, ProgressionObjectiveId>>
> = {
  "block:wood": "collect_wood",
  "block:stone": "mine_stone",
  "material:coal": "mine_coal",
};

const OUTPUT_OBJECTIVES: Readonly<
  Partial<Record<ItemId, ProgressionObjectiveId>>
> = {
  "block:planks": "craft_planks",
  "block:basic_workbench": "craft_basic_workbench",
  "material:stick": "craft_sticks",
  "tool:pickaxe": "craft_pickaxe",
  "block:element_combiner": "craft_element_combiner",
};

function defaultProgressionHidden(mode: GameMode): boolean {
  return mode === "creative";
}

function isProgressionObjectiveId(
  value: unknown,
): value is ProgressionObjectiveId {
  return (
    typeof value === "string" &&
    OBJECTIVES_BY_ID.has(value as ProgressionObjectiveId)
  );
}

function uniqueObjectiveIds(
  values: readonly unknown[] | undefined,
): readonly ProgressionObjectiveId[] {
  return [...new Set((values ?? []).filter(isProgressionObjectiveId))].sort(
    (a, b) =>
      PROGRESSION_OBJECTIVES.findIndex((objective) => objective.id === a) -
      PROGRESSION_OBJECTIVES.findIndex((objective) => objective.id === b),
  );
}

export function createDefaultProgressionSave(
  mode: GameMode = "survival",
): SerializedProgression {
  return {
    version: PROGRESSION_SAVE_VERSION,
    completedObjectiveIds: [],
    hidden: defaultProgressionHidden(mode),
  };
}

export function normalizeSerializedProgression(
  value: unknown,
  mode: GameMode = "survival",
): SerializedProgression {
  if (!value || typeof value !== "object") {
    return createDefaultProgressionSave(mode);
  }

  const record = value as Record<string, unknown>;
  const hidden =
    typeof record.hidden === "boolean"
      ? record.hidden
      : defaultProgressionHidden(mode);

  return {
    version: PROGRESSION_SAVE_VERSION,
    completedObjectiveIds: uniqueObjectiveIds(
      Array.isArray(record.completedObjectiveIds)
        ? record.completedObjectiveIds
        : undefined,
    ),
    hidden,
  };
}

export class ProgressionController {
  readonly #mode: GameMode;
  readonly #onChange: (event: ProgressionEvent) => void;
  readonly #completed = new Set<ProgressionObjectiveId>();
  readonly #notifications: string[] = [];
  #hidden: boolean;

  constructor(options: ProgressionControllerOptions = {}) {
    this.#mode = options.mode ?? "survival";
    this.#onChange = options.onChange ?? (() => {});
    const state = normalizeSerializedProgression(options.state, this.#mode);

    this.#hidden = state.hidden;
    for (const objectiveId of state.completedObjectiveIds) {
      this.#completed.add(objectiveId);
    }
  }

  isHidden(): boolean {
    return this.#hidden;
  }

  setHidden(hidden: boolean): boolean {
    if (this.#hidden === hidden) {
      return false;
    }

    this.#hidden = hidden;
    this.#onChange({ type: "visibility_changed", hidden });
    return true;
  }

  toggleHidden(): boolean {
    this.setHidden(!this.#hidden);
    return this.#hidden;
  }

  objectives(): readonly ProgressionObjectiveView[] {
    return PROGRESSION_OBJECTIVES.map((objective) => ({
      ...objective,
      completed: this.#completed.has(objective.id),
    }));
  }

  completedObjectiveIds(): readonly ProgressionObjectiveId[] {
    return PROGRESSION_OBJECTIVES.map((objective) => objective.id).filter(
      (objectiveId) => this.#completed.has(objectiveId),
    );
  }

  isComplete(objectiveId: ProgressionObjectiveId): boolean {
    return this.#completed.has(objectiveId);
  }

  recordItemCollected(itemId: ItemId, count = 1): boolean {
    if (count <= 0) {
      return false;
    }

    const objectiveId = ITEM_COLLECTION_OBJECTIVES[itemId];

    return objectiveId ? this.#completeObjective(objectiveId) : false;
  }

  recordRecipeCrafted(recipe: Recipe): boolean {
    const directObjectiveId = RECIPE_OBJECTIVES[recipe.id];
    let completed = directObjectiveId
      ? this.#completeObjective(directObjectiveId)
      : false;

    for (const output of recipe.outputs) {
      const outputObjectiveId = OUTPUT_OBJECTIVES[output.itemId];

      if (outputObjectiveId) {
        completed = this.#completeObjective(outputObjectiveId) || completed;
      }
      if (isModifiedToolItemId(output.itemId)) {
        completed = this.#completeObjective("upgrade_first_tool") || completed;
      }
    }

    return completed;
  }

  recordMaterialDiscovered(materialId: string): boolean {
    return materialId === "element:carbon"
      ? this.#completeObjective("discover_carbon")
      : false;
  }

  recordMaterialsCombined(): boolean {
    return this.#completeObjective("combine_first_materials");
  }

  recordGeneratedMaterialStored(materialId: string, quantity = 1): boolean {
    return materialId.startsWith("generated:") && quantity > 0
      ? this.#completeObjective("store_generated_material")
      : false;
  }

  takeNotifications(): readonly string[] {
    return this.#notifications.splice(0);
  }

  serialize(): SerializedProgression {
    return {
      version: PROGRESSION_SAVE_VERSION,
      completedObjectiveIds: this.completedObjectiveIds(),
      hidden: this.#hidden,
    };
  }

  #completeObjective(objectiveId: ProgressionObjectiveId): boolean {
    if (this.#completed.has(objectiveId)) {
      return false;
    }

    const objective = OBJECTIVES_BY_ID.get(objectiveId);

    if (!objective) {
      return false;
    }

    this.#completed.add(objectiveId);
    this.#notifications.push(`Objective complete: ${objective.title}`);
    this.#onChange({ type: "objective_completed", objective });
    return true;
  }
}
