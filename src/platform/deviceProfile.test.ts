import { describe, expect, it } from "vitest";

import {
  detectDeviceProfile,
  shouldUseMobileControls,
} from "./deviceProfile.ts";

describe("device performance profile", () => {
  it("always returns bounded rendering settings", () => {
    const profile = detectDeviceProfile();

    expect(profile.maxPixelRatio).toBeGreaterThan(0);
    expect(profile.maxPixelRatio).toBeLessThanOrEqual(2);
    expect(profile.chunkSize).toBeGreaterThanOrEqual(8);
    expect(profile.renderDistance).toBeGreaterThanOrEqual(2);
    expect(profile.shadowMapSize).toBeGreaterThanOrEqual(512);
  });

  it("uses touch controls on a phone", () => {
    expect(
      shouldUseMobileControls({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile",
        platform: "Linux armv8l",
        touchPoints: 5,
      }),
    ).toBe(true);
  });

  it("keeps desktop controls on a touch-enabled laptop", () => {
    expect(
      shouldUseMobileControls({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/127.0",
        platform: "Win32",
        touchPoints: 10,
      }),
    ).toBe(false);
  });

  it("detects iPadOS when Safari requests a desktop site", () => {
    expect(
      shouldUseMobileControls({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
        platform: "MacIntel",
        touchPoints: 5,
      }),
    ).toBe(true);
  });

  it("uses browser mobile client hints when available", () => {
    expect(
      shouldUseMobileControls({
        userAgent: "Mozilla/5.0",
        platform: "Linux",
        touchPoints: 0,
        userAgentDataMobile: true,
      }),
    ).toBe(true);
  });
});
