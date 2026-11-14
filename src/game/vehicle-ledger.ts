/** Pure daily vehicle accounting. It is not yet wired into campaign saves or commands. */
import type {Team} from './campaign-teams.ts';
import {quoteVehicleCost} from './vehicle-cost.ts';
import type {VehicleMode} from './vehicle-cost.ts';

export type VehicleUnitLedger = {drive: number; motorcade: number};
export type VehicleTeamLedger = {day: number; team: Team; actualQuarterMetres: number; units: Record<string, VehicleUnitLedger>};
export type VehicleResources = {ap: number; materials: number; fatigue: number; health: number};
export type VehicleCharge = {mode: VehicleMode; unitId: string; weightedQuarterMetres: number; actualQuarterMetres: number};

const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const teams: readonly Team[] = ['blue', 'green', 'white'];

export function newVehicleLedger(day: number, team: Team): VehicleTeamLedger {
  if (!Number.isInteger(day) || day < 1 || day > 28 || !teams.includes(team)) throw new RangeError('Invalid vehicle ledger');
  return {day, team, actualQuarterMetres: 0, units: {}};
}

/** Preserve the current day across phases/reloads; only a later day resets it. */
export function vehicleLedgerForDay(ledger: VehicleTeamLedger, day: number): VehicleTeamLedger {
  if (!Number.isInteger(day) || day < ledger.day || day > 28) throw new RangeError('Invalid vehicle ledger day');
  return day === ledger.day ? ledger : newVehicleLedger(day, ledger.team);
}

/** Preliminary ledger validation only. A future save schema must also validate route history and revisions. */
export function validVehicleLedger(value:unknown,day:number,team:Team,unitIds:readonly string[]):value is VehicleTeamLedger {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const ledger=value as Record<string,unknown>;
  if(Object.keys(ledger).sort().join(',')!=='actualQuarterMetres,day,team,units'||ledger.day!==day||ledger.team!==team||
     !Number.isInteger(day)||day<1||day>28||!teams.includes(team)||!nonnegative(ledger.actualQuarterMetres)||
     !ledger.units||typeof ledger.units!=='object'||Array.isArray(ledger.units))return false;
  const units=ledger.units as Record<string,unknown>,ids=Object.keys(units);
  if(ids.length>7||new Set(unitIds).size!==unitIds.length)return false;
  let weighted=0;
  for(const id of ids){
    if(!unitIds.includes(id)||!new RegExp(`^${team}[1-7]$`).test(id))return false;
    const unit=units[id];if(!unit||typeof unit!=='object'||Array.isArray(unit))return false;
    const record=unit as Record<string,unknown>;
    if(Object.keys(record).sort().join(',')!=='drive,motorcade'||!nonnegative(record.drive)||!nonnegative(record.motorcade)||
      record.drive+record.motorcade===0||!Number.isSafeInteger(weighted+record.drive+record.motorcade))return false;
    weighted+=record.drive+record.motorcade;
  }
  return Number(ledger.actualQuarterMetres)<=weighted && (Number(ledger.actualQuarterMetres)>0)===(weighted>0);
}

/** Accounting only: the campaign command must validate the route, unit availability and occupancy first. */
export function applyVehicleCharge(ledger: VehicleTeamLedger, resources: VehicleResources, charge: VehicleCharge):
  | {ok: true; ledger: VehicleTeamLedger; resources: VehicleResources; cost: {ap: number; supplies: number; fatigue: number; health: number}}
  | {ok: false; reason: 'invalid' | 'ap' | 'materials'} {
  const {unitId, mode, actualQuarterMetres: actual, weightedQuarterMetres: weighted} = charge;
  if (!teams.includes(ledger.team) || !Number.isInteger(ledger.day) || ledger.day < 1 || ledger.day > 28 ||
      !nonnegative(ledger.actualQuarterMetres) || !new RegExp(`^${ledger.team}[1-7]$`).test(unitId) ||
      (mode !== 'drive' && mode !== 'motorcade') || !nonnegative(actual) || actual === 0 ||
      !nonnegative(weighted) || weighted < actual ||
      !Number.isSafeInteger(ledger.actualQuarterMetres + actual) ||
      ![resources.ap, resources.materials, resources.fatigue, resources.health].every(nonnegative) ||
      resources.fatigue > 10 || resources.health > 100) return {ok: false, reason: 'invalid'};
  const existing = ledger.units[unitId] ?? {drive: 0, motorcade: 0};
  if (!nonnegative(existing.drive) || !nonnegative(existing.motorcade) || !Number.isSafeInteger(existing[mode] + weighted)) return {ok: false, reason: 'invalid'};
  const cost = quoteVehicleCost({mode, previousWeightedQuarterMetres: existing[mode], addedWeightedQuarterMetres: weighted,
    previousTeamQuarterMetres: ledger.actualQuarterMetres, addedTeamQuarterMetres: actual});
  if (resources.ap < cost.ap) return {ok: false, reason: 'ap'};
  if (resources.materials < cost.supplies) return {ok: false, reason: 'materials'};
  return {ok: true, cost,
    ledger: {...ledger, actualQuarterMetres: ledger.actualQuarterMetres + actual,
      units: {...ledger.units, [unitId]: {...existing, [mode]: existing[mode] + weighted}}},
    resources: {...resources, ap: resources.ap - cost.ap, materials: resources.materials - cost.supplies,
      fatigue: Math.min(10, resources.fatigue + cost.fatigue), health: Math.max(0, resources.health - cost.health)}};
}
