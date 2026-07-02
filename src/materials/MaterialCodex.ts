import type { MaterialRegistry } from "./MaterialRegistry.ts";
import type { MaterialDefinition } from "./MaterialTypes.ts";

export class MaterialCodex {
  readonly #registry: MaterialRegistry;

  constructor(registry: MaterialRegistry) {
    this.#registry = registry;
  }

  discoveredMaterials(): readonly MaterialDefinition[] {
    return this.#registry.allDiscoveredMaterials();
  }

  discoveredMaterialIds(): readonly string[] {
    return this.#registry.discoveredMaterialIds();
  }

  findById(id: string): MaterialDefinition | null {
    return this.#registry.getMaterialById(id);
  }

  findByName(name: string): MaterialDefinition | null {
    return this.#registry.getMaterialByName(name);
  }

  searchByTag(tag: string): readonly MaterialDefinition[] {
    const normalizedTag = tag.toLowerCase();

    return this.discoveredMaterials().filter((material) =>
      material.tags.some(
        (materialTag) => materialTag.toLowerCase() === normalizedTag,
      ),
    );
  }
}
