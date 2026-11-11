import io
import struct
import unittest
from package_vehicle_prototype import write_binary, metadata, canonical
from vehicle_graph import VehicleGraph


class PackageTests(unittest.TestCase):
    def test_roundtrip_and_deterministic_order(self):
        source = {'sourceSha256': 'fixture', 'bboxWgs84': [0, 0, 1, 1], 'licence': 'ODbL-1.0',
                  'ways': [{'id': 8, 'tags': {'highway': 'residential', 'oneway': 'yes'},
                            'nodes': [[20, 121.0, 25.0], [10, 121.001, 25.0]]}],
                  'nodeRestrictions': {}, 'turnRestrictions': []}
        graph = VehicleGraph(source)
        first, second = io.BytesIO(), io.BytesIO()
        info = write_binary(graph, first)
        self.assertEqual(info, write_binary(graph, second))
        self.assertEqual(first.getvalue(), second.getvalue())
        self.assertEqual(struct.unpack_from('<4sII', first.getvalue()), (b'VGP1', 2, 1))
        self.assertEqual(struct.unpack_from('<Qdd', first.getvalue(), 12)[0], 10)
        a, b, way, metres = struct.unpack_from('<IIQd', first.getvalue(), 12 + 2 * 24)
        self.assertEqual((a, b, way), (1, 0, 8))
        self.assertGreater(metres, 0)
        self.assertEqual(metadata(graph, source)['ways'][0]['tags']['oneway'], 'yes')
        self.assertEqual(canonical(metadata(graph, source)), canonical(metadata(graph, source)))


if __name__ == '__main__':
    unittest.main()
