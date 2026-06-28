import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const oLat = searchParams.get("oLat");
    const oLng = searchParams.get("oLng");
    const dLat = searchParams.get("dLat");
    const dLng = searchParams.get("dLng");

    if (!oLat || !oLng || !dLat || !dLng) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // OSRM public server (fair-use). For production: self-host.
    const url =
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/` +
      `${encodeURIComponent(oLng)},${encodeURIComponent(oLat)};${encodeURIComponent(dLng)},${encodeURIComponent(dLat)}` +
      `?overview=false`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const details = await r.text().catch(() => "");
      return NextResponse.json({ error: "OSRM error", details }, { status: 502 });
    }

    const data: any = await r.json();
    const route = data?.routes?.[0];
    if (!route) {
      return NextResponse.json({ error: "No route" }, { status: 404 });
    }

    const distanceMeters = route.distance ?? 0;
    const durationSeconds = route.duration ?? 0;

    const km = distanceMeters / 1000;
    const distanceText = km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;

    const mins = Math.max(0, Math.round(durationSeconds / 60));
    const durationText = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;

    return NextResponse.json({ distanceText, durationText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
