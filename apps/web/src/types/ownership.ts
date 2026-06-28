// types/ownership.ts
export type CarApi = {
    id: number;
    brand: string;
    model: string;
    variant: string | null;
    usableBatteryKWh: number;
    acMaxKW: number;
    dcMaxKW: number;
    dcPorts: string[];
    acPorts: string[];
  };
  
  export type CarOwnershipApi = {
    id: number;
    userId: string;
    carId: number;
    color: string;          // e.g. "RED" (Prisma enum)
    createdAt: string;
    car: CarApi;
  };
  