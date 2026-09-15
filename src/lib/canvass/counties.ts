// src/lib/canvass/counties.ts
// The 41 counties the Canvass Map covers: every county containing a city on
// docs/Cities & Regions - Sheet1.csv (confirmed by Youssef, 14 Sep 2026; spec
// A10). A county is in when any listed city lies in it, even partly, which is
// why Kaufman is here for the slice of Dallas and Mesquite inside it.
//
// Deliberately NOT here: Starr County, which only matched a second, unrelated
// place named Mesquite on the Mexico border.

export type Area = "FW" | "RR" | "Lubbock" | "CC";

export type ServiceCounty = { fips: string; name: string; area: Area };

export const SERVICE_COUNTIES: readonly ServiceCounty[] = [
  // FW (Dallas-Fort Worth). Cameron is on the sheet for Harlingen only.
  { fips: "48061", name: "Cameron", area: "FW" },
  { fips: "48085", name: "Collin", area: "FW" },
  { fips: "48097", name: "Cooke", area: "FW" },
  { fips: "48113", name: "Dallas", area: "FW" },
  { fips: "48121", name: "Denton", area: "FW" },
  { fips: "48139", name: "Ellis", area: "FW" },
  { fips: "48181", name: "Grayson", area: "FW" },
  { fips: "48221", name: "Hood", area: "FW" },
  { fips: "48251", name: "Johnson", area: "FW" },
  { fips: "48257", name: "Kaufman", area: "FW" },
  { fips: "48363", name: "Palo Pinto", area: "FW" },
  { fips: "48367", name: "Parker", area: "FW" },
  { fips: "48397", name: "Rockwall", area: "FW" },
  { fips: "48425", name: "Somervell", area: "FW" },
  { fips: "48439", name: "Tarrant", area: "FW" },
  { fips: "48497", name: "Wise", area: "FW" },
  // RR (Round Rock)
  { fips: "48021", name: "Bastrop", area: "RR" },
  { fips: "48027", name: "Bell", area: "RR" },
  { fips: "48041", name: "Brazos", area: "RR" },
  { fips: "48053", name: "Burnet", area: "RR" },
  { fips: "48055", name: "Caldwell", area: "RR" },
  { fips: "48099", name: "Coryell", area: "RR" },
  { fips: "48187", name: "Guadalupe", area: "RR" },
  { fips: "48209", name: "Hays", area: "RR" },
  { fips: "48281", name: "Lampasas", area: "RR" },
  { fips: "48453", name: "Travis", area: "RR" },
  { fips: "48491", name: "Williamson", area: "RR" },
  // Lubbock (West Texas)
  { fips: "48135", name: "Ector", area: "Lubbock" },
  { fips: "48169", name: "Garza", area: "Lubbock" },
  { fips: "48219", name: "Hockley", area: "Lubbock" },
  { fips: "48227", name: "Howard", area: "Lubbock" },
  { fips: "48253", name: "Jones", area: "Lubbock" },
  { fips: "48303", name: "Lubbock", area: "Lubbock" },
  { fips: "48317", name: "Martin", area: "Lubbock" },
  { fips: "48329", name: "Midland", area: "Lubbock" },
  { fips: "48375", name: "Potter", area: "Lubbock" },
  { fips: "48381", name: "Randall", area: "Lubbock" },
  { fips: "48441", name: "Taylor", area: "Lubbock" },
  // CC (Corpus Christi)
  { fips: "48025", name: "Bee", area: "CC" },
  { fips: "48355", name: "Nueces", area: "CC" },
  { fips: "48409", name: "San Patricio", area: "CC" },
];

const BY_FIPS = new Map(SERVICE_COUNTIES.map((c) => [c.fips, c]));

export function isServiceCounty(fips: string): boolean {
  return BY_FIPS.has(fips);
}

export function areaForCounty(fips: string): Area | null {
  return BY_FIPS.get(fips)?.area ?? null;
}
