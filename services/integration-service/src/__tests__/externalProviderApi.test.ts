import { describe, expect, it } from "vitest";
import { getAdapter } from "../adapters/externalProviderApi.ts";
import { vi } from "vitest";

const CANONICAL_STATUSES = ["AVAILABLE", "IN_USE", "OUTAGE"];
const CANONICAL_CONNECTORS = ["CCS", "CHADEMO", "TYPE2", "TYPE1", "SCHUKO"];

describe("ExternalProviderAPI mock adapter (#40)", () => {
  it("normalizes redPlug points (flat long/lat, defaulted price)", async () => {
    const chargers = await getAdapter("redPlug", { useMock: true }).listChargers();

    expect(chargers.length).toBeGreaterThan(0);
    for (const c of chargers) {
      expect(c.externalProvider).toBe("redPlug");
      expect(typeof c.lat).toBe("number");
      expect(typeof c.lng).toBe("number");
      expect(CANONICAL_STATUSES).toContain(c.status);
      expect(CANONICAL_CONNECTORS).toContain(c.connectorType);
      expect(c.kwhPrice).toBeGreaterThan(0); // redPlug has no price -> defaulted
    }
  });

  it("normalizes greenPlug nested coords into flat lat/lng", async () => {
    const chargers = await getAdapter("greenPlug", { useMock: true }).listChargers();

    expect(chargers.every((c) => c.externalProvider === "greenPlug")).toBe(true);
    expect(chargers[0].kwhPrice).toBeGreaterThan(0);
    expect(chargers[0].lat).toBeGreaterThan(30); // greek latitudes
  });

  it("normalizes bluePlug geo array and maps 'offline' to OUTAGE", async () => {
    const chargers = await getAdapter("bluePlug", { useMock: true }).listChargers();

    const offline = chargers.find((c) => c.externalId === "9002");
    expect(offline?.status).toBe("OUTAGE");
    expect(offline?.lng).toBeCloseTo(23.8, 1);
  });

  it("maps charging/reserved statuses to IN_USE", async () => {
    const red = await getAdapter("redPlug", { useMock: true }).listChargers();
    const green = await getAdapter("greenPlug", { useMock: true }).listChargers();

    expect(red.find((c) => c.externalId === "102")?.status).toBe("IN_USE"); // "charging"
    expect(green.find((c) => c.externalId === "5002")?.status).toBe("IN_USE"); // "reserved"
  });

  it("throws on an unknown provider", () => {
    expect(() => getAdapter("purplePlug", { useMock: true })).toThrow();
  });

  it("calls live provider APIs with Bearer authorization when mock mode is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          pointid: 1,
          status: "available",
          cap: 22,
          connector: "10",
          locationName: "Test point",
          long: 23.72,
          lat: 37.9,
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAdapter("redPlug", {
      useMock: false,
      apiKey: "sk_test_provider_key",
    }).listChargers();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://davinci.softlab.ntua.gr/saas26/redPlug/api/points",
      { headers: { Accept: "application/json", Authorization: "Bearer sk_test_provider_key" } },
    );

    vi.unstubAllGlobals();
  });
});
