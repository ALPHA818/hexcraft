import type { BaseElementMaterial, MaterialRarity } from "./MaterialTypes.ts";

type ElementSeed = readonly [
  atomicNumber: number,
  symbol: string,
  name: string,
];

const ELEMENT_SEEDS = [
  [1, "H", "Hydrogen"],
  [2, "He", "Helium"],
  [3, "Li", "Lithium"],
  [4, "Be", "Beryllium"],
  [5, "B", "Boron"],
  [6, "C", "Carbon"],
  [7, "N", "Nitrogen"],
  [8, "O", "Oxygen"],
  [9, "F", "Fluorine"],
  [10, "Ne", "Neon"],
  [11, "Na", "Sodium"],
  [12, "Mg", "Magnesium"],
  [13, "Al", "Aluminium"],
  [14, "Si", "Silicon"],
  [15, "P", "Phosphorus"],
  [16, "S", "Sulfur"],
  [17, "Cl", "Chlorine"],
  [18, "Ar", "Argon"],
  [19, "K", "Potassium"],
  [20, "Ca", "Calcium"],
  [21, "Sc", "Scandium"],
  [22, "Ti", "Titanium"],
  [23, "V", "Vanadium"],
  [24, "Cr", "Chromium"],
  [25, "Mn", "Manganese"],
  [26, "Fe", "Iron"],
  [27, "Co", "Cobalt"],
  [28, "Ni", "Nickel"],
  [29, "Cu", "Copper"],
  [30, "Zn", "Zinc"],
  [31, "Ga", "Gallium"],
  [32, "Ge", "Germanium"],
  [33, "As", "Arsenic"],
  [34, "Se", "Selenium"],
  [35, "Br", "Bromine"],
  [36, "Kr", "Krypton"],
  [37, "Rb", "Rubidium"],
  [38, "Sr", "Strontium"],
  [39, "Y", "Yttrium"],
  [40, "Zr", "Zirconium"],
  [41, "Nb", "Niobium"],
  [42, "Mo", "Molybdenum"],
  [43, "Tc", "Technetium"],
  [44, "Ru", "Ruthenium"],
  [45, "Rh", "Rhodium"],
  [46, "Pd", "Palladium"],
  [47, "Ag", "Silver"],
  [48, "Cd", "Cadmium"],
  [49, "In", "Indium"],
  [50, "Sn", "Tin"],
  [51, "Sb", "Antimony"],
  [52, "Te", "Tellurium"],
  [53, "I", "Iodine"],
  [54, "Xe", "Xenon"],
  [55, "Cs", "Caesium"],
  [56, "Ba", "Barium"],
  [57, "La", "Lanthanum"],
  [58, "Ce", "Cerium"],
  [59, "Pr", "Praseodymium"],
  [60, "Nd", "Neodymium"],
  [61, "Pm", "Promethium"],
  [62, "Sm", "Samarium"],
  [63, "Eu", "Europium"],
  [64, "Gd", "Gadolinium"],
  [65, "Tb", "Terbium"],
  [66, "Dy", "Dysprosium"],
  [67, "Ho", "Holmium"],
  [68, "Er", "Erbium"],
  [69, "Tm", "Thulium"],
  [70, "Yb", "Ytterbium"],
  [71, "Lu", "Lutetium"],
  [72, "Hf", "Hafnium"],
  [73, "Ta", "Tantalum"],
  [74, "W", "Tungsten"],
  [75, "Re", "Rhenium"],
  [76, "Os", "Osmium"],
  [77, "Ir", "Iridium"],
  [78, "Pt", "Platinum"],
  [79, "Au", "Gold"],
  [80, "Hg", "Mercury"],
  [81, "Tl", "Thallium"],
  [82, "Pb", "Lead"],
  [83, "Bi", "Bismuth"],
  [84, "Po", "Polonium"],
  [85, "At", "Astatine"],
  [86, "Rn", "Radon"],
  [87, "Fr", "Francium"],
  [88, "Ra", "Radium"],
  [89, "Ac", "Actinium"],
  [90, "Th", "Thorium"],
  [91, "Pa", "Protactinium"],
  [92, "U", "Uranium"],
  [93, "Np", "Neptunium"],
  [94, "Pu", "Plutonium"],
  [95, "Am", "Americium"],
  [96, "Cm", "Curium"],
  [97, "Bk", "Berkelium"],
  [98, "Cf", "Californium"],
  [99, "Es", "Einsteinium"],
  [100, "Fm", "Fermium"],
  [101, "Md", "Mendelevium"],
  [102, "No", "Nobelium"],
  [103, "Lr", "Lawrencium"],
  [104, "Rf", "Rutherfordium"],
  [105, "Db", "Dubnium"],
  [106, "Sg", "Seaborgium"],
  [107, "Bh", "Bohrium"],
  [108, "Hs", "Hassium"],
  [109, "Mt", "Meitnerium"],
  [110, "Ds", "Darmstadtium"],
  [111, "Rg", "Roentgenium"],
  [112, "Cn", "Copernicium"],
  [113, "Nh", "Nihonium"],
  [114, "Fl", "Flerovium"],
  [115, "Mc", "Moscovium"],
  [116, "Lv", "Livermorium"],
  [117, "Ts", "Tennessine"],
  [118, "Og", "Oganesson"],
] as const satisfies readonly ElementSeed[];

