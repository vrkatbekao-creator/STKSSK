"""Reproject Copernicus GLO-30 DSM (N22E120) to EPSG:3826 local 30m grid for Kaohsiung 12 zones."""
from pathlib import Path
import datetime
import gzip
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from rasterio.features import geometry_mask
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import make_valid, transform as shapely_transform
from PIL import Image

ORIGIN = [180000, 2505000]
proj = Transformer.from_crs(4326, 3826, always_xy=True)

def to_epsg3826(coords):
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([xs, ys])

districts_gj = json.loads((ROOT / 'design/assets/kaohsiung-districts.geojson').read_text('utf-8'))
city_3826 = unary_union([make_valid(shapely_transform(shape(f['geometry']), to_epsg3826)) for f in districts_gj['features']])
left, bottom, right, top = city_3826.bounds
left = math.floor((left - 90) / 30) * 30
bottom = math.floor((bottom - 90) / 30) * 30
right = math.ceil((right + 90) / 30) * 30
top = math.ceil((top + 90) / 30) * 30
width = round((right - left) / 30)
height = round((top - bottom) / 30)
affine = from_origin(left, top, 30, 30)
raster = np.full((height, width), -9999, dtype='float32')

dem_path = ROOT / '.tools/copdem-N22E120.tif'
key = 'Copernicus_DSM_COG_10_N22_00_E120_00_DEM'
with rasterio.open(dem_path) as src:
    reproject(
        rasterio.band(src, 1), raster,
        src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
        dst_transform=affine, dst_crs='EPSG:3826', dst_nodata=-9999,
        resampling=Resampling.bilinear, init_dest_nodata=False,
    )
    src_meta = {
        'url': f'https://copernicus-dem-30m.s3.amazonaws.com/{key}/{key}.tif',
        'sha256': hashlib.sha256(dem_path.read_bytes()).hexdigest(),
        'bounds': list(src.bounds),
        'pixelDegrees': list(src.res),
        'tags': src.tags(),
    }

mask = geometry_mask([mapping(city_3826)], (height, width), affine, invert=True)
raster[~mask] = -9999
valid = raster != -9999
assert valid.sum() > 250000

target_tif = ROOT / 'design/assets/kaohsiung-copdem-30m.tif'
with rasterio.open(target_tif, 'w', driver='GTiff', height=height, width=width, count=1, dtype='float32', crs='EPSG:3826', transform=affine, nodata=-9999, compress='deflate') as dst:
    dst.write(raster, 1)

grid = np.rint(raster * 10).astype('int32')
grid[~valid] = -99999

dy, dx = np.gradient(np.where(valid, raster, 0), 30)
interior = valid.copy()
interior[1:-1, 1:-1] &= valid[:-2, 1:-1] & valid[2:, 1:-1] & valid[1:-1, :-2] & valid[1:-1, 2:]
slope = np.arctan(np.hypot(dx, dy))
aspect = np.arctan2(-dx, dy)
shade = np.clip(np.cos(math.pi / 4) * np.cos(slope) + np.sin(math.pi / 4) * np.sin(slope) * np.cos(math.radians(315) - aspect), 0, 1)
shade[~interior] = 0.65

stops = np.array([0, 50, 200, 500, 1200])
colors = np.array([[50, 92, 108], [60, 111, 109], [87, 127, 112], [126, 135, 126], [174, 166, 149]])
rgb = np.stack([np.interp(raster, stops, colors[:, ch]) for ch in range(3)], axis=2)
rgb *= np.clip(0.55 + shade * 0.55, 0.4, 1.1)[:, :, None]
rgba = np.concatenate([np.clip(rgb, 0, 255).astype('uint8'), (valid * 255).astype('uint8')[:, :, None]], axis=2)
Image.fromarray(rgba).save(ROOT / 'public/data/kaohsiung-surface-hillshade.png')

contours = {}
corners = [(0, 0), (0, 1), (1, 1), (1, 0)]
pairs = [(0, 1), (1, 2), (2, 3), (3, 0)]
for row in range(height - 1):
    for col in range(width - 1):
        values = [float(raster[row + dy_, col + dx_]) for dy_, dx_ in corners]
        if min(values) == -9999:
            continue
        for level in range(max(0, math.ceil(min(values) / 50) * 50), math.floor(max(values) / 50) * 50 + 1, 50):
            hits = []
            for a, b in pairs:
                if (values[a] < level) != (values[b] < level):
                    t = (level - values[a]) / (values[b] - values[a])
                    ay, ax = corners[a]
                    by, bx = corners[b]
                    hits.append([
                        round(left - ORIGIN[0] + (col + 0.5 + ax + (bx - ax) * t) * 30, 1),
                        round(ORIGIN[1] - top + (row + 0.5 + ay + (by - ay) * t) * 30, 1),
                    ])
            for i in range(0, len(hits) - 1, 2):
                contours.setdefault(level, []).append(hits[i] + hits[i + 1])

metadata = {
    'provider': 'Copernicus GLO-30 Public / AWS',
    'model': 'DSM',
    'release': '2021',
    'acquisition': '2011–2015 (older gap-fill possible)',
    'nativeResolution': '1 arc-second (~30 m)',
    'gridMetres': 30,
    'verticalDatum': 'EGM2008 (EPSG:3855)',
    'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sources': [src_meta],
    'sourceSubsetSha256': hashlib.sha256(target_tif.read_bytes()).hexdigest(),
    'datasetUrl': 'https://registry.opendata.aws/copernicus-dem/',
    'productUrl': 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
    'licence': 'Copernicus DEM licence, free GLO-30/GLO-90 use with attribution',
    'processing': 'Bilinear reprojection from EPSG:4326 to EPSG:3826 at 30 m, city mask, decimetre quantisation, hillshade and 50 m surface isolines.',
}
out = {
    'version': 'kaohsiung-surface-v1',
    'projection': 'EPSG:3826',
    'origin': ORIGIN,
    'source': metadata,
    'x': float(left - ORIGIN[0]),
    'y': float(ORIGIN[1] - top),
    'width': width,
    'height': height,
    'step': 30,
    'nodata': -99999,
    'scale': 0.1,
    'values': grid.ravel().tolist(),
    'contours': [[level, lines] for level, lines in sorted(contours.items())],
}
out['revision'] = hashlib.sha256(json.dumps(out, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
raw = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode()
(ROOT / 'public/data/kaohsiung-surface-v1.json.gz').write_bytes(gzip.compress(raw, mtime=0))
(ROOT / 'design/assets/kaohsiung-surface-source-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print(json.dumps({'width': width, 'height': height, 'validPixels': int(valid.sum()), 'minM': float(raster[valid].min()), 'maxM': float(raster[valid].max()), 'contours': sum(len(v) for v in contours.values()), 'gzipBytes': (ROOT / 'public/data/kaohsiung-surface-v1.json.gz').stat().st_size}), flush=True)
