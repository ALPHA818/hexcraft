import {
  EQUIPMENT_SLOT_IDS,
  EQUIPMENT_SLOT_LABELS,
  type Equipment,
  type EquipmentInventory,
  type EquipmentSlotId,
} from "../game/Equipment.ts";
import type { Inventory, InventoryEquipmentItem } from "../game/Inventory.ts";
import { itemDefinitionFor } from "../items/ItemRegistry.ts";

export type EquipmentPanelInventory = EquipmentInventory &
  Pick<Inventory, "equipmentItems">;

export type EquipmentPanelSession = Readonly<{
  equipment: Equipment;
  inventory: EquipmentPanelInventory;
  onSaveRequested?: () => void;
}>;

function equipmentItemLabel(item: InventoryEquipmentItem): string {
  return `${item.item.displayName}${item.count > 1 ? ` (${item.count})` : ""}`;
}

export class EquipmentPanel {
  readonly #root: HTMLElement;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: EquipmentPanelSession | null = null;
  #message = "";

  constructor(
    root: HTMLElement,
    session: EquipmentPanelSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#session = session;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "equipment-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Equipment");
    this.#root.tabIndex = -1;
    this.hide();
  }

  setSession(session: EquipmentPanelSession | null): void {
    this.#session = session;
    this.#message = "";

    if (this.isOpen()) {
      this.#render();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(): void {
    this.#root.hidden = false;
    document.body.classList.add("equipment-open");
    this.#render();
    this.#onOpenChange(true);
    this.#root.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("equipment-open");
    this.#message = "";
    this.#onOpenChange(false);
  }

  refresh(): void {
    if (this.isOpen()) {
      this.#render();
    }
  }

  #render(): void {
    const card = document.createElement("section");
    const header = document.createElement("header");
    const titleGroup = document.createElement("div");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const closeButton = document.createElement("button");
    const list = document.createElement("div");
    const message = document.createElement("p");

    card.className = "equipment-card";
    title.textContent = "Equipment";
    subtitle.textContent = "Protective gear and future hazard mitigation";
    closeButton.type = "button";
    closeButton.className = "equipment-close";
    closeButton.textContent = "Close";
    closeButton.title = "Close equipment";
    closeButton.setAttribute("aria-label", "Close equipment");
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    list.className = "equipment-list";
    list.replaceChildren(
      ...EQUIPMENT_SLOT_IDS.map((slotId) => this.#createSlotRow(slotId)),
    );

    message.className = "equipment-message";
    message.textContent = this.#message;
    card.append(header, list, message);
    this.#root.replaceChildren(card);
    this.#root.removeEventListener("keydown", this.#handleKeyDown);
    this.#root.addEventListener("keydown", this.#handleKeyDown);
  }

  #createSlotRow(slotId: EquipmentSlotId): HTMLElement {
    const row = document.createElement("article");
    const slotLabel = document.createElement("strong");
    const current = document.createElement("span");
    const actions = document.createElement("div");
    const session = this.#session;
    const stack = session?.equipment.slot(slotId) ?? null;
    const item = stack ? itemDefinitionFor(stack.itemId) : null;

    row.className = "equipment-slot-row";
    slotLabel.textContent = EQUIPMENT_SLOT_LABELS[slotId];
    current.className = "equipment-current";
    current.textContent = item?.displayName ?? (stack ? stack.itemId : "Empty");
    actions.className = "equipment-slot-actions";

    if (!session) {
      actions.append(this.#disabledButton("No active world"));
    } else if (stack) {
      actions.append(this.#unequipButton(slotId));
    } else {
      const candidates = session.inventory
        .equipmentItems()
        .filter((candidate) =>
          session.equipment.canEquipItem(slotId, candidate.itemId),
        );

      if (candidates.length === 0) {
        actions.append(this.#disabledButton("No gear"));
      } else {
        actions.replaceChildren(
          ...candidates.map((candidate) =>
            this.#equipButton(slotId, candidate),
          ),
        );
      }
    }

    row.append(slotLabel, current, actions);
    return row;
  }

  #equipButton(
    slotId: EquipmentSlotId,
    candidate: InventoryEquipmentItem,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = `Equip ${equipmentItemLabel(candidate)}`;
    button.title = `Equip ${candidate.item.displayName}`;
    button.addEventListener("click", () => {
      const session = this.#session;

      if (
        !session ||
        !session.equipment.equipFromInventory(
          slotId,
          candidate.itemId,
          session.inventory,
        )
      ) {
        this.#message = "Could not equip item.";
        this.#render();
        return;
      }

      this.#message = `${candidate.item.displayName} equipped.`;
      session.onSaveRequested?.();
      this.#render();
    });
    return button;
  }

  #unequipButton(slotId: EquipmentSlotId): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = "Unequip";
    button.title = `Unequip ${EQUIPMENT_SLOT_LABELS[slotId]}`;
    button.addEventListener("click", () => {
      const session = this.#session;

      if (
        !session ||
        !session.equipment.unequipToInventory(slotId, session.inventory)
      ) {
        this.#message = "Could not unequip item.";
        this.#render();
        return;
      }

      this.#message = "Item returned to inventory.";
      session.onSaveRequested?.();
      this.#render();
    });
    return button;
  }

  #disabledButton(text: string): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = text;
    button.disabled = true;
    return button;
  }

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      event.preventDefault();
      this.hide();
    }
  };
}
