import {
  DifficultyLevel,
  ExerciseType,
  StudyStatus,
  type AiExerciseQuestion,
  type AiExerciseSet,
  type ProgressMap,
  type VocabOverride,
  type VocabOverridesMap,
  type VocabWord,
  type WordProgress,
} from '../types/vocab';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface VocabFilterOptions {
  query: string;
  folderId?: string | 'all';
  deckId?: string | 'all';
  topic?: string | 'all';
  status: StudyStatus | 'all';
}

export interface ProgressStats {
  total: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  dueCount: number;
  accuracyPercent: number;
  folderBreakdown: Array<{
    folderId: string;
    folderName: string;
    total: number;
    mastered: number;
    learning: number;
  }>;
  topicBreakdown: Array<{
    deckId: string;
    folderId: string;
    folderName: string;
    topic: string;
    total: number;
    mastered: number;
    learning: number;
  }>;
}

export type ExerciseUserAnswer =
  | string
  | Record<string, string>
  | string[];

export interface GradedQuestionResult {
  questionId: string;
  isCorrect: boolean;
  targetWordIds: number[];
}

export interface GradedExerciseSummary {
  total: number;
  correct: number;
  scorePercent: number;
  results: Record<string, boolean>;
  correctWordIds: number[];
  wrongWordIds: number[];
}

function pickNonEmpty(overrideVal: string | undefined, fallback: string): string {
  if (typeof overrideVal !== 'string') return fallback;
  const trimmed = overrideVal.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function applyVocabOverrides(
  words: VocabWord[],
  overrides: VocabOverridesMap
): VocabWord[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return words;
  }
  return words.map((word) => {
    const ov: VocabOverride | undefined = overrides[word.id];
    if (!ov) return word;
    return {
      ...word,
      viMeaning: pickNonEmpty(ov.viMeaning, word.viMeaning),
      posVi: pickNonEmpty(ov.posVi, word.posVi),
      example: pickNonEmpty(ov.example, word.example),
      examplePinyin: pickNonEmpty(ov.examplePinyin, word.examplePinyin),
      exampleVi: pickNonEmpty(ov.exampleVi, word.exampleVi),
    };
  });
}

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getWordProgress(
  progressMap: ProgressMap,
  wordId: number
): WordProgress {
  const existing = progressMap[wordId];
  if (existing) return existing;
  return {
    wordId,
    status: StudyStatus.NEW,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    correctCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
  };
}

export function filterVocab(
  words: VocabWord[],
  progressMap: ProgressMap,
  filters: VocabFilterOptions
): VocabWord[] {
  const normalizedQuery = normalizeSearchText(filters.query);

  return words.filter((word) => {
    if (
      filters.folderId &&
      filters.folderId !== 'all' &&
      word.folderId !== filters.folderId
    ) {
      return false;
    }
    if (
      filters.deckId &&
      filters.deckId !== 'all' &&
      word.deckId !== filters.deckId
    ) {
      return false;
    }
    if (
      filters.topic &&
      filters.topic !== 'all' &&
      word.topic !== filters.topic
    ) {
      return false;
    }
    const progress = getWordProgress(progressMap, word.id);
    if (filters.status !== 'all' && progress.status !== filters.status) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      String(word.id),
      word.word,
      normalizeSearchText(word.pinyin),
      normalizeSearchText(word.viMeaning),
      word.example,
      normalizeSearchText(word.examplePinyin),
      normalizeSearchText(word.exampleVi),
      normalizeSearchText(word.topic),
      normalizeSearchText(word.folderName),
    ].join(' ');

    return haystack.includes(normalizedQuery);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeSrsUpdate(
  current: WordProgress,
  rating: ReviewRating,
  now: number = Date.now()
): WordProgress {
  let { easeFactor, intervalDays, repetitions, correctCount, wrongCount } =
    current;
  let status = current.status;

  if (rating === 'again') {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
    wrongCount += 1;
    status = StudyStatus.LEARNING;
    return {
      ...current,
      status,
      easeFactor,
      intervalDays,
      repetitions,
      correctCount,
      wrongCount,
      lastReviewedAt: now,
      nextReviewAt: now + 10 * 60 * 1000,
    };
  }

  correctCount += 1;

  if (rating === 'hard') {
    repetitions = Math.max(1, repetitions);
    intervalDays =
      repetitions <= 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    easeFactor = Math.max(1.3, Number((easeFactor - 0.15).toFixed(2)));
    status = StudyStatus.LEARNING;
  } else if (rating === 'good') {
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(4, Math.round(intervalDays * easeFactor));
    }
    status = repetitions >= 2 ? StudyStatus.MASTERED : StudyStatus.LEARNING;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 3;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(7, Math.round(intervalDays * easeFactor * 1.3));
    }
    easeFactor = Number((easeFactor + 0.1).toFixed(2));
    status = StudyStatus.MASTERED;
  }

  return {
    ...current,
    status,
    easeFactor,
    intervalDays,
    repetitions,
    correctCount,
    wrongCount,
    lastReviewedAt: now,
    nextReviewAt: now + intervalDays * DAY_MS,
  };
}

