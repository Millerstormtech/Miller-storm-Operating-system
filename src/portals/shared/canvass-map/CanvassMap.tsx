// src/portals/shared/canvass-map/CanvassMap.tsx
// The Canvass Map screen (spec A3): a map of houses coloured by how good a door
// they are, a card per house, filters, a legend, and a freshness line. Shared by
// every role's page shell. It fetches only from /api/canvass/*, which decide
// what a caller may see; nothing here sorts, filters or grades on its own.
//
// The map library lives in MapCanvas.tsx alone, loaded in the browser only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Bbox, Cluster, MapHailCell, MapHome } from "../../../lib/canvass/query";
import { CLUSTER_CELLS, clusterCellSize } from "../../../lib/canvass/query";
import { DEFAULT_FILTERS, canRequestHouses, hailUrl, homesUrl, type FilterState } from "../../../lib/canvass/mapView";
import { centralDay, monthsBefore } from "../../../lib/canvass/dates";
import { GRADE } from "../../../lib/canvass/config";
import type { HouseCard as HouseCardData } from "../../../lib/canvass/card";
import { HouseCard } from "./HouseCard";
import { Filters } from "./Filters";
import { Legend } from "./Legend";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)", fontSize: 13 }}>
      Loading map...
    </div>
  ),
});

type Status = {
  hail: { lastStormDay: string | null; loadedAt: string | null };
  doors: { loadedAt: string | null };
  jobs: { loadedAt: string | null };
  parcels: { importedAt: string | null };
  gradedOn: string | null;
};

const panel: React.CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
};

export function CanvassMap() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [homes, setHomes] = useState<MapHome[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [hail, setHail] = useState<MapHailCell[]>([]);
  const [tooMany, setTooMany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [card, setCard] = useState<HouseCardData | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const today = useMemo(() => centralDay(new Date()) ?? "", []);
  // The hail layer shows the same window the grade looks at, unless the rep picked a later day.
  const hailSince = filters.hailSince ?? monthsBefore(today, GRADE.hailLookbackMonths);
  const tooWide = view !== null && !canRequestHouses(view.bbox);

  const onViewChange = useCallback((bbox: Bbox, zoom: number) => setView({ bbox, zoom }), []);

  useEffect(() => {
    fetch("/api/canvass/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStatus(data))
      .catch(() => {});
  }, []);

  // Houses and hail for the view, a moment after the map stops moving.
  useEffect(() => {
    if (!view) return;
    if (tooWide) {
      setHomes([]);
      setClusters([]);
      setHail([]);
      setTooMany(false);
      return;
    }
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setLoading(true);
      setError(null);
      try {
        const [homesRes, hailRes] = await Promise.all([
          fetch(homesUrl(view.bbox, filters), { signal: controller.signal }),
          filters.showHail ? fetch(hailUrl(view.bbox, hailSince), { signal: controller.signal }) : Promise.resolve(null),
        ]);
        if (!homesRes.ok) throw new Error((await homesRes.json().catch(() => ({}))).error || `The map could not load houses (${homesRes.status}).`);
        const data = await homesRes.json();
        if (data.tooMany) {
          setTooMany(true);
          setClusters(data.clusters ?? []);
          setHomes([]);
        } else {
          setTooMany(false);
          setHomes(data.homes ?? []);
          setClusters([]);
        }
        if (hailRes) setHail(hailRes.ok ? (await hailRes.json()).cells ?? [] : []);
        else setHail([]);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (inFlight.current === controller) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [view, filters, hailSince, tooWide]);

  // The card for the tapped house.
  useEffect(() => {
    if (!selectedId) {
      setCard(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/canvass/homes/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setCard(data))
      .catch(() => !cancelled && setCard(null));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const clusterCellDegrees = view ? clusterCellSize(view.bbox, CLUSTER_CELLS) : 0.01;
  const hint = tooWide
    ? "Zoom in to see houses."
    : tooMany
      ? "Shaded areas show where the houses are. Zoom in to see each one."
      : loading
        ? "Loading..."
        : homes.length === 0 && view
          ? "No houses in this view with these filters."
          : `${homes.length.toLocaleString()} houses in view`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100vh - 170px)", minHeight: 480 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{hint}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setFiltersOpen((open) => !open)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-default)", background: filtersOpen ? "var(--surface-subtle)" : "var(--surface-default)", color: "var(--text-primary)", cursor: "pointer", fontSize: 13 }}>
          Filters
        </button>
      </div>

      {filtersOpen && (
        <div style={{ ...panel, padding: 12 }}>
          <Filters value={filters} onChange={setFilters} today={today} />
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: "8px 12px", borderRadius: 8, background: "var(--surface-subtle)", color: "var(--ms-red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, minHeight: 360, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-default)" }}>
        <MapCanvas homes={homes} clusters={clusters} clusterCellDegrees={clusterCellDegrees} hail={hail} selectedId={selectedId} onViewChange={onViewChange} onSelectHome={setSelectedId} />
        <div style={{ position: "absolute", left: 10, bottom: 28, maxWidth: "min(320px, calc(100% - 20px))" }}>
          <Legend />
        </div>
        {card && (
          <div style={{ position: "absolute", right: 10, top: 10, bottom: 28, width: "min(360px, calc(100% - 20px))", overflowY: "auto", ...panel }}>
            <HouseCard card={card} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      <div style={{ color: "var(--text-subtle)", fontSize: 12 }}>
        {status
          ? `Hail to ${status.hail.lastStormDay ?? "unknown"}. Doors ${dayOf(status.doors.loadedAt)}, jobs ${dayOf(status.jobs.loadedAt)}, houses ${dayOf(status.parcels.importedAt)}. Colours worked out for ${status.gradedOn ?? "unknown"}.`
          : "Checking data freshness..."}
      </div>
    </div>
  );
}

function dayOf(value: string | null): string {
  if (!value) return "unknown";
  return centralDay(value) ?? "unknown";
}
