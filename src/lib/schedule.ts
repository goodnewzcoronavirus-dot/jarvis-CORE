import { useMemo } from 'react';
import { todayStr, type PlanData } from './core';
import { computeSchedule, type Schedule } from './schedule-core';

export * from './schedule-core';

export function useSchedule(plan: PlanData): Schedule {
  const today = todayStr();
  return useMemo(() => computeSchedule(plan, today), [plan, today]);
}