export function isWordDue(
  progress: WordProgress,
  now: number = Date.now()
): boolean {
  if (progress.status === StudyStatus.NEW) return false;
  if (progress.nextReviewAt === null) return true;
  return progress.nextReviewAt <= now;
}

export type DeckMode =
  | 'due'
  | 'new'
  | 'weak'
  | 'starred'
  | 'topic'
  | 'all_random';

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function selectStudyDeck(
  words: VocabWord[],
  progressMap: ProgressMap,
  options: {
    mode: DeckMode;
    folderId?: string | 'all';
    deckId?: string;
    topic?: string;
    starredIds?: number[] | Set<number>;
    shuffle?: boolean;
    limit?: number;
    now?: number;
  }
): VocabWord[] {
  const now = options.now ?? Date.now();
  const scopedWords =
    options.folderId && options.folderId !== 'all'
      ? words.filter((w) => w.folderId === options.folderId)
      : words;
  const limit = options.limit ?? (options.mode === 'topic' ? 50 : 20);
  const maybeShuffle = (list: VocabWord[]) =>
    options.shuffle ? shuffleArray(list) : list;

  if (options.mode === 'topic') {
    if (options.deckId) {
      return maybeShuffle(
        scopedWords.filter((w) => w.deckId === options.deckId)
      ).slice(0, limit);
    }
    if (options.topic) {
      return maybeShuffle(
        scopedWords.filter((w) => w.topic === options.topic)
      ).slice(0, limit);
    }
  }

  if (options.mode === 'starred') {
    const starredSet =
      options.starredIds instanceof Set
        ? options.starredIds
        : new Set(options.starredIds ?? []);
    return maybeShuffle(scopedWords.filter((w) => starredSet.has(w.id))).slice(
      0,
      limit
    );
  }

  if (options.mode === 'weak') {
    const weak = scopedWords
      .filter((w) => {
        const p = getWordProgress(progressMap, w.id);
        return p.wrongCount > 0 || p.status === StudyStatus.LEARNING;
      })
      .sort((a, b) => {
        const pa = getWordProgress(progressMap, a.id);
        const pb = getWordProgress(progressMap, b.id);
        return pb.wrongCount - pa.wrongCount || pa.easeFactor - pb.easeFactor;
      });
    return maybeShuffle(weak).slice(0, limit);
  }

  if (options.mode === 'new') {
    return maybeShuffle(
      scopedWords.filter(
        (w) => getWordProgress(progressMap, w.id).status === StudyStatus.NEW
      )
    ).slice(0, limit);
  }

  if (options.mode === 'due') {
    const due = scopedWords.filter((w) =>
      isWordDue(getWordProgress(progressMap, w.id), now)
    );
    if (due.length >= limit) {
      return maybeShuffle(due).slice(0, limit);
    }
    const dueIds = new Set(due.map((w) => w.id));
    const fill = scopedWords.filter(
      (w) =>
        !dueIds.has(w.id) &&
        getWordProgress(progressMap, w.id).status !== StudyStatus.MASTERED
    );
    return maybeShuffle([...due, ...fill]).slice(0, limit);
  }

  return shuffleArray(scopedWords).slice(0, limit);
}

