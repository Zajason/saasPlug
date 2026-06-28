export const rkeys = {
    // Live status overlay (string): "available" | "in_use" | "outage"
    chargerStatus: (chargerId: number) => `charger:status:${chargerId}`,
  
    // Reservation lock for charger (JSON) with TTL
    chargerReservation: (chargerId: number) => `charger:reservation:${chargerId}`,
  
    // User can only have one active reservation (string chargerId) with TTL
    userReservation: (userId: number) => `user:reservation:${userId}`,
  };
  