#!/usr/bin/env python3
"""Canvass Map hail decoder (plan T3.1).

Reads NOAA's MRMS "Maximum Estimated Size of Hail" 24-hour maximum and writes
every Texas grid square with hail of at least 0.75 inch as JSON lines:
{"date": "YYYY-MM-DD", "lat": .., "lon": .., "mm": ..}.

A storm day runs 12:00 UTC to 12:00 UTC, the same day NOAA's Storm Prediction
Center uses for its hail reports. The 24-hour maximum file stamped 12:00 UTC on
the NEXT calendar day covers exactly that window.

Public data from NOAA's open data bucket; no key, no cost. Needs pygrib and
numpy, which are installed in the Ubuntu on D: at /opt/kp-hail.

One day:
  /opt/kp-hail/bin/python decode.py --date 2026-03-10 --out /mnt/d/knock-planner/data/hail/mesh/2026-03-10.jsonl

A range, one file per day, skipping days already decoded:
  /opt/kp-hail/bin/python decode.py --from 2024-08-01 --to 2026-09-14 --out-dir /mnt/d/knock-planner/data/hail/mesh
"""

import argparse
import datetime as dt
import gzip
import json
import os
import tempfile
import time
import urllib.error
import urllib.request

import numpy as np
import pygrib

BUCKET = "https://noaa-mrms-pds.s3.amazonaws.com/CONUS/MESH_Max_1440min_00.50"
TEXAS = {"south": 25.8, "north": 36.6, "west": -106.7, "east": -93.5}
MIN_MM = 19.05  # 0.75 inch: smaller hail never adds points, so it is not stored


def source_url(storm_day: dt.date) -> str:
    stamp = (storm_day + dt.timedelta(days=1)).strftime("%Y%m%d")
    return f"{BUCKET}/{stamp}/MRMS_MESH_Max_1440min_00.50_{stamp}-120000.grib2.gz"


def decode_day(storm_day: dt.date):
    """Returns (url, squares) with squares as (lat, lon, mm), or (url, None) when NOAA has no file for that day."""
    url = source_url(storm_day)
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            raw = gzip.decompress(response.read())
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):  # the bucket answers either for a file that does not exist
            return url, None
        raise

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
    indexes = np.argwhere(in_texas & (values >= MIN_MM))
    return url, [(float(lats[i, j]), float(lons[i, j]), float(values[i, j])) for i, j in indexes]


def decode_with_retry(storm_day: dt.date):
    """One retry after a network hiccup; a second failure stops the run."""
    try:
        return decode_day(storm_day)
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        time.sleep(5)
        return decode_day(storm_day)


def write_squares(path: str, day_text: str, squares) -> None:
    """Writes to a .part file first, so a half-written day never looks finished."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    part = path + ".part"
    with open(part, "w", encoding="utf-8") as out:
        for lat, lon, mm in squares:
            out.write(json.dumps({"date": day_text, "lat": round(lat, 4), "lon": round(lon, 4), "mm": round(mm, 1)}) + "\n")
    os.replace(part, path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", help="one storm day, YYYY-MM-DD (with --out)")
    parser.add_argument("--out", help="JSON lines file for --date")
    parser.add_argument("--from", dest="first", help="first storm day of a range, YYYY-MM-DD")
    parser.add_argument("--to", dest="last", help="last storm day of a range, YYYY-MM-DD")
    parser.add_argument("--out-dir", help="folder for a range, one YYYY-MM-DD.jsonl per day")
    args = parser.parse_args()

    if args.date and args.out:
        jobs = [(dt.date.fromisoformat(args.date), args.out)]
        skip_existing = False
    elif args.first and args.last and args.out_dir:
        first, last = dt.date.fromisoformat(args.first), dt.date.fromisoformat(args.last)
        jobs = []
        for n in range((last - first).days + 1):
            day = first + dt.timedelta(days=n)
            jobs.append((day, os.path.join(args.out_dir, f"{day.isoformat()}.jsonl")))
        skip_existing = True
    else:
        parser.error("use --date with --out, or --from, --to and --out-dir")

    totals = {"decoded": 0, "skippedAlreadyDone": 0, "missingAtNoaa": 0, "daysWithHail": 0, "squares": 0}
    for day, out_path in jobs:
        if skip_existing and os.path.exists(out_path):
            totals["skippedAlreadyDone"] += 1
            continue
        url, squares = decode_with_retry(day)
        if squares is None:
            totals["missingAtNoaa"] += 1
            print(json.dumps({"date": day.isoformat(), "missingAtNoaa": url}), flush=True)
            continue
        write_squares(out_path, day.isoformat(), squares)
        totals["decoded"] += 1
        totals["squares"] += len(squares)
        if squares:
            totals["daysWithHail"] += 1
        biggest = max((mm for _, _, mm in squares), default=0.0)
        print(json.dumps({"date": day.isoformat(), "texasSquaresAtLeast075in": len(squares), "biggestInches": round(biggest / 25.4, 2)}), flush=True)

    print(json.dumps({"summary": totals}), flush=True)


if __name__ == "__main__":
    main()