export function computeProgressStats(
  words: VocabWord[],
  progressMap: ProgressMap,
  now: number = Date.now()
): ProgressStats {
  let newCount = 0;
  let learningCount = 0;
  let masteredCount = 0;
  let dueCount = 0;
  let totalCorrect = 0;
  let totalAttempts = 0;

  const folderMap = new Map<
    string,
    {
      folderId: string;
      folderName: string;
      total: number;
      mastered: number;
      learning: number;
    }
  >();

  const deckMap = new Map<
    string,
    {
      deckId: string;
      folderId: string;
      folderName: string;
      topic: string;
      total: number;
      mastered: number;
      learning: number;
    }
  >();

  for (const word of words) {
    const p = getWordProgress(progressMap, word.id);
    if (p.status === StudyStatus.NEW) newCount += 1;
    else if (p.status === StudyStatus.LEARNING) learningCount += 1;
    else masteredCount += 1;

    if (isWordDue(p, now)) dueCount += 1;

    totalCorrect += p.correctCount;
    totalAttempts += p.correctCount + p.wrongCount;

    const fBucket = folderMap.get(word.folderId) ?? {
      folderId: word.folderId,
      folderName: word.folderName,
      total: 0,
      mastered: 0,
      learning: 0,
    };
    fBucket.total += 1;
    if (p.status === StudyStatus.MASTERED) fBucket.mastered += 1;
    else if (p.status === StudyStatus.LEARNING) fBucket.learning += 1;
    folderMap.set(word.folderId, fBucket);

    const dBucket = deckMap.get(word.deckId) ?? {
      deckId: word.deckId,
      folderId: word.folderId,
      folderName: word.folderName,
      topic: word.topic,
      total: 0,
      mastered: 0,
      learning: 0,
    };
    dBucket.total += 1;
    if (p.status === StudyStatus.MASTERED) dBucket.mastered += 1;
    else if (p.status === StudyStatus.LEARNING) dBucket.learning += 1;
    deckMap.set(word.deckId, dBucket);
  }

  return {
    total: words.length,
    newCount,
    learningCount,
    masteredCount,
    dueCount,
    accuracyPercent:
      totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100),
    folderBreakdown: Array.from(folderMap.values()),
    topicBreakdown: Array.from(deckMap.values()),
  };
}

function cleanCompareText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[。，！？、.,!?]/g, '');
}

export type MeaningMatchType = 'empty' | 'exact' | 'near' | 'wrong';

export interface MeaningEvaluationResult {
  isCorrect: boolean;
  matchType: MeaningMatchType;
  matchedTarget?: string;
}

const VIETNAMESE_SYNONYM_GROUPS: string[][] = [
  ['bố', 'ba', 'cha'],
  ['mẹ', 'má'],
  ['bệnh', 'ốm', 'đau ốm', 'bị bệnh', 'bị ốm'],
  ['xe hơi', 'ô tô', 'xe ô tô'],
  ['cảm ơn', 'cám ơn'],
  ['xin lỗi', 'lỗi', 'thứ lỗi'],
  ['không có gì', 'không có chi', 'đừng khách sáo', 'không sao'],
  ['tạm biệt', 'chào tạm biệt'],
  ['xin chào', 'chào', 'chào bạn'],
  ['thích', 'yêu thích', 'ưa', 'mến'],
  ['yêu', 'thương', 'yêu thương'],
  ['lớn', 'to'],
  ['nhỏ', 'bé'],
  ['vui', 'vui vẻ', 'vui mừng', 'mừng', 'hạnh phúc', 'phấn khởi', 'mừng rỡ'],
  ['buồn', 'buồn bã', 'sầu'],
  ['đẹp', 'xinh', 'xinh đẹp', 'đẹp đẽ'],
  ['tốt', 'tốt đẹp', 'ổn'],
  ['khỏe', 'khỏe mạnh'],
  ['ngon', 'thơm ngon', 'ngon miệng'],
  ['nhiều', 'đông', 'lắm'],
  ['nhanh', 'mau', 'lẹ'],
  ['chậm', 'chậm chạp', 'từ từ'],
  ['mua', 'mua sắm', 'sắm'],
  ['bán', 'buôn bán'],
  ['nhìn', 'xem', 'ngắm', 'trông'],
  ['nói', 'bảo', 'kể', 'nói chuyện'],
  ['nghe', 'lắng nghe'],
  ['đọc', 'đọc sách'],
  ['viết', 'ghi', 'ghi chép'],
  ['học', 'học tập', 'học hành'],
  ['làm', 'làm việc', 'thực hiện', 'chế tạo'],
  ['công việc', 'việc làm', 'việc', 'nghề nghiệp'],
  ['biết', 'hiểu', 'nắm được'],
  ['nghĩ', 'suy nghĩ'],
  ['cảm thấy', 'thấy', 'thấy rằng', 'cho rằng'],
  ['nhớ', 'ghi nhớ', 'nhớ nhung'],
  ['quên', 'lãng quên'],
  ['đợi', 'chờ', 'chờ đợi'],
  ['gặp', 'gặp gỡ', 'gặp mặt'],
  ['tìm', 'tìm kiếm', 'kiếm'],
  ['bận', 'bận rộn'],
  ['cho', 'tặng', 'biếu', 'đưa', 'đưa cho'],
  ['uống', 'nhấp'],
  ['ăn', 'ăn cơm', 'dùng bữa'],
  ['ngủ', 'đi ngủ', 'ngủ nghỉ'],
  ['đến', 'tới', 'đến nơi'],
  ['về', 'trở về', 'quay về', 'về nhà'],
  ['ở', 'tại', 'sống ở', 'cư trú'],
  ['nhà', 'gia đình', 'tổ ấm'],
  ['bạn', 'bạn bè', 'người bạn'],
  ['mọi người', 'tất cả mọi người', 'cả nhà'],
  ['học sinh', 'học trò'],
  ['sinh viên', 'sinh viên đại học'],
  ['giáo viên', 'thầy giáo', 'cô giáo', 'thầy cô'],
  ['bác sĩ', 'thầy thuốc'],
  ['bây giờ', 'hiện tại', 'lúc này', 'giờ'],
  ['hôm nay', 'ngày hôm nay', 'bữa nay'],
  ['ngày mai', 'mai'],
  ['hôm qua', 'ngày hôm qua'],
  ['rất', 'lắm', 'vô cùng', 'cực kỳ', 'khá'],
  ['không', 'chẳng', 'chả'],
  ['đều', 'cả hai', 'tất cả'],
  ['có thể', 'có khả năng', 'được'],
  ['muốn', 'mong muốn', 'ao ước', 'cần'],
];

