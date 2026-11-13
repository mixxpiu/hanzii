import type { VocabDeck, VocabFolder, VocabWord } from '../types/vocab';
import {
  HSK1_FOLDER_ID,
  HSK1_FOLDER_NAME,
  VOCAB_323,
  VOCAB_TOPICS,
} from './vocab323';
import {
  HUY_TUONG_2_DECKS,
  HUY_TUONG_2_FOLDER_ID,
  HUY_TUONG_2_FOLDER_NAME,
  VOCAB_HUY_TUONG_2,
} from './vocabHuyTuong2';

export const HSK1_DECKS: VocabDeck[] = VOCAB_TOPICS.map((topic, idx) => ({
  id: `hsk1-${String(idx + 1).padStart(2, '0')}`,
  folderId: HSK1_FOLDER_ID,
  folderName: HSK1_FOLDER_NAME,
  order: idx + 1,
  name: topic,
  subtitle: `Chủ đề ${idx + 1} · HSK 1 bản 3.0`,
  cardCount: VOCAB_323.filter((c) => c.topic === topic).length,
}));

export const VOCAB_DECKS: VocabDeck[] = [...HSK1_DECKS, ...HUY_TUONG_2_DECKS];

export const ALL_VOCAB: VocabWord[] = [...VOCAB_323, ...VOCAB_HUY_TUONG_2];

export const VOCAB_FOLDERS: VocabFolder[] = [
  {
    id: HSK1_FOLDER_ID,
    name: HSK1_FOLDER_NAME,
    description:
      'Bộ 323 từ vựng HSK 1 (bản 3.0) chia thành 13 chủ đề giao tiếp nền tảng kèm ví dụ, Pinyin và nghĩa tiếng Việt.',
    deckCount: HSK1_DECKS.length,
    cardCount: VOCAB_323.length,
  },
  {
    id: HUY_TUONG_2_FOLDER_ID,
    name: HUY_TUONG_2_FOLDER_NAME,
    description:
      'Giáo trình Tiếng Trung Huy Tường Quyển 2 gồm 10 bài học (247 từ) về thời gian, công sở, nhà xưởng, nhân sự và giao dịch.',
    deckCount: HUY_TUONG_2_DECKS.length,
    cardCount: VOCAB_HUY_TUONG_2.length,
  },
];

export const VOCAB_BY_ID: Record<number, VocabWord> = Object.fromEntries(
  ALL_VOCAB.map((item) => [item.id, item])
);

export const DECK_BY_ID: Record<string, VocabDeck> = Object.fromEntries(
  VOCAB_DECKS.map((d) => [d.id, d])
);

export const FOLDER_BY_ID: Record<string, VocabFolder> = Object.fromEntries(
  VOCAB_FOLDERS.map((f) => [f.id, f])
);

export function getDecksByFolder(folderId: string | 'all'): VocabDeck[] {
  if (folderId === 'all') return VOCAB_DECKS;
  return VOCAB_DECKS.filter((d) => d.folderId === folderId);
}
