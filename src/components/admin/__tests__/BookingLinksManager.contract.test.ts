/**
 * Contract tests for BookingLinksManager canonical-link behavior.
 *
 * These verify the two bug-regression contracts from finding
 * b8b38e53 ("Cannot promote an existing booking link to canonical"):
 *
 *  1. Every newly created link persists `canonical_url` — so any active
 *     non-canonical link can later be promoted from the UI.
 *  2. Promoting an existing link (setCanonical) sets is_canonical = true
 *     on the target row and NEVER writes canonical_url = null (which would
 *     wipe the persisted URL and break /book).
 *
 * We assert on the source of BookingLinksManager to keep this a fast,
 * provider-free unit check that survives future refactors.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '../../components/admin/BookingLinksManager.tsx'),
  'utf8',
);

describe('BookingLinksManager — canonical link contracts', () => {
  it('always persists canonical_url on create (not gated on markCanonical)', () => {
    // The create mutation must build `bookingUrl` unconditionally from the
    // freshly generated plaintext token — this is the ONLY moment the token
    // is available (token_hash is one-way).
    const createBlock = SOURCE.split('generateLink = useMutation')[1] ?? '';
    const insertBlock = createBlock.split('.insert(')[1]?.split(');')[0] ?? '';

    expect(insertBlock).toContain('canonical_url: bookingUrl');
    // Guard against the previous buggy shape: `markCanonical ? url : null`.
    expect(createBlock).not.toMatch(/canonical_url:\s*markCanonical\s*\?/);
    expect(createBlock).toMatch(
      /const bookingUrl\s*=\s*`\$\{window\.location\.origin\}\/book\/\$\{token\}`/,
    );
  });

  it('promote mutation flips is_canonical without nulling canonical_url', () => {
    const promoteBlock = SOURCE.split('setCanonical = useMutation')[1]?.split('});')[0] ?? '';

    expect(promoteBlock).toContain(".update({ is_canonical: true })");
    expect(promoteBlock).toContain(".update({ is_canonical: false })");
    // A defensive check: no code path in the promote mutation clears the URL.
    expect(promoteBlock).not.toMatch(/canonical_url:\s*null/);
  });

  it('renders a disabled promote affordance for legacy rows (canonical_url = null)', () => {
    // Pre-migration rows can never be promoted (their plaintext token is lost).
    // The UI must surface this explicitly instead of silently hiding the action.
    expect(SOURCE).toMatch(
      /link\.active\s*&&\s*!link\.is_canonical\s*&&\s*!link\.canonical_url/,
    );
    expect(SOURCE).toContain('cannotPromoteLegacy');
  });
});