const OPTIONAL_VI_PREFIXES = [
  'cái',
  'chiếc',
  'con',
  'quyển',
  'cuốn',
  'tờ',
  'bức',
  'người',
  'món',
  'quả',
  'trái',
  'cây',
  'bông',
  'đóa',
  'căn',
  'ngôi',
  'sự',
  'việc',
  'niềm',
  'nỗi',
  'bị',
  'được',
  'rất',
  'hơi',
  'quá',
  'đi',
  'làm',
];

function cleanMeaningText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[。，！？、.,!?;:()[\]{}"'“”‘’/\\|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripOptionalViPrefix(phrase: string): string {
  const tokens = phrase.split(' ').filter(Boolean);
  if (tokens.length >= 2 && OPTIONAL_VI_PREFIXES.includes(tokens[0])) {
    return tokens.slice(1).join(' ');
  }
  return phrase;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[n];
}

function extractMeaningCandidates(
  expectedRaw: string,
  extraAccepted: string[] = []
): string[] {
  const sources = [expectedRaw, ...extraAccepted].filter(
    (s) => typeof s === 'string' && s.trim().length > 0
  );
  const results = new Set<string>();

  for (const src of sources) {
    const withoutParens = src.replace(/\([^)]*\)/g, ' ');
    for (const variant of [withoutParens, src]) {
      const cleanedWhole = cleanMeaningText(variant);
      if (cleanedWhole) results.add(cleanedWhole);

      const parts = variant
        .split(/[,;/|]+|\b(?:hoặc|hay)\b/gi)
        .map((p) => cleanMeaningText(p))
        .filter(Boolean);

      for (const p of parts) {
        results.add(p);
      }
    }
  }

  return Array.from(results);
}

const MEANING_FILLER_WORDS = new Set([
  'cua',
  'cho',
  'voi',
  'la',
  'mot',
  'nhung',
  'cac',
  'ban',
  'toi',
  'minh',
  'anh',
  'chi',
  'em',
  'ho',
  'chung',
  'ta',
  'cai',
  'viec',
  'su',
  'dang',
  'da',
  'se',
  'bi',
  'duoc',
  'rat',
  'nguoi',
]);

function stripLeadingPronounOrTense(phrase: string): string {
  const tokens = phrase.split(' ').filter(Boolean);
  let start = 0;
  while (
    tokens.length - start >= 2 &&
    (OPTIONAL_VI_PREFIXES.includes(tokens[start]) ||
      MEANING_FILLER_WORDS.has(normalizeSearchText(tokens[start])))
  ) {
    start += 1;
  }
  return tokens.slice(start).join(' ');
}

function findSynonymCluster(
  normalizedAccented: string,
  normalizedAscii: string
): Set<string> | null {
  for (const group of VIETNAMESE_SYNONYM_GROUPS) {
    if (group.includes(normalizedAccented)) {
      return new Set(group);
    }
    if (normalizedAscii.length >= 5 && normalizedAscii.includes(' ')) {
      if (group.some((item) => normalizeSearchText(item) === normalizedAscii)) {
        return new Set(group);
      }
    }
  }
  return null;
}

