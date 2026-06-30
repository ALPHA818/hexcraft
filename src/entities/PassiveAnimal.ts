import {
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_BLOCK_RADIUS,
} from "../geometry/terrainChunk.ts";
import type {
  Entity,
  EntityId,
  EntityTerrain,
  EntityUpdateContext,
  EntityVector3,
} from "./Entity.ts";
import { cloneEntityVector3 } from "./Entity.ts";

const PASSIVE_ANIMAL_SPEED = 0.95;
const MAX_ENTITY_STEP_HEIGHT = TERRAIN_BLOCK_HEIGHT * 1.35;
const WATER_PROBE_HEIGHTS = [0.25, 0.75] as const;

export type PassiveAnimalOptions = Readonly<{
  seed?: number;
  initialHeading?: number;
}>;

function hashEntitySeed(id: EntityId, seed: number): number {
  let hash = (seed ^ 0x9e3779b9) >>> 0;

  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x45d9f3b) >>> 0;
    hash ^= hash >>> 16;
  }

  return hash || 1;
}

function normalizeRadians(angle: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;

  return normalized < 0 ? normalized + fullTurn : normalized;
}

function randomUnit(state: number): readonly [number, number] {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;

  return [next, next / 0xffffffff];
}

function terrainGroundY(
  terrain: EntityTerrain,
  x: number,
  z: number,
  currentY: number,
): number {
  return terrain.groundYAt(x, z, Math.max(currentY + 10, 80));
}

function isWaterAtFeet(
  terrain: EntityTerrain,
  x: number,
  groundY: number,
  z: number,
): boolean {
  return WATER_PROBE_HEIGHTS.some((height) =>
    terrain.isFluidAtWorld(x, groundY + height * TERRAIN_BLOCK_HEIGHT, z),
  );
}

export function findPassiveAnimalSpawnPosition(
  terrain: EntityTerrain,
  center: readonly [number, number, number],
  seed = 0,
): EntityVector3 {
  let randomState = Math.imul(seed + 0x6d2b79f5, 0x85ebca6b) >>> 0 || 1;

  for (let ring = 0; ring < 6; ring += 1) {
    const radius = 4 + ring * 2.25;
    const samples = 8 + ring * 2;

    for (let sample = 0; sample < samples; sample += 1) {
      const randomResult = randomUnit(randomState);
      randomState = randomResult[0];
      const angle =
        (sample / samples) * Math.PI * 2 +
        randomResult[1] * 0.35 +
        seed * 0.0001;
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[2] + Math.sin(angle) * radius;
      const y = terrainGroundY(terrain, x, z, center[1]);

      if (!isWaterAtFeet(terrain, x, y, z)) {
        return { x, y, z };
      }
    }
  }

  const fallbackX = center[0] + TERRAIN_BLOCK_RADIUS * 4;
  const fallbackZ = center[2] + TERRAIN_BLOCK_RADIUS * 2;

  return {
    x: fallbackX,
    y: terrainGroundY(terrain, fallbackX, fallbackZ, center[1]),
    z: fallbackZ,
  };
}

export class PassiveAnimal implements Entity {
  readonly kind = "passive_animal";
  readonly radius = 0.36;
  readonly height = 0.78;
  readonly id: EntityId;

  position: EntityVector3;
  velocity: EntityVector3 = { x: 0, y: 0, z: 0 };
  health = 6;

  #facingRadians: number;
  #wanderTimer = 0;
  #randomState: number;

  constructor(
    id: EntityId,
    position: EntityVector3,
    options: PassiveAnimalOptions = {},
  ) {
    this.id = id;
    this.position = cloneEntityVector3(position);
    this.#randomState = hashEntitySeed(id, options.seed ?? 0);
    const initialHeading = options.initialHeading ?? this.#nextHeading();
    this.#facingRadians = normalizeRadians(initialHeading);
    this.#wanderTimer = 1 + this.#nextRandom() * 2;
  }

  get facingRadians(): number {
    return this.#facingRadians;
  }

  update(deltaSeconds: number, context: EntityUpdateContext): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);

    if (delta <= 0 || this.health <= 0) {
      this.velocity = { x: 0, y: 0, z: 0 };
      return;
    }

    this.#wanderTimer -= delta;
    if (this.#wanderTimer <= 0) {
      this.#facingRadians = this.#nextHeading();
      this.#wanderTimer = 1.4 + this.#nextRandom() * 2.4;
    }

    const previous = cloneEntityVector3(this.position);
    const next = this.#nextWalkablePosition(context.terrain, delta);

    this.position = next;
    this.velocity = {
      x: (next.x - previous.x) / delta,
      y: (next.y - previous.y) / delta,
      z: (next.z - previous.z) / delta,
    };
  }

  #nextWalkablePosition(
    terrain: EntityTerrain,
    deltaSeconds: number,
  ): EntityVector3 {
    const candidateHeadings = [
      this.#facingRadians,
      this.#facingRadians + Math.PI / 3,
      this.#facingRadians - Math.PI / 3,
      this.#facingRadians + Math.PI,
    ];

    for (const heading of candidateHeadings) {
      const normalizedHeading = normalizeRadians(heading);
      const x =
        this.position.x +
        Math.cos(normalizedHeading) * PASSIVE_ANIMAL_SPEED * deltaSeconds;
      const z =
        this.position.z +
        Math.sin(normalizedHeading) * PASSIVE_ANIMAL_SPEED * deltaSeconds;
      const y = terrainGroundY(terrain, x, z, this.position.y);

      if (
        isWaterAtFeet(terrain, x, y, z) ||
        Math.abs(y - this.position.y) > MAX_ENTITY_STEP_HEIGHT
      ) {
        continue;
      }

      this.#facingRadians = normalizedHeading;
      return { x, y, z };
    }

    this.#facingRadians = normalizeRadians(this.#facingRadians + Math.PI / 2);

    return {
      x: this.position.x,
      y: terrainGroundY(
        terrain,
        this.position.x,
        this.position.z,
        this.position.y,
      ),
      z: this.position.z,
    };
  }

  #nextHeading(): number {
    return this.#nextRandom() * Math.PI * 2;
  }

  #nextRandom(): number {
    const result = randomUnit(this.#randomState);
    this.#randomState = result[0];
    return result[1];
  }
}
