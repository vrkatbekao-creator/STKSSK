import unittest
from vehicle_graph import VehicleGraph


def way(id, nodes, **tags):
    return {'id': id, 'nodes': nodes, 'tags': {'highway': 'residential', **tags}}


class GraphTests(unittest.TestCase):
    def test_direction_barrier_and_turn(self):
        source = {'ways': [way(10, [[1, 121, 25], [2, 121.001, 25]], oneway='yes'),
                           way(11, [[2, 121.001, 25], [3, 121.002, 25]]),
                           way(12, [[2, 121.001, 25], [4, 121.001, 25.001]]),
                           way(13, [[4, 121.001, 25.001], [5, 121.002, 25.001]])],
                  'nodeRestrictions': {'4': {'barrier': 'gate'}},
                  'turnRestrictions': [{'tags': {'restriction': 'no_left_turn'}, 'members': [
                      {'type': 'w', 'role': 'from', 'ref': 10},
                      {'type': 'n', 'role': 'via', 'ref': 2},
                      {'type': 'w', 'role': 'to', 'ref': 11}]}]}
        graph = VehicleGraph(source)
        self.assertIsNotNone(graph.route(1, 2))
        self.assertIsNone(graph.route(2, 1))
        self.assertIsNone(graph.route(1, 3))
        self.assertIsNotNone(graph.route(2, 3))
        self.assertIsNone(graph.route(1, 5))
        self.assertEqual(set(graph.distances(1, [2, 3, 5])), {2})

    def test_crossing_without_shared_reference_is_not_connected(self):
        graph = VehicleGraph({'ways': [way(1, [[1, 121, 25], [2, 121.002, 25]]),
                                             way(2, [[3, 121.001, 24.999], [4, 121.001, 25.001]])],
                              'nodeRestrictions': {}, 'turnRestrictions': []})
        self.assertIsNone(graph.route(1, 4))


if __name__ == '__main__':
    unittest.main()
