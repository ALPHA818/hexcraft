import type {
  Entity,
  EntityTerrain,
  EntityUpdateContext,
  EntityVector3,
} from "./Entity.ts";
import { createEntityId, entityDistanceSquared } from "./Entity.ts";
import {
  findPassiveAnimalSpawnPosition,
  PassiveAnimal,
} from "./PassiveAnimal.ts";

export type EntityManagerOptions = Readonly<{
  despawnDistance?: number;
}>;

const DEFAULT_DESPAWN_DISTANCE = 96;

export class EntityManager {
  readonly #entities = new Map<string, Entity>();
  readonly #despawnDistance: number;

  constructor(options: EntityManagerOptions = {}) {
    this.#despawnDistance = options.despawnDistance ?? DEFAULT_DESPAWN_DISTANCE;
  }

  entities(): readonly Entity[] {
    return [...this.#entities.values()];
  }

  spawn(entity: Entity): Entity {
    this.#entities.set(entity.id, entity);
    return entity;
  }

  spawnPassiveAnimal(
    terrain: EntityTerrain,
    center: readonly [number, number, number],
    seed = 0,
  ): PassiveAnimal {
    const animal = new PassiveAnimal(
      createEntityId("animal"),
      findPassiveAnimalSpawnPosition(terrain, center, seed),
      {
        seed,
      },
    );

    return this.spawn(animal) as PassiveAnimal;
  }

  ensurePassiveAnimal(
    terrain: EntityTerrain,
    center: readonly [number, number, number],
    seed = 0,
  ): PassiveAnimal | null {
    const existing = this.entities().find(
      (entity) => entity.kind === "passive_animal",
    );

    if (existing instanceof PassiveAnimal) {
      return existing;
    }

    if (existing) {
      return null;
    }

    return this.spawnPassiveAnimal(terrain, center, seed);
  }

  update(deltaSeconds: number, context: EntityUpdateContext): void {
    for (const entity of this.#entities.values()) {
      entity.update(deltaSeconds, context);
    }

    const despawnDistanceSquared =
      this.#despawnDistance * this.#despawnDistance;

    for (const entity of this.#entities.values()) {
      if (
        entity.health <= 0 ||
        entityDistanceSquared(entity, context.playerPosition) >
          despawnDistanceSquared
      ) {
        this.#entities.delete(entity.id);
      }
    }
  }

  clear(): void {
    this.#entities.clear();
  }

  get size(): number {
    return this.#entities.size;
  }
}

export function entityPositionToArray(
  position: EntityVector3,
): readonly [number, number, number] {
  return [position.x, position.y, position.z] as const;
}
