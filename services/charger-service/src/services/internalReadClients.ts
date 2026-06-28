const reservationServiceUrl = process.env.RESERVATION_SERVICE_URL ?? "http://localhost:8085";
const sessionServiceUrl = process.env.SESSION_SERVICE_URL ?? "http://localhost:8086";

export type ReservationSnapshot = {
  id: number;
  userId: number;
  chargerId: number;
  startsAt: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
};

export type SessionSnapshot = {
  id: number;
  userId: number;
  chargerId: number;
  reservationId: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getActiveReservations(args: {
  userId?: number;
  chargerIds?: number[];
  chargerId?: number;
}) {
  const params = new URLSearchParams();
  if (args.userId) params.set("userId", String(args.userId));
  if (args.chargerId) params.set("chargerId", String(args.chargerId));
  if (args.chargerIds?.length) params.set("chargerIds", args.chargerIds.join(","));

  const data = await fetchJson<{ reservations: ReservationSnapshot[] }>(
    `${reservationServiceUrl}/api/v1/internal/reservations/active?${params.toString()}`,
  );
  return data.reservations;
}

export async function getReservationHistory(chargerId: number, from: string, to: string) {
  const data = await fetchJson<{ reservations: ReservationSnapshot[] }>(
    `${reservationServiceUrl}/api/v1/internal/reservations/history/${chargerId}/${from}/${to}`,
  );
  return data.reservations;
}

export async function getSessionHistory(chargerId: number, from: string, to: string) {
  const data = await fetchJson<{ sessions: SessionSnapshot[] }>(
    `${sessionServiceUrl}/api/v1/internal/sessions/history/${chargerId}/${from}/${to}`,
  );
  return data.sessions;
}
