export interface HydraResponse<T> {
  "hydra:member": T[];
  "hydra:totalItems": number;
  "hydra:view"?: {
    "@id": string;
    "@type": string;
    "hydra:next"?: string;
  };
}

export interface OTG {
  id: number;
  name: string;
}

export interface City {
  id: number;
  name: string;
  otg: {
    "@id": string;
  };
}

export interface Street {
  id: number;
  name: string;
}

export interface Accident {
  id: number;
  typeOff: number;
  switchSubReason: number;
  dateEvent: string;
  datePlanIn: string;
  buildingNames: string;
  chergGav?: string;
  chergGpv?: string;
  chergSgav?: string;
  street: {
    name: string;
  };
  city: {
    name: string;
    otg?: {
      name: string;
    };
  };
}

export interface SyncStatus {
  option_key: string;
  option_value: string;
  date?: string;
}

export interface SavedAddress {
  id: string;
  customName: string;
  otgId: number;
  otgName: string;
  cityId: number;
  cityName: string;
  streetId: number;
  streetName: string;
  buildingNumber: string;
}
