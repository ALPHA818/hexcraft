export type WorkbenchType =
  | "basic"
  | "metal"
  | "magic"
  | "organic"
  | "crystal"
  | "chemical"
  | "assembler"
  | "element_combiner";

export const WORKBENCH_TYPES = [
  "basic",
  "metal",
  "magic",
  "organic",
  "crystal",
  "chemical",
  "assembler",
  "element_combiner",
] as const satisfies readonly WorkbenchType[];

export const WORKBENCH_LABELS = {
  basic: "Basic Workbench",
  metal: "Metal Workbench",
  magic: "Magic Workbench",
  organic: "Organic Workbench",
  crystal: "Crystal Workbench",
  chemical: "Chemical Workbench",
  assembler: "Assembler Workbench",
  element_combiner: "Element Combiner",
} as const satisfies Record<WorkbenchType, string>;

export function isWorkbenchType(value: unknown): value is WorkbenchType {
  return (
    typeof value === "string" &&
    (WORKBENCH_TYPES as readonly string[]).includes(value)
  );
}
