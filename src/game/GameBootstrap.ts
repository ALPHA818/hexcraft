import { WebGlRenderer } from "../render/WebGlRenderer.ts";
import { WebGpuRenderer } from "../render/WebGpuRenderer.ts";
import type { TerrainStreamUpdate } from "../world/InfiniteTerrain.ts";

export type GameRenderer = WebGpuRenderer | WebGlRenderer;
export type RendererBackend = "WebGPU" | "WebGL 2";

export type RendererStartup = Readonly<{
  renderer: GameRenderer;
  backend: RendererBackend;
  canvas: HTMLCanvasElement;
}>;

export type GameDomElements = Readonly<{
  initialCanvas: HTMLCanvasElement;
  message: HTMLParagraphElement;
  menuRoot: HTMLElement;
  modeStatus: HTMLElement | null;
  meshStatus: HTMLElement | null;
  survivalHudRoot: HTMLElement;
  debugOverlayRoot: HTMLElement;
  materialCodexRoot: HTMLElement;
  materialCombinerRoot: HTMLElement;
  materialResearchRoot: HTMLElement;
  materialStorageRoot: HTMLElement;
  deathScreenRoot: HTMLElement;
  mobileControlsRoot: HTMLElement | null;
}>;

function queryRequiredElement<T extends Element>(
  selector: string,
  label: string,
): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing ${label} element (${selector}).`);
  }

  return element;
}

export function readGameDom(): GameDomElements {
  return {
    initialCanvas: queryRequiredElement<HTMLCanvasElement>(
      "#game",
      "game canvas",
    ),
    message: queryRequiredElement<HTMLParagraphElement>(
      "#message",
      "status message",
    ),
    menuRoot: queryRequiredElement<HTMLElement>("#menu-root", "menu root"),
    modeStatus: document.querySelector<HTMLElement>("#mode-status"),
    meshStatus: document.querySelector<HTMLElement>("#mesh-status"),
    survivalHudRoot: queryRequiredElement<HTMLElement>(
      "#survival-hud",
      "survival HUD",
    ),
    debugOverlayRoot: queryRequiredElement<HTMLElement>(
      "#debug-overlay",
      "debug overlay",
    ),
    materialCodexRoot: queryRequiredElement<HTMLElement>(
      "#material-codex",
      "material codex",
    ),
    materialCombinerRoot: queryRequiredElement<HTMLElement>(
      "#material-combiner",
      "material combiner",
    ),
    materialResearchRoot: queryRequiredElement<HTMLElement>(
      "#material-research",
      "material research",
    ),
    materialStorageRoot: queryRequiredElement<HTMLElement>(
      "#material-storage",
      "material storage",
    ),
    deathScreenRoot: queryRequiredElement<HTMLElement>(
      "#death-screen",
      "death screen",
    ),
    mobileControlsRoot: document.querySelector<HTMLElement>("#mobile-controls"),
  };
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  mesh: TerrainStreamUpdate["mesh"],
): Promise<RendererStartup> {
  try {
    return {
      renderer: await WebGpuRenderer.create(canvas, mesh),
      backend: "WebGPU",
      canvas,
    };
  } catch (webGpuError) {
    console.warn("WebGPU startup failed; using WebGL 2.", webGpuError);

    // A canvas cannot switch context type after one has been created.
    // Replace it so WebGL can still start if WebGPU failed mid-setup.
    const fallbackCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(fallbackCanvas);

    return {
      renderer: WebGlRenderer.create(fallbackCanvas, mesh),
      backend: "WebGL 2",
      canvas: fallbackCanvas,
    };
  }
}
