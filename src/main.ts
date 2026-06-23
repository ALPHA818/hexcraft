import "./style.css";
import { Atmosphere } from "./environment/Atmosphere.ts";
import { Inventory } from "./game/Inventory.ts";
import {
  ACTIVE_GAME_MODE,
  isCreativeMode,
} from "./game/gameMode.ts";
import { SurvivalController } from "./game/SurvivalController.ts";
import { FirstPersonCamera } from "./input/FirstPersonCamera.ts";
import { MobileControls } from "./input/MobileControls.ts";
import { DEVICE_PROFILE } from "./platform/deviceProfile.ts";
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
const mobileControlsRoot =
  document.querySelector<HTMLElement>("#mobile-controls");

document.body.classList.toggle("mobile-game", DEVICE_PROFILE.isMobile);
document.body.classList.toggle(
  "creative-game",
  isCreativeMode(ACTIVE_GAME_MODE),
);
if (mobileControlsRoot && !DEVICE_PROFILE.isMobile) {
  mobileControlsRoot.hidden = true;
}

async function start(): Promise<void> {
  try {
    const world = new InfiniteTerrain(
      undefined,
      DEVICE_PROFILE.chunkSize,
      DEVICE_PROFILE.renderDistance,
    );
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

    const camera = new FirstPersonCamera(
      activeCanvas,
      world,
      DEVICE_PROFILE.isMobile,
      ACTIVE_GAME_MODE,
    );
    camera.spawnAt(0, 18);
    camera.start();
    const inventory = new Inventory(ACTIVE_GAME_MODE);
    const atmosphere = new Atmosphere();
    const showWorldStatus = (update: TerrainStreamUpdate): void => {
      statusMessage.textContent =
        `Creative test · Infinite · ${update.loadedChunkCount} chunks · ` +
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
    let streamRequestId = 0;
    const survival = new SurvivalController(
      activeCanvas,
      world,
      camera,
      inventory,
      applyWorldUpdate,
      ACTIVE_GAME_MODE,
    );
    if (DEVICE_PROFILE.isMobile) {
      new MobileControls(
        camera,
        survival,
        inventory,
        atmosphere,
      );
    }
    renderer.start(
      camera,
      atmosphere,
      () => {
        const [x, , z] = camera.position();
        const update = world.requestUpdate({ x, z });

        if (update) {
          const requestId = ++streamRequestId;
          statusMessage.dataset.streaming = "true";
          if (!statusMessage.textContent?.endsWith(" · loading…")) {
            statusMessage.textContent += " · loading…";
          }
          void update
            .then((worldUpdate) => {
              if (requestId === streamRequestId && worldUpdate) {
                applyWorldUpdate(worldUpdate);
              }
            })
            .catch((error) => {
              console.error("Background terrain streaming failed.", error);
              statusMessage.textContent = "Terrain streaming failed.";
            })
            .finally(() => {
              if (requestId === streamRequestId) {
                delete statusMessage.dataset.streaming;
              }
            });
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
