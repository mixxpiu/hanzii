import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB_323, VOCAB_TOPICS } from '../data/vocab323';
import {
  ALL_VOCAB,
  VOCAB_DECKS,
  VOCAB_FOLDERS,
  getDecksByFolder,
} from '../data/vocabCatalog';
import {
  HUY_TUONG_2_DECKS,
  HUY_TUONG_2_FOLDER_ID,
  VOCAB_HUY_TUONG_2,
} from '../data/vocabHuyTuong2';
import {
  DifficultyLevel,
  ExerciseType,
  StudyStatus,
  type AiExerciseQuestion,
  type ProgressMap,
} from '../types/vocab';
import {
  applyVocabOverrides,
  computeProgressStats,
  computeSrsUpdate,
  computeTypingSessionStats,
  evaluateMeaningAnswer,
  filterVocab,
  generateLocalExerciseSet,
  getWordProgress,
  gradeExerciseSet,
  normalizeSearchText,
  scheduleRetryInQueue,
  selectStudyDeck,
} from './studyLogic';

test('VOCAB_323 contains exact 323 contiguous entries with 13 topics and examples on every word', () => {
  assert.equal(VOCAB_323.length, 323);
  assert.equal(VOCAB_TOPICS.length, 13);

  VOCAB_323.forEach((item, index) => {
    assert.equal(item.id, index + 1);
    assert.ok(item.topicIndex >= 1, `topicIndex missing at id ${item.id}`);
    assert.ok(item.word.length > 0, `word missing at id ${item.id}`);
    assert.ok(item.pinyin.length > 0, `pinyin missing at id ${item.id}`);
    assert.ok(item.viMeaning.length > 0, `viMeaning missing at id ${item.id}`);
    assert.ok(item.posVi.length > 0, `posVi missing at id ${item.id}`);
    assert.ok(item.example.length > 0, `example missing at id ${item.id}`);
    assert.ok(
      item.examplePinyin.length > 0,
      `examplePinyin missing at id ${item.id}`
    );
    assert.ok(item.exampleVi.length > 0, `exampleVi missing at id ${item.id}`);
    assert.ok(
      VOCAB_TOPICS.includes(item.topic),
      `unknown topic ${item.topic} at id ${item.id}`
    );
    assert.equal('hanViet' in item, false);
  });
});

test('VOCAB_CATALOG organizes 2 folders, 23 decks, and 570 cards with exact Quyển 2 Huy Tường counts', () => {
  assert.equal(VOCAB_FOLDERS.length, 2);
  assert.equal(VOCAB_DECKS.length, 23);
  assert.equal(ALL_VOCAB.length, 570);
  assert.equal(VOCAB_HUY_TUONG_2.length, 247);
  assert.equal(HUY_TUONG_2_DECKS.length, 10);

  assert.deepEqual(
    HUY_TUONG_2_DECKS.map((d) => d.cardCount),
    [36, 30, 25, 26, 28, 23, 28, 18, 22, 11]
  );
  assert.equal(getDecksByFolder('hsk1-323').length, 13);
  assert.equal(getDecksByFolder(HUY_TUONG_2_FOLDER_ID).length, 10);

  ALL_VOCAB.forEach((item, index) => {
    assert.equal(item.id, index + 1);
    assert.ok(item.folderId.length > 0, `folderId missing at id ${item.id}`);
    assert.ok(item.deckId.length > 0, `deckId missing at id ${item.id}`);
    assert.ok(item.word.length > 0, `word missing at id ${item.id}`);
    assert.ok(item.pinyin.length > 0, `pinyin missing at id ${item.id}`);
    assert.ok(item.viMeaning.length > 0, `viMeaning missing at id ${item.id}`);
    assert.ok(item.example.length > 0, `example missing at id ${item.id}`);
    assert.equal('hanViet' in item, false);
  });
});

test('applyVocabOverrides patches edited word fields and ignores empty values', () => {
  const updated = applyVocabOverrides(VOCAB_323, {
    2: {
      viMeaning: 'Chào bạn thân mật',
      example: '你好，很高兴认识你！',
      examplePinyin: 'Nǐ hǎo, hěn gāoxìng rènshi nǐ!',
      exampleVi: 'Chào bạn, rất vui được làm quen với bạn!',
    },
    3: {
      viMeaning: '   ',
    },
  });

  assert.equal(updated[1].id, 2);
  assert.equal(updated[1].viMeaning, 'Chào bạn thân mật');
  assert.equal(updated[1].example, '你好，很高兴认识你！');
  assert.equal(updated[2].viMeaning, VOCAB_323[2].viMeaning);
  assert.equal(updated[0].viMeaning, VOCAB_323[0].viMeaning);
});

