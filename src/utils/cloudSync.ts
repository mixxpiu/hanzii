import {
  StudyStatus,
  type ProgressMap,
  type VocabOverride,
  type VocabOverridesMap,
  type WordInsight,
  type WordProgress,
} from '../types/vocab';

export interface CloudWordProgressPayload {
  ownerId: string;
  wordId: number;
  status: StudyStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: number | null;
  nextReviewAt: number | null;
}

export interface CloudVocabOverridePayload {
  ownerId: string;
  wordId: number;
  viMeaning: string;
  posVi: string;
  example: string;
  examplePinyin: string;
  exampleVi: string;
}

export interface CloudWordInsightPayload {
  ownerId: string;
  wordId: number;
  characterBreakdown: Array<{ char: string; meaningVi: string }>;
  examples: Array<{ chinese: string; pinyin: string; vietnamese: string }>;
  usageNoteVi: string;
  memoryTipVi: string;
}

function clampString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value.toFixed(2))));
}

function clampNullableTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

function normalizeStatus(value: unknown): StudyStatus {
  if (
    value === StudyStatus.NEW ||
    value === StudyStatus.LEARNING ||
    value === StudyStatus.MASTERED
  ) {
    return value;
  }
  return StudyStatus.NEW;
}

export function sanitizeWordProgressPayload(
  ownerId: string,
  progress: WordProgress
): CloudWordProgressPayload {
  return {
    ownerId: clampString(ownerId, 128),
    wordId: clampInt(progress.wordId, 1, 100000, 1),
    status: normalizeStatus(progress.status),
    easeFactor: clampNumber(progress.easeFactor, 1.0, 10.0, 2.5),
    intervalDays: clampInt(progress.intervalDays, 0, 36500, 0),
    repetitions: clampInt(progress.repetitions, 0, 10000, 0),
    correctCount: clampInt(progress.correctCount, 0, 100000, 0),
    wrongCount: clampInt(progress.wrongCount, 0, 100000, 0),
    lastReviewedAt: clampNullableTimestampMs(progress.lastReviewedAt),
    nextReviewAt: clampNullableTimestampMs(progress.nextReviewAt),
  };
}

export function sanitizeVocabOverridePayload(
  ownerId: string,
  wordId: number,
  override: VocabOverride
): CloudVocabOverridePayload {
  return {
    ownerId: clampString(ownerId, 128),
    wordId: clampInt(wordId, 1, 100000, 1),
    viMeaning: clampString(override.viMeaning, 500),
    posVi: clampString(override.posVi, 100),
    example: clampString(override.example, 500),
    examplePinyin: clampString(override.examplePinyin, 500),
    exampleVi: clampString(override.exampleVi, 500),
  };
}

export function sanitizeWordInsightPayload(
  ownerId: string,
  insight: WordInsight
): CloudWordInsightPayload {
  const breakdown = Array.isArray(insight.characterBreakdown)
    ? insight.characterBreakdown.slice(0, 12).map((item) => ({
        char: clampString(item?.char, 16),
        meaningVi: clampString(item?.meaningVi, 300),
      }))
    : [];

  const examples = Array.isArray(insight.examples)
    ? insight.examples.slice(0, 6).map((item) => ({
        chinese: clampString(item?.chinese, 300),
        pinyin: clampString(item?.pinyin, 300),
        vietnamese: clampString(item?.vietnamese, 400),
      }))
    : [];

  return {
    ownerId: clampString(ownerId, 128),
    wordId: clampInt(insight.wordId, 1, 100000, 1),
    characterBreakdown: breakdown,
    examples,
    usageNoteVi: clampString(insight.usageNoteVi, 1000),
    memoryTipVi: clampString(insight.memoryTipVi, 1000),
  };
}

