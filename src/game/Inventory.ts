import {
  CraftingController,
  type CraftingInventory,
} from "../crafting/CraftingController.ts";
import type { Recipe, RecipeStack } from "../crafting/RecipeTypes.ts";
import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  blockItemIdForMaterial,
  DEFAULT_CREATIVE_HOTBAR_ITEM_IDS,
  DEFAULT_SURVIVAL_HOTBAR_ITEM_IDS,
  equippedToolForItem,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  itemDefinitionFor,
  itemDefinitionOrThrow,
  placeableMaterialForItem,
  type ItemDefinition,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  canMergeItemStacks,
  createItemStack,
  damageToolStack,
  normalizeItemStack,
  serializeItemStack,
  type ItemStack,
} from "../items/ItemStack.ts";
import type { EquippedTool } from "../items/ToolTypes.ts";
import type { SerializedInventory } from "../save/WorldSaveTypes.ts";
import { minedDrop as registryMinedDrop } from "../world/blocks.ts";
import type { GameMode } from "./gameMode.ts";

export type InventoryItem = ItemDefinition;

export const HOTBAR_ITEMS: readonly InventoryItem[] =
  DEFAULT_CREATIVE_HOTBAR_ITEM_IDS.map((itemId) =>
    itemDefinitionOrThrow(itemId),
  );

export function minedDrop(material: TerrainMaterial): TerrainMaterial | null {
  const drop = registryMinedDrop(material);
  return drop === null ? null : (drop as TerrainMaterial);
}

function createCreativeSlots(): Array<ItemStack | null> {
  return DEFAULT_CREATIVE_HOTBAR_ITEM_IDS.map((itemId) =>
    createItemStack(itemId),
  );
}

function createSurvivalSlots(): Array<ItemStack | null> {
  const slots: Array<ItemStack | null> = Array.from(
    { length: HOTBAR_SLOT_COUNT },
    () => null,
  );

  for (const [index, itemId] of DEFAULT_SURVIVAL_HOTBAR_ITEM_IDS.entries()) {
    slots[index] = createItemStack(itemId, itemId === "block:dirt" ? 8 : 1);
  }

  return slots;
}

function safeItemClass(itemId: string): string {
  return `item-${itemId.replace(/[^a-z0-9_-]/gi, "-")}`;
}

export class Inventory {
  readonly #hotbar: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #inventoryCounts: HTMLElement;
  readonly #recipeList: HTMLElement;
  readonly #crafting: CraftingController;
  readonly #isCreative: boolean;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #slots: Array<ItemStack | null>;
  #selectedIndex = 0;
  #isOpen = false;
  #isActive = true;

  constructor(
    mode: GameMode = "survival",
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    const hotbar = document.querySelector<HTMLElement>("#hotbar");
    const panel = document.querySelector<HTMLElement>("#inventory-panel");
    const inventoryCounts =
      document.querySelector<HTMLElement>("#inventory-counts");
    const recipeList =
      document.querySelector<HTMLElement>("#inventory-recipes");

    if (!hotbar || !panel || !inventoryCounts || !recipeList) {
      throw new Error("Inventory interface elements are missing.");
    }

    this.#hotbar = hotbar;
    this.#panel = panel;
    this.#inventoryCounts = inventoryCounts;
    this.#recipeList = recipeList;
    this.#isCreative = mode === "creative";
    this.#onOpenChange = onOpenChange;
    this.#slots = this.#isCreative
      ? createCreativeSlots()
      : createSurvivalSlots();
    this.#crafting = new CraftingController(this.#craftingInventory());

    document.addEventListener("keydown", (event) => {
      if (!this.#isActive) {
        return;
      }

      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        this.toggle();
        return;
      }

      const slot = Number(event.key) - 1;
      if (slot >= 0 && slot < this.#slots.length) {
        this.select(slot);
      }
    });

