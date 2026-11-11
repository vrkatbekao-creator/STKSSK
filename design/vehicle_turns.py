"""Conservative turn-filter prototype for source-node vehicle graphs.

Via-way restrictions deliberately block entry from the affected from-way. This
can reject legal routes; it must never be treated as full via-way support.
"""


def permitted(incoming_way, via_node, outgoing_way, relations, via_nodes_by_way=None):
    for relation in relations:
        tags = relation['tags']
        exceptions = {item.strip() for item in tags.get('except', '').split(';')}
        if exceptions & {'motorcar', 'motor_vehicle', 'vehicle'}:
            continue
        members = relation['members']
        from_ways = {m['ref'] for m in members if m['role'] == 'from' and m['type'] == 'w'}
        # Malformed relations without a from-way cannot be safely ignored.
        if not from_ways and any(m['type'] == 'w' and m['ref'] == incoming_way for m in members):
            return False
        if incoming_way not in from_ways:
            continue
        if any(m['role'] not in {'from', 'via', 'to'} for m in members):
            return False
        via_ways = {m['ref'] for m in members if m['role'] == 'via' and m['type'] == 'w'}
        if via_ways:
            if via_nodes_by_way is not None and all(way in via_nodes_by_way for way in via_ways):
                if not any(via_node in via_nodes_by_way[way] for way in via_ways):
                    continue
            # Covers no_* and only_* without guessing how the via-way is traversed.
            if outgoing_way in via_ways:
                return False
            # An only_* restriction may also require entering that via-way.
            value = tags.get('restriction:motorcar', tags.get('restriction:motor_vehicle', tags.get('restriction', '')))
            if value.startswith('only_') or not value or any('conditional' in k for k in tags):
                return False
            continue
        via_nodes = {m['ref'] for m in members if m['role'] == 'via' and m['type'] == 'n'}
        if not via_nodes:
            return False
        if via_node not in via_nodes:
            continue
        to_ways = {m['ref'] for m in members if m['role'] == 'to' and m['type'] == 'w'}
        value = tags.get('restriction:motorcar', tags.get('restriction:motor_vehicle', tags.get('restriction', '')))
        if not to_ways or any('conditional' in k for k in tags):
            return False
        if value.startswith('no_') and outgoing_way in to_ways:
            return False
        if value.startswith('only_') and outgoing_way not in to_ways:
            return False
        if not value.startswith(('no_', 'only_')):
            return False
    return True
