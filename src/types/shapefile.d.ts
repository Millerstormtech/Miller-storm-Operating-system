// Minimal types for the `shapefile` package, which ships none. Only what the
// Canvass Map parcel importer uses (scripts/canvass-import-parcels.ts).
declare module "shapefile" {
  export type Feature = {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown } | null;
  };

  export type Source = {
    bbox: number[];
    read(): Promise<{ done: boolean; value: Feature }>;
  };

  export function open(shp: string, dbf?: string, options?: { encoding?: string }): Promise<Source>;
}
