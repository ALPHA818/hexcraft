export type DeviceProfile = Readonly<{
  isMobile: boolean;
  maxPixelRatio: number;
  chunkSize: number;
  renderDistance: number;
  shadowMapSize: number;
  weatherParticles: number;
}>;

export type DeviceCapabilities = Readonly<{
  userAgent: string;
  platform: string;
  touchPoints: number;
  userAgentDataMobile?: boolean;
}>;

export function shouldUseMobileControls(
  capabilities: DeviceCapabilities,
): boolean {
  if (capabilities.userAgentDataMobile === true) {
    return true;
  }

  const mobileOperatingSystem =
    /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(
      capabilities.userAgent,
    );
  const iPadDesktopMode =
    capabilities.platform === "MacIntel" &&
    capabilities.touchPoints > 1;

  return mobileOperatingSystem || iPadDesktopMode;
}

export function detectDeviceProfile(): DeviceProfile {
  const browserNavigator =
    typeof navigator === "undefined" ? null : navigator;
  const userAgentDataMobile = (
    browserNavigator as
      | (Navigator & {
          userAgentData?: Readonly<{ mobile?: boolean }>;
        })
      | null
  )?.userAgentData?.mobile;
  const isMobile = shouldUseMobileControls({
    userAgent: browserNavigator?.userAgent ?? "",
    platform: browserNavigator?.platform ?? "",
    touchPoints: browserNavigator?.maxTouchPoints ?? 0,
    userAgentDataMobile,
  });

  return isMobile
    ? {
        isMobile: true,
        maxPixelRatio: 1,
        chunkSize: 8,
        renderDistance: 2,
        shadowMapSize: 512,
        weatherParticles: 140,
      }
    : {
        isMobile: false,
        maxPixelRatio: 2,
        chunkSize: 10,
        renderDistance: 2,
        shadowMapSize: 1024,
        weatherParticles: 360,
      };
}

export const DEVICE_PROFILE = detectDeviceProfile();