    this.render();
  }

  isCreative(): boolean {
    return this.#isCreative;
  }

  selectedStack(): ItemStack | null {
    return this.#slots[this.#selectedIndex] ?? null;
  }

  selectedItem(): ItemDefinition | null {
    const stack = this.selectedStack();

    return stack ? itemDefinitionFor(stack.itemId) : null;
  }

  selectedItemId(): ItemId | null {
    return this.selectedStack()?.itemId ?? null;
  }

  selectedMaterial(): TerrainMaterial | null {
    return this.selectedPlaceableMaterial();
  }

  selectedPlaceableMaterial(): TerrainMaterial | null {
    const stack = this.selectedStack();

    return stack ? placeableMaterialForItem(stack.itemId) : null;
  }

  selectedTool(): EquippedTool {
    return equippedToolForItem(this.selectedItemId());
  }

  slot(index: number): ItemStack | null {
    return this.#slots[index] ?? null;
  }

  setSlot(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= this.#slots.length) {
      return;
    }

    this.#slots[index] = normalizeItemStack(stack);
    this.render();
  }

  damageSelectedTool(amount = 1): void {
    if (this.#isCreative) {
      return;
    }

    const stack = this.selectedStack();
    if (!stack || itemDefinitionFor(stack.itemId)?.kind !== "tool") {
      return;
    }

    this.#slots[this.#selectedIndex] = damageToolStack(stack, amount);
    this.render();
  }

  exportState(): SerializedInventory {
    return {
      selectedIndex: this.#selectedIndex,
      slots: this.#slots.map((stack) => serializeItemStack(stack)),
    };
  }

  importState(state: SerializedInventory): void {
    const importedSlots = Array.from(
      { length: HOTBAR_SLOT_COUNT },
      () => null,
    ) as Array<ItemStack | null>;

    if (state.slots) {
      for (const [index, stack] of state.slots.entries()) {
        if (index < importedSlots.length) {
          importedSlots[index] = normalizeItemStack(stack);
        }
      }
    } else if (state.items) {
      for (const item of state.items) {
        if (Number.isFinite(item.material) && Number.isFinite(item.count)) {
          this.#addStackToSlots(
            importedSlots,
            item.material as TerrainMaterial,
            Math.max(0, item.count),
          );
        }
      }
    }

    this.#slots = importedSlots;
    this.select(Number.isFinite(state.selectedIndex) ? state.selectedIndex : 0);
  }

  count(material: TerrainMaterial): number {
    const itemId = blockItemIdForMaterial(material);

    return itemId ? this.countItem(itemId) : 0;
  }

  countItem(itemId: ItemId): number {
    if (!itemDefinitionFor(itemId)) {
      return 0;
    }

    if (this.#isCreative) {
      return Number.POSITIVE_INFINITY;
    }

    return this.#slots.reduce(
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
    const added = this.#addItemToSlots(this.#slots, itemId, amount);
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

    for (const [index, stack] of this.#slots.entries()) {
      if (!stack || stack.itemId !== itemId) {
        continue;
      }

      const removed = Math.min(stack.count, remaining);
      const nextCount = stack.count - removed;
      this.#slots[index] =
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

    this.render();
    return true;
  }

  select(index: number): void {
    this.#selectedIndex =
      ((index % this.#slots.length) + this.#slots.length) % this.#slots.length;
    this.render();
  }

  selectRelative(offset: number): void {
    this.select(this.#selectedIndex + offset);
  }

  craftPlanks(): boolean {
    return this.craftRecipe("wood_to_planks");
  }

  craftRecipe(recipeId: string): boolean {
    const crafted = this.#crafting.craft(recipeId);

    this.render();
    return crafted;
  }

  toggle(): void {
    if (!this.#isActive) {
      return;
    }

    this.#isOpen = !this.#isOpen;
    this.#panel.hidden = !this.#isOpen;
    document.body.classList.toggle("inventory-open", this.#isOpen);

    if (this.#isOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.#onOpenChange(this.#isOpen);
  }

  destroy(): void {
    this.#isActive = false;
    this.#isOpen = false;
    this.#panel.hidden = true;
    document.body.classList.remove("inventory-open");
  }

  render(): void {
    this.#hotbar.replaceChildren(
      ...this.#slots.map((stack, index) => {
        const slot = document.createElement("button");
        const item = stack ? itemDefinitionFor(stack.itemId) : null;

        slot.className = "hotbar-slot";
        slot.classList.toggle("selected", index === this.#selectedIndex);
        slot.classList.toggle("empty", !item);
        if (item) {
          slot.classList.add(safeItemClass(item.id));
          if (item.kind === "block") {
            slot.classList.add(`material-${item.material}`);
          }
        }
        slot.type = "button";
        slot.innerHTML =
          `<span class="slot-key">${index + 1}</span>` +
          `<span class="slot-name">${item?.shortName ?? "Empty"}</span>` +
          `<strong>${this.#stackCountLabel(stack)}</strong>`;
        slot.title = item?.displayName ?? "Empty slot";
        slot.addEventListener("click", () => this.select(index));
        return slot;
      }),
    );

    this.#inventoryCounts.replaceChildren(
      ...ITEM_DEFINITIONS.map((item) => {
        const row = document.createElement("div");
        row.className = `inventory-item-row ${safeItemClass(item.id)}`;
        row.classList.add(`inventory-kind-${item.kind}`);
        row.innerHTML = `<span>${item.displayName}</span><strong>${this.#itemCountLabel(item)}</strong>`;
        return row;
      }),
    );
    this.#recipeList.replaceChildren(
      ...this.#crafting
        .recipesForStation("inventory")
        .map((recipe) => this.#createRecipeRow(recipe)),
    );
  }

  #stackCountLabel(stack: ItemStack | null): string {
    if (!stack) {
      return "";
    }

    const item = itemDefinitionFor(stack.itemId);

    if (!item) {
      return "";
    }
    if (this.#isCreative) {
      return "∞";
    }
    if (item.kind === "tool") {
      return `${stack.durability ?? item.maxDurability}/${item.maxDurability}`;
    }

    return String(stack.count);
  }

  #itemCountLabel(item: ItemDefinition): string {
    if (this.#isCreative) {
      return "∞";
    }
    if (item.kind === "tool") {
      const stack = this.#slots.find((slot) => slot?.itemId === item.id);
      return stack ? this.#stackCountLabel(stack) : "—";
    }

    return item.kind === "block"
      ? String(this.count(item.material))
      : String(this.countItem(item.id));
  }

  #addStackToSlots(
    slots: Array<ItemStack | null>,
    material: TerrainMaterial,
    amount: number,
  ): void {
    const itemId = blockItemIdForMaterial(material);

    if (itemId) {
      this.#addItemToSlots(slots, itemId, amount);
    }
  }

  #addItemToSlots(
    slots: Array<ItemStack | null>,
    itemId: ItemId,
    amount: number,
  ): boolean {
    if (amount <= 0) {
      return true;
    }
    const item = itemDefinitionFor(itemId);

    if (!item) {
      return false;
    }
    let remaining = amount;

    if (item.kind !== "tool") {
      for (const [index, stack] of slots.entries()) {
        if (!stack || !canMergeItemStacks(stack, createItemStack(itemId))) {
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

    for (const [index, stack] of slots.entries()) {
      if (stack) {
        continue;
      }

      const added =
        item.kind === "tool" ? 1 : Math.min(item.maxStackSize, remaining);
      slots[index] = createItemStack(itemId, added);
      remaining -= added;

      if (remaining === 0) {
        return true;
      }
    }

    return false;
  }

  #createRecipeRow(recipe: Recipe): HTMLElement {
    const row = document.createElement("article");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const summary = document.createElement("p");
    const button = document.createElement("button");
    const canCraft = this.#crafting.canCraft(recipe);

    row.className = "recipe";
    row.classList.toggle("can-craft", canCraft);
    row.classList.toggle("missing-ingredients", !canCraft);
    title.textContent = recipe.displayName;
    summary.textContent = this.#recipeSummary(recipe);
    button.type = "button";
    button.disabled = !canCraft;
    button.textContent = this.#isCreative ? "Make" : "Craft";
    button.addEventListener("click", () => {
      this.craftRecipe(recipe.id);
    });
    details.append(title, summary);
    row.append(details, button);
    return row;
  }

  #recipeSummary(recipe: Recipe): string {
    const inputs =
      recipe.type === "shapeless"
        ? recipe.inputs
            .map((input) => this.#recipeStackLabel(input))
            .join(" + ")
        : "Shaped recipe";
    const outputs = recipe.outputs
      .map((output) => this.#recipeStackLabel(output))
      .join(" + ");

    return `${inputs} → ${outputs}`;
  }

  #recipeStackLabel(stack: RecipeStack): string {
    const item = itemDefinitionFor(stack.itemId);

    return `${stack.count} ${item?.displayName ?? stack.itemId}`;
  }

  #craftingInventory(): CraftingInventory {
    return {
      isCreative: () => this.isCreative(),
      countItem: (itemId) => this.countItem(itemId),
      addItem: (itemId, count) => this.addItem(itemId, count),
      removeItem: (itemId, count) => this.removeItem(itemId, count),
    };
  }
}
