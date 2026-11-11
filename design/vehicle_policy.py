"""Conservative offline game policy; not a real-world driving permission check."""

ALLOW = {'yes', 'permissive', 'designated', 'official'}
ORDINARY = {'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary',
            'tertiary_link', 'residential', 'living_street', 'unclassified',
            'service', 'road', 'track'}
RESTRICTED = {'pedestrian', 'footway', 'path', 'cycleway', 'bridleway'}
NEVER = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction',
         'proposed', 'steps', 'raceway'}
ACCESS_KEYS = ('access', 'vehicle', 'motor_vehicle', 'motorcar')


def eligibility(tags, node=False):
    """Return eligibility, whether permission was assumed, and reason."""
    if any(tags.get(key + ':conditional') for key in ACCESS_KEYS):
        return False, False, 'conditional-access'
    if any(tags.get(k) for k in ('oneway:conditional', 'oneway:motorcar:conditional',
                                  'oneway:motor_vehicle:conditional', 'motorcar:oneway:conditional')):
        return False, False, 'conditional-direction'
    if not node:
        highway = tags.get('highway', '')
        if highway in NEVER or tags.get('motorroad') == 'yes':
            return False, False, 'excluded-road'
    if node and tags.get('barrier') in {'wall', 'fence', 'retaining_wall', 'block', 'jersey_barrier', 'bollard', 'bus_trap', 'cycle_barrier'}:
        return False, False, 'barrier'
    explicit = next((tags[k] for k in reversed(ACCESS_KEYS) if tags.get(k)), None)
    if explicit is not None and explicit not in ALLOW:
        return False, False, 'access'
    # Gates and other tagged barriers are not presumed open to campaign vehicles.
    if node and tags.get('barrier') and explicit is None:
        return False, False, 'unknown-barrier-access'
    if not node and highway not in ORDINARY:
        if highway not in RESTRICTED or not any(tags.get(k) in ALLOW for k in ('motorcar', 'motor_vehicle')):
            return False, False, 'class'
    return True, explicit is None, 'game-assumed' if explicit is None else 'source-tag'


def directions(tags):
    """Direction relative to source node order; unknown direction is rejected."""
    value = tags.get('oneway:motorcar', tags.get('oneway:motor_vehicle', tags.get('oneway')))
    if value is None:
        value = 'yes' if tags.get('junction') in {'roundabout', 'circular'} else 'no'
    if value in {'yes', '1', 'true'}:
        return True, False
    if value == '-1':
        return False, True
    if value in {'no', '0', 'false'}:
        return True, True
    return False, False
