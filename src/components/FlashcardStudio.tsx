import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  DECK_BY_ID,
  FOLDER_BY_ID,
  VOCAB_DECKS,
  VOCAB_FOLDERS,
  getDecksByFolder,
} from '../data/vocabCatalog';
import { MobileConfigDrawer } from './MobileConfigDrawer';
import type { ProgressMap, VocabWord } from '../types/vocab';
import { speakChinese } from '../utils/speech';
import {
  selectStudyDeck,
  type DeckMode,
  type ReviewRating,
} from '../utils/studyLogic';

interface FlashcardStudioProps {
  words: VocabWord[];
  progressMap: ProgressMap;
  initialMode?: DeckMode;
  initialFolderId?: string | 'all';
  initialDeckId?: string;
  onRateWord: (wordId: number, rating: ReviewRating) => void;
  onStartAiQuizWithWords: (words: VocabWord[], label: string) => void;
}

const DECK_MODE_LABELS: Array<{ id: DeckMode; label: string }> = [
  { id: 'due', label: 'Cần ôn' },
  { id: 'new', label: 'Chưa học' },
  { id: 'weak', label: 'Hay quên' },
  { id: 'topic', label: 'Theo bộ thẻ' },
  { id: 'all_random', label: 'Ngẫu nhiên' },
];

