import { describe, expect, it, vi } from 'vitest';
import { createOptionsStateManager } from '@options/state/StateManager';

describe('OptionsStateManager', () => {
  it('does not notify subscribers when state is structurally unchanged', () => {
    const manager = createOptionsStateManager();
    const listener = vi.fn();

    manager.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    manager.setState({ activeSection: null });
    manager.setState({ mountedSections: {} });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies once when complex slices actually change', () => {
    const manager = createOptionsStateManager();
    const listener = vi.fn();

    manager.subscribe(listener);
    listener.mockClear();

    manager.setState({
      options: { rest: { baseUrl: 'https://example.com/' } },
      usage: null
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const [snapshot] = listener.mock.calls[0] as [
      { options: { rest?: { baseUrl?: string } } | null }
    ];
    expect(snapshot.options?.rest?.baseUrl).toBe('https://example.com/');
  });
});
