import { describe, expect, it } from "vitest";

import type { EntityTerrain } from "./Entity.ts";
import { createEntityId } from "./Entity.ts";
import { EntityManager } from "./EntityManager.ts";
import { PassiveAnimal } from "./PassiveAnimal.ts";

const flatTerrain: EntityTerrain = {
  groundYAt: () => 4,
  isFluidAtWorld: () => false,
};

describe("entities", () => {
  it("moves an entity over time", () => {
    const animal = new PassiveAnimal(
      createEntityId("test-animal"),
      { x: 0, y: 4, z: 0 },
      {
        initialHeading: 0,
        seed: 1,
      },
    );

    animal.update(1, {
      terrain: flatTerrain,
      playerPosition: [0, 4, 0],
    });

    expect(Math.hypot(animal.position.x, animal.position.z)).toBeGreaterThan(
      0.1,
    );
  });

  it("does not fall through terrain", () => {
    const terrain: EntityTerrain = {
      groundYAt: () => 12,
      isFluidAtWorld: () => false,
    };
    const animal = new PassiveAnimal(
      createEntityId("test-animal"),
      { x: 0, y: -20, z: 0 },
      {
        initialHeading: 0,
      },
    );

    animal.update(0.1, {
      terrain,
      playerPosition: [0, 12, 0],
    });

    expect(animal.position.y).toBeGreaterThanOrEqual(12);
  });

  it("despawns entities that are too far from the player", () => {
    const manager = new EntityManager({ despawnDistance: 8 });
    manager.spawn(
      new PassiveAnimal(
        createEntityId("test-animal"),
        { x: 40, y: 4, z: 0 },
        {
          initialHeading: 0,
        },
      ),
    );

    manager.update(0.1, {
      terrain: flatTerrain,
      playerPosition: [0, 4, 0],
    });

    expect(manager.size).toBe(0);
  });

  it("creates unique entity ids", () => {
    const ids = new Set(
      Array.from({ length: 12 }, () => createEntityId("unique-test")),
    );

    expect(ids.size).toBe(12);
  });

  it("avoids water when a dry route is available", () => {
    const terrain: EntityTerrain = {
      groundYAt: () => 4,
      isFluidAtWorld: (x) => x > 0.05,
    };
    const animal = new PassiveAnimal(
      createEntityId("test-animal"),
      { x: 0, y: 4, z: 0 },
      {
        initialHeading: 0,
      },
    );

    animal.update(1, {
      terrain,
      playerPosition: [0, 4, 0],
    });

    expect(animal.position.x).toBeLessThanOrEqual(0.05);
  });
});
