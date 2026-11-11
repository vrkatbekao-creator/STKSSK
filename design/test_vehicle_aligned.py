import unittest
from package_vehicle_aligned import encode_v3
from package_vehicle_columnar import encode
from vehicle_graph import VehicleGraph


class AlignedTests(unittest.TestCase):
    def test_repack_preserves_every_column_and_aligns_tail(self):
        graph = VehicleGraph({'ways': [{'id': 8, 'tags': {'highway': 'residential', 'oneway': 'yes'},
                                       'nodes': [[20, 121.0, 25.0], [10, 121.001, 25.0]]}],
                              'nodeRestrictions': {}, 'turnRestrictions': []})
        before = encode(graph)
        after = encode_v3(before)
        self.assertEqual(after[:4], b'VGP3')
        self.assertEqual(after[16:80], before[12:76])
        self.assertEqual(after[80:], before[76:])
        self.assertEqual(len(after), 96)
        with self.assertRaises(ValueError):
            encode_v3(before[:-1])


if __name__ == '__main__':
    unittest.main()