test('normalizeSearchText strips Vietnamese accents and Pinyin tone marks', () => {
  assert.equal(normalizeSearchText('Điện thoại'), 'dien thoai');
  assert.equal(normalizeSearchText('diànhuà'), 'dianhua');
  assert.equal(normalizeSearchText('nǚ’ér'), 'nu’er');
});

test('filterVocab matches by Chinese, Pinyin without tones, Vietnamese meaning, example, and topic', () => {
  const progress: ProgressMap = {};
  const byChinese = filterVocab(VOCAB_323, progress, {
    query: '先生',
    topic: 'all',
    status: 'all',
  });
  assert.ok(byChinese.some((w) => w.word === '先生'));

  const byPinyin = filterVocab(VOCAB_323, progress, {
    query: 'zaijian',
    topic: 'all',
    status: 'all',
  });
  assert.ok(byPinyin.some((w) => w.word === '再见'));

  const byExampleVi = filterVocab(VOCAB_323, progress, {
    query: 'ly nuoc',
    topic: 'all',
    status: 'all',
  });
  assert.ok(byExampleVi.some((w) => w.word === '给'));

  const firstTopic = VOCAB_TOPICS[0];
  const byTopic = filterVocab(VOCAB_323, progress, {
    query: '',
    topic: firstTopic,
    status: 'all',
  });
  assert.equal(byTopic.length, 28);

  const byFolder = filterVocab(ALL_VOCAB, progress, {
    query: '',
    folderId: HUY_TUONG_2_FOLDER_ID,
    status: 'all',
  });
  assert.equal(byFolder.length, 247);

  const byDeck = filterVocab(ALL_VOCAB, progress, {
    query: '',
    folderId: HUY_TUONG_2_FOLDER_ID,
    deckId: 'ht2-01',
    status: 'all',
  });
  assert.equal(byDeck.length, 36);
  assert.ok(byDeck.some((w) => w.word === '现在'));
});

test('computeSrsUpdate advances intervals on good/easy and resets on again', () => {
  const baseNow = 1_700_000_000_000;
  const initial = getWordProgress({}, 1);

  const firstGood = computeSrsUpdate(initial, 'good', baseNow);
  assert.equal(firstGood.status, StudyStatus.LEARNING);
  assert.equal(firstGood.intervalDays, 1);
  assert.equal(firstGood.repetitions, 1);
  assert.equal(firstGood.correctCount, 1);

  const secondGood = computeSrsUpdate(firstGood, 'good', baseNow);
  assert.equal(secondGood.status, StudyStatus.MASTERED);
  assert.equal(secondGood.intervalDays, 3);
  assert.equal(secondGood.repetitions, 2);

  const resetAgain = computeSrsUpdate(secondGood, 'again', baseNow);
  assert.equal(resetAgain.status, StudyStatus.LEARNING);
  assert.equal(resetAgain.intervalDays, 0);
  assert.equal(resetAgain.repetitions, 0);
  assert.equal(resetAgain.wrongCount, 1);
});

test('selectStudyDeck prioritizes due/weak words and filters by topic accurately', () => {
  const now = 1_700_000_000_000;
  const progress: ProgressMap = {
    5: {
      wordId: 5,
      status: StudyStatus.LEARNING,
      easeFactor: 1.8,
      intervalDays: 1,
      repetitions: 1,
      correctCount: 1,
      wrongCount: 3,
      lastReviewedAt: now - 100000,
      nextReviewAt: now - 1000,
    },
  };

  const weakDeck = selectStudyDeck(VOCAB_323, progress, {
    mode: 'weak',
    limit: 5,
    now,
  });
  assert.equal(weakDeck[0].id, 5);

  const dueDeck = selectStudyDeck(VOCAB_323, progress, {
    mode: 'due',
    limit: 5,
    now,
  });
  assert.equal(dueDeck[0].id, 5);
  assert.equal(dueDeck.length, 5);

  const topicDeck = selectStudyDeck(VOCAB_323, progress, {
    mode: 'topic',
    topic: VOCAB_TOPICS[0],
  });
  assert.equal(topicDeck.length, 28);
  assert.ok(topicDeck.every((w) => w.topic === VOCAB_TOPICS[0]));

  const ht2Deck = selectStudyDeck(ALL_VOCAB, progress, {
    mode: 'topic',
    folderId: HUY_TUONG_2_FOLDER_ID,
    deckId: 'ht2-01',
  });
  assert.equal(ht2Deck.length, 36);
  assert.ok(ht2Deck.every((w) => w.deckId === 'ht2-01'));
});

