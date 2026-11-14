import unittest
from build_vehicle_connectors import joins


class ConnectorTests(unittest.TestCase):
    def test_only_exact_original_node_ids_join(self):
        nodes = [[1, 2, 0, '42'], [1, 2, 0, 'v:1:1:1'], [1, 2, 0, '99'], [1, 2, 0, '42']]
        self.assertEqual(joins(nodes, [3, 42, 70]), [[0, 1], [3, 1]])
        self.assertEqual(joins(nodes, []), [])


if __name__ == '__main__':
    unittest.main()
