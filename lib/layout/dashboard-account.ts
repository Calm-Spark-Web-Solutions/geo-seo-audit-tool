/**
 * Account info shown in the dashboard shell (sidebar / topbar).
 *
 * The previous `loadDashboardAccount()` helper was removed: the dashboard
 * layout now resolves account + quota inline so it can scope the quota
 * snapshot to the active organization rather than the account.
 */
export type DashboardAccount = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};
