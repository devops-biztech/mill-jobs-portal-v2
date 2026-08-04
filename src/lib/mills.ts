export const MILL_CODES = ["TRL", "SRM", "SLI", "NFL", "STLC", "GL"] as const;
export type MillCode = (typeof MILL_CODES)[number];

export const ACCESS_FIELD_BY_MILL = {
  TRL: "trlAccess",
  SRM: "srmAccess",
  SLI: "sliAccess",
  NFL: "nflAccess",
  STLC: "stlcAccess",
  GL: "glAccess",
} as const satisfies Record<MillCode, string>;
