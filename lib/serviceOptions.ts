// Service classification for 3rd party vendor contracts.
//
// These two values mirror the `vendor_costs_service_check` CHECK constraint in
// Postgres — if you add an option here, widen the constraint in the same
// change or inserts will be rejected.
export const SERVICE_OPTIONS = ['Standard Services Delivery', 'Custom Services'] as const

export type ServiceOption = (typeof SERVICE_OPTIONS)[number]
