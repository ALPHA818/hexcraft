export type HexPosition = Readonly<{
  q: number;
  r: number;
  z: number;
}>;

export const HORIZONTAL_DIRECTIONS: readonly HexPosition[] = [
  { q: 1, r: 0, z: 0 },
  { q: 1, r: -1, z: 0 },
  { q: 0, r: -1, z: 0 },
  { q: -1, r: 0, z: 0 },
  { q: -1, r: 1, z: 0 },
  { q: 0, r: 1, z: 0 },
];

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