test('computeProgressStats aggregates status counts, accuracy, 2 folders, and 23 decks', () => {
  const now = 1_700_000_000_000;
  const progress: ProgressMap = {
    1: {
      wordId: 1,
      status: StudyStatus.MASTERED,
      easeFactor: 2.5,
      intervalDays: 3,
      repetitions: 2,
      correctCount: 3,
      wrongCount: 1,
      lastReviewedAt: now - 1000,
      nextReviewAt: now + 100000,
    },
    2: {
      wordId: 2,
      status: StudyStatus.LEARNING,
      easeFactor: 2.3,
      intervalDays: 1,
      repetitions: 1,
      correctCount: 1,
      wrongCount: 0,
      lastReviewedAt: now - 1000,
      nextReviewAt: now - 500,
    },
  };

  const stats = computeProgressStats(ALL_VOCAB, progress, now);
  assert.equal(stats.total, 570);
  assert.equal(stats.masteredCount, 1);
  assert.equal(stats.learningCount, 1);
  assert.equal(stats.newCount, 568);
  assert.equal(stats.dueCount, 1);
  assert.equal(stats.accuracyPercent, 80);
  assert.equal(stats.folderBreakdown.length, 2);
  assert.equal(stats.topicBreakdown.length, 23);
});

test('evaluateMeaningAnswer handles exact, multi-meaning, accent-stripped, synonyms, classifiers, and typos', () => {
  assert.equal(
    evaluateMeaningAnswer('yêu', 'yêu, thích').matchType,
    'exact'
  );
  assert.equal(
    evaluateMeaningAnswer('điện thoại', 'điện thoại (di động)').matchType,
    'exact'
  );
  assert.equal(
    evaluateMeaningAnswer('xin chao', 'xin chào').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('ba', 'bố').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('ốm', 'bệnh').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('con mèo', 'mèo').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('dien thoaij', 'điện thoại').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('máy bay', 'yêu, thích').isCorrect,
    false
  );
  assert.equal(
    evaluateMeaningAnswer('bà', 'bố').isCorrect,
    false
  );
  assert.equal(
    evaluateMeaningAnswer('   ', 'xin chào').matchType,
    'empty'
  );
});

test('gradeExerciseSet grades multiple choice, fill blank, matching, and sentence order', () => {
  const questions: AiExerciseQuestion[] = [
    {
      id: 'q1',
      kind: 'multiple_choice',
      targetWordIds: [1],
      promptVi: 'Chọn nghĩa đúng của 你好',
      options: ['Xin chào', 'Tạm biệt', 'Cảm ơn', 'Xin lỗi'],
      correctAnswer: 'Xin chào',
      explanationVi: '你好 (nǐ hǎo) nghĩa là xin chào.',
      memoryTipVi: 'Cụm từ chào hỏi thông dụng.',
    },
    {
      id: 'q2',
      kind: 'fill_blank',
      targetWordIds: [3],
      promptVi: 'Điền từ thích hợp: 你___什么工作？',
      options: ['做', '吃', '喝', '去'],
      correctAnswer: '做',
      explanationVi: '做 (zuò) nghĩa là làm.',
      memoryTipVi: 'Động từ chỉ hành động làm việc.',
    },
    {
      id: 'q3',
      kind: 'matching',
      targetWordIds: [26, 27],
      promptVi: 'Nối từ đúng',
      matchingPairs: [
        { id: 'p1', left: '请', right: 'Mời' },
        { id: 'p2', left: '谢谢', right: 'Cảm ơn' },
      ],
      explanationVi: '请 (qǐng - mời) và 谢谢 (xièxie - cảm ơn).',
      memoryTipVi: 'Hai từ lịch sự cơ bản.',
    },
    {
      id: 'q4',
      kind: 'sentence_order',
      targetWordIds: [2, 12],
      promptVi: 'Sắp xếp thành câu: Tôi rất khỏe.',
      orderTokens: ['很好', '我'],
      correctOrder: ['我', '很好'],
      explanationVi: '我很好 (Wǒ hěn hǎo).',
      memoryTipVi: 'Chủ ngữ + 很 + Tính từ.',
    },
  ];

  const summary = gradeExerciseSet(questions, {
    q1: 'Xin chào',
    q2: '去',
    q3: { p1: 'Mời', p2: 'Cảm ơn' },
    q4: ['我', '很好'],
  });

  assert.equal(summary.total, 4);
  assert.equal(summary.correct, 3);
  assert.equal(summary.scorePercent, 75);
  assert.equal(summary.results.q1, true);
  assert.equal(summary.results.q2, false);
  assert.equal(summary.results.q3, true);
  assert.equal(summary.results.q4, true);
  assert.deepEqual(summary.wrongWordIds, [3]);
});

