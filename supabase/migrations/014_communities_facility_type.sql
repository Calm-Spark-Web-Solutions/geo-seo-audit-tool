-- Optional facility niche for audit context (web + PDF), validated in app + DB.

alter table public.communities
  add column if not exists facility_type text;

alter table public.communities
  drop constraint if exists communities_facility_type_check;

alter table public.communities
  add constraint communities_facility_type_check
  check (
    facility_type is null
    or facility_type in (
      'Skilled Nursing Facility (SNF)',
      'Assisted Living Facility (ALF)',
      'Memory Care / Dementia Care',
      'Independent Living Community',
      'Continuing Care Retirement Community (CCRC)',
      'Life Plan Community',
      '55+ Active Adult Community',
      'Residential Care Home',
      'Adult Family Home (AFH)',
      'Adult Day Care Center',
      'Home Health Agency',
      'In-Home Care Agency',
      'Hospice Care',
      'Palliative Care',
      'PACE Program',
      'Subacute Rehabilitation',
      'Inpatient Rehabilitation Facility (IRF)',
      'Long-Term Acute Care (LTACH)',
      'Veteran Senior Community',
      'Faith-Based Senior Living',
      'Other'
    )
  );

comment on column public.communities.facility_type is 'Senior-living niche; surfaced on audits and PDFs.';
