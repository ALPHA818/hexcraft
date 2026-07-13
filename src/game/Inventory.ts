import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  blockItemIdForMaterial,
  equippedToolForItem,
  HOTBAR_SLOT_COUNT,
  itemDefinitionFor,
  itemIdForMaterial,
  materialIdFromItemId,
  placeableMaterialForItem,
  type EquipmentItemDefinition,
  type ItemDefinition,
  type ItemId,
} from "../items/ItemRegistry.ts";
import type { MaterialItemResolver } from "../items/MaterialItemResolver.ts";
import {
  canMergeItemStacks,
  createItemStack,
  damageToolStack,
  normalizeItemStack,
  serializeItemStack,
  type ItemStack,
} from "../items/ItemStack.ts";
import type { EquippedTool } from "../items/ToolTypes.ts";
import {
  materialBlockTintCssForVisuals,
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
  type MaterialVisuals,
} from "../materials/MaterialVisuals.ts";
import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
  type MaterialRarity,
} from "../materials/MaterialTypes.ts";
import type { SerializedInventory } from "../save/WorldSaveTypes.ts";
import { minedDrop as registryMinedDrop } from "../world/blocks.ts";
import type { GameMode } from "./gameMode.ts";
import type { MaterialStorage } from "./MaterialStorage.ts";

export type InventorySlot = ItemStack | null;
export type InventoryContainer = Readonly<{
  slots: readonly InventorySlot[];
}>;
export type InventorySlotContainer = "hotbar" | "backpack";
export type InventorySlotAddress = Readonly<{
  container: InventorySlotContainer;
  index: number;
}>;
export type PlayerInventoryState = Readonly<{
  selectedHotbarIndex: number;
  hotbar: readonly InventorySlot[];
  backpack: readonly InventorySlot[];
}>;
export type InventorySlotInteractionOptions = Readonly<{
  button?: 0 | 2;
  shiftKey?: boolean;
}>;
export type InventoryFilter =
  | "all"
  | "blocks"
  | "tools"
  | "materials"
  | "generated-materials"
  | "workbenches";
export type InventorySortMode =
  "manual" | "name" | "count" | "type" | "rarity" | "generation";
export type InventoryVisibleStack = Readonly<{
  index: number;
  stack: ItemStack;
  item: ItemDefinition;
}>;
export type InventoryEquipmentItem = Readonly<{
  itemId: ItemId;
  count: number;
  item: EquipmentItemDefinition;
}>;
export type GeneratedMaterialStorageFilter = (
  materialId: string,
  material: MaterialDefinition | null,
) => boolean;

export const BACKPACK_SLOT_COUNT = 27;

export const INVENTORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "blocks", label: "Blocks" },
  { id: "tools", label: "Tools" },
  { id: "materials", label: "Materials" },
  { id: "generated-materials", label: "Generated Materials" },
  { id: "workbenches", label: "Workbenches" },
] as const satisfies readonly { id: InventoryFilter; label: string }[];

export const INVENTORY_SORT_OPTIONS = [
  { id: "manual", label: "Manual" },
  { id: "name", label: "Name" },
  { id: "count", label: "Count" },
  { id: "type", label: "Type" },
  { id: "rarity", label: "Rarity" },
  { id: "generation", label: "Generation" },
] as const satisfies readonly { id: InventorySortMode; label: string }[];

type InventorySlotRenderEntry = Readonly<{
  index: number;
  stack: InventorySlot;
}>;

const INVENTORY_FILTER_IDS = new Set<InventoryFilter>(
  INVENTORY_FILTERS.map((filter) => filter.id),
);
const INVENTORY_SORT_IDS = new Set<InventorySortMode>(
  INVENTORY_SORT_OPTIONS.map((sort) => sort.id),
);
const RARITY_SORT_RANK: ReadonlyMap<MaterialRarity, number> = new Map([
  ["common", 0],
  ["uncommon", 1],
  ["rare", 2],
  ["epic", 3],
  ["legendary", 4],
  ["mythic", 5],
]);

export function minedDrop(material: TerrainMaterial): TerrainMaterial | null {
  const drop = registryMinedDrop(material);
  return drop === null ? null : (drop as TerrainMaterial);
}

function createEmptySlots(count: number): InventorySlot[] {
  return Array.from({ length: count }, () => null);
}

function createStartingHotbar(): InventorySlot[] {
  return createEmptySlots(HOTBAR_SLOT_COUNT);
}

function createStartingBackpack(): InventorySlot[] {
  return createEmptySlots(BACKPACK_SLOT_COUNT);
}

