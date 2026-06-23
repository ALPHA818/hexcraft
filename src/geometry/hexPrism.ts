type Vec3 = readonly [number, number, number];
type Color = readonly [number, number, number];
type Vec2 = readonly [number, number];

export type MeshData = Readonly<{
  vertices: Float32Array;
  vertexCount: number;
  floatsPerVertex: number;
  opaqueVertexCount?: number;
  translucentVertexCount?: number;
}>;

export const FLOATS_PER_VERTEX = 11;

function pushVertex(
  output: number[],
  position: Vec3,
  normal: Vec3,
  color: Color,
  uv: Vec2,
): void {
  output.push(...position, ...normal, ...color, ...uv);
}

function pushTriangle(
  output: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  normal: Vec3,
  color: Color,
): void {
  pushVertex(output, a, normal, color, [0.5, 0.5]);
  pushVertex(output, b, normal, color, [0, 0]);
  pushVertex(output, c, normal, color, [1, 1]);
}

export function createHexPrism(radius = 1, height = 1.5): MeshData {
  const output: number[] = [];
  const halfHeight = height / 2;
  const topCenter: Vec3 = [0, halfHeight, 0];
  const bottomCenter: Vec3 = [0, -halfHeight, 0];
  const topColor: Color = [0.42, 0.76, 0.23];
  const bottomColor: Color = [0.2, 0.12, 0.07];
  const sideColors: readonly Color[] = [
    [0.52, 0.31, 0.16],
    [0.58, 0.35, 0.18],
    [0.48, 0.28, 0.14],
    [0.55, 0.32, 0.16],
    [0.45, 0.26, 0.13],
    [0.6, 0.37, 0.19],
  ];

  const topRing: Vec3[] = [];
  const bottomRing: Vec3[] = [];

  for (let side = 0; side < 6; side += 1) {
    const angle = Math.PI / 6 + side * (Math.PI / 3);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    topRing.push([x, halfHeight, z]);
    bottomRing.push([x, -halfHeight, z]);
  }

  for (let side = 0; side < 6; side += 1) {
    const next = (side + 1) % 6;
    const topCurrent = topRing[side]!;
    const topNext = topRing[next]!;
    const bottomCurrent = bottomRing[side]!;
    const bottomNext = bottomRing[next]!;

    pushTriangle(
      output,
      topCenter,
      topNext,
      topCurrent,
      [0, 1, 0],
      topColor,
    );
    pushTriangle(
      output,
      bottomCenter,
      bottomCurrent,
      bottomNext,
      [0, -1, 0],
      bottomColor,
    );

    const middleAngle = Math.PI / 3 + side * (Math.PI / 3);
    const sideNormal: Vec3 = [
      Math.cos(middleAngle),
      0,
      Math.sin(middleAngle),
    ];
    const sideColor = sideColors[side]!;

    pushTriangle(
      output,
      bottomCurrent,
      topCurrent,
      topNext,
      sideNormal,
      sideColor,
    );
    pushTriangle(
      output,
      bottomCurrent,
      topNext,
      bottomNext,
      sideNormal,
      sideColor,
    );
  }

  return {
    vertices: new Float32Array(output),
    vertexCount: output.length / FLOATS_PER_VERTEX,
    floatsPerVertex: FLOATS_PER_VERTEX,
    opaqueVertexCount: output.length / FLOATS_PER_VERTEX,
    translucentVertexCount: 0,
  };
}