function progressActivityScore(p: WordProgress): number {
  const reviewed = p.lastReviewedAt ?? 0;
  if (reviewed > 0) return reviewed;
  return (p.correctCount + p.wrongCount) * 1000 + (p.status !== StudyStatus.NEW ? 1 : 0);
}

export function mergeProgressMaps(
  localMap: ProgressMap,
  cloudMap: ProgressMap
): {
  merged: ProgressMap;
  toUpload: WordProgress[];
} {
  const merged: ProgressMap = {};
  const toUpload: WordProgress[] = [];

  const allKeys = new Set<string>([
    ...Object.keys(localMap),
    ...Object.keys(cloudMap),
  ]);

  for (const key of allKeys) {
    const wordId = Number(key);
    const localItem = localMap[wordId];
    const cloudItem = cloudMap[wordId];

    if (localItem && !cloudItem) {
      merged[wordId] = localItem;
      toUpload.push(localItem);
      continue;
    }

    if (!localItem && cloudItem) {
      merged[wordId] = cloudItem;
      continue;
    }

    if (localItem && cloudItem) {
      const localScore = progressActivityScore(localItem);
      const cloudScore = progressActivityScore(cloudItem);
      if (localScore > cloudScore) {
        merged[wordId] = localItem;
        toUpload.push(localItem);
      } else {
        merged[wordId] = cloudItem;
      }
    }
  }

  return { merged, toUpload };
}

export function mergeOverridesMaps(
  localMap: VocabOverridesMap,
  cloudMap: VocabOverridesMap
): {
  merged: VocabOverridesMap;
  toUpload: Array<{ wordId: number; override: VocabOverride }>;
} {
  const merged: VocabOverridesMap = { ...cloudMap };
  const toUpload: Array<{ wordId: number; override: VocabOverride }> = [];

  for (const [key, localOv] of Object.entries(localMap)) {
    const wordId = Number(key);
    if (!cloudMap[wordId] && localOv) {
      merged[wordId] = localOv;
      toUpload.push({ wordId, override: localOv });
    }
  }

  return { merged, toUpload };
}

export function mergeInsightMaps(
  localMap: Record<number, WordInsight>,
  cloudMap: Record<number, WordInsight>
): {
  merged: Record<number, WordInsight>;
  toUpload: WordInsight[];
} {
  const merged: Record<number, WordInsight> = { ...cloudMap };
  const toUpload: WordInsight[] = [];

  for (const [key, localInsight] of Object.entries(localMap)) {
    const wordId = Number(key);
    if (!cloudMap[wordId] && localInsight) {
      merged[wordId] = localInsight;
      toUpload.push(localInsight);
    }
  }

  return { merged, toUpload };
}

export function formatCloudSyncError(err: unknown): {
  message: string;
  quotaUpgradeUrl?: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes("Free daily read units per project") ||
    raw.includes('Quota exceeded')
  ) {
    return {
      message:
        'Đã đạt hạn mức miễn phí hằng ngày của Firestore. Hạn mức sẽ tự đặt lại vào ngày mai.',
    };
  }
  if (raw.includes('popup-closed-by-user') || raw.includes('cancelled-popup-request')) {
    return { message: '' };
  }
  if (raw.includes('popup-blocked')) {
    return {
      message:
        'Trình duyệt đang chặn cửa sổ đăng nhập Google. Hãy cho phép popup và thử lại.',
    };
  }
  if (raw.includes('unauthorized-domain')) {
    return {
      message:
        'Tên miền hiện tại chưa được cấp phép đăng nhập Google trong cấu hình Firebase Auth.',
    };
  }
  if (raw.includes('Missing or insufficient permissions')) {
    return {
      message:
        'Không đủ quyền đồng bộ dữ liệu Firestore. Vui lòng đăng nhập lại bằng tài khoản Google đã xác minh email.',
    };
  }
  return {
    message: 'Không thể đồng bộ dữ liệu với Cloud lúc này. Dữ liệu vẫn được giữ an toàn trên máy.',
  };
}
