import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../hooks/useTranslation';
import type { RouteListingGeo } from '../types';
export type { RouteListingGeo };

export interface RouteCorridorMapProps {
  /** A corridor's road; none for a hunt around one town. */
  polyline?: [number, number][];
  listings: RouteListingGeo[];
  selectedListingId: string | null;
  onSelectListing: (id: string) => void;
  originName?: string;
  destinationName?: string;
  className?: string;
}

const NO_ROAD: [number, number][] = [];

// Fits the view to the route or the pins -- once per new shape. Fitting on
// every render snapped a zoomed-in map back whenever the page re-rendered.
function MapBoundsFitter({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    map.invalidateSize();
    const key = bounds && bounds.isValid() ? bounds.toBBoxString() : null;
    if (bounds && key && key !== fitted.current) {
      fitted.current = key;
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map, bounds]);
  return null;
}

// One icon per look, reused: a new DivIcon each render replaced the marker's DOM.
const iconCache = new Map<string, L.DivIcon>();
function cached(key: string, make: () => L.DivIcon): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = make();
    iconCache.set(key, icon);
  }
  return icon;
}

// 8px dot for unselected listing with 32x32 touch target
function createDotIcon(detourMin: number | null) {
  const label = detourMin !== null ? (detourMin < 1 ? 'on route' : `+${Math.round(detourMin)}m`) : '';
  return cached(`dot:${label}`, () => L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 group" title="${label}"><div class="w-2.5 h-2.5 rounded-full bg-[#4E8C6A] ring-2 ring-[#011F1F] shadow-md group-hover:scale-150 transition-all duration-150"></div></div>`,
    className: 'prism-listing-marker-dot',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  }));
}

