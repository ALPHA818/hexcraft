export function interpolate(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

export function rangeStep(
  minimum: number,
  maximum: number,
  value: number,
): number {
  return smoothStep(
    Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))),
  );
}

export function hash2d(x: number, z: number, seed: number): number {
  let value =
    Math.imul(x, 0x1f123bb5) ^
    Math.imul(z, 0x5f356495) ^
    Math.imul(seed, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export function valueNoise(x: number, z: number, seed: number): number {
  const minimumX = Math.floor(x);
  const minimumZ = Math.floor(z);
  const fractionX = smoothStep(x - minimumX);
  const fractionZ = smoothStep(z - minimumZ);
  const north = interpolate(
    hash2d(minimumX, minimumZ, seed),
    hash2d(minimumX + 1, minimumZ, seed),
    fractionX,
  );
  const south = interpolate(
    hash2d(minimumX, minimumZ + 1, seed),
    hash2d(minimumX + 1, minimumZ + 1, seed),
    fractionX,
  );

  return interpolate(north, south, fractionZ);
}

export function hash3d(x: number, y: number, z: number, seed: number): number {
  let value =
    Math.imul(x, 0x1f123bb5) ^
    Math.imul(y, 0x6c8e9cf5) ^
    Math.imul(z, 0x5f356495) ^
    Math.imul(seed, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export function valueNoise3d(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  const minimumX = Math.floor(x);
  const minimumY = Math.floor(y);
  const minimumZ = Math.floor(z);
  const fractionX = smoothStep(x - minimumX);
  const fractionY = smoothStep(y - minimumY);
  const fractionZ = smoothStep(z - minimumZ);
  const layer = (offsetY: number): number => {
    const north = interpolate(
      hash3d(minimumX, minimumY + offsetY, minimumZ, seed),
      hash3d(minimumX + 1, minimumY + offsetY, minimumZ, seed),
      fractionX,
    );
    const south = interpolate(
      hash3d(minimumX, minimumY + offsetY, minimumZ + 1, seed),
      hash3d(minimumX + 1, minimumY + offsetY, minimumZ + 1, seed),
      fractionX,
    );
    return interpolate(north, south, fractionZ);
  };

  return interpolate(layer(0), layer(1), fractionY);
}
