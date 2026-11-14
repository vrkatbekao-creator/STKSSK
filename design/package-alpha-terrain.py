"""Encode the existing masked Copernicus GLO-30 DSM as local terrain tiles."""
import gzip
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public/alpha-data/terrain"
with gzip.open(ROOT / "public/data/taipei-surface-v1.json.gz", "rt", encoding="utf-8") as source:
    surface = json.load(source)
samples = np.array(surface["values"]).reshape(surface["height"], surface["width"])
size = 256


def project(lon, lat):
    phi, lam = np.radians(lat), np.radians(lon - 121)
    a, f, k = 6378137, 1 / 298.257222101, .9999
    e2 = 2 * f - f * f
    s, c, t = np.sin(phi), np.cos(phi), np.tan(phi)
    n = a / np.sqrt(1 - e2 * s * s)
    e4, e6 = e2**2, e2**3
    T, C, A = t * t, e2 / (1 - e2) * c * c, c * lam
    m = a * ((1 - e2/4 - 3*e4/64 - 5*e6/256)*phi
             - (3*e2/8 + 3*e4/32 + 45*e6/1024)*np.sin(2*phi)
             + (15*e4/256 + 45*e6/1024)*np.sin(4*phi) - 35*e6/3072*np.sin(6*phi))
    east = 250000 + k*n*(A + (1-T+C)*A**3/6 + (5-18*T+T*T+72*C-58*e2/(1-e2))*A**5/120)
    north = k*(m + n*t*(A*A/2 + (5-T+9*C+4*C*C)*A**4/24 + (61-58*T+T*T+600*C-330*e2/(1-e2))*A**6/720))
    return east - 300000, 2800000 - north


def tile_y(lat, scale):
    return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) * scale / 2


for zoom in range(9, 13):
    scale = 2**zoom
    west, south, east, north = 121.42, 24.94, 121.72, 25.23
    for x in range(int((west+180)/360*scale), int((east+180)/360*scale)+1):
        for y in range(int(tile_y(north, scale)), int(tile_y(south, scale))+1):
            pixels = (np.arange(size)+.5)/size
            lon = ((x+pixels[None, :])/scale)*360-180
            lat = np.degrees(np.arctan(np.sinh(math.pi*(1-2*(y+pixels[:, None])/scale))))
            east_m, north_m = project(lon, lat)
            col = np.floor((east_m-surface["x"])/surface["step"]).astype(int)
            row = np.floor((north_m-surface["y"])/surface["step"]).astype(int)
            inside = (col>=0)&(row>=0)&(col<surface["width"])&(row<surface["height"])
            value = samples[np.clip(row,0,surface["height"]-1),np.clip(col,0,surface["width"]-1)]
            # Raster DEM needs RGB everywhere. Zero fills masked areas for the renderer only.
            encoded = 100000 + np.where(inside&(value!=surface["nodata"]), value, 0)
            rgb = np.stack([encoded>>16, (encoded>>8)&255, encoded&255],axis=2).astype(np.uint8)
            path = DEST / str(zoom) / str(x) / f"{y}.png"
            path.parent.mkdir(parents=True,exist_ok=True)
            Image.fromarray(rgb).save(path)
print("Prepared local DSM terrain tiles")
