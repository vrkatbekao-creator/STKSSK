"""Independent pyproj/Shapely check of vehicle projection and district clipping."""
from pathlib import Path
import json
import math
import random
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
from pyproj import Transformer
from shapely import make_valid
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

rng = random.Random(20261111)
geographic = [[rng.uniform(121.156, 121.969), rng.uniform(24.686, 25.48)] for _ in range(500)]
segments = [[[rng.uniform(-18000, 28000), rng.uniform(-2000, 55000)],
             [rng.uniform(-18000, 28000), rng.uniform(-2000, 55000)]] for _ in range(120)]
request = {'geographic': geographic, 'segments': segments}
script = r'''
import fs from 'node:fs';
import {projectVehiclePoint,clipVehicleSegment} from './src/game/vehicle-geometry.ts';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const districts=JSON.parse(fs.readFileSync('src/data/kaohsiung-map.json','utf8')).districts;
const points=input.geographic.map(([x,y])=>projectVehiclePoint(x,y));
const clips=input.segments.map(([a,b])=>clipVehicleSegment(a,b,1000000,'audit:1:2',districts));
process.stdout.write(JSON.stringify({points,clips}));
'''
out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
                     input=json.dumps(request), capture_output=True, text=True, check=True)
actual = json.loads(out.stdout)
project = Transformer.from_crs(4326, 3826, always_xy=True)
errors = []
for (lon, lat), (x, y) in zip(geographic, actual['points']):
    east, north = project.transform(lon, lat)
    errors.append(math.hypot(x - (east - 300000), y - (2800000 - north)))
assert max(errors) < .02
base = json.loads((ROOT / 'src/data/kaohsiung-map.json').read_text('utf8'))
polygons = {d['id']: make_valid(Polygon(d['rings'][0], d['rings'][1:])) for d in base['districts']}
city = unary_union(list(polygons.values()))
max_difference = 0
for (a, b), fragments in zip(segments, actual['clips']):
    line = LineString([a, b])
    expected = line.intersection(city).length / line.length * 1000000
    observed = sum(p['end'] - p['start'] for p in fragments)
    difference = abs(expected - observed)
    max_difference = max(max_difference, difference)
    # Each interval endpoint is rounded once; tolerance scales with split count.
    assert difference <= len(fragments) + 3, (expected, observed, len(fragments))
    for p in fragments:
        if p['end'] - p['start'] <= 4:
            continue
        t = (p['start'] + p['end']) / 2000000
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t
        # Quarter-interval rounding can move the midpoint slightly near an edge.
        assert polygons[p['district']].buffer(.5).covers(Point(x, y))
        sx, sy = map(int, p['sector'].split(':')[1].split(','))
        assert sx*600-.5 <= x <= (sx+1)*600+.5 and sy*600-.5 <= y <= (sy+1)*600+.5
result = {'status': 'independent local geometry check; not full road-data certification',
          'projectionSamples': len(geographic), 'maxProjectionErrorMetres': max(errors),
          'clippedSegments': len(segments), 'maxCoverageDifferenceQuarterUnits': max_difference,
          'note': 'Compares against pyproj EPSG:3826 and Shapely using the existing simplified game district outlines.'}
(ROOT / 'artifacts/vehicle-geometry-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps(result), flush=True)
