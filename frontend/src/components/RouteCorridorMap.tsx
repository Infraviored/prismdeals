import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../hooks/useTranslation';
import type { RouteCircle, RouteListingGeo } from '../types';
export type { RouteCircle, RouteListingGeo };

export interface RouteCorridorMapProps {
  polyline: [number, number][];
  circles: RouteCircle[];
  listings: RouteListingGeo[];
  selectedListingId: string | null;
  onSelectListing: (id: string) => void;
  onSelectCluster?: (listingIds: string[]) => void;
  originName?: string;
  destinationName?: string;
  className?: string;
}

// Automatically fit map view to the bounds of the route, circles, and listings
function MapBoundsFitter({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map, bounds]);
  return null;
}

// 8px dot for unselected listing with 32x32 touch target
function createDotIcon(detourMin: number | null) {
  const label = detourMin !== null ? (detourMin < 1 ? 'on route' : `+${Math.round(detourMin)}m`) : '';
  return L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 group" title="${label}"><div class="w-2.5 h-2.5 rounded-full bg-[#4E8C6A] ring-2 ring-[#011F1F] shadow-md group-hover:scale-150 transition-all duration-150"></div></div>`,
    className: 'prism-listing-marker-dot',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
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
  return L.divIcon({
    html: `<div class="cursor-pointer -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"><div class="${size} rounded-full bg-[#4E8C6A] text-[#011F1F] font-bold shadow-lg flex items-center justify-center border-2 border-[#011F1F] hover:opacity-90 hover:scale-110 transition-all">${count}</div></div>`,
    className: 'prism-listing-marker-cluster',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
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
  onSelectCluster,
}: {
  listings: RouteListingGeo[];
  selectedListingId: string | null;
  onSelectListing: (id: string) => void;
  onSelectCluster?: (listingIds: string[]) => void;
}) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const handleMoveOrZoom = () => {
      setCurrentZoom(map.getZoom());
    };
    map.on('zoomend', handleMoveOrZoom);
    map.on('moveend', handleMoveOrZoom);
    return () => {
      map.off('zoomend', handleMoveOrZoom);
      map.off('moveend', handleMoveOrZoom);
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
    type Cluster = {
      key: string;
      centerLat: number;
      centerLon: number;
      items: RouteListingGeo[];
    };
    const list: Cluster[] = [];

    for (const item of otherListings) {
      const pt = map.project([item.lat!, item.lon!], currentZoom);
      let joined = false;
      for (const cluster of list) {
        const clusterPt = map.project([cluster.centerLat, cluster.centerLon], currentZoom);
        if (Math.hypot(pt.x - clusterPt.x, pt.y - clusterPt.y) < CLUSTER_DISTANCE_PX) {
          cluster.items.push(item);
          const n = cluster.items.length;
          cluster.centerLat = (cluster.centerLat * (n - 1) + item.lat!) / n;
          cluster.centerLon = (cluster.centerLon * (n - 1) + item.lon!) / n;
          joined = true;
          break;
        }
      }
      if (!joined) {
        list.push({
          key: `cluster-${item.id}`,
          centerLat: item.lat!,
          centerLon: item.lon!,
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

        return (
          <Marker
            key={cluster.key}
            position={[cluster.centerLat, cluster.centerLon]}
            icon={createClusterIcon(cluster.items.length)}
            zIndexOffset={500}
            eventHandlers={{
              click: () => {
                map.setView(
                  [cluster.centerLat, cluster.centerLon],
                  Math.min(map.getZoom() + 2, 15)
                );
                onSelectCluster?.(cluster.items.map((i) => i.id));
              },
            }}
          />
        );
      })}
    </>
  );
}

export default function RouteCorridorMap({
  polyline,
  circles,
  listings,
  selectedListingId,
  onSelectListing,
  onSelectCluster,
  originName,
  destinationName,
  className = '',
}: RouteCorridorMapProps) {
  const { t } = useTranslation();

  // Compute total map bounds
  const bounds = useMemo(() => {
    const latLngs: L.LatLngExpression[] = [];

    (polyline || []).forEach(([lat, lon]) => {
      latLngs.push([lat, lon]);
    });

    (circles || []).forEach((circle) => {
      if (circle.lat !== null && circle.lon !== null) {
        latLngs.push([circle.lat, circle.lon]);
      }
    });

    // Without a route the pins are the shape: a town search has one circle
    // and its finds, some of them outside it.
    if (!polyline || polyline.length === 0) {
      (listings || []).forEach((l) => {
        if (typeof l.lat === 'number' && typeof l.lon === 'number') latLngs.push([l.lat, l.lon]);
      });
    }

    if (latLngs.length === 0) return null;
    return L.latLngBounds(latLngs);
  }, [polyline, circles, listings]);

  const defaultCenter: [number, number] = polyline.length > 0
    ? polyline[Math.floor(polyline.length / 2)]
    : [48.137, 11.576];

  const startPoint = polyline.length > 0 ? polyline[0] : null;
  const endPoint = polyline.length > 1 ? polyline[polyline.length - 1] : null;

  return (
    <div
      data-testid="route-corridor-map-container"
      className={`w-full h-full min-h-[300px] relative bg-[#011F1F] overflow-hidden ${className}`}
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

        {/* Search Circles */}
        {circles.map((circle, index) => {
          if (circle.lat === null || circle.lon === null) return null;
          return (
            <Circle
              key={`circle-${circle.postal_code || circle.label || index}`}
              center={[circle.lat, circle.lon]}
              radius={circle.radius_km * 1000}
              pathOptions={{
                color: '#4E8C6A',
                fillColor: '#4E8C6A',
                fillOpacity: 0.08,
                weight: 1.5,
                dashArray: '6, 6',
              }}
            >
              <Popup>
                <div className="text-xs font-sans text-[#8FA6A1] space-y-1">
                  <div className="font-bold text-[#4E8C6A]">
                    {t('routeResults.legendSearchArea')} #{index + 1}
                  </div>
                  <div className="font-semibold text-[#F2F5F4]">{circle.label || ''}</div>
                  <div className="text-2xs text-[#8FA6A1]">
                    {t('routeResults.circlePopup', { label: circle.label || '', radius: circle.radius_km })}
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

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
          onSelectCluster={onSelectCluster}
        />
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-[#06322C]/90 backdrop-blur-md border border-[#0E4A40] rounded px-3 py-1.5 flex items-center gap-3 text-2xs font-semibold text-[#8FA6A1] pointer-events-none shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 bg-[#4E8C6A] rounded-full" />
          <span>{t('routeResults.legendRoute')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[#4E8C6A]/60 bg-[#4E8C6A]/10" />
          <span>{t('routeResults.legendSearchArea')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4E8C6A] ring-1 ring-[#011F1F]" />
          <span>{t('routeResults.legendListing')}</span>
        </div>
      </div>
    </div>
  );
}