export function evaluateMeaningAnswer(
  userInput: string,
  expectedMeaningRaw: string,
  options?: { acceptedAnswers?: string[] }
): MeaningEvaluationResult {
  const userAccented = cleanMeaningText(userInput);
  if (!userAccented) {
    return { isCorrect: false, matchType: 'empty' };
  }

  const candidates = extractMeaningCandidates(
    expectedMeaningRaw,
    options?.acceptedAnswers
  );
  if (candidates.length === 0) {
    return { isCorrect: false, matchType: 'wrong' };
  }

  // 1. Exact accented match against any parsed candidate
  for (const cand of candidates) {
    if (userAccented === cand) {
      return { isCorrect: true, matchType: 'exact', matchedTarget: cand };
    }
  }

  const userAscii = normalizeSearchText(userAccented);
  const userCore = stripLeadingPronounOrTense(stripOptionalViPrefix(userAccented));
  const userCoreAscii = normalizeSearchText(userCore);
  const userSynonymCluster =
    findSynonymCluster(userAccented, userAscii) ??
    findSynonymCluster(userCore, userCoreAscii);

  for (const cand of candidates) {
    const candAscii = normalizeSearchText(cand);
    const candCore = stripLeadingPronounOrTense(stripOptionalViPrefix(cand));
    const candCoreAscii = normalizeSearchText(candCore);

    // 2. Accent-insensitive match (e.g. "xin chao" vs "xin chào")
    if (
      userAscii &&
      (userAscii === candAscii ||
        (candCoreAscii.length >= 2 && userCoreAscii === candCoreAscii))
    ) {
      return { isCorrect: true, matchType: 'near', matchedTarget: cand };
    }

    // 3. Optional classifier / modifier / pronoun match (e.g. "con mèo" vs "mèo", "tôi xin lỗi" vs "xin lỗi")
    if (
      userCore === cand ||
      userAccented === candCore ||
      userCore === candCore
    ) {
      return { isCorrect: true, matchType: 'near', matchedTarget: cand };
    }

    // 4. Vietnamese synonym group match
    if (userSynonymCluster) {
      if (
        userSynonymCluster.has(cand) ||
        userSynonymCluster.has(candCore) ||
        Array.from(userSynonymCluster).some(
          (syn) =>
            syn.length >= 5 &&
            syn.includes(' ') &&
            normalizeSearchText(syn) === candCoreAscii
        )
      ) {
        return { isCorrect: true, matchType: 'near', matchedTarget: cand };
      }
    }

    // 5. Token overlap & meaningful phrase inclusion for multi-word meanings
    const userTokens = userCoreAscii.split(' ').filter(Boolean);
    const candTokens = candCoreAscii.split(' ').filter(Boolean);
    if (userTokens.length >= 2 && candTokens.length >= 2) {
      const userSet = new Set(userTokens);
      const candSet = new Set(candTokens);
      let intersection = 0;
      for (const tok of userSet) {
        if (candSet.has(tok)) intersection += 1;
      }
      const union = new Set([...userSet, ...candSet]).size;
      if (intersection >= 2 && union > 0 && intersection / union >= 0.6) {
        return { isCorrect: true, matchType: 'near', matchedTarget: cand };
      }
      if (
        candTokens.every((t) => userSet.has(t)) &&
        userTokens.length <= candTokens.length + 2
      ) {
        return { isCorrect: true, matchType: 'near', matchedTarget: cand };
      }
    }

    // 6. Meaningful content-word overlap when extra filler words differ
    const userContent = userTokens.filter((t) => !MEANING_FILLER_WORDS.has(t));
    const candContent = candTokens.filter((t) => !MEANING_FILLER_WORDS.has(t));
    if (
      userContent.length >= 1 &&
      candContent.length >= 1 &&
      userContent.join(' ') === candContent.join(' ')
    ) {
      return { isCorrect: true, matchType: 'near', matchedTarget: cand };
    }

    // 7. Minor spelling/typo tolerance (Levenshtein on ascii)
    const maxLen = Math.max(userCoreAscii.length, candCoreAscii.length);
    if (maxLen >= 4) {
      const dist = levenshteinDistance(userCoreAscii, candCoreAscii);
      const allowedDist = maxLen >= 8 ? 2 : 1;
      if (dist <= allowedDist) {
        return { isCorrect: true, matchType: 'near', matchedTarget: cand };
      }
    }
  }

  return { isCorrect: false, matchType: 'wrong' };
}

export type TypingOutcomeStatus = 'exact' | 'near' | 'wrong' | 'unknown';

export interface TypingSessionOutcome {
  wordId: number;
  status: TypingOutcomeStatus;
}

