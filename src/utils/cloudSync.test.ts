import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyStatus } from '../types/vocab';
import {
  mergeInsightMaps,
  mergeOverridesMaps,
  mergeProgressMaps,
  sanitizeVocabOverridePayload,
  sanitizeWordInsightPayload,
  sanitizeWordProgressPayload,
} from './cloudSync';

test('sanitizeWordProgressPayload clamps bounds and preserves nullable timestamps', () => {
  const sanitized = sanitizeWordProgressPayload('user-123', {
    wordId: 42,
    status: StudyStatus.MASTERED,
    easeFactor: 99,
    intervalDays: -5,
    repetitions: 3,
    correctCount: 10,
    wrongCount: 2,
    lastReviewedAt: null,
    nextReviewAt: 1700000000123.7,
  });

  assert.equal(sanitized.ownerId, 'user-123');
  assert.equal(sanitized.wordId, 42);
  assert.equal(sanitized.easeFactor, 10);
  assert.equal(sanitized.intervalDays, 0);
  assert.equal(sanitized.lastReviewedAt, null);
  assert.equal(sanitized.nextReviewAt, 1700000000124);
});

test('sanitizeVocabOverridePayload truncates oversized strings to blueprint limits', () => {
  const longText = 'a'.repeat(700);
  const sanitized = sanitizeVocabOverridePayload('user-1', 15, {
    viMeaning: `  ${longText}  `,
    posVi: 'b'.repeat(200),
    example: '我喜欢学习汉语',
    examplePinyin: 'Wǒ xǐhuan xuéxí Hànyǔ',
    exampleVi: 'Tôi thích học tiếng Trung',
  });

  assert.equal(sanitized.viMeaning.length, 500);
  assert.equal(sanitized.posVi.length, 100);
  assert.equal(sanitized.wordId, 15);
});

test('sanitizeWordInsightPayload bounds arrays and string fields', () => {
  const sanitized = sanitizeWordInsightPayload('user-1', {
    wordId: 5,
    characterBreakdown: Array.from({ length: 20 }, (_, i) => ({
      char: `字${i}`,
      meaningVi: 'nghĩa',
    })),
    examples: Array.from({ length: 10 }, (_, i) => ({
      chinese: `例句 ${i}`,
      pinyin: 'lìjù',
      vietnamese: 'ví dụ',
    })),
    usageNoteVi: 'n'.repeat(1200),
    memoryTipVi: 'mẹo',
  });

  assert.equal(sanitized.characterBreakdown.length, 12);
  assert.equal(sanitized.examples.length, 6);
  assert.equal(sanitized.usageNoteVi.length, 1000);
});

test('mergeProgressMaps uploads local-only and newer local records without losing newer cloud data', () => {
  const local = {
    1: {
      wordId: 1,
      status: StudyStatus.LEARNING,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      correctCount: 1,
      wrongCount: 0,
      lastReviewedAt: 2000,
      nextReviewAt: 5000,
    },
    2: {
      wordId: 2,
      status: StudyStatus.LEARNING,
      easeFactor: 2.4,
      intervalDays: 1,
      repetitions: 1,
      correctCount: 1,
      wrongCount: 1,
      lastReviewedAt: 1000,
      nextReviewAt: 3000,
    },
  };

  const cloud = {
    2: {
      wordId: 2,
      status: StudyStatus.MASTERED,
      easeFactor: 2.6,
      intervalDays: 6,
      repetitions: 3,
      correctCount: 4,
      wrongCount: 1,
      lastReviewedAt: 5000,
      nextReviewAt: 9000,
    },
    3: {
      wordId: 3,
      status: StudyStatus.MASTERED,
      easeFactor: 2.5,
      intervalDays: 3,
      repetitions: 2,
      correctCount: 2,
      wrongCount: 0,
      lastReviewedAt: 4000,
      nextReviewAt: 8000,
    },
  };

  const { merged, toUpload } = mergeProgressMaps(local, cloud);
  assert.equal(merged[1].status, StudyStatus.LEARNING);
  assert.equal(merged[2].status, StudyStatus.MASTERED);
  assert.equal(merged[3].status, StudyStatus.MASTERED);
  assert.deepEqual(
    toUpload.map((x) => x.wordId),
    [1]
  );
});

test('mergeOverridesMaps and mergeInsightMaps preserve cloud entries and queue local-only additions', () => {
  const overridesRes = mergeOverridesMaps(
    {
      1: { viMeaning: 'cục bộ' },
      2: { viMeaning: 'sửa mới' },
    },
    {
      1: { viMeaning: 'trên cloud' },
    }
  );
  assert.equal(overridesRes.merged[1].viMeaning, 'trên cloud');
  assert.equal(overridesRes.merged[2].viMeaning, 'sửa mới');
  assert.deepEqual(
    overridesRes.toUpload.map((x) => x.wordId),
    [2]
  );

  const insightsRes = mergeInsightMaps(
    {
      10: {
        wordId: 10,
        characterBreakdown: [],
        examples: [],
        usageNoteVi: 'u',
        memoryTipVi: 'm',
      },
    },
    {}
  );
  assert.equal(insightsRes.toUpload.length, 1);
  assert.equal(insightsRes.merged[10].wordId, 10);
});
