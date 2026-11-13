import type { ProgressMap, StudyStreakState } from '../types/vocab';

const MAX_STORED_DATES = 365;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export interface StreakDayCell {
  dateKey: string;
  weekdayLabel: string;
  dayNumber: number;
  studied: boolean;
  isToday: boolean;
}

export interface StreakSummary {
  currentStreak: number;
  bestStreak: number;
  totalStudyDays: number;
  studiedToday: boolean;
  last7Days: StreakDayCell[];
}

export function toLocalDateKey(timestampMs: number = Date.now()): string {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKeyToLocalMidnight(dateKey: string): Date | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const dt = parseDateKeyToLocalMidnight(dateKey);
  if (!dt) return dateKey;
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateKey(dt.getTime());
}

export function normalizeStudyDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return [];
  const validSet = new Set<string>();
  for (const item of dates) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (parseDateKeyToLocalMidnight(trimmed)) {
        validSet.add(trimmed);
      }
    }
  }
  const sorted = Array.from(validSet).sort();
  if (sorted.length > MAX_STORED_DATES) {
    return sorted.slice(sorted.length - MAX_STORED_DATES);
  }
  return sorted;
}

export function computeMaxHistoricalStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const expectedNext = shiftDateKey(sortedDates[i - 1], 1);
    if (sortedDates[i] === expectedNext) {
      currentRun += 1;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }
  return maxRun;
}

export function sanitizeStreakState(state: Partial<StudyStreakState> | null | undefined): StudyStreakState {
  const studyDates = normalizeStudyDates(state?.studyDates ?? []);
  const historicalBest = computeMaxHistoricalStreak(studyDates);
  const rawBest =
    typeof state?.bestStreak === 'number' && Number.isFinite(state.bestStreak)
      ? Math.min(10000, Math.max(0, Math.round(state.bestStreak)))
      : 0;
  return {
    studyDates,
    bestStreak: Math.max(rawBest, historicalBest),
  };
}

export function recordStudyDay(
  state: StudyStreakState,
  now: number = Date.now()
): StudyStreakState {
  const todayKey = toLocalDateKey(now);
  const currentDates = normalizeStudyDates(state.studyDates);
  if (!currentDates.includes(todayKey)) {
    currentDates.push(todayKey);
  }
  const trimmedDates = normalizeStudyDates(currentDates);
  const historicalBest = computeMaxHistoricalStreak(trimmedDates);
  return {
    studyDates: trimmedDates,
    bestStreak: Math.max(state.bestStreak ?? 0, historicalBest),
  };
}

export function computeStreakSummary(
  state: StudyStreakState,
  now: number = Date.now()
): StreakSummary {
  const clean = sanitizeStreakState(state);
  const dateSet = new Set(clean.studyDates);
  const todayKey = toLocalDateKey(now);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const studiedToday = dateSet.has(todayKey);

  let currentStreak = 0;
  let cursor = studiedToday
    ? todayKey
    : dateSet.has(yesterdayKey)
      ? yesterdayKey
      : null;

  while (cursor && dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const last7Days: StreakDayCell[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    const key = shiftDateKey(todayKey, offset);
    const dt = parseDateKeyToLocalMidnight(key) ?? new Date(now);
    last7Days.push({
      dateKey: key,
      weekdayLabel: WEEKDAY_LABELS[dt.getDay()],
      dayNumber: dt.getDate(),
      studied: dateSet.has(key),
      isToday: offset === 0,
    });
  }

  return {
    currentStreak,
    bestStreak: Math.max(clean.bestStreak, currentStreak),
    totalStudyDays: clean.studyDates.length,
    studiedToday,
    last7Days,
  };
}

export function bootstrapStreakFromProgress(
  progressMap: ProgressMap
): StudyStreakState {
  const derivedDates: string[] = [];
  for (const item of Object.values(progressMap)) {
    if (
      item &&
      typeof item.lastReviewedAt === 'number' &&
      Number.isFinite(item.lastReviewedAt) &&
      item.lastReviewedAt > 0
    ) {
      derivedDates.push(toLocalDateKey(item.lastReviewedAt));
    }
  }
  return sanitizeStreakState({ studyDates: derivedDates, bestStreak: 0 });
}

export function mergeStreakStates(
  local: StudyStreakState,
  cloud: StudyStreakState | null
): {
  merged: StudyStreakState;
  shouldUpload: boolean;
} {
  const cleanLocal = sanitizeStreakState(local);
  if (!cloud) {
    return {
      merged: cleanLocal,
      shouldUpload: cleanLocal.studyDates.length > 0 || cleanLocal.bestStreak > 0,
    };
  }

  const cleanCloud = sanitizeStreakState(cloud);
  const combinedDates = normalizeStudyDates([
    ...cleanLocal.studyDates,
    ...cleanCloud.studyDates,
  ]);
  const bestStreak = Math.max(
    cleanLocal.bestStreak,
    cleanCloud.bestStreak,
    computeMaxHistoricalStreak(combinedDates)
  );
  const merged: StudyStreakState = {
    studyDates: combinedDates,
    bestStreak,
  };

  const cloudSet = new Set(cleanCloud.studyDates);
  const hasNewLocalDates = combinedDates.some((d) => !cloudSet.has(d));
  const shouldUpload = hasNewLocalDates || bestStreak > cleanCloud.bestStreak;

  return { merged, shouldUpload };
}
