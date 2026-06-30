export type EntityId = string;

export type EntityVector3 = {
  x: number;
  y: number;
  z: number;
};

export type EntityKind = "passive_animal";

export type EntityTerrain = {
  groundYAt: (x: number, z: number, maximumY: number) => number;
  isFluidAtWorld: (x: number, y: number, z: number) => boolean;
};

export type EntityUpdateContext = Readonly<{
  terrain: EntityTerrain;
  playerPosition: readonly [number, number, number];
}>;

export type Entity = {
  readonly id: EntityId;
  readonly kind: EntityKind;
  position: EntityVector3;
  velocity: EntityVector3;
  health: number;
  readonly radius: number;
  readonly height: number;
  readonly facingRadians: number;
  update(deltaSeconds: number, context: EntityUpdateContext): void;
};

let nextEntityNumber = 1;

export function createEntityId(prefix = "entity"): EntityId {
  const id = `${prefix}-${nextEntityNumber}`;
  nextEntityNumber += 1;
  return id;
}

export function cloneEntityVector3(vector: EntityVector3): EntityVector3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

export function entityDistanceSquared(
  entity: Entity,
  position: readonly [number, number, number],
): number {
  const dx = entity.position.x - position[0];
  const dy = entity.position.y - position[1];
  const dz = entity.position.z - position[2];

  return dx * dx + dy * dy + dz * dz;
}
