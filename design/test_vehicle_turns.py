import unittest
from vehicle_turns import permitted


def relation(kind, via_type='n', exceptions=None):
    tags = {'restriction': kind}
    if exceptions:
        tags['except'] = exceptions
    return {'tags': tags, 'members': [
        {'type': 'w', 'role': 'from', 'ref': 1},
        {'type': via_type, 'role': 'via', 'ref': 2},
        {'type': 'w', 'role': 'to', 'ref': 3},
    ]}


class TurnTests(unittest.TestCase):
    def test_via_node_no_and_only(self):
        self.assertFalse(permitted(1, 2, 3, [relation('no_left_turn')]))
        self.assertTrue(permitted(1, 2, 4, [relation('no_left_turn')]))
        self.assertTrue(permitted(1, 2, 3, [relation('only_straight_on')]))
        self.assertFalse(permitted(1, 2, 4, [relation('only_straight_on')]))
        self.assertTrue(permitted(1, 5, 3, [relation('no_left_turn')]))

    def test_except_and_unsupported(self):
        self.assertTrue(permitted(1, 2, 3, [relation('no_left_turn', exceptions='bus;motorcar')]))
        conditional = relation('no_left_turn')
        conditional['tags']['restriction:conditional'] = 'no_left_turn @ (Mo-Fr)'
        self.assertFalse(permitted(1, 2, 4, [conditional]))
        self.assertFalse(permitted(1, 99, 2, [relation('no_left_turn', 'w')]))
        self.assertFalse(permitted(1, 99, 4, [relation('only_straight_on', 'w')]))
        self.assertTrue(permitted(1, 98, 1, [relation('only_straight_on', 'w')], {2: {99, 100}}))
        self.assertFalse(permitted(1, 99, 2, [relation('only_straight_on', 'w')], {2: {99, 100}}))
        incomplete = {'tags': {'restriction': 'no_left_turn'},
                      'members': [{'type': 'w', 'role': 'to', 'ref': 1}]}
        self.assertFalse(permitted(1, 2, 3, [incomplete]))
        unusual = relation('no_left_turn')
        unusual['members'].append({'type': 'n', 'role': 'unknown', 'ref': 4})
        self.assertFalse(permitted(1, 2, 4, [unusual]))


if __name__ == '__main__':
    unittest.main()
