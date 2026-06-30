import {
  itemDefinitionFor,
  itemDefinitionOrThrow,
  type ItemId,
} from "./ItemRegistry.ts";

export type SerializedItemStack = Readonly<{
  itemId: string;
  count: number;
  durability?: number;
}>;

export type ItemStack = Readonly<{
  itemId: ItemId;
  count: number;
  durability?: number;
}>;

export function createItemStack(itemId: ItemId, count = 1): ItemStack {
  const item = itemDefinitionOrThrow(itemId);
  const safeCount = Math.max(1, Math.min(item.maxStackSize, Math.floor(count)));

  if (item.kind === "tool") {
    return {
      itemId,
      count: 1,
      durability: item.maxDurability,
    };
  }

  return {
    itemId,
    count: safeCount,
  };
}

export function normalizeItemStack(
  stack: SerializedItemStack | ItemStack | null | undefined,
): ItemStack | null {
  if (!stack || !Number.isFinite(stack.count) || stack.count <= 0) {
    return null;
  }

  const item = itemDefinitionFor(stack.itemId);

  if (!item) {
    return null;
  }

  if (item.kind === "tool") {
    const durability =
      typeof stack.durability === "number" && Number.isFinite(stack.durability)
        ? Math.floor(stack.durability)
        : item.maxDurability;

    return durability > 0
      ? {
          itemId: item.id,
          count: 1,
          durability: Math.min(item.maxDurability, durability),
        }
      : null;
  }

  return {
    itemId: item.id,
    count: Math.min(item.maxStackSize, Math.floor(stack.count)),
  };
}

export function serializeItemStack(
  stack: ItemStack | null,
): SerializedItemStack | null {
  return stack
    ? {
        itemId: stack.itemId,
        count: stack.count,
        durability: stack.durability,
      }
    : null;
}

export function canMergeItemStacks(
  first: ItemStack | null,
  second: ItemStack | null,
): boolean {
  if (!first || !second || first.itemId !== second.itemId) {
    return false;
  }

  return itemDefinitionOrThrow(first.itemId).kind !== "tool";
}

export function damageToolStack(
  stack: ItemStack,
  amount = 1,
): ItemStack | null {
  const item = itemDefinitionOrThrow(stack.itemId);

  if (item.kind !== "tool") {
    return stack;
  }

  const nextDurability = (stack.durability ?? item.maxDurability) - amount;

  return nextDurability > 0
    ? {
        ...stack,
        durability: nextDurability,
      }
    : null;
}
