import { describe, it, expect } from 'vitest';

describe('CommandPalette', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/command/CommandPalette');
    expect(mod.CommandPalette).toBeDefined();
    expect(typeof mod.CommandPalette).toBe('function');
  });
});

describe('SavedViewsDropdown', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/crm/SavedViewsDropdown');
    expect(mod.SavedViewsDropdown).toBeDefined();
    expect(typeof mod.SavedViewsDropdown).toBe('function');
  });
});

describe('ContractIntelligenceCard', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/contracts/ContractIntelligenceCard');
    expect(mod.ContractIntelligenceCard).toBeDefined();
    expect(typeof mod.ContractIntelligenceCard).toBe('function');
  });
});


describe('useCrmSavedViews', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/hooks/useCrmSavedViews');
    expect(mod.useCrmSavedViews).toBeDefined();
    expect(mod.useSaveCrmView).toBeDefined();
    expect(mod.useDeleteCrmView).toBeDefined();
  });
});

describe('FocusModeToggle', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/ui/FocusModeToggle');
    expect(mod.FocusModeToggle).toBeDefined();
    expect(mod.FocusModeProvider).toBeDefined();
    expect(mod.useFocusMode).toBeDefined();
  });
});

describe('WorkQueuePanel', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/staff/WorkQueuePanel');
    expect(mod.WorkQueuePanel).toBeDefined();
    expect(typeof mod.WorkQueuePanel).toBe('function');
  });
});

describe('NotificationCenter', () => {
  it('module exports correctly', async () => {
    const mod = await import('@/components/notifications/NotificationCenter');
    expect(mod.NotificationCenter).toBeDefined();
    expect(typeof mod.NotificationCenter).toBe('function');
  });
});