function safeItemClass(itemId: string): string {
  return `item-${itemId.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function normalizedText(text: string): string {
  return text.trim().toLowerCase();
}

function validInventoryFilter(filter: InventoryFilter): InventoryFilter {
  return INVENTORY_FILTER_IDS.has(filter) ? filter : "all";
}

function validInventorySortMode(
  sortMode: InventorySortMode,
): InventorySortMode {
  return INVENTORY_SORT_IDS.has(sortMode) ? sortMode : "manual";
}

function materialForInventoryItem(
  item: ItemDefinition,
): MaterialDefinition | null {
  if (item.kind === "generated_material") {
    return item.material;
  }
  if (item.kind === "tool" && "material" in item) {
    return item.material;
  }

  return null;
}

export function isWorkbenchInventoryItem(item: ItemDefinition): boolean {
  return (
    item.kind === "block" &&
    (item.block.id === "element_combiner" ||
      item.block.id.endsWith("_workbench") ||
      item.block.id.endsWith("_station"))
  );
}

export function inventoryItemMatchesFilter(
  item: ItemDefinition,
  filter: InventoryFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "blocks":
      return item.kind === "block";
    case "tools":
      return item.kind === "tool";
    case "materials":
      return item.kind === "material";
    case "generated-materials":
      return item.kind === "generated_material";
    case "workbenches":
      return isWorkbenchInventoryItem(item);
  }
}

export function inventoryItemSearchText(item: ItemDefinition): string {
  const parts = [
    item.id,
    item.displayName,
    item.shortName,
    item.kind,
    item.placeable ? "placeable" : "",
  ];

  if (item.kind === "block") {
    parts.push(item.block.id, item.block.displayName, String(item.material));
  }

  const material = materialForInventoryItem(item);
  if (material) {
    parts.push(
      material.id,
      material.name,
      material.rarity,
      `generation:${material.generation}`,
      `gen:${material.generation}`,
      ...material.parents,
      ...material.tags,
    );
    for (const stat of MATERIAL_STAT_KEYS) {
      parts.push(`${stat}:${material[stat]}`);
      if (material[stat] > 0) {
        parts.push(stat);
      }
    }
  } else if (item.kind === "generated_material") {
    parts.push(item.materialId);
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function inventoryItemMatchesSearch(
  item: ItemDefinition,
  query: string,
): boolean {
  const normalizedQuery = normalizedText(query);

  return (
    normalizedQuery === "" ||
    inventoryItemSearchText(item).includes(normalizedQuery)
  );
}

function itemCategoryRank(item: ItemDefinition | null): number {
  if (!item) {
    return 6;
  }
  if (isWorkbenchInventoryItem(item)) {
    return 4;
  }

  switch (item.kind) {
    case "block":
      return 0;
    case "tool":
      return 1;
    case "material":
      return 2;
    case "generated_material":
      return 3;
    case "equipment":
      return 5;
  }
}

function materialRaritySortValue(item: ItemDefinition | null): number {
  const material = item ? materialForInventoryItem(item) : null;

  return material ? (RARITY_SORT_RANK.get(material.rarity) ?? -1) : -1;
}

function materialGenerationSortValue(item: ItemDefinition | null): number {
  const material = item ? materialForInventoryItem(item) : null;

  return material?.generation ?? -1;
}

function itemNameSortValue(
  item: ItemDefinition | null,
  stack: ItemStack,
): string {
  return normalizedText(item?.displayName ?? stack.itemId);
}

function compareStrings(first: string, second: string): number {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareInventoryStacks(
  first: ItemStack,
  second: ItemStack,
  sortMode: InventorySortMode,
  itemDefinitionForStack: (itemId: string) => ItemDefinition | null,
): number {
  const firstItem = itemDefinitionForStack(first.itemId);
  const secondItem = itemDefinitionForStack(second.itemId);
  const firstName = itemNameSortValue(firstItem, first);
  const secondName = itemNameSortValue(secondItem, second);
  const nameTieBreak = compareStrings(firstName, secondName);

  switch (sortMode) {
    case "manual":
      return 0;
    case "name":
      return nameTieBreak || compareStrings(first.itemId, second.itemId);
    case "count":
      return second.count - first.count || nameTieBreak;
    case "type":
      return (
        itemCategoryRank(firstItem) - itemCategoryRank(secondItem) ||
        nameTieBreak
      );
    case "rarity":
      return (
        materialRaritySortValue(secondItem) -
          materialRaritySortValue(firstItem) || nameTieBreak
      );
    case "generation":
      return (
        materialGenerationSortValue(secondItem) -
          materialGenerationSortValue(firstItem) || nameTieBreak
      );
  }
}

export function inventoryVisualsForItem(
  item: ItemDefinition | null,
): MaterialVisuals | null {
  if (item?.kind !== "generated_material") {
    return null;
  }

  return item.material
    ? materialVisualsForMaterial(item.material)
    : UNKNOWN_MATERIAL_VISUALS;
}

export function applyGeneratedMaterialVisual(
  element: HTMLElement,
  item: ItemDefinition | null,
): void {
  const visuals = inventoryVisualsForItem(item);

  if (!visuals) {
    return;
  }

  element.classList.add("generated-material-visual");
  element.style?.setProperty("--item-base-color", visuals.baseColor);
  element.style?.setProperty("--item-accent-color", visuals.accentColor);
  element.style?.setProperty(
    "--item-block-tint",
    materialBlockTintCssForVisuals(visuals),
  );
  element.style?.setProperty(
    "--item-emissive-strength",
    String(visuals.emissiveStrength),
  );
  element.style?.setProperty("--item-metallic", String(visuals.metallic));
}

function createItemSwatch(): HTMLElement {
  const swatch = document.createElement("span");

  swatch.className = "item-swatch";
  return swatch;
}

export class Inventory {
  readonly #hotbar: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #inventoryCounts: HTMLElement;
  readonly #inventoryActions: HTMLElement;
  readonly #heldStackPreview: HTMLElement | null;
  readonly #isCreative: boolean;
  readonly #materialItemResolver: MaterialItemResolver | null;
  readonly #onOpenChange: (isOpen: boolean) => void;
  readonly #materialStorage: MaterialStorage | null;
  readonly #onMaterialStorageChanged: () => void;
  readonly #openMaterialStorage: () => void;
  readonly #openCreativeCatalog: () => void;
  readonly #openEquipment: () => void;
  readonly #onItemAdded: (itemId: ItemId, amount: number) => void;
  readonly #onGeneratedMaterialStored: (
    materialId: string,
    quantity: number,
  ) => void;

  #hotbarSlots: InventorySlot[];
  #backpackSlots: InventorySlot[];
  #selectedHotbarIndex = 0;
  #selectedPanelSlot: {
    container: "hotbar" | "backpack";
    index: number;
  } = { container: "hotbar", index: 0 };
  #heldStack: {
    stack: ItemStack;
    origin: InventorySlotAddress | null;
  } | null = null;
  #backpackFilter: InventoryFilter = "all";
  #backpackSearch = "";
  #backpackSortMode: InventorySortMode = "manual";
  #grantSlotIndex = 0;
  #isOpen = false;
  #isActive = true;

  constructor(
    mode: GameMode = "survival",
    onOpenChange: (isOpen: boolean) => void = () => {},
    materialItemResolver: MaterialItemResolver | null = null,
    materialStorage: MaterialStorage | null = null,
    onMaterialStorageChanged: () => void = () => {},
    openMaterialStorage: () => void = () => {},
    openCreativeCatalog: () => void = () => {},
    openEquipment: () => void = () => {},
    onItemAdded: (itemId: ItemId, amount: number) => void = () => {},
    onGeneratedMaterialStored: (
      materialId: string,
      quantity: number,
    ) => void = () => {},
  ) {
    const hotbar = document.querySelector<HTMLElement>("#hotbar");
    const panel = document.querySelector<HTMLElement>("#inventory-panel");
    const inventoryCounts =
      document.querySelector<HTMLElement>("#inventory-counts");
    const inventoryActions =
      document.querySelector<HTMLElement>("#inventory-actions");
    const heldStackPreview = document.querySelector<HTMLElement>(
      "#inventory-cursor-stack",
    );

    if (!hotbar || !panel || !inventoryCounts || !inventoryActions) {
      throw new Error("Inventory interface elements are missing.");
    }

    this.#hotbar = hotbar;
    this.#panel = panel;
    this.#inventoryCounts = inventoryCounts;
    this.#inventoryActions = inventoryActions;
    this.#heldStackPreview = heldStackPreview;
    this.#isCreative = mode === "creative";
    this.#materialItemResolver = materialItemResolver;
    this.#onOpenChange = onOpenChange;
    this.#materialStorage = materialStorage;
    this.#onMaterialStorageChanged = onMaterialStorageChanged;
    this.#openMaterialStorage = openMaterialStorage;
    this.#openCreativeCatalog = openCreativeCatalog;
    this.#openEquipment = openEquipment;
    this.#onItemAdded = onItemAdded;
    this.#onGeneratedMaterialStored = onGeneratedMaterialStored;
    this.#hotbarSlots = createStartingHotbar();
    this.#backpackSlots = createStartingBackpack();

    document.addEventListener("keydown", this.#handleKeyDown, {
      capture: true,
    });

    this.render();
  }

  isCreative(): boolean {
    return this.#isCreative;
  }

  isOpen(): boolean {
    return this.#isOpen;
  }

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.#isActive) {
      return;
    }

    if (event.code === "Escape" && this.#isOpen && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
      return;
    }

    if (event.code === "KeyE" && !event.repeat) {
      event.preventDefault();
      this.toggle();
      return;
    }

    const slot = Number(event.key) - 1;
    if (slot >= 0 && slot < HOTBAR_SLOT_COUNT) {
      this.select(slot);
    }
  };

  selectedStack(): ItemStack | null {
    return this.#hotbarSlots[this.#selectedHotbarIndex] ?? null;
  }

  selectedItem(): ItemDefinition | null {
    const stack = this.selectedStack();

    return stack ? this.#itemDefinitionFor(stack.itemId) : null;
  }

  selectedStackCount(): number {
    return this.selectedStack()?.count ?? 0;
  }

  selectedItemId(): ItemId | null {
    return this.selectedStack()?.itemId ?? null;
  }

  selectedMaterial(): TerrainMaterial | null {
    return this.selectedPlaceableMaterial();
  }

  selectedPlaceableMaterial(): TerrainMaterial | null {
    const stack = this.selectedStack();

    return stack
      ? placeableMaterialForItem(stack.itemId, this.#materialItemResolver)
      : null;
  }

  selectedDynamicMaterialId(): string | null {
    const stack = this.selectedStack();
    const item = stack ? this.#itemDefinitionFor(stack.itemId) : null;

    return item?.kind === "generated_material" &&
      this.selectedPlaceableMaterial() === TerrainMaterial.DynamicMaterial
      ? item.materialId
      : null;
  }

  selectedTool(): EquippedTool {
    return equippedToolForItem(
      this.selectedItemId(),
      this.#materialItemResolver,
    );
  }

  selectedProceduralMaterial(): MaterialDefinition | null {
    const item = this.selectedItem();

    if (item?.kind === "generated_material") {
      return item.material;
    }
    if (item?.kind === "tool" && "materialId" in item) {
      return item.material;
    }

    return null;
  }

  selectedHazardMaterial(): MaterialDefinition | null {
    return this.selectedProceduralMaterial();
  }

  slot(index: number): ItemStack | null {
    return this.#hotbarSlots[index] ?? null;
  }

  backpackSlot(index: number): ItemStack | null {
    return this.#backpackSlots[index] ?? null;
  }

  heldStack(): ItemStack | null {
    return this.#heldStack?.stack ?? null;
  }

  visibleBackpackStacks(): readonly InventoryVisibleStack[] {
    return this.#visibleBackpackStacks();
  }

  setBackpackFilter(filter: InventoryFilter): void {
    this.#backpackFilter = validInventoryFilter(filter);
    this.render();
  }

  setBackpackSearch(query: string): void {
    this.#backpackSearch = query;
    this.render();
  }

  setBackpackSortMode(sortMode: InventorySortMode): void {
    this.#backpackSortMode = validInventorySortMode(sortMode);
    this.render();
  }

  sortBackpack(sortMode: InventorySortMode = this.#backpackSortMode): boolean {
    const validSortMode = validInventorySortMode(sortMode);

    if (validSortMode === "manual" || this.#heldStack) {
      return false;
    }

    const occupiedSlots = this.#backpackSlots.filter(
      (stack): stack is ItemStack => stack !== null,
    );

    occupiedSlots.sort((first, second) =>
      compareInventoryStacks(first, second, validSortMode, (itemId) =>
        this.#itemDefinitionFor(itemId),
      ),
    );
    this.#backpackSortMode = validSortMode;
    this.#backpackSlots = [
      ...occupiedSlots,
      ...createEmptySlots(BACKPACK_SLOT_COUNT - occupiedSlots.length),
    ];
    this.render();
    return occupiedSlots.length > 1;
  }

  setSlot(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= this.#hotbarSlots.length) {
      return;
    }

    this.#hotbarSlots[index] = this.#normalizeItemStack(stack);
    this.render();
  }

  setBackpackSlot(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= this.#backpackSlots.length) {
      return;
    }

    this.#backpackSlots[index] = this.#normalizeItemStack(stack);
    this.render();
  }

  damageSelectedTool(amount = 1): void {
    if (this.#isCreative) {
      return;
    }

    const stack = this.selectedStack();
    if (!stack || this.#itemDefinitionFor(stack.itemId)?.kind !== "tool") {
      return;
    }

    this.#hotbarSlots[this.#selectedHotbarIndex] = damageToolStack(
      stack,
      amount,
      this.#materialItemResolver,
    );
    this.render();
  }

  exportState(): SerializedInventory {
    return {
      selectedHotbarIndex: this.#selectedHotbarIndex,
      hotbar: this.#hotbarSlots.map((stack) => serializeItemStack(stack)),
      backpack: this.#backpackSlots.map((stack) => serializeItemStack(stack)),
    };
  }

  importState(state: SerializedInventory): void {
    this.#heldStack = null;
    const importedHotbar = createEmptySlots(HOTBAR_SLOT_COUNT);
    const importedBackpack = createEmptySlots(BACKPACK_SLOT_COUNT);

    if (state.hotbar || state.backpack) {
      this.#importSlotsInto(importedHotbar, state.hotbar ?? []);
      this.#importSlotsInto(importedBackpack, state.backpack ?? []);
    } else if (state.slots) {
      this.#importSlotsInto(importedHotbar, state.slots);
      if (state.slots.length > HOTBAR_SLOT_COUNT) {
        this.#importSlotsInto(
          importedBackpack,
          state.slots.slice(HOTBAR_SLOT_COUNT),
        );
      }
    } else if (state.items) {
      for (const item of state.items) {
        if (Number.isFinite(item.material) && Number.isFinite(item.count)) {
          this.#addStackToContainers(
            [importedHotbar, importedBackpack],
            item.material as TerrainMaterial,
            Math.max(0, item.count),
          );
        }
      }
    }

    this.#hotbarSlots = importedHotbar;
    this.#backpackSlots = importedBackpack;
    this.select(
      Number.isFinite(state.selectedHotbarIndex)
        ? (state.selectedHotbarIndex ?? 0)
        : Number.isFinite(state.selectedIndex)
          ? (state.selectedIndex ?? 0)
          : 0,
    );
  }

  count(material: TerrainMaterial): number {
    const itemId = blockItemIdForMaterial(material);

    return itemId ? this.countItem(itemId) : 0;
  }

  countItem(itemId: ItemId): number {
    if (!this.#itemDefinitionFor(itemId)) {
      return 0;
    }

    return this.#allSlots().reduce(
      (total, stack) =>
        stack?.itemId === itemId ? total + stack.count : total,
      0,
    );
  }

  equipmentItems(): readonly InventoryEquipmentItem[] {
    const items = new Map<ItemId, InventoryEquipmentItem>();

    for (const stack of this.#allSlots()) {
      if (!stack) {
        continue;
      }

      const item = this.#itemDefinitionFor(stack.itemId);
      if (item?.kind !== "equipment") {
        continue;
      }

      const existing = items.get(item.id);
      items.set(item.id, {
        itemId: item.id,
        item,
        count: (existing?.count ?? 0) + stack.count,
      });
    }

    return [...items.values()].sort((first, second) =>
      first.item.displayName.localeCompare(second.item.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }

  add(material: TerrainMaterial, amount = 1): void {
    const itemId = blockItemIdForMaterial(material);

    if (!itemId) {
      return;
    }

    this.addItem(itemId, amount);
  }

  addItem(itemId: ItemId, amount = 1): boolean {
    if (this.#isCreative) {
      return false;
    }
    const added = this.#addItemToInventory(itemId, amount);
    if (added) {
      this.#onItemAdded(itemId, amount);
    }
    this.render();
    return added;
  }

  grantItem(itemId: ItemId, amount = 1): boolean {
    const added = this.#addItemToInventory(itemId, amount);

    if (!added && this.#isCreative) {
      const totalSlots = this.#hotbarSlots.length + this.#backpackSlots.length;
      const grantIndex = this.#grantSlotIndex % totalSlots;
      const target = this.#slotAtFlatIndex(grantIndex);

      target.slots[target.index] = this.#createItemStack(itemId, amount);
      if (grantIndex < this.#hotbarSlots.length) {
        this.#selectedHotbarIndex = grantIndex;
      }
      this.#grantSlotIndex = (grantIndex + 1) % totalSlots;
      this.#onItemAdded(itemId, amount);
      this.render();
      return true;
    }

    if (added) {
      this.#onItemAdded(itemId, amount);
    }
    this.render();
    return added;
  }

  remove(material: TerrainMaterial, amount = 1): boolean {
    const itemId = blockItemIdForMaterial(material);

    return itemId ? this.removeItem(itemId, amount) : false;
  }

  removeItem(itemId: ItemId, amount = 1): boolean {
    if (this.#isCreative) {
      return true;
    }
    if (amount <= 0) {
      return true;
    }
    return this.#removeItemFromInventory(itemId, amount);
  }

  consumeSelectedStack(amount = 1): boolean {
    if (this.#isCreative) {
      return true;
    }

    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (normalizedAmount === 0) {
      return true;
    }

    const stack = this.selectedStack();
    if (!stack || stack.count < normalizedAmount) {
      return false;
    }

    this.#hotbarSlots[this.#selectedHotbarIndex] =
      stack.count > normalizedAmount
        ? {
            ...stack,
            count: stack.count - normalizedAmount,
          }
        : null;
    this.render();
    return true;
  }

  restoreSelectedStackItem(itemId: ItemId, amount = 1): boolean {
    const normalizedAmount = Math.max(0, Math.floor(amount));

    if (normalizedAmount === 0) {
      return true;
    }

    const stack = this.#createItemStack(itemId, normalizedAmount);
    const selectedSlot: InventorySlotAddress = {
      container: "hotbar",
      index: this.#selectedHotbarIndex,
    };
    let remainder = this.#insertStackIntoSlot(selectedSlot, stack);

    if (remainder) {
      remainder = this.#insertStackIntoContainers(
        this.#slotContainers(),
        remainder,
      );
    }

    this.render();
    return remainder === null;
  }

  storeGeneratedMaterialItem(itemId: ItemId, amount = 1): boolean {
    if (!this.#materialStorage) {
      return false;
    }

    const materialId = materialIdFromItemId(itemId);
    const quantity = Math.max(1, Math.floor(amount));
    const item = this.#itemDefinitionFor(itemId);

    if (
      !materialId ||
      item?.kind !== "generated_material" ||
      this.countItem(itemId) < quantity
    ) {
      return false;
    }

    if (!this.#removeItemFromInventory(itemId, quantity, false)) {
      return false;
    }

    if (!this.#materialStorage.addMaterial(materialId, quantity)) {
      this.#addItemToInventory(itemId, quantity);
      return false;
    }

    this.#onGeneratedMaterialStored(materialId, quantity);
    this.#onMaterialStorageChanged();
    this.render();
    return true;
  }

  storeGeneratedMaterialItems(
    filter: GeneratedMaterialStorageFilter = () => true,
  ): number {
    if (!this.#materialStorage) {
      return 0;
    }

    let moved = 0;

    for (const slots of this.#slotContainers()) {
      for (const [index, stack] of slots.entries()) {
        if (!stack) {
          continue;
        }

        const item = this.#itemDefinitionFor(stack.itemId);
        if (
          item?.kind !== "generated_material" ||
          !filter(item.materialId, item.material)
        ) {
          continue;
        }

        if (this.#materialStorage.addMaterial(item.materialId, stack.count)) {
          moved += stack.count;
          this.#onGeneratedMaterialStored(item.materialId, stack.count);
          slots[index] = null;
        }
      }
    }

    if (moved > 0) {
      this.#onMaterialStorageChanged();
      this.render();
    }

    return moved;
  }

  withdrawStoredMaterial(materialId: string, amount = 64): number {
    if (!this.#materialStorage) {
      return 0;
    }

    const quantity = Math.min(
      this.#materialStorage.count(materialId),
      Math.max(1, Math.floor(amount)),
    );
    const itemId = itemIdForMaterial(materialId);

    if (
      quantity <= 0 ||
      !this.#itemDefinitionFor(itemId) ||
      !this.#canFitItem(itemId, quantity) ||
      !this.#materialStorage.removeMaterial(materialId, quantity)
    ) {
      return 0;
    }

    if (!this.#addItemToInventory(itemId, quantity)) {
      this.#materialStorage.addMaterial(materialId, quantity);
      return 0;
    }

    this.#onMaterialStorageChanged();
    this.render();
    return quantity;
  }

  select(index: number): void {
    this.#selectedHotbarIndex =
      ((index % HOTBAR_SLOT_COUNT) + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT;
    this.#selectedPanelSlot = {
      container: "hotbar",
      index: this.#selectedHotbarIndex,
    };
    this.render();
  }

  selectRelative(offset: number): void {
    this.select(this.#selectedHotbarIndex + offset);
  }

  interactWithSlot(
    container: InventorySlotContainer,
    index: number,
    options: InventorySlotInteractionOptions = {},
  ): boolean {
    const address = this.#validSlotAddress(container, index);

    if (!address) {
      return false;
    }

    this.#selectedPanelSlot = address;
    if (address.container === "hotbar") {
      this.#selectedHotbarIndex = address.index;
    }

    const moved =
      options.shiftKey === true
        ? this.#shiftMoveSlot(address)
        : options.button === 2
          ? this.#rightClickSlot(address)
          : this.#leftClickSlot(address);

    this.render();
    return moved;
  }

  toggle(): void {
    if (!this.#isActive) {
      return;
    }

    if (this.#isOpen) {
      this.hide();
      return;
    }

    this.#isOpen = true;
    this.#panel.hidden = false;
    document.body.classList.add("inventory-open");
    this.#onOpenChange(true);
  }

  hide(): void {
    if (!this.#isOpen) {
      return;
    }

    if (!this.#returnHeldStackSafely()) {
      this.render();
      return;
    }

    this.#isOpen = false;
    this.#panel.hidden = true;
    document.body.classList.remove("inventory-open");
    this.#onOpenChange(false);
  }

  destroy(): void {
    this.#isActive = false;
    document.removeEventListener("keydown", this.#handleKeyDown, {
      capture: true,
    });
    this.hide();
  }

  render(): void {
    this.#hotbar.replaceChildren(
      ...this.#hotbarSlots.map((stack, index) =>
        this.#createHotbarSlot(stack, index),
      ),
    );

    this.#inventoryCounts.replaceChildren(
      this.#createInventoryContainer("Hotbar", this.#hotbarSlots, "hotbar"),
      this.#createBackpackControls(),
      this.#createInventoryContainer(
        "Backpack",
        this.#backpackSlots,
        "backpack",
      ),
    );
    this.#inventoryActions.replaceChildren(...this.#createActionButtons());
    this.#renderHeldStackPreview();
  }

  #stackCountLabel(stack: ItemStack | null): string {
    if (!stack) {
      return "";
    }

    const item = this.#itemDefinitionFor(stack.itemId);

    if (!item) {
      return "";
    }
    if (item.kind === "tool") {
      return `${stack.durability ?? item.maxDurability}/${item.maxDurability}`;
    }

    return String(stack.count);
  }

  #toolDurabilityPercent(stack: ItemStack | null): number | null {
    if (!stack) {
      return null;
    }

    const item = this.#itemDefinitionFor(stack.itemId);

    if (item?.kind !== "tool") {
      return null;
    }

    return Math.max(
      0,
      Math.min(
        100,
        ((stack.durability ?? item.maxDurability) / item.maxDurability) * 100,
      ),
    );
  }

  #itemDefinitionFor(itemId: string): ItemDefinition | null {
    return itemDefinitionFor(itemId, this.#materialItemResolver);
  }

  #createHotbarSlot(stack: InventorySlot, index: number): HTMLButtonElement {
    const slot = document.createElement("button");
    const item = stack ? this.#itemDefinitionFor(stack.itemId) : null;

    this.#applySlotClasses(slot, item, "hotbar-slot");
    slot.classList.toggle("selected", index === this.#selectedHotbarIndex);
    slot.type = "button";
    slot.setAttribute("aria-label", item?.displayName ?? "Empty hotbar slot");
    slot.setAttribute(
      "aria-pressed",
      index === this.#selectedHotbarIndex ? "true" : "false",
    );
    slot.append(
      this.#textElement("span", "slot-key", String(index + 1)),
      createItemSwatch(),
      this.#textElement("span", "slot-name", item?.shortName ?? "Empty"),
      this.#textElement("strong", "", this.#stackCountLabel(stack)),
      this.#createDurabilityBar(stack),
    );
    slot.title = item?.displayName ?? "Empty slot";
    slot.addEventListener("click", () => this.select(index));
    return slot;
  }

  #createInventoryContainer(
    label: string,
    slots: readonly InventorySlot[],
    container: "hotbar" | "backpack",
  ): HTMLElement {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const grid = document.createElement("div");
    const entries = this.#slotRenderEntries(slots, container);

    section.className = `inventory-container inventory-container-${container}`;
    heading.textContent = label;
    grid.className = "inventory-slot-grid";
    grid.replaceChildren(
      ...entries.map(({ stack, index }) =>
        this.#createInventorySlot(stack, index, container),
      ),
    );
    section.append(heading, grid);
    if (
      container === "backpack" &&
      entries.length === 0 &&
      this.#hasActiveBackpackViewFilter()
    ) {
      section.append(
        this.#textElement(
          "p",
          "inventory-empty-filter",
          "No matching backpack items.",
        ),
      );
    }
    return section;
  }

  #createBackpackControls(): HTMLElement {
    const section = document.createElement("section");
    const tabs = document.createElement("div");
    const search = document.createElement("input");
    const sortRow = document.createElement("div");
    const sortSelect = document.createElement("select");
    const sortButton = document.createElement("button");

    section.className = "inventory-backpack-controls";
    tabs.className = "inventory-filter-tabs";
    tabs.replaceChildren(
      ...INVENTORY_FILTERS.map((filter) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "inventory-filter-tab";
        button.classList.toggle("selected", filter.id === this.#backpackFilter);
        button.textContent = filter.label;
        button.addEventListener("click", () =>
          this.setBackpackFilter(filter.id),
        );
        return button;
      }),
    );

    search.className = "inventory-backpack-search";
    search.type = "search";
    search.placeholder = "Search items";
    search.value = this.#backpackSearch;
    search.addEventListener("input", (event) => {
      this.setBackpackSearch((event.currentTarget as HTMLInputElement).value);
    });

    sortRow.className = "inventory-sort-row";
    sortSelect.className = "inventory-sort-select";
    sortSelect.value = this.#backpackSortMode;
    sortSelect.replaceChildren(
      ...INVENTORY_SORT_OPTIONS.map((sort) => {
        const option = document.createElement("option");

        option.value = sort.id;
        option.textContent = sort.label;
        option.selected = sort.id === this.#backpackSortMode;
        return option;
      }),
    );
    sortSelect.addEventListener("change", (event) => {
      this.setBackpackSortMode(
        (event.currentTarget as HTMLSelectElement).value as InventorySortMode,
      );
    });

    sortButton.type = "button";
    sortButton.className = "inventory-sort-button";
    sortButton.textContent = "Sort Backpack";
    sortButton.disabled = this.#backpackSortMode === "manual";
    sortButton.addEventListener("click", () => {
      this.sortBackpack();
    });

    sortRow.append(sortSelect, sortButton);
    section.append(tabs, search, sortRow);
    return section;
  }

  #slotRenderEntries(
    slots: readonly InventorySlot[],
    container: "hotbar" | "backpack",
  ): readonly InventorySlotRenderEntry[] {
    if (container === "hotbar" || !this.#hasActiveBackpackViewFilter()) {
      return slots.map((stack, index) => ({ index, stack }));
    }

    return this.#visibleBackpackStacks().map(({ index, stack }) => ({
      index,
      stack,
    }));
  }

  #hasActiveBackpackViewFilter(): boolean {
    return (
      this.#backpackFilter !== "all" ||
      normalizedText(this.#backpackSearch) !== ""
    );
  }

  #visibleBackpackStacks(): readonly InventoryVisibleStack[] {
    return this.#backpackSlots.flatMap((stack, index) => {
      if (!stack) {
        return [];
      }

      const item = this.#itemDefinitionFor(stack.itemId);

      if (
        !item ||
        !inventoryItemMatchesFilter(item, this.#backpackFilter) ||
        !inventoryItemMatchesSearch(item, this.#backpackSearch)
      ) {
        return [];
      }

      return [{ index, stack, item }];
    });
  }

  #createInventorySlot(
    stack: InventorySlot,
    index: number,
    container: "hotbar" | "backpack",
  ): HTMLElement {
    const slot = document.createElement("article");
    const item = stack ? this.#itemDefinitionFor(stack.itemId) : null;
    const slotLabel =
      container === "hotbar" ? String(index + 1) : String(index + 10);
    const details = document.createElement("div");
    const name = this.#textElement("span", "slot-name", item?.shortName ?? "");
    const count = this.#textElement("strong", "", this.#stackCountLabel(stack));

    this.#applySlotClasses(slot, item, "inventory-slot");
    slot.classList.add(`inventory-slot-${container}`);
    slot.classList.toggle(
      "selected",
      this.#selectedPanelSlot.container === container &&
        this.#selectedPanelSlot.index === index,
    );
    slot.title = item?.displayName ?? "Empty slot";
    slot.setAttribute(
      "aria-label",
      item
        ? `${item.displayName}, ${this.#stackCountLabel(stack) || "1"}`
        : `Empty ${container} slot ${index + 1}`,
    );
    slot.tabIndex = 0;
    details.className = "inventory-slot-details";
    details.append(name, count, this.#createDurabilityBar(stack));
    slot.append(
      this.#textElement("span", "slot-key", slotLabel),
      createItemSwatch(),
      details,
    );
    slot.addEventListener("click", (event) => {
      this.interactWithSlot(container, index, {
        button: 0,
        shiftKey: event.shiftKey,
      });
    });
    slot.addEventListener("keydown", (event) => {
      if (event.code !== "Enter" && event.code !== "Space") {
        return;
      }

      event.preventDefault();
      this.interactWithSlot(container, index, {
        button: 0,
        shiftKey: event.shiftKey,
      });
    });
    slot.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.interactWithSlot(container, index, {
        button: 2,
        shiftKey: event.shiftKey,
      });
    });
    return slot;
  }

  #createDurabilityBar(stack: ItemStack | null): HTMLElement {
    const durability = document.createElement("span");
    const fill = document.createElement("span");
    const percent = this.#toolDurabilityPercent(stack);

    durability.className = "tool-durability";
    fill.className = "tool-durability-fill";
    durability.hidden = percent === null;
    if (percent !== null) {
      durability.title = `Durability ${Math.round(percent)}%`;
      durability.style.setProperty("--durability", `${percent}%`);
    }
    durability.append(fill);
    return durability;
  }

  #applySlotClasses(
    element: HTMLElement,
    item: ItemDefinition | null,
    baseClass: string,
  ): void {
    element.className = baseClass;
    element.classList.toggle("empty", !item);
    if (item) {
      element.classList.add(safeItemClass(item.id));
      element.classList.add(`inventory-kind-${item.kind}`);
      if (item.kind === "block") {
        element.classList.add(`material-${item.material}`);
      }
    }
    applyGeneratedMaterialVisual(element, item);
  }

  #createActionButtons(): readonly HTMLButtonElement[] {
    const buttons: HTMLButtonElement[] = [];

    if (this.#isCreative) {
      buttons.push(
        this.#createActionButton("Creative Catalog", {
          className: "inventory-action-creative-catalog",
          title: "Creative item catalog",
          onClick: () => this.#openCreativeCatalog(),
        }),
      );
    }

    if (this.#materialStorage) {
      buttons.push(
        this.#createActionButton("Store Materials", {
          className: "inventory-action-store-materials",
          title: "Move generated material items into material storage",
          onClick: () => this.storeGeneratedMaterialItems(),
        }),
      );
      buttons.push(
        this.#createActionButton("Material Storage", {
          className: "inventory-action-material-storage",
          title: "Open material storage",
          onClick: () => this.#openMaterialStorage(),
        }),
      );
    }

    buttons.push(
      this.#createActionButton("Equipment", {
        className: "inventory-action-equipment",
        title: "Open equipment slots",
        onClick: () => this.#openEquipment(),
      }),
    );

    return buttons;
  }

  #createActionButton(
    text: string,
    options: Readonly<{
      className: string;
      disabled?: boolean;
      title?: string;
      onClick?: () => void;
    }>,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = `inventory-action ${options.className}`;
    button.textContent = text;
    button.disabled = options.disabled ?? false;
    button.title = options.title ?? text;
    if (options.onClick) {
      button.addEventListener("click", options.onClick);
    }
    return button;
  }

  #renderHeldStackPreview(): void {
    document.body.classList.toggle(
      "inventory-holding-stack",
      this.#heldStack !== null,
    );

    if (!this.#heldStackPreview) {
      return;
    }

    const held = this.#heldStack;

    this.#heldStackPreview.replaceChildren();
    this.#heldStackPreview.hidden = held === null;
    if (!held) {
      this.#heldStackPreview.className = "inventory-cursor-stack";
      return;
    }

    const item = this.#itemDefinitionFor(held.stack.itemId);
    const name = this.#textElement("span", "slot-name", item?.shortName ?? "");
    const count = this.#textElement(
      "strong",
      "",
      this.#stackCountLabel(held.stack),
    );

    this.#applySlotClasses(
      this.#heldStackPreview,
      item,
      "inventory-cursor-stack",
    );
    this.#heldStackPreview.hidden = false;
    this.#heldStackPreview.title = item?.displayName ?? held.stack.itemId;
    this.#heldStackPreview.append(createItemSwatch(), name, count);
  }

  #validSlotAddress(
    container: InventorySlotContainer,
    index: number,
  ): InventorySlotAddress | null {
    const slots =
      container === "hotbar" ? this.#hotbarSlots : this.#backpackSlots;

    if (index < 0 || index >= slots.length) {
      return null;
    }

    return { container, index };
  }

  #slotsForAddress(address: InventorySlotAddress): InventorySlot[] {
    return address.container === "hotbar"
      ? this.#hotbarSlots
      : this.#backpackSlots;
  }

  #stackAt(address: InventorySlotAddress): ItemStack | null {
    return this.#slotsForAddress(address)[address.index] ?? null;
  }

  #setStackAt(address: InventorySlotAddress, stack: ItemStack | null): void {
    this.#slotsForAddress(address)[address.index] =
      this.#normalizeItemStack(stack);
  }

  #maxStackSize(stack: ItemStack): number {
    return this.#itemDefinitionFor(stack.itemId)?.maxStackSize ?? stack.count;
  }

  #stackWithCount(stack: ItemStack, count: number): ItemStack | null {
    if (count <= 0) {
      return null;
    }

    return {
      ...stack,
      count,
    };
  }

  #canMergeInto(first: ItemStack | null, second: ItemStack | null): boolean {
    return canMergeItemStacks(first, second, this.#materialItemResolver);
  }

  #leftClickSlot(address: InventorySlotAddress): boolean {
    const slotStack = this.#stackAt(address);

    if (!this.#heldStack) {
      if (!slotStack) {
        return false;
      }

      this.#heldStack = {
        stack: slotStack,
        origin: address,
      };
      this.#setStackAt(address, null);
      return true;
    }

    const held = this.#heldStack.stack;

    if (!slotStack) {
      this.#setStackAt(address, held);
      this.#heldStack = null;
      return true;
    }

    if (this.#canMergeInto(slotStack, held)) {
      const maxStackSize = this.#maxStackSize(slotStack);
      const available = Math.max(0, maxStackSize - slotStack.count);
      const moved = Math.min(available, held.count);

      if (moved <= 0) {
        return false;
      }

      this.#setStackAt(address, {
        ...slotStack,
        count: slotStack.count + moved,
      });
      this.#heldStack =
        held.count - moved > 0
          ? {
              stack: {
                ...held,
                count: held.count - moved,
              },
              origin: this.#heldStack.origin,
            }
          : null;
      return true;
    }

    this.#setStackAt(address, held);
    this.#heldStack = {
      stack: slotStack,
      origin: address,
    };
    return true;
  }

  #rightClickSlot(address: InventorySlotAddress): boolean {
    const slotStack = this.#stackAt(address);

    if (!this.#heldStack) {
      if (!slotStack) {
        return false;
      }

      const splitCount =
        this.#itemDefinitionFor(slotStack.itemId)?.kind === "tool"
          ? 1
          : Math.ceil(slotStack.count / 2);
      const remainingCount = slotStack.count - splitCount;

      this.#heldStack = {
        stack: {
          ...slotStack,
          count: splitCount,
        },
        origin: address,
      };
      this.#setStackAt(
        address,
        this.#stackWithCount(slotStack, remainingCount),
      );
      return true;
    }

    const held = this.#heldStack.stack;

    if (!slotStack) {
      const placedCount =
        this.#itemDefinitionFor(held.itemId)?.kind === "tool" ? held.count : 1;

      this.#setStackAt(address, {
        ...held,
        count: placedCount,
      });
      this.#heldStack = this.#stackWithCount(held, held.count - placedCount)
        ? {
            stack: this.#stackWithCount(held, held.count - placedCount)!,
            origin: this.#heldStack.origin,
          }
        : null;
      return true;
    }

    if (!this.#canMergeInto(slotStack, held)) {
      return false;
    }

    const maxStackSize = this.#maxStackSize(slotStack);

    if (slotStack.count >= maxStackSize) {
      return false;
    }

    this.#setStackAt(address, {
      ...slotStack,
      count: slotStack.count + 1,
    });
    this.#heldStack = this.#stackWithCount(held, held.count - 1)
      ? {
          stack: this.#stackWithCount(held, held.count - 1)!,
          origin: this.#heldStack.origin,
        }
      : null;
    return true;
  }

  #shiftMoveSlot(address: InventorySlotAddress): boolean {
    if (this.#heldStack) {
      return false;
    }

    const stack = this.#stackAt(address);

    if (!stack) {
      return false;
    }

    const targetContainers =
      address.container === "hotbar"
        ? [this.#backpackSlots]
        : [this.#hotbarSlots];
    const remainder = this.#insertStackIntoContainers(targetContainers, stack);

    if (remainder?.count === stack.count) {
      return false;
    }

    this.#setStackAt(address, remainder);
    return true;
  }

  #returnHeldStackSafely(): boolean {
    const held = this.#heldStack;

    if (!held) {
      return true;
    }

    let remainder: ItemStack | null = held.stack;

    if (held.origin) {
      remainder = this.#insertStackIntoSlot(held.origin, remainder);
    }
    if (remainder) {
      remainder = this.#insertStackIntoContainers(
        this.#slotContainers(),
        remainder,
      );
    }

    this.#heldStack = remainder
      ? {
          stack: remainder,
          origin: null,
        }
      : null;

    return this.#heldStack === null;
  }

  #insertStackIntoSlot(
    address: InventorySlotAddress,
    stack: ItemStack | null,
  ): ItemStack | null {
    if (!stack) {
      return null;
    }

    const target = this.#stackAt(address);

    if (!target) {
      const placed = Math.min(this.#maxStackSize(stack), stack.count);

      this.#setStackAt(address, {
        ...stack,
        count: placed,
      });
      return this.#stackWithCount(stack, stack.count - placed);
    }

    if (!this.#canMergeInto(target, stack)) {
      return stack;
    }

    const available = Math.max(0, this.#maxStackSize(target) - target.count);
    const moved = Math.min(available, stack.count);

    if (moved <= 0) {
      return stack;
    }

    this.#setStackAt(address, {
      ...target,
      count: target.count + moved,
    });
    return this.#stackWithCount(stack, stack.count - moved);
  }

  #textElement<TagName extends keyof HTMLElementTagNameMap>(
    tagName: TagName,
    className: string,
    text: string,
  ): HTMLElementTagNameMap[TagName] {
    const element = document.createElement(tagName);

    element.className = className;
    element.textContent = text;
    return element;
  }

  #createItemStack(itemId: ItemId, count = 1): ItemStack {
    return createItemStack(itemId, count, this.#materialItemResolver);
  }

  #normalizeItemStack(
    stack: ItemStack | ReturnType<typeof serializeItemStack> | null | undefined,
  ): ItemStack | null {
    return normalizeItemStack(stack, this.#materialItemResolver);
  }

  #importSlotsInto(
    target: InventorySlot[],
    source: readonly (ReturnType<typeof serializeItemStack> | null)[],
  ): void {
    for (const [index, stack] of source.entries()) {
      if (index < target.length) {
        target[index] = this.#normalizeItemStack(stack);
      }
    }
  }

  #slotContainers(): readonly InventorySlot[][] {
    return [this.#hotbarSlots, this.#backpackSlots];
  }

  #allSlots(): readonly InventorySlot[] {
    return this.#slotContainers().flatMap((slots) => slots);
  }

  #slotAtFlatIndex(flatIndex: number): {
    slots: InventorySlot[];
    index: number;
  } {
    if (flatIndex < this.#hotbarSlots.length) {
      return {
        slots: this.#hotbarSlots,
        index: flatIndex,
      };
    }

    return {
      slots: this.#backpackSlots,
      index: flatIndex - this.#hotbarSlots.length,
    };
  }

  #addStackToContainers(
    containers: readonly InventorySlot[][],
    material: TerrainMaterial,
    amount: number,
  ): void {
    const itemId = blockItemIdForMaterial(material);

    if (itemId) {
      this.#addItemToContainers(containers, itemId, amount);
    }
  }

  #addItemToInventory(itemId: ItemId, amount: number): boolean {
    return this.#addItemToContainers(this.#slotContainers(), itemId, amount);
  }

  #removeItemFromInventory(
    itemId: ItemId,
    amount: number,
    shouldRender = true,
  ): boolean {
    if (amount <= 0) {
      return true;
    }
    if (this.countItem(itemId) < amount) {
      return false;
    }

    let remaining = amount;

    for (const slots of this.#slotContainers()) {
      for (const [index, stack] of slots.entries()) {
        if (!stack || stack.itemId !== itemId) {
          continue;
        }

        const removed = Math.min(stack.count, remaining);
        const nextCount = stack.count - removed;
        slots[index] =
          nextCount > 0
            ? {
                ...stack,
                count: nextCount,
              }
            : null;
        remaining -= removed;

        if (remaining === 0) {
          break;
        }
      }

      if (remaining === 0) {
        break;
      }
    }

    if (shouldRender) {
      this.render();
    }

    return true;
  }

  #canFitItem(itemId: ItemId, amount: number): boolean {
    const item = this.#itemDefinitionFor(itemId);

    if (!item || amount <= 0) {
      return amount <= 0;
    }
    if (item.kind === "tool") {
      return this.#allSlots().filter((slot) => slot === null).length >= amount;
    }

    let capacity = 0;
    const candidateStack = this.#createItemStack(itemId);

    for (const stack of this.#allSlots()) {
      if (!stack) {
        capacity += item.maxStackSize;
      } else if (
        canMergeItemStacks(stack, candidateStack, this.#materialItemResolver)
      ) {
        capacity += Math.max(0, item.maxStackSize - stack.count);
      }

      if (capacity >= amount) {
        return true;
      }
    }

    return false;
  }

  #insertStackIntoContainers(
    containers: readonly InventorySlot[][],
    stack: ItemStack,
  ): ItemStack | null {
    const item = this.#itemDefinitionFor(stack.itemId);

    if (!item) {
      return stack;
    }

    let remaining = stack.count;

    if (item.kind !== "tool") {
      for (const slots of containers) {
        for (const [index, target] of slots.entries()) {
          if (!this.#canMergeInto(target, stack)) {
            continue;
          }

          const available = Math.max(0, item.maxStackSize - target!.count);
          const moved = Math.min(available, remaining);

          if (moved <= 0) {
            continue;
          }

          slots[index] = {
            ...target!,
            count: target!.count + moved,
          };
          remaining -= moved;

          if (remaining === 0) {
            return null;
          }
        }
      }
    }

    for (const slots of containers) {
      for (const [index, target] of slots.entries()) {
        if (target) {
          continue;
        }

        const moved =
          item.kind === "tool" ? 1 : Math.min(item.maxStackSize, remaining);

        slots[index] = {
          ...stack,
          count: moved,
        };
        remaining -= moved;

        if (remaining === 0) {
          return null;
        }
      }
    }

    return {
      ...stack,
      count: remaining,
    };
  }

  #addItemToContainers(
    containers: readonly InventorySlot[][],
    itemId: ItemId,
    amount: number,
  ): boolean {
    if (amount <= 0) {
      return true;
    }
    const item = this.#itemDefinitionFor(itemId);

    if (!item) {
      return false;
    }
    let remaining = amount;
    const candidateStack = this.#createItemStack(itemId);

    if (item.kind !== "tool") {
      for (const slots of containers) {
        for (const [index, stack] of slots.entries()) {
          if (
            !stack ||
            !canMergeItemStacks(
              stack,
              candidateStack,
              this.#materialItemResolver,
            )
          ) {
            continue;
          }

          const available = item.maxStackSize - stack.count;
          const added = Math.min(available, remaining);
          slots[index] = {
            ...stack,
            count: stack.count + added,
          };
          remaining -= added;

          if (remaining === 0) {
            return true;
          }
        }
      }
    }

    for (const slots of containers) {
      for (const [index, stack] of slots.entries()) {
        if (stack) {
          continue;
        }

        const added =
          item.kind === "tool" ? 1 : Math.min(item.maxStackSize, remaining);
        slots[index] = this.#createItemStack(itemId, added);
        remaining -= added;

        if (remaining === 0) {
          return true;
        }
      }
    }

    return false;
  }
}
