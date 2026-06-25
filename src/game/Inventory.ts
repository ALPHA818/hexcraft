import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import type { GameMode } from "./gameMode.ts";

export type InventoryItem = Readonly<{
  material: TerrainMaterial;
  name: string;
  shortName: string;
}>;

export const HOTBAR_ITEMS: readonly InventoryItem[] = [
  { material: TerrainMaterial.Dirt, name: "Dirt", shortName: "Dirt" },
  { material: TerrainMaterial.Stone, name: "Stone", shortName: "Stone" },
  { material: TerrainMaterial.Wood, name: "Wood", shortName: "Wood" },
  { material: TerrainMaterial.Planks, name: "Wood Planks", shortName: "Planks" },
  { material: TerrainMaterial.Sand, name: "Sand", shortName: "Sand" },
];

export function minedDrop(material: TerrainMaterial): TerrainMaterial | null {
  switch (material) {
    case TerrainMaterial.Grass:
    case TerrainMaterial.DryGrass:
    case TerrainMaterial.Snow:
      return TerrainMaterial.Dirt;
    case TerrainMaterial.AlpineRock:
      return TerrainMaterial.Stone;
    case TerrainMaterial.Dirt:
    case TerrainMaterial.Stone:
    case TerrainMaterial.Sand:
    case TerrainMaterial.Wood:
    case TerrainMaterial.Planks:
      return material;
    default:
      return null;
  }
}

export class Inventory {
  readonly #counts = new Map<TerrainMaterial, number>();
  readonly #hotbar: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #inventoryCounts: HTMLElement;
  readonly #craftButton: HTMLButtonElement;
  readonly #isCreative: boolean;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #selectedIndex = 0;
  #isOpen = false;

  constructor(
    mode: GameMode = "survival",
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    const hotbar = document.querySelector<HTMLElement>("#hotbar");
    const panel = document.querySelector<HTMLElement>("#inventory-panel");
    const inventoryCounts =
      document.querySelector<HTMLElement>("#inventory-counts");
    const craftButton =
      document.querySelector<HTMLButtonElement>("#craft-planks");

    if (!hotbar || !panel || !inventoryCounts || !craftButton) {
      throw new Error("Inventory interface elements are missing.");
    }

    this.#hotbar = hotbar;
    this.#panel = panel;
    this.#inventoryCounts = inventoryCounts;
    this.#craftButton = craftButton;
    this.#isCreative = mode === "creative";
    this.#onOpenChange = onOpenChange;
    this.#counts.set(TerrainMaterial.Dirt, 8);

    document.addEventListener("keydown", (event) => {
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        this.toggle();
        return;
      }

      const slot = Number(event.key) - 1;
      if (slot >= 0 && slot < HOTBAR_ITEMS.length) {
        this.select(slot);
      }
    });

    this.#craftButton.addEventListener("click", () => {
      this.craftPlanks();
    });

    this.render();
  }

  selectedMaterial(): TerrainMaterial {
    return HOTBAR_ITEMS[this.#selectedIndex]!.material;
  }

  count(material: TerrainMaterial): number {
    if (this.#isCreative && HOTBAR_ITEMS.some((item) => item.material === material)) {
      return Number.POSITIVE_INFINITY;
    }
    return this.#counts.get(material) ?? 0;
  }

  add(material: TerrainMaterial, amount = 1): void {
    if (this.#isCreative) {
      return;
    }
    this.#counts.set(material, this.count(material) + amount);
    this.render();
  }

  remove(material: TerrainMaterial, amount = 1): boolean {
    if (this.#isCreative) {
      return true;
    }
    if (this.count(material) < amount) {
      return false;
    }

    this.#counts.set(material, this.count(material) - amount);
    this.render();
    return true;
  }

  select(index: number): void {
    this.#selectedIndex =
      ((index % HOTBAR_ITEMS.length) + HOTBAR_ITEMS.length) %
      HOTBAR_ITEMS.length;
    this.render();
  }

  selectRelative(offset: number): void {
    this.select(this.#selectedIndex + offset);
  }

  craftPlanks(): boolean {
    if (this.#isCreative) {
      return true;
    }
    if (!this.remove(TerrainMaterial.Wood, 1)) {
      return false;
    }

    this.add(TerrainMaterial.Planks, 4);
    return true;
  }

  toggle(): void {
    this.#isOpen = !this.#isOpen;
    this.#panel.hidden = !this.#isOpen;
    document.body.classList.toggle("inventory-open", this.#isOpen);

    if (this.#isOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.#onOpenChange(this.#isOpen);
  }

  render(): void {
    const countLabel = (material: TerrainMaterial): string =>
      this.#isCreative ? "∞" : String(this.count(material));

    this.#hotbar.replaceChildren(
      ...HOTBAR_ITEMS.map((item, index) => {
        const slot = document.createElement("button");
        slot.className = `hotbar-slot material-${item.material}`;
        slot.classList.toggle("selected", index === this.#selectedIndex);
        slot.type = "button";
        slot.innerHTML =
          `<span class="slot-key">${index + 1}</span>` +
          `<span class="slot-name">${item.shortName}</span>` +
          `<strong>${countLabel(item.material)}</strong>`;
        slot.title = item.name;
        slot.addEventListener("click", () => this.select(index));
        return slot;
      }),
    );

    this.#inventoryCounts.replaceChildren(
      ...HOTBAR_ITEMS.map((item) => {
        const row = document.createElement("div");
        row.innerHTML = `<span>${item.name}</span><strong>${countLabel(item.material)}</strong>`;
        return row;
      }),
    );
    this.#craftButton.disabled =
      this.#isCreative || this.count(TerrainMaterial.Wood) < 1;
    this.#craftButton.textContent = this.#isCreative
      ? "Unlimited"
      : "Craft";
  }
}
