/**
 * Shared booking-link token helpers.
 *
 * Contract:
 * - `generateBookingToken()` returns a fresh URL-safe plaintext token (hex).
 * - `sha256Hex(token)` returns the SHA-256 hex digest stored in `token_hash`.
 *
 * The plaintext is ONLY embedded in the shareable URL handed back to the
 * admin at creation time. The DB never stores the plaintext, so server-side
 * verification always hashes the incoming token before comparing.
 */

export function generateBookingToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