export function FlashcardStudio({
  words,
  progressMap,
  initialMode = 'due',
  initialFolderId = 'all',
  initialDeckId = VOCAB_DECKS[0].id,
  onRateWord,
  onStartAiQuizWithWords,
}: FlashcardStudioProps) {
  const [deckMode, setDeckMode] = useState<DeckMode>(initialMode);
  const [folderId, setFolderId] = useState<string | 'all'>(initialFolderId);
  const [deckId, setDeckId] = useState<string>(initialDeckId);
  const [showPinyinFront, setShowPinyinFront] = useState(true);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState<
    Array<{ wordId: number; rating: ReviewRating }>
  >([]);

  const availableDecks = useMemo(() => getDecksByFolder(folderId), [folderId]);
  const activeDeckMeta = DECK_BY_ID[deckId] ?? availableDecks[0];

  const deck = useMemo(
    () =>
      selectStudyDeck(words, progressMap, {
        mode: deckMode,
        folderId,
        deckId: activeDeckMeta?.id,
        limit: deckMode === 'topic' ? 50 : 20,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckMode, folderId, activeDeckMeta?.id, sessionSeed, words]
  );

  const isCompleted = deck.length > 0 && currentIndex >= deck.length;
  const currentCard = !isCompleted ? deck[currentIndex] : undefined;

  function resetSession(
    nextMode?: DeckMode,
    nextFolderId?: string | 'all',
    nextDeckId?: string
  ) {
    if (nextMode) setDeckMode(nextMode);
    if (nextFolderId !== undefined) {
      setFolderId(nextFolderId);
      const nextDecks = getDecksByFolder(nextFolderId);
      if (nextDeckId) {
        setDeckId(nextDeckId);
      } else if (!nextDecks.some((d) => d.id === deckId) && nextDecks[0]) {
        setDeckId(nextDecks[0].id);
      }
    } else if (nextDeckId) {
      setDeckId(nextDeckId);
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewedInSession([]);
    setSessionSeed((s) => s + 1);
  }

  function handleRate(rating: ReviewRating) {
    if (!currentCard) return;
    onRateWord(currentCard.id, rating);
    setReviewedInSession((prev) => [
      ...prev,
      { wordId: currentCard.id, rating },
    ]);
    setIsFlipped(false);
    setCurrentIndex((i) => i + 1);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !isCompleted && currentCard) {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (isFlipped && currentCard) {
        if (e.key === '1') handleRate('again');
        else if (e.key === '2') handleRate('hard');
        else if (e.key === '3') handleRate('good');
        else if (e.key === '4') handleRate('easy');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const progressPct =
    deck.length === 0
      ? 0
      : Math.min(100, Math.round((currentIndex / deck.length) * 100));

  const sessionCorrectCount = reviewedInSession.filter(
    (r) => r.rating !== 'again'
  ).length;

  const activeModeLabel =
    DECK_MODE_LABELS.find((m) => m.id === deckMode)?.label ?? 'Cần ôn';
  const activeScopeDetail =
    deckMode === 'topic' && activeDeckMeta
      ? `${activeDeckMeta.order}. ${activeDeckMeta.name}`
      : folderId === 'all'
        ? 'Tất cả thư mục'
        : (FOLDER_BY_ID[folderId]?.name ?? 'Thư mục');

  return (
    <section
      aria-label="Thẻ ghi nhớ"
      className="mx-auto max-w-4xl space-y-3.5 sm:space-y-5"
    >
      {/* Mobile Compact Summary Bar + Drawer Trigger */}
      <div className="sm:hidden flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-900">
            {activeModeLabel} · {activeScopeDetail}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            <span className="font-mono tabular-nums">{deck.length} thẻ</span>
            {' · '}
            {showPinyinFront ? 'Pinyin mặt trước' : 'Ẩn Pinyin mặt trước'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-expanded={mobileDrawerOpen}
          aria-controls="flashcard-mobile-drawer"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal
            className="h-3.5 w-3.5 text-teal-700"
            aria-hidden="true"
          />
          <span>Cấu hình</span>
        </button>
      </div>

      {/* Mobile Configuration Drawer */}
      <MobileConfigDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Cấu hình thẻ ghi nhớ"
        subtitle={`${activeModeLabel} · ${activeScopeDetail}`}
      >
        <div id="flashcard-mobile-drawer" className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700">
              Chế độ học thẻ
            </span>
            <div
              role="group"
              aria-label="Chế độ học thẻ di động"
              className="flex flex-wrap gap-1.5"
            >
              {DECK_MODE_LABELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => resetSession(m.id)}
                  className={`min-h-[42px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    deckMode === m.id
                      ? 'border-teal-700 bg-teal-50 text-teal-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-flashcard-folder"
                className="block text-xs font-semibold text-slate-700"
              >
                Thư mục
              </label>
              <select
                id="mobile-flashcard-folder"
                value={folderId}
                onChange={(e) => resetSession(deckMode, e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none"
              >
                <option value="all">Tất cả thư mục (570 thẻ)</option>
                {VOCAB_FOLDERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.cardCount} thẻ)
                  </option>
                ))}
              </select>
            </div>

            {deckMode === 'topic' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-flashcard-deck"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Bộ thẻ
                </label>
                <select
                  id="mobile-flashcard-deck"
                  value={activeDeckMeta?.id ?? deckId}
                  onChange={(e) =>
                    resetSession('topic', undefined, e.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none"
                >
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {folderId === 'all' ? `[${d.folderName}] ` : ''}
                      {d.order}. {d.name} ({d.cardCount} thẻ)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-3">
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-medium text-slate-800">
              <span>Hiện Pinyin ở mặt trước thẻ</span>
              <input
                type="checkbox"
                checked={showPinyinFront}
                onChange={(e) => setShowPinyinFront(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
            </label>

            <button
              type="button"
              disabled={deck.length === 0}
              onClick={() => {
                setMobileDrawerOpen(false);
                onStartAiQuizWithWords(
                  deck,
                  deckMode === 'topic' && activeDeckMeta
                    ? `${activeDeckMeta.name} (${deck.length} thẻ)`
                    : `Bộ thẻ đang học (${deck.length} thẻ)`
                );
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:border-teal-700 hover:text-teal-800 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <span>Tạo bài tập AI từ nhóm thẻ này</span>
            </button>
          </div>
        </div>
      </MobileConfigDrawer>

      {/* Desktop Inline Config Bar */}
      <div className="hidden sm:block rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Chế độ học thẻ"
            className="flex w-full sm:w-auto items-center gap-0.5 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 p-0.5"
          >
            {DECK_MODE_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => resetSession(m.id)}
                className={`min-h-[36px] sm:min-h-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  deckMode === m.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
            <label className="min-h-[36px] sm:min-h-0 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showPinyinFront}
                onChange={(e) => setShowPinyinFront(e.target.checked)}
                className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              <span>Pinyin mặt trước</span>
            </label>

            <button
              type="button"
              disabled={deck.length === 0}
              onClick={() =>
                onStartAiQuizWithWords(
                  deck,
                  deckMode === 'topic' && activeDeckMeta
                    ? `${activeDeckMeta.name} (${deck.length} thẻ)`
                    : `Bộ thẻ đang học (${deck.length} thẻ)`
                )
              }
              className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-teal-700 hover:text-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bài tập AI</span>
            </button>
          </div>
        </div>

        <div
          className={`grid gap-2 border-t border-slate-100 pt-2.5 sm:pt-3 ${
            deckMode === 'topic' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="flashcard-folder"
              className="hidden sm:inline w-16 shrink-0 text-xs font-medium text-slate-500"
            >
              Thư mục
            </label>
            <select
              id="flashcard-folder"
              aria-label="Chọn thư mục"
              value={folderId}
              onChange={(e) => resetSession(deckMode, e.target.value)}
              className="min-h-[40px] sm:min-h-0 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
            >
              <option value="all">Tất cả thư mục (570 thẻ)</option>
              {VOCAB_FOLDERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.cardCount} thẻ)
                </option>
              ))}
            </select>
          </div>

          {deckMode === 'topic' && (
            <div className="flex items-center gap-2 min-w-0">
              <label
                htmlFor="flashcard-deck"
                className="hidden sm:inline w-16 shrink-0 text-xs font-medium text-slate-500"
              >
                Bộ thẻ
              </label>
              <select
                id="flashcard-deck"
                aria-label="Chọn bộ thẻ"
                value={activeDeckMeta?.id ?? deckId}
                onChange={(e) =>
                  resetSession('topic', undefined, e.target.value)
                }
                className="min-h-[40px] sm:min-h-0 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
              >
                {availableDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {folderId === 'all' ? `[${d.folderName}] ` : ''}
                    {d.order}. {d.name} ({d.cardCount} thẻ)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Study Stage */}
      {deck.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-4">
          <p className="text-base font-semibold text-slate-900">
            Không có thẻ trong nhóm này
          </p>
          <button
            type="button"
            onClick={() =>
              resetSession(
                'topic',
                VOCAB_DECKS[0].folderId,
                VOCAB_DECKS[0].id
              )
            }
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            Học {VOCAB_DECKS[0].name}
          </button>
        </div>
      ) : isCompleted ? (
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center space-y-5">
          <CheckCircle2
            className="mx-auto h-9 w-9 text-emerald-700"
            aria-hidden="true"
          />
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Hoàn thành {deck.length} thẻ
          </h2>

          <div className="grid grid-cols-2 gap-4 border-y border-slate-100 py-4">
            <div>
              <div className="text-xs text-slate-500">Đã ôn</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {reviewedInSession.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tỷ lệ nhớ</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                {reviewedInSession.length === 0
                  ? 0
                  : Math.round(
                      (sessionCorrectCount / reviewedInSession.length) * 100
                    )}
                %
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => resetSession()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ôn tiếp</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onStartAiQuizWithWords(
                  deck,
                  `Kiểm tra ${deck.length} từ vừa ôn`
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Kiểm tra AI</span>
            </button>
          </div>
        </div>
      ) : (
        currentCard && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span className="font-mono tabular-nums">
                  Thẻ {currentIndex + 1} / {deck.length}
                </span>
                <span>
                  {currentCard.folderName} · {currentCard.topic}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-teal-700 transition-transform duration-200 origin-left"
                  style={{
                    transform: `scaleX(${Math.max(0.02, progressPct / 100)})`,
                  }}
                />
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                aria-label={
                  isFlipped
                    ? 'Lật lại mặt trước thẻ ghi nhớ'
                    : `Lật thẻ ${currentCard.word}`
                }
                onClick={() => setIsFlipped((f) => !f)}
                className="flex min-h-[270px] sm:min-h-[340px] w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 pb-6 pt-16 text-center transition-colors hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-10"
              >
                {!isFlipped ? (
                  <div className="space-y-2.5 sm:space-y-3">
                    <div className="text-xs text-slate-400">
                      <span className="font-mono tabular-nums">
                        #{String(currentCard.id).padStart(3, '0')}
                      </span>{' '}
                      · {currentCard.posVi}
                    </div>
                    <div className="font-hanzi text-5xl font-bold text-slate-900 sm:text-7xl">
                      {currentCard.word}
                    </div>
                    {showPinyinFront && (
                      <div className="font-mono text-lg sm:text-xl text-slate-600">
                        {currentCard.pinyin}
                      </div>
                    )}
                    <div className="pt-2 text-[11px] font-mono text-slate-400">
                      <span className="sm:hidden">Chạm thẻ để lật</span>
                      <span className="hidden sm:inline">Space · Lật thẻ</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-y-4 sm:space-y-5">
                    <div>
                      <div className="font-hanzi text-3xl sm:text-4xl font-bold text-slate-900">
                        {currentCard.word}
                      </div>
                      <div className="mt-1 font-mono text-xs sm:text-sm text-slate-500">
                        {currentCard.pinyin} · {currentCard.posVi}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3.5 sm:pt-4 space-y-3">
                      <div className="text-xl sm:text-2xl font-bold text-teal-800">
                        {currentCard.viMeaning}
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 sm:p-3.5 text-left space-y-1">
                        <p className="font-hanzi text-base font-semibold text-slate-900">
                          {currentCard.example}
                        </p>
                        {currentCard.examplePinyin && (
                          <p className="font-mono text-xs text-slate-500">
                            {currentCard.examplePinyin}
                          </p>
                        )}
                        {currentCard.exampleVi && (
                          <p className="text-xs text-slate-700">
                            {currentCard.exampleVi}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </button>

              <div className="absolute right-3 top-3 sm:right-4 sm:top-4 flex items-center gap-1.5">
                {isFlipped && (
                  <button
                    type="button"
                    aria-label={`Nghe ví dụ của ${currentCard.word}`}
                    onClick={() => speakChinese(currentCard.example)}
                    className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-700 hover:text-teal-800"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ví dụ</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Phát âm ${currentCard.word}`}
                  onClick={() => speakChinese(currentCard.word)}
                  className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-700 hover:text-teal-800"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Nghe</span>
                </button>
              </div>
            </div>

            {!isFlipped ? (
              <div key="flip-action" className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsFlipped(true)}
                  className="min-h-[48px] w-full sm:w-auto rounded-xl sm:rounded-lg bg-slate-900 px-8 py-3 sm:py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Lật thẻ
                </button>
              </div>
            ) : (
              <div
                key="rating-actions"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
              >
                <button
                  type="button"
                  onClick={() => handleRate('again')}
                  className="min-h-[56px] rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-center transition-colors hover:bg-rose-50"
                >
                  <div className="text-sm font-semibold text-rose-700">
                    1 · Quên
                  </div>
                  <div className="text-[11px] text-slate-500">Ôn lại sớm</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRate('hard')}
                  className="min-h-[56px] rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-center transition-colors hover:bg-amber-50"
                >
                  <div className="text-sm font-semibold text-amber-800">
                    2 · Khó
                  </div>
                  <div className="text-[11px] text-slate-500">1 ngày</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRate('good')}
                  className="min-h-[56px] rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-center transition-colors hover:bg-sky-50"
                >
                  <div className="text-sm font-semibold text-sky-800">
                    3 · Nhớ
                  </div>
                  <div className="text-[11px] text-slate-500">3 ngày</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRate('easy')}
                  className="min-h-[56px] rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center transition-colors hover:bg-emerald-50"
                >
                  <div className="text-sm font-semibold text-emerald-800">
                    4 · Thuộc
                  </div>
                  <div className="text-[11px] text-slate-500">6+ ngày</div>
                </button>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
}
