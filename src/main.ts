import "./style.css";
import { Inventory } from "./game/Inventory.ts";
import { SurvivalController } from "./game/SurvivalController.ts";
import { FirstPersonCamera } from "./input/FirstPersonCamera.ts";
import { WebGlRenderer } from "./render/WebGlRenderer.ts";
import { WebGpuRenderer } from "./render/WebGpuRenderer.ts";
import {
  InfiniteTerrain,
  type TerrainStreamUpdate,
} from "./world/InfiniteTerrain.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const message = document.querySelector<HTMLParagraphElement>("#message");

if (!canvas || !message) {
  throw new Error("The game canvas or status message is missing.");
}

const gameCanvas = canvas;
const statusMessage = message;

async function start(): Promise<void> {
  try {
    const world = new InfiniteTerrain();
    const initialWorld = world.update({ x: 0, z: 18 });

    if (!initialWorld) {
      throw new Error("Could not generate the initial terrain window.");
    }

    let renderer: WebGpuRenderer | WebGlRenderer;
    let backend: "WebGPU" | "WebGL 2";
    let activeCanvas = gameCanvas;

    try {
      renderer = await WebGpuRenderer.create(
        gameCanvas,
        initialWorld.mesh,
      );
      backend = "WebGPU";
    } catch (webGpuError) {
      console.warn("WebGPU startup failed; using WebGL 2.", webGpuError);

      // A canvas cannot switch context type after one has been created.
      // Replace it so WebGL can still start if WebGPU failed mid-setup.
      const fallbackCanvas = gameCanvas.cloneNode(false) as HTMLCanvasElement;
      gameCanvas.replaceWith(fallbackCanvas);
      activeCanvas = fallbackCanvas;
      renderer = WebGlRenderer.create(fallbackCanvas, initialWorld.mesh);
      backend = "WebGL 2";
    }

    const camera = new FirstPersonCamera(activeCanvas, world);
    camera.spawnAt(0, 18);
    camera.start();
    const inventory = new Inventory();
    const showWorldStatus = (update: TerrainStreamUpdate): void => {
      statusMessage.textContent =
        `Infinite · ${update.loadedChunkCount} chunks · ` +
        `${update.mesh.biomeCount} biomes · ` +
        `${update.mesh.riverColumnCount} river cells · ` +
        `${update.mesh.mountainColumnCount} mountain cells · ` +
        `${update.mesh.caveAirCount.toLocaleString()} cave cells · ${backend}`;
    };

    showWorldStatus(initialWorld);
    const applyWorldUpdate = (update: TerrainStreamUpdate): void => {
      renderer.updateMesh(update.mesh);
      showWorldStatus(update);
    };
    const survival = new SurvivalController(
      activeCanvas,
      world,
      camera,
      inventory,
      applyWorldUpdate,
    );
    renderer.start(
      camera,
      () => {
        const [x, , z] = camera.position();
        const update = world.update({ x, z });

        if (update) {
          applyWorldUpdate(update);
        }
        survival.update();
      },
      (reason) => {
        statusMessage.textContent = `Graphics device lost: ${reason}`;
      },
    );
  } catch (error) {
    statusMessage.textContent =
      error instanceof Error ? error.message : "Renderer startup failed.";
    console.error(error);
  }
}

void start();
