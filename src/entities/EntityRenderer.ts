import { FLOATS_PER_VERTEX, type MeshData } from "../geometry/hexPrism.ts";
import { atlasUv, BlockTexture } from "../render/blockTextureAtlas.ts";
import type { Entity, EntityVector3 } from "./Entity.ts";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];
type Color = readonly [number, number, number];

const EMPTY_ENTITY_MESH: MeshData = {
  vertices: new Float32Array(0),
  vertexCount: 0,
  floatsPerVertex: FLOATS_PER_VERTEX,
  opaqueVertexCount: 0,
  translucentVertexCount: 0,
};

function pushVertex(
  output: number[],
  position: Vec3,
  normal: Vec3,
  color: Color,
  uv: Vec2,
): void {
  output.push(...position, ...normal, ...color, ...uv);
}

function pushQuad(
  output: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  normal: Vec3,
  color: Color,
  texture: BlockTexture,
): void {
  const uvA = atlasUv(texture, 0, 1);
  const uvB = atlasUv(texture, 0, 0);
  const uvC = atlasUv(texture, 1, 0);
  const uvD = atlasUv(texture, 1, 1);

  pushVertex(output, a, normal, color, uvA);
  pushVertex(output, b, normal, color, uvB);
  pushVertex(output, c, normal, color, uvC);
  pushVertex(output, a, normal, color, uvA);
  pushVertex(output, c, normal, color, uvC);
  pushVertex(output, d, normal, color, uvD);
}

function transformPoint(origin: EntityVector3, yaw: number, local: Vec3): Vec3 {
  const forwardX = Math.cos(yaw);
  const forwardZ = Math.sin(yaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  return [
    origin.x + rightX * local[0] + forwardX * local[2],
    origin.y + local[1],
    origin.z + rightZ * local[0] + forwardZ * local[2],
  ];
}

function transformNormal(yaw: number, local: Vec3): Vec3 {
  const forwardX = Math.cos(yaw);
  const forwardZ = Math.sin(yaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  return [
    rightX * local[0] + forwardX * local[2],
    local[1],
    rightZ * local[0] + forwardZ * local[2],
  ];
}

function pushCuboid(
  output: number[],
  entity: Entity,
  center: Vec3,
  size: Vec3,
  color: Color,
  texture: BlockTexture,
): void {
  const halfX = size[0] / 2;
  const halfY = size[1] / 2;
  const halfZ = size[2] / 2;
  const minX = center[0] - halfX;
  const maxX = center[0] + halfX;
  const minY = center[1] - halfY;
  const maxY = center[1] + halfY;
  const minZ = center[2] - halfZ;
  const maxZ = center[2] + halfZ;
  const corner = (x: number, y: number, z: number): Vec3 =>
    transformPoint(entity.position, entity.facingRadians, [x, y, z]);
  const normal = (x: number, y: number, z: number): Vec3 =>
    transformNormal(entity.facingRadians, [x, y, z]);

  pushQuad(
    output,
    corner(minX, minY, maxZ),
    corner(minX, maxY, maxZ),
    corner(maxX, maxY, maxZ),
    corner(maxX, minY, maxZ),
    normal(0, 0, 1),
    color,
    texture,
  );
  pushQuad(
    output,
    corner(maxX, minY, minZ),
    corner(maxX, maxY, minZ),
    corner(minX, maxY, minZ),
    corner(minX, minY, minZ),
    normal(0, 0, -1),
    color,
    texture,
  );
  pushQuad(
    output,
    corner(maxX, minY, maxZ),
    corner(maxX, maxY, maxZ),
    corner(maxX, maxY, minZ),
    corner(maxX, minY, minZ),
    normal(1, 0, 0),
    color,
    texture,
  );
  pushQuad(
    output,
    corner(minX, minY, minZ),
    corner(minX, maxY, minZ),
    corner(minX, maxY, maxZ),
    corner(minX, minY, maxZ),
    normal(-1, 0, 0),
    color,
    texture,
  );
  pushQuad(
    output,
    corner(minX, maxY, maxZ),
    corner(minX, maxY, minZ),
    corner(maxX, maxY, minZ),
    corner(maxX, maxY, maxZ),
    normal(0, 1, 0),
    color,
    texture,
  );
  pushQuad(
    output,
    corner(minX, minY, minZ),
    corner(minX, minY, maxZ),
    corner(maxX, minY, maxZ),
    corner(maxX, minY, minZ),
    normal(0, -1, 0),
    color,
    texture,
  );
}

function pushPassiveAnimal(output: number[], entity: Entity): void {
  pushCuboid(
    output,
    entity,
    [0, 0.43, 0],
    [0.48, 0.42, 0.72],
    [1.05, 0.58, 0.27],
    BlockTexture.Wood,
  );
  pushCuboid(
    output,
    entity,
    [0, 0.62, 0.48],
    [0.38, 0.34, 0.36],
    [1.15, 0.64, 0.31],
    BlockTexture.Wood,
  );
  pushCuboid(
    output,
    entity,
    [0, 0.44, -0.5],
    [0.24, 0.22, 0.46],
    [1.22, 0.7, 0.36],
    BlockTexture.Wood,
  );
  pushCuboid(
    output,
    entity,
    [0, 0.47, -0.78],
    [0.2, 0.18, 0.2],
    [1.35, 1.18, 0.88],
    BlockTexture.Snow,
  );

  for (const legX of [-0.18, 0.18] as const) {
    for (const legZ of [-0.22, 0.2] as const) {
      pushCuboid(
        output,
        entity,
        [legX, 0.16, legZ],
        [0.13, 0.32, 0.13],
        [0.46, 0.24, 0.13],
        BlockTexture.Wood,
      );
    }
  }
}

export function buildEntityMesh(entities: readonly Entity[]): MeshData {
  if (entities.length === 0) {
    return EMPTY_ENTITY_MESH;
  }

  const output: number[] = [];

  for (const entity of entities) {
    if (entity.kind === "passive_animal") {
      pushPassiveAnimal(output, entity);
    }
  }

  const vertexCount = output.length / FLOATS_PER_VERTEX;

  return {
    vertices: new Float32Array(output),
    vertexCount,
    floatsPerVertex: FLOATS_PER_VERTEX,
    opaqueVertexCount: vertexCount,
    translucentVertexCount: 0,
  };
}

export class EntityRenderer {
  buildMesh(entities: readonly Entity[]): MeshData {
    return buildEntityMesh(entities);
  }
}
