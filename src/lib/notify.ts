/**
 * Unified toast helpers — single source of truth for app feedback.
 *
 * Why: prior code mixed `toast()`, `toast.success()`, raw `useToast`, and
 * silent successes. This wrapper enforces:
 *   • success → short, 2.5s, no description unless useful
 *   • error   → 5s, supports an "action" (retry / view details)
 *   • promise → built-in for async ops (loading → success/error transitions)
 *   • info / warn → consistent durations + iconography via sonner
 *
 * Prefer `notify.*` over raw `toast.*` going forward. Keep destructive
 * confirmations in <ConfirmDialog />, NOT toasts.
 */
import { toast, type ExternalToast } from 'sonner';

type Opts = Omit<ExternalToast, 'duration'> & { duration?: number };

export const notify = {
  success(message: string, opts?: Opts) {
    return toast.success(message, { duration: 2500, ...opts });
  },

  error(message: string, opts?: Opts) {
    return toast.error(message, { duration: 5000, ...opts });
  },

  info(message: string, opts?: Opts) {
    return toast(message, { duration: 3500, ...opts });
  },

  warn(message: string, opts?: Opts) {
    return toast.warning(message, { duration: 4000, ...opts });
  },

  /**
   * Wrap an async operation with loading → success / error toast transitions.
   * Returns the original promise so callers can still await/catch it.
   */
  promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ): Promise<T> {
    toast.promise(promise, messages);
    return promise;
  },

  /** Silent dismiss helper (e.g. clear loaders on unmount) */
  dismiss(id?: string | number) {
    toast.dismiss(id);
  },
};

export default notify;
