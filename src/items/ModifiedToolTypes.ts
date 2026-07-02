export const MODIFIABLE_BASE_TOOL_IDS = [
  "tool:pickaxe",
  "tool:shovel",
  "tool:axe",
  "tool:shears",
] as const;

export type ModifiableBaseToolItemId =
  (typeof MODIFIABLE_BASE_TOOL_IDS)[number];

export type ModifiedToolItemId =
  `modified-tool:${ModifiableBaseToolItemId}:${string}`;
export type ModifiedToolRecipeId =
  `assembler:${ModifiableBaseToolItemId}:${string}`;

export type ModifiedToolItemParts = Readonly<{
  baseToolId: ModifiableBaseToolItemId;
  materialId: string;
}>;

export function modifiedToolItemId(
  baseToolId: ModifiableBaseToolItemId,
  materialId: string,
): ModifiedToolItemId {
  return `modified-tool:${baseToolId}:${materialId}` as ModifiedToolItemId;
}

export function modifiedToolRecipeId(
  baseToolId: ModifiableBaseToolItemId,
  materialId: string,
): ModifiedToolRecipeId {
  return `assembler:${baseToolId}:${materialId}` as ModifiedToolRecipeId;
}

export function modifiedToolPartsFromItemId(
  itemId: string,
): ModifiedToolItemParts | null {
  if (!itemId.startsWith("modified-tool:")) {
    return null;
  }

  const rest = itemId.slice("modified-tool:".length);

  for (const baseToolId of MODIFIABLE_BASE_TOOL_IDS) {
    const prefix = `${baseToolId}:`;

    if (!rest.startsWith(prefix)) {
      continue;
    }

    const materialId = rest.slice(prefix.length);

    return materialId.trim() === ""
      ? null
      : {
          baseToolId,
          materialId,
        };
  }

  return null;
}

export function isModifiedToolItemId(
  itemId: string,
): itemId is ModifiedToolItemId {
  return modifiedToolPartsFromItemId(itemId) !== null;
}

export function baseToolIdFromModifiedToolItemId(
  itemId: string,
): ModifiableBaseToolItemId | null {
  return modifiedToolPartsFromItemId(itemId)?.baseToolId ?? null;
}

export function materialIdFromModifiedToolItemId(
  itemId: string,
): string | null {
  return modifiedToolPartsFromItemId(itemId)?.materialId ?? null;
}
