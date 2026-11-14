import tempfile
import unittest
from pathlib import Path
from extract_vehicle_network import Extract


class ExtractTests(unittest.TestCase):
    def test_source_nodes_and_relation_are_preserved(self):
        osm = '''<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
 <node id="1" lat="25.03" lon="121.50"/>
 <node id="2" lat="25.03" lon="121.51"><tag k="barrier" v="gate"/></node>
 <node id="3" lat="25.04" lon="121.51"/>
 <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/><tag k="oneway" v="yes"/></way>
 <way id="11"><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/></way>
 <relation id="20"><member type="way" ref="10" role="from"/><member type="node" ref="2" role="via"/>
 <member type="way" ref="11" role="to"/><tag k="type" v="restriction"/><tag k="restriction" v="no_left_turn"/></relation>
</osm>'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fixture.osm'
            source.write_text(osm, encoding='utf8')
            handler = Extract()
            handler.apply_file(str(source), locations=True)
        self.assertEqual({w['id'] for w in handler.ways}, {10, 11})
        self.assertEqual(handler.ways[0]['nodes'][1][0], 2)
        self.assertEqual(handler.barriers['2']['barrier'], 'gate')
        self.assertEqual(handler.relations[0]['tags']['restriction'], 'no_left_turn')
        self.assertEqual(handler.relations[0]['members'][1], {'type': 'n', 'ref': 2, 'role': 'via'})


if __name__ == '__main__':
    unittest.main()
