import struct
import unittest
from package_vehicle_columnar import encode
from vehicle_graph import VehicleGraph


class ColumnarTests(unittest.TestCase):
    def test_columns_preserve_directions_and_exact_values(self):
        source = {'ways': [{'id': 8, 'tags': {'highway': 'residential', 'oneway': 'yes'},
                            'nodes': [[20, 121.0, 25.0], [10, 121.001, 25.0]]}],
                  'nodeRestrictions': {}, 'turnRestrictions': []}
        graph = VehicleGraph(source)
        data = encode(graph)
        self.assertEqual(data, encode(graph))
        self.assertEqual(struct.unpack_from('<4sII', data), (b'VGP2', 2, 1))
        self.assertEqual(struct.unpack_from('<2Q', data, 12), (10, 20))
        self.assertEqual(struct.unpack_from('<2d', data, 28), (121.001, 121.0))
        self.assertEqual(struct.unpack_from('<3I', data, 60), (0, 0, 1))
        self.assertEqual(struct.unpack_from('<I', data, 72)[0], 0)
        self.assertEqual(struct.unpack_from('<Q', data, 76)[0], 8)
        self.assertEqual(struct.unpack_from('<d', data, 84)[0], graph.adjacency[20][0][2])


if __name__ == '__main__':
    unittest.main()
