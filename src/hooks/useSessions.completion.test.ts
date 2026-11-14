import { describe, expect, it, vi } from 'vitest';
const { invalidate, capture } = vi.hoisted(() => ({ invalidate: vi.fn(), capture: { success: undefined as undefined | ((data: unknown, vars: { workspace_id: string }) => void) } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: invalidate }),
  useMutation: (options: { onSuccess: typeof capture.success }) => { capture.success = options.onSuccess; return options; },
}));
import { useCompleteSession } from './useSessions';
describe('session completion refreshes staff queue', () => {
  it('invalidates queue items and queue statistics after success', () => {
    useCompleteSession();
    expect(capture.success).toBeTypeOf('function');
    capture.success?.({}, { workspace_id: 'workspace' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-queue'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-queue-stats'] });
  });
});