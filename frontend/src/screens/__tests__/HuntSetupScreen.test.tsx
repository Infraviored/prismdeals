import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HuntSetupScreen from '../HuntSetupScreen';

describe('HuntSetupScreen', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('runs through the setup wizard flow: Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Save', async () => {
    const handleSaved = vi.fn();
    const handleBack = vi.fn();

    // Mock backend responses
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/intent/parse') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              hunt_type: 'features',
              musts: [{ id: 'ram', label: '32 GB' }],
              prefs: [{ id: 'screen', label: 'OLED' }],
              budget: { min: null, max: 800 },
              models: ['ThinkPad T14'],
            }),
        });
      }
      if (url === '/api/probe') {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: rung\ndata: {"term":"oled-laptop","label":"oled laptop","source":"seed","total":45,"sampled":20,"likely":15,"unclear":2,"no":3,"new_likely":15,"gain":0.75,"overlap":0.0,"likely_share":0.33,"kept":true,"prices":[700]}\n\n` +
                `event: result\ndata: {"rungs":[{"term":"oled-laptop","label":"oled laptop","source":"seed","total":45,"sampled":20,"likely":15,"unclear":2,"no":3,"new_likely":15,"gain":0.75,"overlap":0.0,"likely_share":0.33,"kept":true,"prices":[700]}],"chosen_terms":["oled laptop"],"estimate":{"union_likely":15,"union_unclear":2,"median_price":700},"per_budget":[{"max":800,"likely":15}],"relax":[],"models_seen":[],"requests":2,"seconds":1.2,"partial":false}\n\n` +
                `event: done\ndata: {"code":0}\n\n`
              )
            );
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }
      if (url === '/api/campaigns') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, id: 202 }),
        });
      }
      if (url === '/api/search-families') {
        // As the real endpoint answers: the family, no campaign.
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 55 }),
        });
      }
      if (url.startsWith('/api/campaigns/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (url === '/api/scraper/start') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ started: true }),
        });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<HuntSetupScreen onBack={handleBack} onSaved={handleSaved} />);

    // --- Step 1: Input text ---
    const input = screen.getByTestId('hunt-intent-input');
    fireEvent.change(input, { target: { value: 'ThinkPad mit 32 GB OLED unter 800 Euro' } });
    fireEvent.click(screen.getByTestId('hunt-step1-next-btn'));

    // Wait for intent parsing to complete and arrive at Step 2
    await waitFor(() => {
      expect(screen.getByTestId('hunt-type-features')).toBeInTheDocument();
    });

    // --- Step 2: Confirm hunt type ---
    fireEvent.click(screen.getByTestId('hunt-step2-next-btn'));

    // --- Step 3: Type details ---
    await waitFor(() => {
      expect(screen.getByText('32 GB')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('hunt-step3-next-btn'));

    // --- Step 4: Location / Price ---
    await waitFor(() => {
      expect(screen.getByTestId('hunt-step4-next-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('hunt-step4-next-btn'));

    // --- Step 5: Market Picture ---
    await waitFor(() => {
      expect(screen.getByTestId('market-hero-likely-count')).toBeInTheDocument();
    });

    // Save hunt
    const saveBtn = screen.getByTestId('hunt-save-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSaved).toHaveBeenCalledWith({
        campaignId: 202,
        familyId: 55,
      });
    });
  });

  it('skips Step 3 when exact hunt type is chosen', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/intent/parse') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              hunt_type: 'exact',
              musts: [],
              prefs: [],
              budget: null,
              models: ['ThinkPad T14'],
            }),
        });
      }
      if (url === '/api/probe') {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<HuntSetupScreen onBack={vi.fn()} onSaved={vi.fn()} />);

    // Step 1
    const input = screen.getByTestId('hunt-intent-input');
    fireEvent.change(input, { target: { value: 'ThinkPad T14 Gen 3' } });
    fireEvent.click(screen.getByTestId('hunt-step1-next-btn'));

    // Step 2
    await waitFor(() => {
      expect(screen.getByTestId('hunt-type-exact')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('hunt-type-exact'));
    fireEvent.click(screen.getByTestId('hunt-step2-next-btn'));

    // Skips Step 3 and lands directly on Step 4 (location/price)
    await waitFor(() => {
      expect(screen.getByTestId('hunt-step4-next-btn')).toBeInTheDocument();
    });
  });
});
