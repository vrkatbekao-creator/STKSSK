export const teams=['blue','green','white'] as const;
export type Team=typeof teams[number];
export function teamRecord<T>(make:(team:Team)=>T):Record<Team,T>{return Object.fromEntries(teams.map(team=>[team,make(team)])) as Record<Team,T>;}
export const teamHomes:Record<Team,string>={blue:'6400600',green:'6400100',white:'6400400'};
export const defaultCommanders={blue:'shen',green:'jiang',white:'huang'} as const;
export function campaignOutcome(scores:Record<Team,number>):Team|'draw'{const ordered=[...teams].sort((a,b)=>scores[b]-scores[a]);return scores[ordered[0]]===scores[ordered[1]]?'draw':ordered[0];}
