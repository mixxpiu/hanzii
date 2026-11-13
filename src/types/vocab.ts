export enum StudyStatus {
  NEW = 'new',
  LEARNING = 'learning',
  MASTERED = 'mastered',
}

export enum ExerciseType {
  MIXED = 'mixed',
  MULTIPLE_CHOICE = 'multiple_choice',
  FILL_BLANK = 'fill_blank',
  MATCHING = 'matching',
  SENTENCE_ORDER = 'sentence_order',
}

export enum DifficultyLevel {
  BASIC = 'basic',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export type AppSection =
  | 'explore'
  | 'flashcards'
  | 'typing'
  | 'ai-quiz'
  | 'progress';

export interface VocabFolder {
  id: string;
  name: string;
  description: string;
  deckCount: number;
  cardCount: number;
}

export interface VocabDeck {
  id: string;
  folderId: string;
  folderName: string;
  order: number;
  name: string;
  subtitle?: string;
  cardCount: number;
}

export interface VocabWord {
  id: number;
  folderId: string;
  folderName: string;
  deckId: string;
  topicIndex: number;
  word: string;
  pinyin: string;
  posVi: string;
  viMeaning: string;
  example: string;
  examplePinyin: string;
  exampleVi: string;
  topic: string;
}

export interface VocabOverride {
  viMeaning?: string;
  posVi?: string;
  example?: string;
  examplePinyin?: string;
  exampleVi?: string;
}

export type VocabOverridesMap = Record<number, VocabOverride>;

export interface WordProgress {
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

export type ProgressMap = Record<number, WordProgress>;

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface AiExerciseQuestion {
  id: string;
  kind: 'multiple_choice' | 'fill_blank' | 'matching' | 'sentence_order';
  targetWordIds: number[];
  promptVi: string;
  chinesePrompt?: string;
  pinyinHint?: string;
  options?: string[];
  correctAnswer?: string;
  matchingPairs?: MatchingPair[];
  orderTokens?: string[];
  correctOrder?: string[];
  explanationVi: string;
  memoryTipVi: string;
}

export interface AiExerciseSet {
  title: string;
  subtitle: string;
  difficulty: DifficultyLevel;
  generatedAt: number;
  questions: AiExerciseQuestion[];
}

export interface WordInsight {
  wordId: number;
  characterBreakdown: Array<{
    char: string;
    meaningVi: string;
  }>;
  examples: Array<{
    chinese: string;
    pinyin: string;
    vietnamese: string;
  }>;
  usageNoteVi: string;
  memoryTipVi: string;
}

export interface StudyStreakState {
  studyDates: string[];
  bestStreak: number;
}