export interface TypingSessionStats {
  total: number;
  exactCount: number;
  nearCount: number;
  correctCount: number;
  wrongCount: number;
  unknownCount: number;
  accuracyPercent: number;
  missedWordIds: number[];
}

export function computeTypingSessionStats(
  outcomes: TypingSessionOutcome[]
): TypingSessionStats {
  let exactCount = 0;
  let nearCount = 0;
  let wrongCount = 0;
  let unknownCount = 0;
  const latestStatusByWord = new Map<number, TypingOutcomeStatus>();

  for (const item of outcomes) {
    latestStatusByWord.set(item.wordId, item.status);
    if (item.status === 'exact') {
      exactCount += 1;
    } else if (item.status === 'near') {
      nearCount += 1;
    } else if (item.status === 'wrong') {
      wrongCount += 1;
    } else {
      unknownCount += 1;
    }
  }

  const missedWordIds: number[] = [];
  for (const [wordId, status] of latestStatusByWord.entries()) {
    if (status === 'wrong' || status === 'unknown') {
      missedWordIds.push(wordId);
    }
  }

  const total = outcomes.length;
  const correctCount = exactCount + nearCount;

  return {
    total,
    exactCount,
    nearCount,
    correctCount,
    wrongCount,
    unknownCount,
    accuracyPercent: total === 0 ? 0 : Math.round((correctCount / total) * 100),
    missedWordIds,
  };
}

export interface ScheduleRetryOptions {
  currentIndex: number;
  sessionMissCount: number;
  historicalWrongCount?: number;
  maxRetriesPerWord?: number;
}

export interface ScheduleRetryResult {
  nextQueue: VocabWord[];
  insertedAtIndex: number | null;
  gapUsed: number | null;
}

export function scheduleRetryInQueue(
  queue: VocabWord[],
  word: VocabWord,
  options: ScheduleRetryOptions
): ScheduleRetryResult {
  const maxRetries = options.maxRetriesPerWord ?? 2;
  if (
    options.sessionMissCount < 1 ||
    options.sessionMissCount > maxRetries ||
    options.currentIndex < 0 ||
    options.currentIndex >= queue.length
  ) {
    return { nextQueue: queue, insertedAtIndex: null, gapUsed: null };
  }

  const remaining = queue.length - (options.currentIndex + 1);
  if (remaining === 0 && options.sessionMissCount >= 2) {
    return { nextQueue: queue, insertedAtIndex: null, gapUsed: null };
  }

  const chronicBonus = (options.historicalWrongCount ?? 0) >= 2 ? 1 : 0;
  const weight = options.sessionMissCount + chronicBonus;
  const desiredGap = weight >= 3 ? 1 : weight === 2 ? 2 : 3;
  const actualGap = Math.min(desiredGap, remaining);
  let insertAt = options.currentIndex + 1 + actualGap;

  if (insertAt < queue.length && queue[insertAt - 1]?.id === word.id) {
    insertAt += 1;
  }

  const nextQueue = [
    ...queue.slice(0, insertAt),
    word,
    ...queue.slice(insertAt),
  ];

  return {
    nextQueue,
    insertedAtIndex: insertAt,
    gapUsed: actualGap,
  };
}

export function isQuestionAnsweredCorrectly(
  question: AiExerciseQuestion,
  userAnswer: ExerciseUserAnswer | undefined
): boolean {
  if (userAnswer === undefined) return false;

  if (question.kind === 'multiple_choice' || question.kind === 'fill_blank') {
    if (typeof userAnswer !== 'string' || !question.correctAnswer) return false;
    return (
      cleanCompareText(userAnswer) === cleanCompareText(question.correctAnswer)
    );
  }

  if (question.kind === 'matching') {
    if (
      !userAnswer ||
      typeof userAnswer !== 'object' ||
      Array.isArray(userAnswer) ||
      !question.matchingPairs?.length
    ) {
      return false;
    }
    return question.matchingPairs.every(
      (pair) => userAnswer[pair.id] === pair.right
    );
  }

  if (question.kind === 'sentence_order') {
    if (!Array.isArray(userAnswer) || !question.correctOrder?.length) {
      return false;
    }
    return (
      cleanCompareText(userAnswer.join('')) ===
      cleanCompareText(question.correctOrder.join(''))
    );
  }

  return false;
}

