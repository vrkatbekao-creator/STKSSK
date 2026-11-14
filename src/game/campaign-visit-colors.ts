import type { Team } from './campaign-teams.ts';
import { teams } from './campaign-teams.ts';

export type VisitColor = { team: Team; depth: 1 | 2; challenger?: Team };
export type VisitColors = Record<string, VisitColor>;

export function nextVisitColor(previous: VisitColor | undefined, team: Team): VisitColor {
 if (!previous) return { team, depth: 1 };
 if (previous.team === team || previous.challenger === team) return { team, depth: 2 };
 return { ...previous, challenger: team };
}

export function validVisitColors(value: unknown, cells: ReadonlyMap<string, unknown>): value is VisitColors {
 if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
 const entries=Object.entries(value);
 return entries.length<=cells.size&&entries.every(([id,visit])=>cells.has(id)&&visit&&typeof visit==='object'&&
  !Array.isArray(visit)&&teams.includes(visit.team)&&(visit.depth===1||visit.depth===2)&&
  (visit.challenger===undefined||teams.includes(visit.challenger)&&visit.challenger!==visit.team)&&
  Object.keys(visit).every(key=>['team','depth','challenger'].includes(key)));
}
