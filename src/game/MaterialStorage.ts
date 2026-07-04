import type {
  MaterialDefinition,
  MaterialRarity,
} from "../materials/MaterialTypes.ts";
import type { SerializedMaterialStorage } from "../save/WorldSaveTypes.ts";

export type MaterialStorageSort =
  "name" | "generation" | "rarity" | "quantity" | "tag";

export type MaterialStorageEntry = Readonly<{
  materialId: string;
  quantity: number;
  material: MaterialDefinition | null;
}>;

export type MaterialStorageResolver = Readonly<{
  getMaterialById: (materialId: string) => MaterialDefinition | null;
}>;

const RARITY_RANK: Record<MaterialRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

function normalizedMaterialId(materialId: string): string {
  return materialId.trim();
}

function normalizedQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

function materialName(entry: MaterialStorageEntry): string {
  return entry.material?.name ?? entry.materialId;
}

function firstTag(entry: MaterialStorageEntry): string {
  return entry.material?.tags[0]?.toLowerCase() ?? "";
}

function compareStorageEntries(
  a: MaterialStorageEntry,
  b: MaterialStorageEntry,
  sort: MaterialStorageSort,
): number {
  if (sort === "generation") {
    return (
      (b.material?.generation ?? -1) - (a.material?.generation ?? -1) ||
      materialName(a).localeCompare(materialName(b))
    );
  }
  if (sort === "rarity") {
    return (
      RARITY_RANK[b.material?.rarity ?? "common"] -
        RARITY_RANK[a.material?.rarity ?? "common"] ||
      materialName(a).localeCompare(materialName(b))
    );
  }
  if (sort === "quantity") {
    return (
      b.quantity - a.quantity || materialName(a).localeCompare(materialName(b))
    );
  }
  if (sort === "tag") {
    return (
      firstTag(a).localeCompare(firstTag(b)) ||
      materialName(a).localeCompare(materialName(b))
    );
  }

  return materialName(a).localeCompare(materialName(b));
}

export function normalizeSerializedMaterialStorage(
  value: unknown,
): SerializedMaterialStorage {
  if (!value || typeof value !== "object") {
    return { materials: [] };
  }

  const record = value as Record<string, unknown>;
  const source = Array.isArray(record.materials) ? record.materials : [];
  const counts = new Map<string, number>();

  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const materialId =
      typeof entry.materialId === "string"
        ? normalizedMaterialId(entry.materialId)
        : "";
    const quantity = normalizedQuantity(
      typeof entry.quantity === "number" ? entry.quantity : 0,
    );

    if (materialId === "" || quantity <= 0) {
      continue;
    }

    counts.set(materialId, (counts.get(materialId) ?? 0) + quantity);
  }

  return {
    materials: [...counts.entries()]
      .map(([materialId, quantity]) => ({ materialId, quantity }))
      .sort((a, b) => a.materialId.localeCompare(b.materialId)),
  };
}

export function materialStorageEntries(
  storage: MaterialStorage,
  resolver: MaterialStorageResolver | null,
  options: Readonly<{
    sort?: MaterialStorageSort;
    tag?: string;
  }> = {},
): readonly MaterialStorageEntry[] {
  const normalizedTag = options.tag?.trim().toLowerCase() ?? "";
  const entries = storage
    .serialize()
    .materials.map((entry): MaterialStorageEntry => {
      const material = resolver?.getMaterialById(entry.materialId) ?? null;

      return {
        materialId: entry.materialId,
        quantity: entry.quantity,
        material,
      };
    })
    .filter((entry) =>
      normalizedTag === ""
        ? true
        : (entry.material?.tags.some(
            (tag) => tag.toLowerCase() === normalizedTag,
          ) ?? false),
    );

  return entries.sort((a, b) =>
    compareStorageEntries(a, b, options.sort ?? "name"),
  );
}

export function materialStorageTags(
  storage: MaterialStorage,
  resolver: MaterialStorageResolver | null,
): readonly string[] {
  return [
    ...new Set(
      storage
        .serialize()
        .materials.flatMap(
          (entry) =>
            resolver
              ?.getMaterialById(entry.materialId)
              ?.tags.map((tag) => tag.toLowerCase()) ?? [],
        ),
    ),
  ].sort();
}

export class MaterialStorage {
  readonly #counts = new Map<string, number>();

  constructor(serialized?: SerializedMaterialStorage | null) {
    const normalized = normalizeSerializedMaterialStorage(serialized);

    for (const entry of normalized.materials) {
      this.#counts.set(entry.materialId, entry.quantity);
    }
  }

  count(materialId: string): number {
    return this.#counts.get(normalizedMaterialId(materialId)) ?? 0;
  }

  has(materialId: string): boolean {
    return this.count(materialId) > 0;
  }

  addMaterial(materialId: string, quantity = 1): boolean {
    const normalizedId = normalizedMaterialId(materialId);
    const normalizedCount = normalizedQuantity(quantity);

    if (normalizedId === "" || normalizedCount <= 0) {
      return false;
    }

    this.#counts.set(normalizedId, this.count(normalizedId) + normalizedCount);
    return true;
  }

  removeMaterial(materialId: string, quantity = 1): boolean {
    const normalizedId = normalizedMaterialId(materialId);
    const normalizedCount = normalizedQuantity(quantity);
    const current = this.count(normalizedId);

    if (
      normalizedId === "" ||
      normalizedCount <= 0 ||
      current < normalizedCount
    ) {
      return false;
    }

    const next = current - normalizedCount;
    if (next > 0) {
      this.#counts.set(normalizedId, next);
    } else {
      this.#counts.delete(normalizedId);
    }
    return true;
  }

  clear(): void {
    this.#counts.clear();
  }

  serialize(): SerializedMaterialStorage {
    return {
      materials: [...this.#counts.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([materialId, quantity]) => ({ materialId, quantity }))
        .sort((a, b) => a.materialId.localeCompare(b.materialId)),
    };
  }
}
