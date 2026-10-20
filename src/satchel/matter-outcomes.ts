// REPORT-001: an explicit legal result, independent of the administrative closure reason.
export const outcomeLabels = {
 won: 'Won',
 settled: 'Settled',
 lost: 'Lost',
 dismissed: 'Dismissed',
 withdrawn: 'Withdrawn',
 transactional_complete: 'Transactional complete',
 other: 'Other',
} as const;
export type MatterOutcome = keyof typeof outcomeLabels;
