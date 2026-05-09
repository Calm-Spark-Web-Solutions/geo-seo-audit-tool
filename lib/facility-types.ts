export const FACILITY_TYPES = [
  "Skilled Nursing Facility (SNF)",
  "Assisted Living Facility (ALF)",
  "Memory Care / Dementia Care",
  "Independent Living Community",
  "Continuing Care Retirement Community (CCRC)",
  "Life Plan Community",
  "55+ Active Adult Community",
  "Residential Care Home",
  "Adult Family Home (AFH)",
  "Adult Day Care Center",
  "Home Health Agency",
  "In-Home Care Agency",
  "Hospice Care",
  "Palliative Care",
  "PACE Program",
  "Subacute Rehabilitation",
  "Inpatient Rehabilitation Facility (IRF)",
  "Long-Term Acute Care (LTACH)",
  "Veteran Senior Community",
  "Faith-Based Senior Living",
  "Other",
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

export function isFacilityType(value: string): value is FacilityType {
  return (FACILITY_TYPES as readonly string[]).includes(value);
}
