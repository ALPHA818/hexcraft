export type AxialPosition = Readonly<{
  q: number;
  r: number;
}>;

export type VoxelPosition = AxialPosition &
  Readonly<{
    level: number;
  }>;

export type VoxelFace = "top" | "bottom" | 0 | 1 | 2 | 3 | 4 | 5;

type HorizontalVoxelFace = 0 | 1 | 2 | 3 | 4 | 5;
type VerticalVoxelFace = "top" | "bottom";

export type VoxelNeighborDirection =
  | Readonly<{
      q: number;
      r: number;
      level: 0;
      face: HorizontalVoxelFace;
    }>
  | Readonly<{
      q: 0;
      r: 0;
      level: 1 | -1;
      face: VerticalVoxelFace;
    }>;

export const HORIZONTAL_HEX_DIRECTIONS = [
  { q: 1, r: 0, level: 0, face: 0 },
  { q: 0, r: 1, level: 0, face: 1 },
  { q: -1, r: 1, level: 0, face: 2 },
  { q: -1, r: 0, level: 0, face: 3 },
  { q: 0, r: -1, level: 0, face: 4 },
  { q: 1, r: -1, level: 0, face: 5 },
] as const satisfies readonly VoxelNeighborDirection[];

export const VERTICAL_DIRECTIONS = [
  { q: 0, r: 0, level: 1, face: "top" },
  { q: 0, r: 0, level: -1, face: "bottom" },
] as const satisfies readonly VoxelNeighborDirection[];

export const ALL_VOXEL_DIRECTIONS = [
  ...HORIZONTAL_HEX_DIRECTIONS,
  ...VERTICAL_DIRECTIONS,
] as const satisfies readonly VoxelNeighborDirection[];

export function neighborOf(
  voxel: VoxelPosition,
  direction: VoxelNeighborDirection,
): VoxelPosition {
  return {
    q: voxel.q + direction.q,
    r: voxel.r + direction.r,
    level: voxel.level + direction.level,
  };
}

export function oppositeFace(face: VoxelFace): VoxelFace {
  if (face === "top") {
    return "bottom";
  }
  if (face === "bottom") {
    return "top";
  }

  return ((face + 3) % 6) as HorizontalVoxelFace;
}

export function faceFromDirection(
  direction: VoxelNeighborDirection,
): VoxelFace {
  return direction.face;
}

export function directionFromFace(face: VoxelFace): VoxelNeighborDirection {
  switch (face) {
    case "top":
      return VERTICAL_DIRECTIONS[0];
    case "bottom":
      return VERTICAL_DIRECTIONS[1];
    case 0:
      return HORIZONTAL_HEX_DIRECTIONS[0];
    case 1:
      return HORIZONTAL_HEX_DIRECTIONS[1];
    case 2:
      return HORIZONTAL_HEX_DIRECTIONS[2];
    case 3:
      return HORIZONTAL_HEX_DIRECTIONS[3];
    case 4:
      return HORIZONTAL_HEX_DIRECTIONS[4];
    case 5:
      return HORIZONTAL_HEX_DIRECTIONS[5];
  }
}

export function voxelKey(q: number, r: number, level: number): string {
  return `${q},${r},${level}`;
}

export function parseVoxelKey(key: string): VoxelPosition {
  const [qText, rText, levelText, extra] = key.split(",");
  const q = Number(qText);
  const r = Number(rText);
  const level = Number(levelText);

  if (
    extra !== undefined ||
    qText === undefined ||
    rText === undefined ||
    levelText === undefined ||
    qText.trim() === "" ||
    rText.trim() === "" ||
    levelText.trim() === "" ||
    !Number.isFinite(q) ||
    !Number.isFinite(r) ||
    !Number.isFinite(level)
  ) {
    throw new Error(`Invalid voxel key: ${key}`);
  }

  return { q, r, level };
}

export function sameVoxel(a: VoxelPosition, b: VoxelPosition): boolean {
  return a.q === b.q && a.r === b.r && a.level === b.level;
}

export function axialDistance(a: AxialPosition, b: AxialPosition): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function voxelDistance(a: VoxelPosition, b: VoxelPosition): number {
  return axialDistance(a, b) + Math.abs(a.level - b.level);
}