export function gradeExerciseSet(
  questions: AiExerciseQuestion[],
  answers: Record<string, ExerciseUserAnswer>,
  preGradedResults?: Record<string, boolean>
): GradedExerciseSummary {
  const results: Record<string, boolean> = {};
  const correctWordSet = new Set<number>();
  const wrongWordSet = new Set<number>();
  let correct = 0;

  for (const q of questions) {
    const ok =
      preGradedResults && q.id in preGradedResults
        ? preGradedResults[q.id]
        : isQuestionAnsweredCorrectly(q, answers[q.id]);
    results[q.id] = ok;
    if (ok) {
      correct += 1;
      q.targetWordIds.forEach((id) => correctWordSet.add(id));
    } else {
      q.targetWordIds.forEach((id) => wrongWordSet.add(id));
    }
  }

  return {
    total: questions.length,
    correct,
    scorePercent:
      questions.length === 0 ? 0 : Math.round((correct / questions.length) * 100),
    results,
    correctWordIds: Array.from(correctWordSet),
    wrongWordIds: Array.from(wrongWordSet).filter(
      (id) => !correctWordSet.has(id)
    ),
  };
}

function pickDistinctDistractors(
  target: VocabWord,
  allWords: VocabWord[],
  seed: number,
  needed = 3
): VocabWord[] {
  const picked: VocabWord[] = [];
  const seenWords = new Set<string>([target.word]);
  const seenMeanings = new Set<string>([target.viMeaning]);
  const total = allWords.length;
  if (total === 0) return picked;

  const start = (seed * 13) % total;
  for (let offset = 0; offset < total && picked.length < needed; offset++) {
    const candidate = allWords[(start + offset * 7) % total];
    if (
      candidate.id !== target.id &&
      !seenWords.has(candidate.word) &&
      !seenMeanings.has(candidate.viMeaning)
    ) {
      seenWords.add(candidate.word);
      seenMeanings.add(candidate.viMeaning);
      picked.push(candidate);
    }
  }
  return picked;
}

function canBuildFillBlank(word: VocabWord): boolean {
  return (
    Boolean(word.example) &&
    word.example.includes(word.word) &&
    word.example.replace(/[。，！？、.,!?\s]/g, '').length > word.word.length
  );
}

