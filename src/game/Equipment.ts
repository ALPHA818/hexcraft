import {
  itemDefinitionFor,
  type EquipmentItemDefinition,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  createItemStack,
  normalizeItemStack,
  serializeItemStack,
  type ItemStack,
  type SerializedItemStack,
} from "../items/ItemStack.ts";
import type { MaterialItemResolver } from "../items/MaterialItemResolver.ts";
import type { MaterialHazardProtection } from "./MaterialHazards.ts";

export const EQUIPMENT_SLOT_IDS = [
  "head",
  "chest",
  "legs",
  "feet",
  "hands",
  "back",
  "accessory1",
  "accessory2",
] as const;

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number];
export type EquipmentSlot = ItemStack | null;

export type SerializedEquipment = Readonly<{
  slots: Readonly<Partial<Record<EquipmentSlotId, SerializedItemStack | null>>>;
}>;

export type EquipmentInventory = Readonly<{
  countItem: (itemId: ItemId) => number;
  removeItem: (itemId: ItemId, amount?: number) => boolean;
  addItem: (itemId: ItemId, amount?: number) => boolean;
  grantItem?: (itemId: ItemId, amount?: number) => boolean;
}>;

export const EQUIPMENT_SLOT_LABELS = {
  head: "Head",
  chest: "Chest",
  legs: "Legs",
  feet: "Feet",
  hands: "Hands",
  back: "Back",
  accessory1: "Accessory 1",
  accessory2: "Accessory 2",
} as const satisfies Record<EquipmentSlotId, string>;

function emptyEquipmentSlots(): Record<EquipmentSlotId, EquipmentSlot> {
  return Object.fromEntries(
    EQUIPMENT_SLOT_IDS.map((slotId) => [slotId, null]),
  ) as Record<EquipmentSlotId, EquipmentSlot>;
}

function emptySerializedEquipmentSlots(): Record<
  EquipmentSlotId,
  SerializedItemStack | null
> {
  return Object.fromEntries(
    EQUIPMENT_SLOT_IDS.map((slotId) => [slotId, null]),
  ) as Record<EquipmentSlotId, SerializedItemStack | null>;
}

function equipmentItemForSlot(
  itemId: string,
  slotId: EquipmentSlotId,
  resolver?: MaterialItemResolver | null,
): EquipmentItemDefinition | null {
  const item = itemDefinitionFor(itemId, resolver);

  return item?.kind === "equipment" && item.equipmentSlot === slotId
    ? item
    : null;
}

export function emptyEquipmentSave(): SerializedEquipment {
  return {
    slots: emptySerializedEquipmentSlots(),
  };
}

export function normalizeSerializedEquipment(
  value: unknown,
  resolver?: MaterialItemResolver | null,
): SerializedEquipment {
  if (!value || typeof value !== "object") {
    return emptyEquipmentSave();
  }

  const record = value as Record<string, unknown>;
  const source =
    record.slots && typeof record.slots === "object"
      ? (record.slots as Record<string, unknown>)
      : record;
  const slots = emptySerializedEquipmentSlots();

  for (const slotId of EQUIPMENT_SLOT_IDS) {
    const normalized = normalizeItemStack(
      source[slotId] as SerializedItemStack | null | undefined,
      resolver,
    );

    slots[slotId] = normalized
      ? serializeItemStack(
          equipmentItemForSlot(normalized.itemId, slotId, resolver)
            ? normalized
            : null,
        )
      : null;
  }

  return {
    slots,
  };
}

export class Equipment {
  readonly #resolver: MaterialItemResolver | null;
  #slots = emptyEquipmentSlots();

  constructor(
    serialized?: SerializedEquipment | null,
    resolver: MaterialItemResolver | null = null,
  ) {
    this.#resolver = resolver;
    const normalized = normalizeSerializedEquipment(serialized, resolver);

    for (const slotId of EQUIPMENT_SLOT_IDS) {
      this.#slots[slotId] = normalizeItemStack(
        normalized.slots[slotId] ?? null,
        resolver,
      );
    }
  }

  slot(slotId: EquipmentSlotId): EquipmentSlot {
    return this.#slots[slotId];
  }

  slots(): Readonly<Record<EquipmentSlotId, EquipmentSlot>> {
    return { ...this.#slots };
  }

  canEquipItem(slotId: EquipmentSlotId, itemId: string): boolean {
    return equipmentItemForSlot(itemId, slotId, this.#resolver) !== null;
  }

  equipFromInventory(
    slotId: EquipmentSlotId,
    itemId: ItemId,
    inventory: EquipmentInventory,
  ): boolean {
    const item = equipmentItemForSlot(itemId, slotId, this.#resolver);

    if (!item || this.#slots[slotId] || inventory.countItem(item.id) < 1) {
      return false;
    }
    if (!inventory.removeItem(item.id, 1)) {
      return false;
    }

    this.#slots[slotId] = createItemStack(item.id, 1, this.#resolver);
    return true;
  }

  unequipToInventory(
    slotId: EquipmentSlotId,
    inventory: EquipmentInventory,
  ): boolean {
    const stack = this.#slots[slotId];

    if (!stack) {
      return false;
    }

    const added =
      inventory.addItem(stack.itemId, stack.count) ||
      inventory.grantItem?.(stack.itemId, stack.count) === true;

    if (!added) {
      return false;
    }

    this.#slots[slotId] = null;
    return true;
  }

  hazardProtection(): MaterialHazardProtection {
    return {};
  }

  serialize(): SerializedEquipment {
    return {
      slots: Object.fromEntries(
        EQUIPMENT_SLOT_IDS.map((slotId) => [
          slotId,
          serializeItemStack(this.#slots[slotId]),
        ]),
      ) as SerializedEquipment["slots"],
    };
  }
}
