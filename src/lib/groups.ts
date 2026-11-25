/** All hourly outage (GPV) groups the official schedule can publish. */
export const GPV_GROUPS = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 2 }, (_, column) => `${row + 1}.${column + 1}`),
).flat();
