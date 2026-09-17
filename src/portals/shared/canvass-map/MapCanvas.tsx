// src/portals/shared/canvass-map/MapCanvas.tsx
// The one place that knows which map library we use (spec B6: keep the switch
// small). Today: MapLibre GL with OpenFreeMap tiles, and deck.gl drawing every
// house, cluster and hail square in one WebGL layer, never one marker per house.
// Swapping the base map means changing this file and nothing else.
//
// Browser only: it is loaded with next/dynamic and ssr: false by CanvassMap.

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre"; // the overlay built for MapLibre v4.5+, not the Mapbox one
import { PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Cluster, MapHailCell, MapHome, Bbox } from "../../../lib/canvass/query";
import {
  DOT_RGB,
  KNOCKED_RING_RGB,
  MAP_STYLE_URL,
  SELECTED_RING_RGB,
  START_VIEW,
  boundsToBbox,
  clusterRadiusMeters,
  clusterRgba,
  hailRgba,
  hailSquare,
} from "../../../lib/canvass/mapView";

// MapLibre finds its web worker with new URL("./maplibre-gl-worker.mjs", import.meta.url)
// inside its own module. Under Next's bundler that address is a hashed chunk, so the
// worker file 404s silently, the style never finishes loading, and no tiles are ever
// drawn (found 17 Sep 2026: isStyleLoaded false, one worker, zero features). The
// worker also imports a sibling file, so the app serves both from one small route,
// pages/api/canvass/map-worker/[file].ts, straight out of the installed package.
maplibregl.setWorkerUrl("/api/canvass/map-worker/maplibre-gl-worker.mjs");

export type MapCanvasProps = {
  homes: MapHome[];
  clusters: Cluster[];
  /** The grid cell size the clusters were counted in, in degrees. */
  clusterCellDegrees: number;
  hail: MapHailCell[];
  selectedId: string | null;
  onViewChange: (bbox: Bbox, zoom: number) => void;
  onSelectHome: (id: string | null) => void;
};

export default function MapCanvas({ homes, clusters, clusterCellDegrees, hail, selectedId, onViewChange, onSelectHome }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapLibreOverlay | null>(null);
  // The latest callbacks, so the map's own listeners never go stale.
  const callbacks = useRef({ onViewChange, onSelectHome });
  callbacks.current = { onViewChange, onSelectHome };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [START_VIEW.longitude, START_VIEW.latitude],
      zoom: START_VIEW.zoom,
      attributionControl: {}, // OpenFreeMap requires attribution; MapLibre draws it from the style
    });
    // Top-left: the house card opens on the right and must not cover the zoom buttons.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-left");
    // pickingRadius: a finger or a mouse a few pixels off a dot still opens its card.
    const overlay = new MapLibreOverlay({ interleaved: false, layers: [], pickingRadius: 8 });
    map.addControl(overlay);
    const report = () => {
      const b = map.getBounds();
      callbacks.current.onViewChange(boundsToBbox(b.getSouthWest(), b.getNorthEast()), map.getZoom());
    };
    map.on("load", report);
    map.on("moveend", report);
    mapRef.current = map;
    overlayRef.current = overlay;
    // Development only: lets a browser test ask the map whether it is loaded.
    if (process.env.NODE_ENV === "development") {
      const w = window as unknown as { __canvassMap?: maplibregl.Map; __canvassMapWorkerUrl?: string };
      w.__canvassMap = map;
      w.__canvassMapWorkerUrl = maplibregl.getWorkerUrl();
    }
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.setProps({
      layers: [
        new PolygonLayer<MapHailCell>({
          id: "hail",
          data: hail,
          getPolygon: (cell) => hailSquare(cell), // the radar's own 1 km squares, not circles
          getFillColor: (cell) => hailRgba(cell.inches),
          filled: true,
          stroked: false,
          pickable: false,
        }),
        new ScatterplotLayer<Cluster>({
          id: "clusters",
          data: clusters,
          getPosition: (cluster) => [cluster.lng, cluster.lat],
          getFillColor: (cluster) => clusterRgba(cluster.count, cluster.green),
          getRadius: (cluster) => clusterRadiusMeters(cluster.count, clusterCellDegrees),
          radiusUnits: "meters",
          stroked: false,
          pickable: false,
        }),
        new ScatterplotLayer<MapHome>({
          id: "homes",
          data: homes,
          getPosition: (home) => [home.lng, home.lat],
          getFillColor: (home) => DOT_RGB[home.color],
          getRadius: 6,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 9,
          stroked: true,
          getLineColor: (home) => (home.id === selectedId ? SELECTED_RING_RGB : home.knocked ? KNOCKED_RING_RGB : [0, 0, 0, 0]),
          getLineWidth: (home) => (home.id === selectedId ? 3 : home.knocked ? 2 : 0),
          lineWidthUnits: "pixels",
          pickable: true,
          onClick: (info) => {
            callbacks.current.onSelectHome(info.object ? info.object.id : null);
            return true;
          },
          updateTriggers: { getLineColor: [selectedId], getLineWidth: [selectedId] },
        }),
      ],
      getCursor: ({ isHovering }: { isHovering: boolean }) => (isHovering ? "pointer" : "grab"),
    });
  }, [homes, clusters, clusterCellDegrees, hail, selectedId]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="Map of houses" />;
}
