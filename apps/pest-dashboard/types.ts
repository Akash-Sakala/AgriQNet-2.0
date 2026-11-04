export enum Severity {
  RED = 'RED',
  ORANGE = 'ORANGE',
  YELLOW = 'YELLOW',
}

export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
}

export interface District {
  id: string;
  name: string;
  meta: {
    population: number;
    area_sq_km: number;
  };
  position: { x: number; y: number }; // For UI rendering
}

export interface Edge {
  districtAId: string;
  districtBId: string;
}

export interface Farmer {
  id: string;
  name: string;
  phone: string;
  districtId: string;
}

export interface Alert {
  id: string;
  reportedDistrictId: string;
  severity: Severity;
  pestType: string;
  reportedAt: string;
  status: AlertStatus;
}

export interface AlertRecipient {
  alertId: string;
  farmerId: string;
  districtId: string;
}

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}