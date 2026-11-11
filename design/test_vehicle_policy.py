import unittest
from vehicle_policy import eligibility, directions


class VehiclePolicyTests(unittest.TestCase):
    def test_ordinary_and_specific_access(self):
        self.assertEqual(eligibility({'highway': 'residential'}), (True, True, 'game-assumed'))
        self.assertTrue(eligibility({'highway': 'service', 'access': 'private', 'motorcar': 'yes'})[0])
        self.assertFalse(eligibility({'highway': 'service', 'access': 'yes', 'motorcar': 'private'})[0])

    def test_excluded_and_conditionals(self):
        for highway in ('steps', 'motorway', 'trunk_link', 'construction', 'path'):
            self.assertFalse(eligibility({'highway': highway})[0], highway)
        self.assertTrue(eligibility({'highway': 'pedestrian', 'motor_vehicle': 'yes'})[0])
        self.assertFalse(eligibility({'highway': 'residential', 'motor_vehicle:conditional': 'no @ (Mo-Fr)'})[0])
        self.assertFalse(eligibility({'barrier': 'bollard'}, node=True)[0])
        self.assertFalse(eligibility({'barrier': 'gate'}, node=True)[0])
        self.assertTrue(eligibility({'barrier': 'gate', 'motorcar': 'yes'}, node=True)[0])

    def test_directions(self):
        self.assertEqual(directions({}), (True, True))
        self.assertEqual(directions({'oneway': 'yes'}), (True, False))
        self.assertEqual(directions({'oneway': '-1'}), (False, True))
        self.assertEqual(directions({'junction': 'roundabout'}), (True, False))
        self.assertEqual(directions({'oneway': 'yes', 'oneway:motorcar': 'no'}), (True, True))
        self.assertEqual(directions({'oneway': 'reversible'}), (False, False))


if __name__ == '__main__':
    unittest.main()