export function generateLocalExerciseSet(
  targetWords: VocabWord[],
  allWords: VocabWord[],
  options: {
    exerciseType: ExerciseType;
    difficulty: DifficultyLevel;
    count: number;
  }
): AiExerciseSet {
  const pool = targetWords.length > 0 ? targetWords : allWords.slice(0, 20);
  const safeCount = Math.min(Math.max(Math.round(options.count) || 10, 1), 100);
  const questions: AiExerciseQuestion[] = [];

  for (let i = 0; i < safeCount; i++) {
    const cycle = Math.floor(i / pool.length);
    const word = pool[i % pool.length];
    const distractors = pickDistinctDistractors(
      word,
      allWords,
      i + 1 + cycle * 17,
      3
    );

    const useMatching =
      options.exerciseType === ExerciseType.MATCHING ||
      (options.exerciseType === ExerciseType.MIXED &&
        i % 4 === 3 &&
        pool.length >= 4);

    if (useMatching) {
      const uniquePairs: VocabWord[] = [];
      const seenLeft = new Set<string>();
      const seenRight = new Set<string>();

      for (let offset = 0; offset < pool.length && uniquePairs.length < 4; offset++) {
        const candidate = pool[(i + offset) % pool.length];
        if (!seenLeft.has(candidate.word) && !seenRight.has(candidate.viMeaning)) {
          seenLeft.add(candidate.word);
          seenRight.add(candidate.viMeaning);
          uniquePairs.push(candidate);
        }
      }
      for (let offset = 0; offset < allWords.length && uniquePairs.length < 4; offset++) {
        const extra = allWords[(uniquePairs.length * 11 + i + offset) % allWords.length];
        if (!seenLeft.has(extra.word) && !seenRight.has(extra.viMeaning)) {
          seenLeft.add(extra.word);
          seenRight.add(extra.viMeaning);
          uniquePairs.push(extra);
        }
      }

      questions.push({
        id: `local-q-${i + 1}`,
        kind: 'matching',
        targetWordIds: uniquePairs.map((w) => w.id),
        promptVi: 'Ghép 4 từ tiếng Trung sau với nghĩa tiếng Việt đúng:',
        matchingPairs: uniquePairs.map((w, idx) => ({
          id: `p${idx + 1}`,
          left:
            options.difficulty === DifficultyLevel.BASIC
              ? `${w.word} (${w.pinyin})`
              : w.word,
          right: w.viMeaning,
        })),
        explanationVi: uniquePairs
          .map(
            (w) =>
              `${w.word} [${w.pinyin}]: ${w.viMeaning} — VD: ${w.example}`
          )
          .join(' | '),
        memoryTipVi:
          'Hãy đọc to kết hợp nhìn ngữ cảnh câu ví dụ để ghi nhớ nghĩa tự nhiên.',
      });
      continue;
    }

    const wantFillBlank =
      options.exerciseType === ExerciseType.FILL_BLANK ||
      (options.exerciseType === ExerciseType.MIXED && i % 3 === 1);

    const fillCandidate = wantFillBlank
      ? canBuildFillBlank(word)
        ? word
        : pool.find(canBuildFillBlank) ?? allWords.find(canBuildFillBlank)
      : undefined;

    if (fillCandidate) {
      const blankDistractors = pickDistinctDistractors(
        fillCandidate,
        allWords,
        i + 5,
        3
      );
      const optionWords = [fillCandidate, ...blankDistractors];
      const rotated = [
        ...optionWords.slice(i % optionWords.length),
        ...optionWords.slice(0, i % optionWords.length),
      ];
      questions.push({
        id: `local-q-${i + 1}`,
        kind: 'fill_blank',
        targetWordIds: [fillCandidate.id],
        promptVi: 'Chọn từ thích hợp điền vào chỗ trống trong câu sau:',
        chinesePrompt: fillCandidate.example.replace(fillCandidate.word, '___'),
        pinyinHint: fillCandidate.exampleVi
          ? options.difficulty === DifficultyLevel.BASIC &&
            fillCandidate.examplePinyin
            ? `${fillCandidate.exampleVi} (${fillCandidate.examplePinyin})`
            : fillCandidate.exampleVi
          : options.difficulty === DifficultyLevel.BASIC
            ? `Nghĩa: ${fillCandidate.viMeaning} (${fillCandidate.posVi})`
            : undefined,
        options: rotated.map((w) => w.word),
        correctAnswer: fillCandidate.word,
        explanationVi: `Câu hoàn chỉnh: "${fillCandidate.example}"${fillCandidate.examplePinyin ? ` [${fillCandidate.examplePinyin}]` : ''}${fillCandidate.exampleVi ? ` — ${fillCandidate.exampleVi}` : ''}.`,
        memoryTipVi: `${fillCandidate.word} [${fillCandidate.pinyin}] (${fillCandidate.posVi}): ${fillCandidate.viMeaning}.`,
      });
      continue;
    }

    const askWordByMeaning = i % 2 === 1;
    if (askWordByMeaning) {
      const optionWords = [word, ...distractors];
      const rotated = [
        ...optionWords.slice(i % optionWords.length),
        ...optionWords.slice(0, i % optionWords.length),
      ];
      questions.push({
        id: `local-q-${i + 1}`,
        kind: 'multiple_choice',
        targetWordIds: [word.id],
        promptVi: `Từ nào có nghĩa là "${word.viMeaning}"?`,
        pinyinHint:
          options.difficulty === DifficultyLevel.BASIC ? word.pinyin : undefined,
        options: rotated.map((w) => w.word),
        correctAnswer: word.word,
        explanationVi: `${word.word} (${word.pinyin}) nghĩa là "${word.viMeaning}". Ví dụ: ${word.example}${word.exampleVi ? ` (${word.exampleVi})` : ''}.`,
        memoryTipVi: `Ghi nhớ: ${word.word} [${word.pinyin}] (${word.posVi}).`,
      });
    } else {
      const optionWords = [word, ...distractors];
      const rotated = [
        ...optionWords.slice((i + 1) % optionWords.length),
        ...optionWords.slice(0, (i + 1) % optionWords.length),
      ];
      questions.push({
        id: `local-q-${i + 1}`,
        kind: 'multiple_choice',
        targetWordIds: [word.id],
        promptVi: 'Chọn nghĩa tiếng Việt đúng của từ sau:',
        chinesePrompt: word.word,
        pinyinHint:
          options.difficulty === DifficultyLevel.BASIC ? word.pinyin : undefined,
        options: rotated.map((w) => w.viMeaning),
        correctAnswer: word.viMeaning,
        explanationVi: `${word.word} [${word.pinyin}] nghĩa là "${word.viMeaning}". Ví dụ: ${word.example}${word.exampleVi ? ` (${word.exampleVi})` : ''}.`,
        memoryTipVi: `${word.word} (${word.posVi}) ↔ "${word.viMeaning}".`,
      });
    }
  }

  return {
    title: 'Bài luyện tập từ vựng nhanh',
    subtitle: `${questions.length} câu hỏi từ ${pool.length} thẻ đang chọn`,
    difficulty: options.difficulty,
    generatedAt: Date.now(),
    questions,
  };
}
