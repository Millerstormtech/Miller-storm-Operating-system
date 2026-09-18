// src/lib/canvass/geometry.ts
// One map point for a parcel outline, so every house can be a single dot.
//
// Parcels are small, so treating longitude and latitude as flat x and y is
// accurate to well under a metre. Coordinates are shifted to start at zero
// before the area sums, because multiplying numbers around -102 and 33 loses
// the precision a lot this size needs.
//
// Pure: no DB, no network.

export type Position = [number, number];

export type PolygonGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

/** Area (unsigned) and area-weighted center of one ring, or the average corner when it has no area. */
function ringCenter(ring: Position[]): { area: number; point: Position } | null {
  const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (points.length === 0) return null;

  const [ox, oy] = points[0];
  let doubleArea = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < points.length; i++) {
    const x0 = points[i][0] - ox;
    const y0 = points[i][1] - oy;
    const x1 = points[(i + 1) % points.length][0] - ox;
    const y1 = points[(i + 1) % points.length][1] - oy;
    const cross = x0 * y1 - x1 * y0;
    doubleArea += cross;
    sx += (x0 + x1) * cross;
    sy += (y0 + y1) * cross;
  }

  if (Math.abs(doubleArea) < 1e-18) {
    const avgX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const avgY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    return { area: 0, point: [avgX, avgY] };
  }
  return { area: Math.abs(doubleArea) / 2, point: [ox + sx / (3 * doubleArea), oy + sy / (3 * doubleArea)] };
}

/**
 * The area-weighted center of the parcel's outline. For a parcel made of
 * several separate pieces, the center of the biggest piece. Holes are ignored:
 * they barely move the point for a house lot. Null for an empty outline.
 */
export function representativePoint(geometry: PolygonGeometry): Position | null {
  const outerRings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);
  let best: { area: number; point: Position } | null = null;
  for (const ring of outerRings) {
    if (!ring) continue;
    const center = ringCenter(ring);
    if (center && (!best || center.area > best.area)) best = center;
  }
  return best ? best.point : null;
}

/**
 * Total area of the parcel's outline in square degrees, every piece added up.
 * Only used to compare pieces of the same parcel, so the odd unit does not
 * matter. Holes are ignored, as in representativePoint.
 */
export function outlineArea(geometry: PolygonGeometry): number {
  const outerRings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);
  let total = 0;
  for (const ring of outerRings) {
    if (!ring) continue;
    total += ringCenter(ring)?.area ?? 0;
  }
  return total;
}
