export function stableHashString(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;

  return hash >>> 0;
}

export function stableHashFloat(
  input: string,
  minimum: number,
  maximum: number,
): number {
  const min = Math.min(minimum, maximum);
  const max = Math.max(minimum, maximum);
  const ratio = stableHashString(input) / 0xffffffff;

  return min + (max - min) * ratio;
}

export function stableHashChoice<T>(input: string, choices: readonly T[]): T {
  if (choices.length === 0) {
    throw new Error("stableHashChoice requires at least one choice.");
  }

  return choices[stableHashString(input) % choices.length]!;
}
