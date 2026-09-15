#!/usr/bin/env python3
"""Canvass Map hail decoder (plan T3.1).

Reads NOAA's MRMS "Maximum Estimated Size of Hail" 24-hour maximum for one storm
day and writes every Texas grid cell with hail of at least 0.75 inch as JSON
lines: {"date": "YYYY-MM-DD", "lat": .., "lon": .., "mm": ..}.

A storm day runs 12:00 UTC to 12:00 UTC, the same day NOAA's Storm Prediction
Center uses for its hail reports. The 24-hour maximum file stamped 12:00 UTC on
the NEXT calendar day covers exactly that window.

Public data from NOAA's open data bucket; no key, no cost. Needs pygrib and
numpy, which are installed in the Ubuntu on D: at /opt/kp-hail.

  /opt/kp-hail/bin/python decode.py --date 2026-05-04 --out /mnt/d/knock-planner/data/hail/mesh/2026-05-04.jsonl
"""

import argparse
import datetime as dt
import gzip
import json
import os
import tempfile
import urllib.request

import numpy as np
import pygrib

BUCKET = "https://noaa-mrms-pds.s3.amazonaws.com/CONUS/MESH_Max_1440min_00.50"
TEXAS = {"south": 25.8, "north": 36.6, "west": -106.7, "east": -93.5}
MIN_MM = 19.05  # 0.75 inch: smaller hail never adds points, so it is not stored


def source_url(storm_day: dt.date) -> str:
    stamp = (storm_day + dt.timedelta(days=1)).strftime("%Y%m%d")
    return f"{BUCKET}/{stamp}/MRMS_MESH_Max_1440min_00.50_{stamp}-120000.grib2.gz"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", required=True, help="storm day, YYYY-MM-DD")
    parser.add_argument("--out", required=True, help="JSON lines file to write")
    args = parser.parse_args()

    day = dt.date.fromisoformat(args.date)
    url = source_url(day)
    with urllib.request.urlopen(url, timeout=120) as response:
        raw = gzip.decompress(response.read())

    # pygrib reads from a file path, so the decompressed grid goes to a temporary file.
    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(raw)
        grib_path = tmp.name
    try:
        messages = pygrib.open(grib_path)
        message = messages.message(1)
        values = np.ma.filled(message.values, fill_value=-999.0)
        lats, lons = message.latlons()
        messages.close()
    finally:
        os.unlink(grib_path)

    # MRMS stores longitudes as 0 to 360; convert to -180 to 180.
    lons = np.where(lons > 180, lons - 360, lons)
    in_texas = (lats >= TEXAS["south"]) & (lats <= TEXAS["north"]) & (lons >= TEXAS["west"]) & (lons <= TEXAS["east"])
    cells = np.argwhere(in_texas & (values >= MIN_MM))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    biggest = 0.0
    with open(args.out, "w", encoding="utf-8") as out:
        for i, j in cells:
            mm = float(values[i, j])
            biggest = max(biggest, mm)
            out.write(json.dumps({"date": args.date, "lat": round(float(lats[i, j]), 4), "lon": round(float(lons[i, j]), 4), "mm": round(mm, 1)}) + "\n")

    print(json.dumps({
        "date": args.date,
        "source": url,
        # pygrib has no name for this NOAA-local field, so label it from the product.
        "field": "MESH_Max_1440min (mm)",
        "gridShape": list(values.shape),
        "texasCellsAtLeast075in": int(len(cells)),
        "biggestMm": round(biggest, 1),
        "biggestInches": round(biggest / 25.4, 2),
        "out": args.out,
    }))


if __name__ == "__main__":
    main()
