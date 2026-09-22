import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingScreen from '../LandingScreen';
import type { Campaign, SearchTarget, Listing } from '../../types';

describe('LandingScreen P3 Surface', () => {
  const mockCampaigns: Campaign[] = [
    { id: 1, name: 'Laptops', route_id: null },
    { id: 3, name: 'Kleiderschrank', route_id: 2 },
    { id: 5, name: 'Matratze', route_id: 3 },
  ];

  const mockSearches: SearchTarget[] = [
    {
      id: 1,
      campaign_id: 1,
      name: 'muenchen',
      url: 'https://www.kleinanzeigen.de/s-notebooks/muenchen/preis::450/laptop/k0c278l6411',
      enabled: true,
      knowledge_set_id: null,
    },
    {
      id: 4,
      campaign_id: 3,
      name: 'kleiderschrank: Landsberg → Konstanz · 1/5 86899 Landsberg (Lech)',
      url: 'https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:100/kleiderschrank/k0l7091r31',
      enabled: true,
      knowledge_set_id: null,
    },
    {
      id: 6,
      campaign_id: 5,
      name: 'matratze: Landsberg → Konstanz · 1/5 86899 Landsberg (Lech)',
      url: 'https://www.kleinanzeigen.de/s-landsberg-lech/matratze/k0l6411r25',
      enabled: true,
      knowledge_set_id: null,
    },
  ];

  const mockListings: Listing[] = [
    {
      id: 'L1',
      title: 'ThinkPad T480s',
      price: '250 €',
      location: 'München',
      url: 'https://example.com/1',
      short_description: '',
      detailed_description: '',
      extracted_facts: {},
      status: 'New',
      search_id: 1,
      llm_processed: false,
      images: ['https://example.com/laptop.jpg'],
      first_seen_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
    {
      id: 'L2',
      title: 'Ikea Brimnes',
      price: '60 €',
      location: 'Landsberg (Lech)',
      url: 'https://example.com/2',
      short_description: '',
      detailed_description: '',
      extracted_facts: {},
      status: 'New',
      search_id: 4,
      llm_processed: false,
      images: ['https://example.com/wardrobe.jpg'],
      first_seen_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    },
    {
      id: 'L3',
      title: 'Federkernmatratze',
      price: '90 €',
      location: 'Landsberg',
      url: 'https://example.com/3',
      short_description: '',
      detailed_description: '',
      extracted_facts: {},
      status: 'New',
      search_id: 6,
      llm_processed: false,
      images: ['https://example.com/matratze.jpg'],
      first_seen_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
  ];

  it('renders sticky bar with title and create button', () => {
    const handleCreate = vi.fn();
    render(
      <LandingScreen
        campaigns={mockCampaigns}
        searches={mockSearches}
        listings={mockListings}
        onOpenCampaign={vi.fn()}
        onCreateCampaign={handleCreate}
        onOpenKept={vi.fn()}
        onOpenApp={vi.fn()}
      />
    );

    expect(screen.getByTestId('surface-bar')).toBeInTheDocument();
    expect(screen.getByText(/Suchen|Searches/)).toBeInTheDocument();

    const createBtn = screen.getByTestId('create-campaign-btn');
    fireEvent.click(createBtn);
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('renders search rows for each campaign and triggers onOpenCampaign on click', () => {
    const handleOpen = vi.fn();
    render(
      <LandingScreen
        campaigns={mockCampaigns}
        searches={mockSearches}
        listings={mockListings}
        onOpenCampaign={handleOpen}
        onCreateCampaign={vi.fn()}
        onOpenKept={vi.fn()}
        onOpenApp={vi.fn()}
      />
    );

    expect(screen.getByText('Laptops')).toBeInTheDocument();
    expect(screen.getByText('Kleiderschrank')).toBeInTheDocument();
    expect(screen.getByText('Matratze')).toBeInTheDocument();

    const laptopRow = screen.getByTestId('campaign-card-1');
    fireEvent.click(laptopRow);
    expect(handleOpen).toHaveBeenCalledWith(mockCampaigns[0]);
  });

  it('renders single-line EmptyLine when there are no campaigns', () => {
    const handleCreate = vi.fn();
    render(
      <LandingScreen
        campaigns={[]}
        searches={[]}
        listings={[]}
        onOpenCampaign={vi.fn()}
        onCreateCampaign={handleCreate}
        onOpenKept={vi.fn()}
        onOpenApp={vi.fn()}
      />
    );

    expect(screen.getByTestId('surface-empty-line')).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Suche|No searches yet/)).toBeInTheDocument();

    const emptyCreateBtn = screen.getByTestId('create-campaign-empty-btn');
    fireEvent.click(emptyCreateBtn);
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('does NOT contain the words "Search Profile" or coral color anywhere', () => {
    const { container } = render(
      <LandingScreen
        campaigns={mockCampaigns}
        searches={mockSearches}
        listings={mockListings}
        onOpenCampaign={vi.fn()}
        onCreateCampaign={vi.fn()}
        onOpenKept={vi.fn()}
        onOpenApp={vi.fn()}
      />
    );

    expect(screen.queryByText(/Search Profile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suchprofil/i)).not.toBeInTheDocument();

    const html = container.innerHTML;
    expect(html).not.toContain('#E87967');
    expect(html).not.toContain('text-brand-accent');
    expect(html).not.toContain('bg-brand-accent');
  });
});