const NOBLE_GASES = new Set(["He", "Ne", "Ar", "Kr", "Xe", "Rn", "Og"]);
const HALOGENS = new Set(["F", "Cl", "Br", "I", "At", "Ts"]);
const NONMETALS = new Set(["H", "C", "N", "O", "P", "S", "Se"]);
const METALLOIDS = new Set(["B", "Si", "Ge", "As", "Sb", "Te"]);
const ORGANIC_CORE = new Set(["H", "C", "N", "O", "P", "S"]);
const LIQUID_ELEMENTS = new Set(["Br", "Hg", "Cs", "Ga", "Fr"]);

function elementId(name: string): string {
  return `element:${name.toLowerCase().replaceAll(" ", "_")}`;
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function elementRarity(atomicNumber: number): MaterialRarity {
  if (atomicNumber >= 104) {
    return "legendary";
  }
  if (atomicNumber >= 89 || atomicNumber === 43 || atomicNumber === 61) {
    return "epic";
  }
  if (atomicNumber >= 57 || atomicNumber === 78 || atomicNumber === 79) {
    return "rare";
  }
  if (atomicNumber >= 31) {
    return "uncommon";
  }
  return "common";
}

function tagsForElement(
  atomicNumber: number,
  symbol: string,
  name: string,
): readonly string[] {
  const tags = new Set<string>(["element", `periodic-${atomicNumber}`]);

  if (NOBLE_GASES.has(symbol)) tags.add("noble-gas");
  if (HALOGENS.has(symbol)) tags.add("halogen");
  if (NONMETALS.has(symbol)) tags.add("nonmetal");
  if (METALLOIDS.has(symbol)) tags.add("metalloid");
  if (
    !NOBLE_GASES.has(symbol) &&
    !HALOGENS.has(symbol) &&
    !NONMETALS.has(symbol) &&
    !METALLOIDS.has(symbol)
  ) {
    tags.add("metallic");
  }
  if (atomicNumber >= 57 && atomicNumber <= 71) tags.add("lanthanide");
  if (atomicNumber >= 89 && atomicNumber <= 103) tags.add("actinide");
  if (atomicNumber >= 84 || atomicNumber === 43 || atomicNumber === 61) {
    tags.add("radioactive");
  }
  if (LIQUID_ELEMENTS.has(symbol)) tags.add("liquid-prone");
  if (ORGANIC_CORE.has(symbol)) tags.add("organic-core");
  tags.add(name.toLowerCase());

  return [...tags].sort();
}

function createBaseElement([
  atomicNumber,
  symbol,
  name,
]: ElementSeed): BaseElementMaterial {
  const nobleGas = NOBLE_GASES.has(symbol);
  const halogen = HALOGENS.has(symbol);
  const nonmetal = NONMETALS.has(symbol);
  const metalloid = METALLOIDS.has(symbol);
  const liquidElement = LIQUID_ELEMENTS.has(symbol);
  const metal =
    !nobleGas && !halogen && !nonmetal && !metalloid ? 78 : metalloid ? 32 : 4;
  const radioactivity =
    atomicNumber >= 84 || atomicNumber === 43 || atomicNumber === 61
      ? Math.min(100, 35 + (atomicNumber - 40) * 0.8)
      : 0;

  return {
    id: elementId(name),
    atomicNumber,
    symbol,
    name,
    generation: 0,
    parents: [],
    rarity: elementRarity(atomicNumber),
    stability: clampStat(100 - radioactivity * 0.62 - (nobleGas ? 0 : 6)),
    hardness: clampStat(
      nobleGas
        ? 1
        : nonmetal
          ? 18
          : halogen
            ? 10
            : metalloid
              ? 52
              : 38 + atomicNumber * 0.42,
    ),
    density: clampStat(
      nobleGas ? 3 + atomicNumber * 0.08 : 8 + atomicNumber * 0.72,
    ),
    heat: clampStat(20 + atomicNumber * 0.35 + (halogen ? 18 : 0)),
    conductivity: clampStat(metal * 0.92 + (metalloid ? 24 : 0)),
    toxicity: clampStat(
      (halogen ? 38 : 0) +
        (["Be", "Cd", "Hg", "Pb", "As", "Tl", "Po"].includes(symbol) ? 45 : 0) +
        radioactivity * 0.22,
    ),
    radioactivity: clampStat(radioactivity),
    magic: clampStat(
      (nobleGas ? 28 : 0) + (metalloid ? 12 : 0) + ((atomicNumber * 17) % 23),
    ),
    organic: clampStat(ORGANIC_CORE.has(symbol) ? 78 : nonmetal ? 34 : 3),
    metal: clampStat(metal),
    crystal: clampStat(metalloid ? 64 : metal > 50 ? 28 : nobleGas ? 4 : 22),
    gas: clampStat(
      nobleGas ? 96 : ["H", "N", "O", "F", "Cl"].includes(symbol) ? 72 : 3,
    ),
    liquid: clampStat(liquidElement ? 78 : halogen ? 22 : 4),
    tags: tagsForElement(atomicNumber, symbol, name),
    discoveredAt: 0,
    description: `${name} is a base element starter material.`,
  };
}

export const BASE_ELEMENT_MATERIALS: readonly BaseElementMaterial[] =
  ELEMENT_SEEDS.map(createBaseElement);

export const BASE_ELEMENT_COUNT = BASE_ELEMENT_MATERIALS.length;
