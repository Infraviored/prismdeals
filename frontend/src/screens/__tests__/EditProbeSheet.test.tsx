import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditProbeSheet from '../EditProbeSheet';

describe('EditProbeSheet', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('launches probe on open and displays market picture container', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    });

    render(
      <EditProbeSheet
        isOpen={true}
        onClose={vi.fn()}
        terms={[{ term: 'thinkpad-t14', label: 'ThinkPad T14', enabled: true }]}
        locationId="6441"
        radius={30}
        maxPrice={800}
        categoryId="278"
      />
    );

    expect(screen.getByTestId('market-picture-container')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/probe',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
