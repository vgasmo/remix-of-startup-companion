import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyWithRetry } from './lazyWithRetry';

describe('lazy import retry with optional storage', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('reloads once when a persistent retry marker is available', async () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, location: { reload } });
    const error = new Error('Failed to fetch dynamically imported module');
    const importer = vi.fn().mockRejectedValue(error);
    const load = lazyWithRetry(importer, 'chunk');
    void load();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(load()).rejects.toBe(error);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('rejects without reloading when retry state cannot be persisted', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('denied'); }, location: { reload } });
    const error = new Error('Importing a module script failed');
    await expect(lazyWithRetry(() => Promise.reject(error), 'chunk')()).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });
  it('returns a successful import despite blocked storage', async () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('denied'); } });
    const module = { default: () => null };
    await expect(lazyWithRetry(() => Promise.resolve(module), 'chunk')()).resolves.toBe(module);
  });
  it('does not replay an unrelated import error', async () => {
    const error = new Error('module initialization error');
    const importer = vi.fn().mockRejectedValue(error);
    await expect(lazyWithRetry(importer, 'chunk')()).rejects.toBe(error);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
