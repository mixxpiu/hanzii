import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Volume2,
  XCircle,
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
  computeTypingSessionStats,
  evaluateMeaningAnswer,
  getWordProgress,
  scheduleRetryInQueue,
  selectStudyDeck,
  type DeckMode,
  type ReviewRating,
  type TypingSessionOutcome,
} from '../utils/studyLogic';

interface TypingPracticeStudioProps {
  words: VocabWord[];
  progressMap: ProgressMap;
  onRateWord: (wordId: number, rating: ReviewRating) => void;
}

type CountOption = '10' | '20' | '30' | '40' | '50' | 'all';

type CardPhase = 'idle' | 'feedback';

interface CardFeedback {
  status: 'exact' | 'near' | 'wrong' | 'unknown';
  message: string;
}

const MODE_LABELS: Array<{ id: DeckMode; label: string }> = [
  { id: 'due', label: 'Cần ôn' },
  { id: 'new', label: 'Chưa học' },
  { id: 'weak', label: 'Hay quên' },
  { id: 'topic', label: 'Theo bộ thẻ' },
  { id: 'all_random', label: 'Ngẫu nhiên' },
];

export function TypingPracticeStudio({
  words,
  progressMap,
  onRateWord,
}: TypingPracticeStudioProps) {
  const [deckMode, setDeckMode] = useState<DeckMode>('topic');
  const [folderId, setFolderId] = useState<string | 'all'>(VOCAB_FOLDERS[0].id);
  const [deckId, setDeckId] = useState<string>(VOCAB_DECKS[0].id);
  const [countOption, setCountOption] = useState<CountOption>('20');
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [autoAdvanceOnCorrect, setAutoAdvanceOnCorrect] = useState(true);
  const [showPinyin, setShowPinyin] = useState(true);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [retryWords, setRetryWords] = useState<VocabWord[] | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const availableDecks = useMemo(() => getDecksByFolder(folderId), [folderId]);
  const activeDeckMeta = DECK_BY_ID[deckId] ?? availableDecks[0];

  const baseDeck = useMemo(() => {
    if (retryWords && retryWords.length > 0) {
      return retryWords;
    }
    const resolvedLimit =
      countOption === 'all' ? words.length : Number(countOption);
    return selectStudyDeck(words, progressMap, {
      mode: deckMode,
      folderId,
      deckId: activeDeckMeta?.id,
      shuffle: shuffleOrder,
      limit: resolvedLimit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    retryWords,
    deckMode,
    folderId,
    activeDeckMeta?.id,
    countOption,
    shuffleOrder,
    sessionSeed,
    words,
  ]);

  const [queue, setQueue] = useState<VocabWord[]>(baseDeck);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState('');
  const [phase, setPhase] = useState<CardPhase>('idle');
  const [feedback, setFeedback] = useState<CardFeedback | null>(null);
  const [outcomes, setOutcomes] = useState<TypingSessionOutcome[]>([]);
  const [sessionMissCounts, setSessionMissCounts] = useState<
    Record<number, number>
  >({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const sessionEpochRef = useRef(0);

  useEffect(() => {
    setQueue(baseDeck);
  }, [baseDeck]);

  const isCompleted = queue.length > 0 && currentIndex >= queue.length;
  const currentCard = !isCompleted ? queue[currentIndex] : undefined;
  const currentMissCount = currentCard
    ? (sessionMissCounts[currentCard.id] ?? 0)
    : 0;

  const sessionStats = useMemo(
    () => computeTypingSessionStats(outcomes),
    [outcomes]
  );

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAutoAdvanceTimer();
  }, [clearAutoAdvanceTimer]);

  useEffect(() => {
    if (!isCompleted && currentCard && phase === 'idle' && !mobileDrawerOpen) {
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [currentIndex, isCompleted, currentCard, phase, mobileDrawerOpen]);

  const advanceToNextCard = useCallback(() => {
    clearAutoAdvanceTimer();
    setCurrentIndex((idx) => idx + 1);
    setAnswerText('');
    setPhase('idle');
    setFeedback(null);
  }, [clearAutoAdvanceTimer]);

  useEffect(() => {
    if (phase !== 'feedback' || isCompleted || !currentCard) return;

    function onWindowKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        advanceToNextCard();
      }
    }

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [phase, isCompleted, currentCard, advanceToNextCard]);

  function resetSession(options?: {
    nextMode?: DeckMode;
    nextFolderId?: string | 'all';
    nextDeckId?: string;
    nextRetryWords?: VocabWord[] | null;
  }) {
    clearAutoAdvanceTimer();
    sessionEpochRef.current += 1;

    if (options?.nextMode) setDeckMode(options.nextMode);
    if (options?.nextFolderId !== undefined) {
      setFolderId(options.nextFolderId);
      const nextDecks = getDecksByFolder(options.nextFolderId);
      if (options.nextDeckId) {
        setDeckId(options.nextDeckId);
      } else if (!nextDecks.some((d) => d.id === deckId) && nextDecks[0]) {
        setDeckId(nextDecks[0].id);
      }
    } else if (options?.nextDeckId) {
      setDeckId(options.nextDeckId);
    }

    setRetryWords(
      options?.nextRetryWords !== undefined ? options.nextRetryWords : null
    );
    setCurrentIndex(0);
    setAnswerText('');
    setPhase('idle');
    setFeedback(null);
    setOutcomes([]);
    setSessionMissCounts({});
    setSessionSeed((s) => s + 1);
  }

  function recordMissWithRetry(
    card: VocabWord,
    status: 'wrong' | 'unknown'
  ) {
    const nextMissCount = (sessionMissCounts[card.id] ?? 0) + 1;
    const historicalWrongCount = getWordProgress(progressMap, card.id).wrongCount;
    const retryResult = scheduleRetryInQueue(queue, card, {
      currentIndex,
      sessionMissCount: nextMissCount,
      historicalWrongCount,
    });

    setSessionMissCounts((prev) => ({
      ...prev,
      [card.id]: nextMissCount,
    }));

    if (retryResult.insertedAtIndex !== null) {
      setQueue(retryResult.nextQueue);
    }

    const retryNote =
      retryResult.insertedAtIndex === null
        ? status === 'unknown'
          ? 'Đã lưu để ôn lại cuối lượt.'
          : 'Chưa khớp nghĩa từ điển.'
        : retryResult.gapUsed === 0
          ? 'Sẽ cho nhập lại ngay sau câu này.'
          : `Sẽ cho nhập lại sau ${retryResult.gapUsed} từ.`;

    onRateWord(card.id, 'again');
    setOutcomes((prev) => [...prev, { wordId: card.id, status }]);
    setFeedback({ status, message: retryNote });
    setPhase('feedback');
  }

  function handleCheckAnswer() {
    if (!currentCard || phase !== 'idle') return;
    const trimmed = answerText.trim();
    if (!trimmed) return;

    const evalResult = evaluateMeaningAnswer(trimmed, currentCard.viMeaning);
    if (evalResult.isCorrect) {
      const status = evalResult.matchType === 'exact' ? 'exact' : 'near';
      onRateWord(currentCard.id, 'good');
      setOutcomes((prev) => [...prev, { wordId: currentCard.id, status }]);
      setFeedback({
        status,
        message:
          status === 'exact'
            ? 'Chính xác.'
            : 'Gần đúng — chấp nhận nghĩa tương đương / chính tả.',
      });
      setPhase('feedback');

      if (autoAdvanceOnCorrect) {
        clearAutoAdvanceTimer();
        const targetEpoch = sessionEpochRef.current;
        autoAdvanceTimerRef.current = window.setTimeout(() => {
          if (sessionEpochRef.current === targetEpoch) {
            advanceToNextCard();
          }
        }, 450);
      }
      return;
    }

    recordMissWithRetry(currentCard, 'wrong');
  }

  function handleDontKnow() {
    if (!currentCard || phase !== 'idle') return;
    recordMissWithRetry(currentCard, 'unknown');
  }

  function handleOverrideAsCorrect() {
    if (!currentCard || phase !== 'feedback') return;
    onRateWord(currentCard.id, 'good');
    setQueue((prev) => {
      const futureIdx = prev.findIndex(
        (w, i) => i > currentIndex && w.id === currentCard.id
      );
      if (futureIdx === -1) return prev;
      return [...prev.slice(0, futureIdx), ...prev.slice(futureIdx + 1)];
    });
    setOutcomes((prev) =>
      prev.map((item, idx) =>
        idx === prev.length - 1 ? { ...item, status: 'near' } : item
      )
    );
    advanceToNextCard();
  }

  const progressPct =
    queue.length === 0
      ? 0
      : Math.min(100, Math.round((currentIndex / queue.length) * 100));

  const missedWords = useMemo(() => {
    const missedSet = new Set(sessionStats.missedWordIds);
    const seen = new Set<number>();
    const list: VocabWord[] = [];
    for (const w of queue) {
      if (missedSet.has(w.id) && !seen.has(w.id)) {
        seen.add(w.id);
        list.push(w);
      }
    }
    return list;
  }, [queue, sessionStats.missedWordIds]);

  const activeModeLabel = retryWords
    ? 'Ôn từ chưa nhớ'
    : (MODE_LABELS.find((m) => m.id === deckMode)?.label ?? 'Theo bộ thẻ');
  const activeScopeDetail = retryWords
    ? `${retryWords.length} từ`
    : deckMode === 'topic' && activeDeckMeta
      ? `${activeDeckMeta.order}. ${activeDeckMeta.name}`
      : folderId === 'all'
        ? 'Tất cả thư mục'
        : (FOLDER_BY_ID[folderId]?.name ?? 'Thư mục');
  const activeOptionsSummary = [
    countOption === 'all' ? 'Tất cả' : `${countOption} từ`,
    shuffleOrder ? 'Xáo trộn' : null,
    autoAdvanceOnCorrect ? 'Tự chuyển' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="Luyện nhập nghĩa"
      className="mx-auto max-w-4xl space-y-3.5 sm:space-y-5"
    >
      {/* Mobile Compact Summary Bar + Drawer Trigger */}
      <div className="sm:hidden flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
            {activeModeLabel} · {activeScopeDetail}
          </div>
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {activeOptionsSummary}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-expanded={mobileDrawerOpen}
          aria-controls="typing-mobile-drawer"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span>Cấu hình</span>
        </button>
      </div>

      {/* Mobile Configuration Drawer */}
      <MobileConfigDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Cấu hình luyện nhập nghĩa"
        subtitle={`${activeModeLabel} · ${activeScopeDetail}`}
      >
        <div id="typing-mobile-drawer" className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nguồn từ vựng
            </span>
            <div
              role="group"
              aria-label="Nguồn từ vựng di động"
              className="flex flex-wrap gap-1.5"
            >
              {MODE_LABELS.map((m) => {
                const active = !retryWords && deckMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => resetSession({ nextMode: m.id })}
                    className={`min-h-[42px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'border-teal-700 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-typing-folder"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Thư mục
              </label>
              <select
                id="mobile-typing-folder"
                value={folderId}
                onChange={(e) =>
                  resetSession({
                    nextMode: deckMode,
                    nextFolderId: e.target.value,
                  })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
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
                  htmlFor="mobile-typing-deck"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Bộ thẻ
                </label>
                <select
                  id="mobile-typing-deck"
                  value={activeDeckMeta?.id ?? deckId}
                  onChange={(e) =>
                    resetSession({
                      nextMode: 'topic',
                      nextDeckId: e.target.value,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
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

          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-typing-count"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Số thẻ mỗi lượt
                </label>
                <select
                  id="mobile-typing-count"
                  value={countOption}
                  onChange={(e) => {
                    setCountOption(e.target.value as CountOption);
                    resetSession();
                  }}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                >
                  <option value="10">10 từ</option>
                  <option value="20">20 từ</option>
                  <option value="30">30 từ</option>
                  <option value="40">40 từ</option>
                  <option value="50">50 từ</option>
                  <option value="all">Tất cả</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Thứ tự
                </span>
                <button
                  type="button"
                  aria-pressed={shuffleOrder}
                  onClick={() => {
                    setShuffleOrder((prev) => !prev);
                    resetSession();
                  }}
                  className={`min-h-[44px] w-full inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    shuffleOrder
                      ? 'border-teal-700 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Xáo trộn</span>
                </button>
              </div>
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200">
              <span>Tự chuyển sang từ tiếp theo khi đúng</span>
              <input
                type="checkbox"
                checked={autoAdvanceOnCorrect}
                onChange={(e) => setAutoAdvanceOnCorrect(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-slate-300 dark:border-slate-600 text-teal-700 focus:ring-teal-700"
              />
            </label>
          </div>
        </div>
      </MobileConfigDrawer>

      {/* Desktop Inline Scope Bar */}
      <div className="hidden sm:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Nguồn từ vựng"
            className="flex w-full sm:w-auto items-center gap-0.5 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5"
          >
            {MODE_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => resetSession({ nextMode: m.id })}
                className={`min-h-[36px] sm:min-h-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  !retryWords && deckMode === m.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2 sm:gap-2.5">
            <label htmlFor="typing-count" className="sr-only">
              Số thẻ luyện tập
            </label>
            <select
              id="typing-count"
              aria-label="Số thẻ mỗi lượt"
              value={countOption}
              onChange={(e) => {
                setCountOption(e.target.value as CountOption);
                resetSession();
              }}
              className="min-h-[38px] sm:min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
            >
              <option value="10">10 từ</option>
              <option value="20">20 từ</option>
              <option value="30">30 từ</option>
              <option value="40">40 từ</option>
              <option value="50">50 từ</option>
              <option value="all">Tất cả</option>
            </select>

            <button
              type="button"
              aria-pressed={shuffleOrder}
              onClick={() => {
                setShuffleOrder((prev) => !prev);
                resetSession();
              }}
              className={`min-h-[38px] sm:min-h-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                shuffleOrder
                  ? 'border-teal-700 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xáo trộn</span>
            </button>

            <label className="min-h-[38px] sm:min-h-0 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
              <input
                type="checkbox"
                checked={autoAdvanceOnCorrect}
                onChange={(e) => setAutoAdvanceOnCorrect(e.target.checked)}
                className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-slate-300 dark:border-slate-600 text-teal-700 focus:ring-teal-700"
              />
              <span>Tự chuyển</span>
            </label>
          </div>
        </div>

        <div
          className={`grid gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 sm:pt-3 ${
            deckMode === 'topic' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="typing-folder"
              className="hidden sm:inline w-16 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Thư mục
            </label>
            <select
              id="typing-folder"
              aria-label="Chọn thư mục"
              value={folderId}
              onChange={(e) =>
                resetSession({
                  nextMode: deckMode,
                  nextFolderId: e.target.value,
                })
              }
              className="min-h-[40px] sm:min-h-0 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none truncate"
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
                htmlFor="typing-deck"
                className="hidden sm:inline w-16 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Bộ thẻ
              </label>
              <select
                id="typing-deck"
                aria-label="Chọn bộ thẻ"
                value={activeDeckMeta?.id ?? deckId}
                onChange={(e) =>
                  resetSession({
                    nextMode: 'topic',
                    nextDeckId: e.target.value,
                  })
                }
                className="min-h-[40px] sm:min-h-0 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-9 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none truncate"
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

      {/* Empty State */}
      {queue.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-4">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Không có thẻ trong nhóm này
          </p>
          <button
            type="button"
            onClick={() =>
              resetSession({
                nextMode: 'topic',
                nextFolderId: VOCAB_DECKS[0].folderId,
                nextDeckId: VOCAB_DECKS[0].id,
              })
            }
            className="rounded-lg bg-teal-700 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:hover:bg-teal-500"
          >
            Luyện {VOCAB_DECKS[0].name}
          </button>
        </div>
      ) : isCompleted ? (
        /* Completion Summary */
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-5">
          <CheckCircle2
            className="mx-auto h-9 w-9 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Hoàn thành {sessionStats.total} lượt
          </h1>

          <div className="grid grid-cols-3 gap-3 border-y border-slate-100 dark:border-slate-800 py-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Đúng / Gần đúng</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {sessionStats.correctCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Sai / Bỏ qua</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                {sessionStats.wrongCount + sessionStats.unknownCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Tỷ lệ</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {sessionStats.accuracyPercent}%
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {missedWords.length > 0 && (
              <button
                type="button"
                onClick={() => resetSession({ nextRetryWords: missedWords })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:hover:bg-teal-500"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ôn lại {missedWords.length} từ chưa nhớ</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => resetSession({ nextRetryWords: null })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${
                missedWords.length > 0
                  ? 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  : 'bg-teal-700 dark:bg-teal-600 text-white hover:bg-teal-800 dark:hover:bg-teal-500'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Luyện lại từ đầu</span>
            </button>
          </div>
        </div>
      ) : (
        currentCard && (
          <div className="mx-auto max-w-2xl space-y-3.5">
            {/* Session Progress Strip */}
            <div className="space-y-1.5 px-0.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                <span className="truncate">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {currentIndex + 1} / {queue.length}
                  </span>{' '}
                  ·{' '}
                  {retryWords
                    ? 'Ôn lại từ chưa nhớ'
                    : `${currentCard.folderName} · ${currentCard.topic}`}
                </span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                  Đúng {sessionStats.correctCount}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full origin-left bg-teal-700 dark:bg-teal-500 transition-transform duration-200"
                  style={{
                    transform: `scaleX(${Math.max(0.02, progressPct / 100)})`,
                  }}
                />
              </div>
            </div>

            {/* Single-Card Stage (No Scroll List) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs sm:p-8 space-y-4 sm:space-y-6">
              {/* Top Controls Row inside Card */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs min-w-0">
                  <span className="font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                    #{String(currentCard.id).padStart(3, '0')}
                  </span>
                  {currentMissCount > 0 && (
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      · Nhập lại (đã sai {currentMissCount} lần)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Pinyin
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showPinyin}
                      aria-label={showPinyin ? 'Ẩn Pinyin' : 'Hiện Pinyin'}
                      onClick={() => setShowPinyin((prev) => !prev)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                        showPinyin ? 'bg-teal-700 dark:bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                          showPinyin ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={`Phát âm ${currentCard.word}`}
                    onClick={() => speakChinese(currentCard.word)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-800 dark:hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-teal-700"
                  >
                    <Volume2 className="h-4.5 w-4.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Word & POS - Pinyin Display */}
              <div className="space-y-2.5">
                <div>
                  <span className="inline-block border-b-2 border-dotted border-slate-300 dark:border-slate-700 pb-1.5 font-hanzi text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
                    {currentCard.word}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="border-b border-dotted border-slate-300 dark:border-slate-700 pb-0.5">
                    {currentCard.posVi}
                  </span>
                  {showPinyin ? (
                    <>
                      {' - '}
                      <span className="border-b border-dotted border-slate-300 dark:border-slate-700 pb-0.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {currentCard.pinyin}
                      </span>
                    </>
                  ) : (
                    <>
                      {' · '}
                      <span className="italic text-slate-400 dark:text-slate-500">
                        Pinyin đang ẩn
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Answer Input + Stacked Full-Width Controls */}
              <div className="space-y-2.5">
                <label htmlFor="typing-answer-input" className="sr-only">
                  Nhập nghĩa tiếng Việt của {currentCard.word}
                </label>
                <input
                  ref={inputRef}
                  id="typing-answer-input"
                  type="text"
                  enterKeyHint="done"
                  autoComplete="off"
                  disabled={phase !== 'idle'}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && phase === 'idle') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCheckAnswer();
                    }
                  }}
                  placeholder="Nhập câu trả lời của bạn..."
                  className={`w-full rounded-xl border-2 px-3.5 py-3 sm:px-4 sm:py-3.5 text-base font-medium transition-colors focus:outline-none ${
                    phase === 'feedback' && feedback
                      ? feedback.status === 'exact' || feedback.status === 'near'
                        ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100'
                        : 'border-rose-500 dark:border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500'
                  } disabled:cursor-default`}
                />

                {phase !== 'feedback' ? (
                  <div className="space-y-2 pt-0.5">
                    <button
                      type="button"
                      disabled={!answerText.trim()}
                      onClick={handleCheckAnswer}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 dark:bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 dark:hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500"
                    >
                      <span>Kiểm tra</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDontKnow}
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-200/80 dark:hover:bg-slate-700"
                    >
                      Tôi không biết
                    </button>
                  </div>
                ) : (
                  feedback && (
                    <div
                      className={`rounded-xl border p-4 space-y-3 ${
                        feedback.status === 'exact' || feedback.status === 'near'
                          ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                          : 'border-rose-200 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 text-sm font-bold">
                          {feedback.status === 'exact' ||
                          feedback.status === 'near' ? (
                            <>
                              <CheckCircle2
                                className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400"
                                aria-hidden="true"
                              />
                              <span>
                                {feedback.status === 'exact'
                                  ? 'Đúng'
                                  : 'Gần đúng'}
                              </span>
                            </>
                          ) : (
                            <>
                              <XCircle
                                className="h-4.5 w-4.5 text-rose-700 dark:text-rose-400"
                                aria-hidden="true"
                              />
                              <span>
                                {feedback.status === 'unknown'
                                  ? 'Đã bỏ qua'
                                  : 'Chưa đúng'}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-xs font-medium opacity-85">
                          {feedback.message}
                        </span>
                      </div>

                      <div className="rounded-lg bg-white/90 dark:bg-slate-900/90 px-3.5 py-2.5 text-slate-900 dark:text-slate-100 space-y-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Nghĩa đúng ·{' '}
                          <span className="font-mono text-slate-600 dark:text-slate-300">
                            {currentCard.pinyin}
                          </span>
                        </div>
                        <div className="text-base font-bold text-teal-800 dark:text-teal-300">
                          {currentCard.viMeaning}
                        </div>
                        {currentCard.example && (
                          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-hanzi text-sm font-medium text-slate-900 dark:text-slate-100">
                                {currentCard.example}
                              </span>
                              <button
                                type="button"
                                aria-label={`Nghe ví dụ của ${currentCard.word}`}
                                onClick={() => speakChinese(currentCard.example)}
                                className="rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-800 dark:hover:text-teal-300 shrink-0"
                              >
                                <Volume2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                            {currentCard.exampleVi && (
                              <p>{currentCard.exampleVi}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        {feedback.status === 'wrong' ? (
                          <button
                            type="button"
                            onClick={handleOverrideAsCorrect}
                            className="min-h-[40px] sm:min-h-0 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 underline hover:text-teal-800 dark:hover:text-teal-300"
                          >
                            Tôi trả lời đúng — Tính đúng
                          </button>
                        ) : feedback.status === 'unknown' ? (
                          <span className="hidden sm:inline text-xs font-medium text-rose-800 dark:text-rose-300">
                            Nhấn Enter để tiếp tục
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                            {autoAdvanceOnCorrect
                              ? 'Đang chuyển từ tiếp theo...'
                              : 'Nhấn Enter để tiếp tục'}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={advanceToNextCard}
                          className="inline-flex min-h-[44px] w-full sm:w-auto sm:min-h-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white"
                        >
                          <span>Tiếp theo</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )
      )}
    </section>
  );
}