test('generateLocalExerciseSet builds valid mixed, matching & fill_blank questions with unique options', () => {
  const mixedSet = generateLocalExerciseSet(VOCAB_323.slice(0, 20), VOCAB_323, {
    exerciseType: ExerciseType.MIXED,
    difficulty: DifficultyLevel.BASIC,
    count: 6,
  });
  assert.equal(mixedSet.questions.length, 6);
  assert.ok(mixedSet.questions.some((q) => q.kind === 'fill_blank'));
  assert.ok(mixedSet.questions.some((q) => q.kind === 'matching'));
  assert.ok(mixedSet.questions.every((q) => q.kind !== ('type_meaning' as string)));

  for (const q of mixedSet.questions) {
    assert.ok(q.targetWordIds.length > 0);
    assert.ok(q.memoryTipVi.length > 0);
    if (q.kind === 'multiple_choice' || q.kind === 'fill_blank') {
      assert.equal(q.options?.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options?.includes(q.correctAnswer!));
      if (q.kind === 'fill_blank') {
        assert.ok(q.chinesePrompt?.includes('___'));
      }
    } else if (q.kind === 'matching') {
      assert.equal(q.matchingPairs?.length, 4);
    }
  }

  const ht2Set = generateLocalExerciseSet(
    VOCAB_HUY_TUONG_2.slice(0, 15),
    ALL_VOCAB,
    {
      exerciseType: ExerciseType.MIXED,
      difficulty: DifficultyLevel.BASIC,
      count: 50,
    }
  );
  assert.equal(ht2Set.questions.length, 50);
  assert.equal(new Set(ht2Set.questions.map((q) => q.id)).size, 50);
  for (const q of ht2Set.questions) {
    assert.equal(q.explanationVi.includes('()'), false);
    assert.equal(q.explanationVi.endsWith('— .'), false);
  }

  const custom25 = generateLocalExerciseSet(
    VOCAB_HUY_TUONG_2.slice(0, 20),
    ALL_VOCAB,
    {
      exerciseType: ExerciseType.MULTIPLE_CHOICE,
      difficulty: DifficultyLevel.INTERMEDIATE,
      count: 25,
    }
  );
  assert.equal(custom25.questions.length, 25);
});

test('selectStudyDeck supports starred mode and computeTypingSessionStats aggregates outcomes accurately', () => {
  const starredDeck = selectStudyDeck(ALL_VOCAB, {}, {
    mode: 'starred',
    starredIds: [1, 4, 15],
    limit: 20,
  });
  assert.deepEqual(
    starredDeck.map((w) => w.id),
    [1, 4, 15]
  );

  const stats = computeTypingSessionStats([
    { wordId: 1, status: 'exact' },
    { wordId: 2, status: 'near' },
    { wordId: 3, status: 'wrong' },
    { wordId: 4, status: 'unknown' },
    { wordId: 3, status: 'exact' },
  ]);
  assert.equal(stats.total, 5);
  assert.equal(stats.exactCount, 2);
  assert.equal(stats.nearCount, 1);
  assert.equal(stats.correctCount, 3);
  assert.equal(stats.wrongCount, 1);
  assert.equal(stats.unknownCount, 1);
  assert.equal(stats.accuracyPercent, 60);
  assert.deepEqual(stats.missedWordIds, [4]);
});

test('scheduleRetryInQueue re-inserts missed words after a dynamic gap based on miss count and caps retries', () => {
  const sampleQueue = ALL_VOCAB.slice(0, 6);
  const word0 = sampleQueue[0];

  // First miss -> gap of 3 cards later (inserted at index 4)
  const firstMiss = scheduleRetryInQueue(sampleQueue, word0, {
    currentIndex: 0,
    sessionMissCount: 1,
    historicalWrongCount: 0,
  });
  assert.equal(firstMiss.gapUsed, 3);
  assert.equal(firstMiss.insertedAtIndex, 4);
  assert.equal(firstMiss.nextQueue.length, 7);
  assert.equal(firstMiss.nextQueue[4].id, word0.id);

  // Second miss (or chronic wrong history) -> tighter gap of 2 cards later
  const secondMiss = scheduleRetryInQueue(firstMiss.nextQueue, word0, {
    currentIndex: 4,
    sessionMissCount: 2,
    historicalWrongCount: 0,
  });
  assert.equal(secondMiss.gapUsed, 2);
  assert.equal(secondMiss.insertedAtIndex, 7);
  assert.equal(secondMiss.nextQueue[7].id, word0.id);

  // Exceeding maxRetriesPerWord -> no further automatic re-queue
  const capped = scheduleRetryInQueue(secondMiss.nextQueue, word0, {
    currentIndex: 7,
    sessionMissCount: 3,
    historicalWrongCount: 0,
  });
  assert.equal(capped.insertedAtIndex, null);
  assert.equal(capped.nextQueue.length, secondMiss.nextQueue.length);

  // Enhanced local near-meaning rules without AI
  assert.equal(
    evaluateMeaningAnswer('tôi xin lỗi', 'Xin lỗi').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('cam on', 'Cảm ơn').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('khong co chi', 'Không có gì / Đừng khách khí').matchType,
    'near'
  );
  assert.equal(
    evaluateMeaningAnswer('đang bận', 'Bận').matchType,
    'near'
  );
});
