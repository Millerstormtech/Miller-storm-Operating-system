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

  /** Attribute rows only, read from the .dbf without the outlines. */
  export type DbfSource = {
    read(): Promise<{ done: boolean; value: Record<string, unknown> }>;
  };

  export function open(shp: string, dbf?: string, options?: { encoding?: string }): Promise<Source>;

  export function openDbf(dbf: string, options?: { encoding?: string }): Promise<DbfSource>;
}
