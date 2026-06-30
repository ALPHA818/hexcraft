import { directionFromFace } from "./voxelRules.ts";

export type HexPosition = Readonly<{
  q: number;
  r: number;
  z: number;
}>;

const LEGACY_HORIZONTAL_FACE_ORDER = [0, 5, 4, 3, 2, 1] as const;

export const HORIZONTAL_DIRECTIONS: readonly HexPosition[] =
  LEGACY_HORIZONTAL_FACE_ORDER.map((face) => {
    const direction = directionFromFace(face);
    return { q: direction.q, r: direction.r, z: 0 };
  });

export function addHex(a: HexPosition, b: HexPosition): HexPosition {
  return {
    q: a.q + b.q,
    r: a.r + b.r,
    z: a.z + b.z,
  };
}

export function horizontalNeighbors(position: HexPosition): HexPosition[] {
  return HORIZONTAL_DIRECTIONS.map((direction) => addHex(position, direction));
}
