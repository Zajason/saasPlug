// Mock raw responses shaped exactly like each provider's OpenAPI contract
// (see docs/provider-apis/*.yaml). Used by the adapters when
// INTEGRATION_USE_MOCK is enabled (the default), so charger sync works
// without network access to the real provider APIs.

export const mockRawData = {
  // redPlug: flat long/lat, no price field, status free-text.
  redPlug: [
    {
      pointid: 101,
      providerName: "redPlug",
      status: "available",
      cap: 50,
      connector: "CCS",
      locationName: "redPlug Syntagma",
      address: "Syntagma Square, Athens",
      long: 23.735,
      lat: 37.9755,
    },
    {
      pointid: 102,
      providerName: "redPlug",
      status: "charging",
      cap: 22,
      connector: "Type2",
      locationName: "redPlug Kifisias",
      address: "Kifisias Avenue 100",
      long: 23.7806,
      lat: 38.0123,
    },
    {
      pointid: 103,
      providerName: "redPlug",
      status: "malfunction",
      cap: 150,
      connector: "CCS",
      locationName: "redPlug Piraeus",
      address: "Piraeus Port",
      long: 23.644,
      lat: 37.942,
    },
  ],
  // greenPlug: nested coords, kwhRateEur, "state" field.
  greenPlug: [
    {
      id: 5001,
      providerName: "greenPlug",
      state: "available",
      kwhRateEur: 0.42,
      cap: 75,
      connector: "CCS",
      locationName: "greenPlug Glyfada",
      address: "Glyfada Marina",
      coords: { long: 23.753, lat: 37.865 },
    },
    {
      id: 5002,
      providerName: "greenPlug",
      state: "reserved",
      kwhRateEur: 0.38,
      cap: 22,
      connector: "Type2",
      locationName: "greenPlug Marousi",
      address: "Marousi Center",
      coords: { long: 23.805, lat: 38.056 },
    },
  ],
  // bluePlug: geo array [long, lat], pricePerKwh, "currentStatus" field.
  bluePlug: [
    {
      chargerId: 9001,
      providerName: "bluePlug",
      currentStatus: "available",
      pricePerKwh: 0.59,
      cap: 60,
      connector: "CHAdeMO",
      locationName: "bluePlug Nea Smyrni",
      address: "Nea Smyrni Square",
      geo: [23.714, 37.946],
    },
    {
      chargerId: 9002,
      providerName: "bluePlug",
      currentStatus: "offline",
      pricePerKwh: 0.55,
      cap: 50,
      connector: "CCS",
      locationName: "bluePlug Chalandri",
      address: "Chalandri",
      geo: [23.8, 38.021],
    },
  ],
};
