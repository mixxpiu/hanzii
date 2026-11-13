import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyStatus } from '../types/vocab';
import {
  bootstrapStreakFromProgress,
  computeStreakSummary,
  mergeStreakStates,
  recordStudyDay,
  sanitizeStreakState,
  toLocalDateKey,
} from './streakLogic';

function localTimestamp(year: number, month: number, day: number, hour = 10): number {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

test('toLocalDateKey formats local calendar YYYY-MM-DD accurately', () => {
  const ts = localTimestamp(2026, 11, 5, 23);
  assert.equal(toLocalDateKey(ts), '2026-11-05');
});

test('recordStudyDay adds unique sorted dates and tracks bestStreak', () => {
  let state = sanitizeStreakState({ studyDates: [], bestStreak: 0 });
  state = recordStudyDay(state, localTimestamp(2026, 11, 10));
  state = recordStudyDay(state, localTimestamp(2026, 11, 10, 19));
  state = recordStudyDay(state, localTimestamp(2026, 11, 11));
  state = recordStudyDay(state, localTimestamp(2026, 11, 12));

  assert.deepEqual(state.studyDates, ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(state.bestStreak, 3);
});

test('computeStreakSummary keeps streak alive via yesterday grace and resets after missed day', () => {
  const state = sanitizeStreakState({
    studyDates: ['2026-11-10', '2026-11-11', '2026-11-12'],
    bestStreak: 3,
  });

  // On Nov 13 before studying today -> grace streak = 3, studiedToday = false
  const graceSummary = computeStreakSummary(state, localTimestamp(2026, 11, 13));
  assert.equal(graceSummary.currentStreak, 3);
  assert.equal(graceSummary.studiedToday, false);
  assert.equal(graceSummary.bestStreak, 3);
  assert.equal(graceSummary.last7Days.length, 7);
  assert.equal(graceSummary.last7Days[6].dateKey, '2026-11-13');
  assert.equal(graceSummary.last7Days[6].isToday, true);
  assert.equal(graceSummary.last7Days[5].studied, true);

  // On Nov 14 without studying Nov 13 -> streak broken (0), bestStreak preserved (3)
  const brokenSummary = computeStreakSummary(state, localTimestamp(2026, 11, 14));
  assert.equal(brokenSummary.currentStreak, 0);
  assert.equal(brokenSummary.bestStreak, 3);
  assert.equal(brokenSummary.totalStudyDays, 3);
});

test('bootstrapStreakFromProgress extracts unique local study dates from existing reviews', () => {
  const bootstrapped = bootstrapStreakFromProgress({
    1: {
      wordId: 1,
      status: StudyStatus.MASTERED,
      easeFactor: 2.5,
      intervalDays: 3,
      repetitions: 2,
      correctCount: 2,
      wrongCount: 0,
      lastReviewedAt: localTimestamp(2026, 11, 12, 9),
      nextReviewAt: null,
    },
    2: {
      wordId: 2,
      status: StudyStatus.LEARNING,
      easeFactor: 2.3,
      intervalDays: 1,
      repetitions: 1,
      correctCount: 1,
      wrongCount: 1,
      lastReviewedAt: localTimestamp(2026, 11, 13, 8),
      nextReviewAt: null,
    },
  });

  assert.deepEqual(bootstrapped.studyDates, ['2026-11-12', '2026-11-13']);
  assert.equal(bootstrapped.bestStreak, 2);
});

test('mergeStreakStates unions dates across devices and computes upload flag', () => {
  const { merged, shouldUpload } = mergeStreakStates(
    { studyDates: ['2026-11-13'], bestStreak: 1 },
    { studyDates: ['2026-11-11', '2026-11-12'], bestStreak: 4 }
  );

  assert.deepEqual(merged.studyDates, ['2026-11-11', '2026-11-12', '2026-11-13']);
  assert.equal(merged.bestStreak, 4);
  assert.equal(shouldUpload, true);

  const noUpload = mergeStreakStates(
    { studyDates: ['2026-11-12'], bestStreak: 1 },
    { studyDates: ['2026-11-12', '2026-11-13'], bestStreak: 2 }
  );
  assert.equal(noUpload.shouldUpload, false);
});
