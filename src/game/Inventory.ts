import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  blockItemIdForMaterial,
  equippedToolForItem,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  itemDefinitionFor,
  materialIdFromItemId,
  placeableMaterialForItem,
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
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
  type MaterialVisuals,
} from "../materials/MaterialVisuals.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { SerializedInventory } from "../save/WorldSaveTypes.ts";
import { minedDrop as registryMinedDrop } from "../world/blocks.ts";
import type { GameMode } from "./gameMode.ts";
import type { MaterialStorage } from "./MaterialStorage.ts";

export type InventoryItem = ItemDefinition;
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

export const BACKPACK_SLOT_COUNT = 27;

export function minedDrop(material: TerrainMaterial): TerrainMaterial | null {
  const drop = registryMinedDrop(material);
  return drop === null ? null : (drop as TerrainMaterial);
}

const SURVIVAL_STARTER_ITEM_STACKS = [
  { itemId: "tool:pickaxe", count: 1 },
  { itemId: "tool:shovel", count: 1 },
  { itemId: "tool:axe", count: 1 },
] as const satisfies readonly { itemId: ItemId; count: number }[];

function createEmptySlots(count: number): InventorySlot[] {
  return Array.from({ length: count }, () => null);
}

function createStartingHotbar(mode: GameMode): InventorySlot[] {
  const slots = createEmptySlots(HOTBAR_SLOT_COUNT);

  if (mode === "survival") {
    for (const [index, starter] of SURVIVAL_STARTER_ITEM_STACKS.entries()) {
      slots[index] = createItemStack(starter.itemId, starter.count);
    }
  }

  return slots;
}

function createStartingBackpack(): InventorySlot[] {
  return createEmptySlots(BACKPACK_SLOT_COUNT);
}

function safeItemClass(itemId: string): string {
  return `item-${itemId.replace(/[^a-z0-9_-]/gi, "-")}`;
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
    this.#hotbarSlots = createStartingHotbar(mode);
    this.#backpackSlots = createStartingBackpack();

    document.addEventListener("keydown", this.#handleKeyDown, {
      capture: true,
    });

    this.render();
  }

  isCreative(): boolean {
    return this.#isCreative;
  }

  creativeCatalogItems(): readonly InventoryItem[] {
    return this.#isCreative ? ITEM_DEFINITIONS : [];
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

  slot(index: number): ItemStack | null {
    return this.#hotbarSlots[index] ?? null;
  }

  backpackSlot(index: number): ItemStack | null {
    return this.#backpackSlots[index] ?? null;
  }

  heldStack(): ItemStack | null {
    return this.#heldStack?.stack ?? null;
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

  add(material: TerrainMaterial, amount = 1): void {
    const itemId = blockItemIdForMaterial(material);

    if (!itemId) {
      return;
    }

    this.addItem(itemId, amount);
  }

  addItem(itemId: ItemId, amount = 1): boolean {
    if (this.#isCreative) {
      return true;
    }
    const added = this.#addItemToInventory(itemId, amount);
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
      this.render();
      return true;
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

    this.render();
    return true;
  }

  storeGeneratedMaterialItem(itemId: ItemId, amount = 1): boolean {
    if (!this.#materialStorage) {
      return false;
    }

    const materialId = materialIdFromItemId(itemId);
    const quantity = Math.max(1, Math.floor(amount));

    if (!materialId || this.countItem(itemId) < quantity) {
      return false;
    }

    if (!this.removeItem(itemId, quantity)) {
      return false;
    }

    if (!this.#materialStorage.addMaterial(materialId, quantity)) {
      this.addItem(itemId, quantity);
      return false;
    }

    this.#onMaterialStorageChanged();
    this.render();
    return true;
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

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
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

  #itemDefinitionFor(itemId: string): ItemDefinition | null {
    return itemDefinitionFor(itemId, this.#materialItemResolver);
  }

  #createHotbarSlot(stack: InventorySlot, index: number): HTMLButtonElement {
    const slot = document.createElement("button");
    const item = stack ? this.#itemDefinitionFor(stack.itemId) : null;

    this.#applySlotClasses(slot, item, "hotbar-slot");
    slot.classList.toggle("selected", index === this.#selectedHotbarIndex);
    slot.type = "button";
    slot.append(
      this.#textElement("span", "slot-key", String(index + 1)),
      createItemSwatch(),
      this.#textElement("span", "slot-name", item?.shortName ?? "Empty"),
      this.#textElement("strong", "", this.#stackCountLabel(stack)),
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

    section.className = `inventory-container inventory-container-${container}`;
    heading.textContent = label;
    grid.className = "inventory-slot-grid";
    grid.replaceChildren(
      ...slots.map((stack, index) =>
        this.#createInventorySlot(stack, index, container),
      ),
    );
    section.append(heading, grid);
    return section;
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
    details.className = "inventory-slot-details";
    details.append(name, count);
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
    slot.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.interactWithSlot(container, index, {
        button: 2,
        shiftKey: event.shiftKey,
      });
    });
    return slot;
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
        this.#createActionButton("Material Storage", {
          className: "inventory-action-material-storage",
          onClick: () => this.#openMaterialStorage(),
        }),
      );
    }

    buttons.push(
      this.#createActionButton("Equipment (Coming Soon)", {
        className: "inventory-action-equipment",
        disabled: true,
        title: "Equipment slots are coming soon.",
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
