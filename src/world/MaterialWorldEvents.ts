import type {
  MaterialDefinition,
  MaterialRarity,
} from "../materials/MaterialTypes.ts";

export type MaterialWorldEventKind =
  "radioactive_cave_hint" | "arcane_biome_hint" | "hazard_warning";

export type MaterialWorldEventSeverity = "info" | "warning";

export type MaterialWorldEvent = Readonly<{
  id: string;
  kind: MaterialWorldEventKind;
  materialId: string;
  materialName: string;
  hintKey: string;
  message: string;
  severity: MaterialWorldEventSeverity;
}>;

export type MaterialWorldEventState = Readonly<{
  triggeredEventIds: readonly string[];
}>;

export type MaterialWorldEventEvaluation = Readonly<{
  events: readonly MaterialWorldEvent[];
  state: MaterialWorldEventState;
}>;

const RARE_RARITIES = new Set<MaterialRarity>([
  "rare",
  "epic",
  "legendary",
  "mythic",
]);

function normalizedTags(material: MaterialDefinition): ReadonlySet<string> {
  return new Set(material.tags.map((tag) => tag.trim().toLowerCase()));
}

function hasAnyTag(
  tags: ReadonlySet<string>,
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

function isRareDiscovery(material: MaterialDefinition): boolean {
  return material.generation > 0 || RARE_RARITIES.has(material.rarity);
}

function materialWorldEventId(
  kind: MaterialWorldEventKind,
  material: MaterialDefinition,
): string {
  return `${kind}:${material.id}`;
}

function eventForMaterial(
  kind: MaterialWorldEventKind,
  material: MaterialDefinition,
  event: Omit<
    MaterialWorldEvent,
    "id" | "kind" | "materialId" | "materialName"
  >,
): MaterialWorldEvent {
  return {
    id: materialWorldEventId(kind, material),
    kind,
    materialId: material.id,
    materialName: material.name,
    ...event,
  };
}

export function materialWorldEventsForDiscovery(
  material: MaterialDefinition,
): readonly MaterialWorldEvent[] {
  if (!isRareDiscovery(material)) {
    return [];
  }

  const tags = normalizedTags(material);
  const events: MaterialWorldEvent[] = [];

  if (
    material.radioactivity >= 65 ||
    hasAnyTag(tags, ["radioactive", "radiological", "uranium", "reactor"])
  ) {
    events.push(
      eventForMaterial("radioactive_cave_hint", material, {
        hintKey: "radioactive-caves",
        message: "Radioactive cave readings can now be hinted.",
        severity: "info",
      }),
    );
  }

  if (material.magic >= 70 || hasAnyTag(tags, ["magic", "arcane", "void"])) {
    events.push(
      eventForMaterial("arcane_biome_hint", material, {
        hintKey: "arcane-biomes",
        message: "Arcane biome traces can now be hinted.",
        severity: "info",
      }),
    );
  }

  if (
    material.stability <= 35 ||
    hasAnyTag(tags, ["unstable", "explosive", "volatile"])
  ) {
    events.push(
      eventForMaterial("hazard_warning", material, {
        hintKey: "unstable-material-hazards",
        message: "Unstable explosive material hazards can now be warned about.",
        severity: "warning",
      }),
    );
  }

  return events.sort((a, b) => a.id.localeCompare(b.id));
}

export function evaluateMaterialWorldEvents(
  material: MaterialDefinition,
  state: MaterialWorldEventState = { triggeredEventIds: [] },
): MaterialWorldEventEvaluation {
  const triggered = new Set(state.triggeredEventIds);
  const events = materialWorldEventsForDiscovery(material).filter(
    (event) => !triggered.has(event.id),
  );

  for (const event of events) {
    triggered.add(event.id);
  }

  return {
    events,
    state: {
      triggeredEventIds: [...triggered].sort(),
    },
  };
}
