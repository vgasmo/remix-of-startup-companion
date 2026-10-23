/** Intake delivery is bound to its saved contact, not an email in the request. */
export function intakeRecipient(value: unknown): string {
  if (typeof value !== 'string' || value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new Error('intake_recipient_missing');
  }
  return value.trim();
}