// Selected listing marker: pill with detour info
function createSelectedPillIcon(detourMin: number | null) {
  const text = detourMin !== null ? (detourMin < 1 ? 'on route' : `+${Math.round(detourMin)}m`) : '•';
  return L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-50"><div class="px-2.5 py-1 rounded text-xs shadow-2xl flex items-center gap-1.5 whitespace-nowrap bg-[#4E8C6A] text-[#011F1F] ring-4 ring-[#4E8C6A]/40 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-[#011F1F]"></span><span>${text}</span></div></div>`,
    className: 'prism-listing-marker-pill',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Cluster marker showing count for overlapping listings
function createClusterIcon(count: number) {
  const size = count >= 10 ? 'w-7 h-7 text-xs' : 'w-6 h-6 text-2xs';
  return cached(`cluster:${count}`, () => L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"><div class="${size} rounded-full bg-[#4E8C6A] text-[#011F1F] font-bold shadow-lg flex items-center justify-center border-2 border-[#011F1F] hover:opacity-90 hover:scale-110 transition-all">${count}</div></div>`,
    className: 'prism-listing-marker-cluster',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  }));
}

function createEndpointIcon(label: string, isStart: boolean) {
  const bgClass = isStart ? 'bg-[#4E8C6A] text-[#011F1F]' : 'bg-[#06322C] text-[#F2F5F4] border-2 border-[#4E8C6A]';
  return L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"><div class="w-6 h-6 rounded-full ${bgClass} font-bold text-2xs shadow-lg flex items-center justify-center">${label}</div></div>`,
    className: 'prism-endpoint-marker',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Subcomponent managing zoom-aware clustering within MapContainer
function ListingClusterMarkers({
  listings,
  selectedListingId,
  onSelectListing,
}: {
  listings: RouteListingGeo[];
  selectedListingId: string | null;
  onSelectListing: (id: string) => void;
}) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const handleMoveOrZoom = () => {
      setCurrentZoom(map.getZoom());
    };
    // Clusters depend on the zoom only. Recomputing on every pan made a
    // zoomed-in map stutter.
    map.on('zoomend', handleMoveOrZoom);
    return () => {
      map.off('zoomend', handleMoveOrZoom);
    };
  }, [map]);

  const selectedListing = useMemo(() => {
    if (!selectedListingId) return null;
    return listings.find((l) => l.id === selectedListingId && typeof l.lat === 'number' && typeof l.lon === 'number') ?? null;
  }, [listings, selectedListingId]);

  const otherListings = useMemo(() => {
    return listings.filter((l) => typeof l.lat === 'number' && typeof l.lon === 'number' && l.id !== selectedListingId);
  }, [listings, selectedListingId]);

  const clusters = useMemo(() => {
    const CLUSTER_DISTANCE_PX = 32;
    // The centre's screen point is kept on the cluster and moved with it,
    // instead of projected again for every comparison.
    type Cluster = {
      key: string;
      centerLat: number;
      centerLon: number;
      x: number;
      y: number;
      items: RouteListingGeo[];
    };
    const list: Cluster[] = [];

    for (const item of otherListings) {
      const pt = map.project([item.lat!, item.lon!], currentZoom);
      const cluster = list.find((c) => Math.hypot(pt.x - c.x, pt.y - c.y) < CLUSTER_DISTANCE_PX);
      if (cluster) {
        cluster.items.push(item);
        const n = cluster.items.length;
        cluster.centerLat = (cluster.centerLat * (n - 1) + item.lat!) / n;
        cluster.centerLon = (cluster.centerLon * (n - 1) + item.lon!) / n;
        cluster.x = (cluster.x * (n - 1) + pt.x) / n;
        cluster.y = (cluster.y * (n - 1) + pt.y) / n;
      } else {
        list.push({
          key: `cluster-${item.id}`,
          centerLat: item.lat!,
          centerLon: item.lon!,
          x: pt.x,
          y: pt.y,
          items: [item],
        });
      }
    }
    return list;
  }, [otherListings, currentZoom, map]);

  return (
    <>
      {/* Selected Listing Pill */}
      {selectedListing && typeof selectedListing.lat === 'number' && typeof selectedListing.lon === 'number' && (
        <Marker
          key={`selected-${selectedListing.id}`}
          position={[selectedListing.lat, selectedListing.lon]}
          icon={createSelectedPillIcon(selectedListing.detour_min ?? null)}
          zIndexOffset={1000}
          eventHandlers={{
            click: () => onSelectListing(selectedListing.id),
          }}
        />
      )}

      {/* Unselected Clusters and Dots */}
      {clusters.map((cluster) => {
        if (cluster.items.length === 1) {
          const item = cluster.items[0];
          return (
            <Marker
              key={`item-${item.id}`}
              position={[item.lat!, item.lon!]}
              icon={createDotIcon(item.detour_min ?? null)}
              eventHandlers={{
                click: () => onSelectListing(item.id),
              }}
            />
          );
        }

        // A number opens the offers it stands for. Zooming never split two
        // listings from the same postal code: they share one point.
        return (
          <Marker
            key={cluster.key}
            position={[cluster.centerLat, cluster.centerLon]}
            icon={createClusterIcon(cluster.items.length)}
            zIndexOffset={500}
          >
            <Popup className="prism-cluster-popup" maxWidth={280} minWidth={220}>
              <ul className="cluster-list" data-testid="cluster-list">
                {cluster.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        map.closePopup();
                        onSelectListing(item.id);
                      }}
                    >
                      {item.images && item.images[0] ? (
                        <img src={item.images[0]} alt="" loading="lazy" />
                      ) : (
                        <span className="cluster-noimg" />
                      )}
                      <span className="cluster-title">{item.title}</span>
                      <span className="cluster-price num">{item.price}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function RouteCorridorMap({
  polyline = NO_ROAD,
  listings,
  selectedListingId,
  onSelectListing,
  originName,
  destinationName,
  className = '',
}: RouteCorridorMapProps) {
  const { t } = useTranslation();

  // Compute total map bounds
  const bounds = useMemo(() => {
    const latLngs: L.LatLngExpression[] = [];

    // The road is the shape of a corridor; without one, the pins are.
    if (polyline.length > 0) {
      polyline.forEach(([lat, lon]) => latLngs.push([lat, lon]));
    } else {
      listings.forEach((l) => {
        if (typeof l.lat === 'number' && typeof l.lon === 'number') latLngs.push([l.lat, l.lon]);
      });
    }

    if (latLngs.length === 0) return null;
    return L.latLngBounds(latLngs);
  }, [polyline, listings]);

  const defaultCenter: [number, number] = polyline.length > 0
    ? polyline[Math.floor(polyline.length / 2)]
    : [48.137, 11.576];

  const startPoint = polyline.length > 0 ? polyline[0] : null;
  const endPoint = polyline.length > 1 ? polyline[polyline.length - 1] : null;

  return (
    <div
      data-testid="route-corridor-map-container"
      className={`w-full h-full min-h-[300px] relative isolate bg-[#011F1F] overflow-hidden ${className}`}
    >
      <MapContainer
        center={defaultCenter}
        zoom={9}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
        className="w-full h-full min-h-[300px] z-10"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsFitter bounds={bounds} />

        {/* Route Polyline */}
        {polyline.length > 1 && (
          <Polyline
            positions={polyline}
            pathOptions={{
              color: '#4E8C6A',
              weight: 4,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Origin and Destination Pin Markers */}
        {startPoint && (
          <Marker position={startPoint} icon={createEndpointIcon('A', true)}>
            <Popup>
              <div className="text-xs font-sans text-[#8FA6A1]">
                <span className="font-bold text-[#4E8C6A] block">
                  {t('routeResults.originPin', { place: originName || 'Start' })}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {endPoint && (
          <Marker position={endPoint} icon={createEndpointIcon('B', false)}>
            <Popup>
              <div className="text-xs font-sans text-[#8FA6A1]">
                <span className="font-bold text-[#F2F5F4] block">
                  {t('routeResults.destinationPin', { place: destinationName || 'Destination' })}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Clustered and Dot Listing Markers */}
        <ListingClusterMarkers
          listings={listings}
          selectedListingId={selectedListingId}
          onSelectListing={onSelectListing}
        />
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-[#06322C]/90 backdrop-blur-md border border-[#0E4A40] rounded px-3 py-1.5 flex items-center gap-3 text-2xs font-semibold text-[#8FA6A1] pointer-events-none shadow-md">
        {polyline.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#4E8C6A] rounded-full" />
            <span>{t('routeResults.legendRoute')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4E8C6A] ring-1 ring-[#011F1F]" />
          <span>{t('routeResults.legendListing')}</span>
        </div>
      </div>
    </div>
  );
}
