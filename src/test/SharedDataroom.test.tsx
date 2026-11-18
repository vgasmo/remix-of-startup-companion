import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SharedDataroom from '@/pages/SharedDataroom';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const room = { dataroom: { id: 'room', startup_name: 'Test startup', allow_download: true }, items: [
  { id: 'item', type: 'document', title: 'Test document', document: { id: 'doc', name: 'Test document', downloadable: true } },
] };
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
function show() {
  render(<MemoryRouter initialEntries={['/dataroom/shared/test']}><Routes><Route path="/dataroom/shared/:token" element={<SharedDataroom />} /></Routes></MemoryRouter>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Shared dataroom downloads', () => {
  it('opens the signed file in the reserved tab with opener detached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(room)).mockResolvedValueOnce(response({ download_url: 'https://example.com/file.pdf' })));
    const tab = { opener: window, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'dataroom.download' }));
    await waitFor(() => expect(tab.location.href).toBe('https://example.com/file.pdf'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.close).not.toHaveBeenCalled();
  });
  it('closes the reserved tab on failure and retains the dataroom for retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(room)).mockResolvedValueOnce(response({ error: 'unavailable' }, false)));
    const tab = { opener: window, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'dataroom.download' }));
    await waitFor(() => expect(tab.close).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'dataroom.download' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('dataroom.downloadFailed');
    expect(tab.location.href).toBe('');
  });
  it('does not request a file or navigate away when the popup is blocked', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(room));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const originalUrl = window.location.href;
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'dataroom.download' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(originalUrl);
    expect(screen.getByRole('button', { name: 'dataroom.download' })).toBeDefined();
  });
});