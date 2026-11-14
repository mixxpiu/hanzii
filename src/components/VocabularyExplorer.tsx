import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  Pencil,
  RotateCcw,
  Search,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import {
  DECK_BY_ID,
  FOLDER_BY_ID,
  VOCAB_FOLDERS,
  getDecksByFolder,
} from '../data/vocabCatalog';
import { WORD_INSIGHTS } from '../data/wordInsights/index';
import {
  StudyStatus,
  type ProgressMap,
  type VocabOverride,
  type VocabOverridesMap,
  type VocabWord,
  type WordInsight,
} from '../types/vocab';
import { speakChinese } from '../utils/speech';
import { filterVocab, getWordProgress } from '../utils/studyLogic';

interface VocabularyExplorerProps {
  words: VocabWord[];
  progressMap: ProgressMap;
  overrides: VocabOverridesMap;
  insightCache: Record<number, WordInsight>;
  onSaveInsight: (insight: WordInsight) => void;
  onUpdateStatus: (wordId: number, status: StudyStatus) => void;
  onSaveOverride: (wordId: number, override: VocabOverride) => void;
  onResetOverride: (wordId: number) => void;
  onStartAiQuizWithWords: (words: VocabWord[], label: string) => void;
  onStartDeckFlashcards: (folderId: string, deckId: string) => void;
}

const STATUS_LABELS: Record<StudyStatus, string> = {
  [StudyStatus.NEW]: 'Chưa học',
  [StudyStatus.LEARNING]: 'Đang ôn',
  [StudyStatus.MASTERED]: 'Thuộc',
};

const PAGE_SIZE = 20;

export function VocabularyExplorer({
  words,
  progressMap,
  overrides,
  insightCache,
  onSaveInsight,
  onUpdateStatus,
  onSaveOverride,
  onResetOverride,
  onStartAiQuizWithWords,
  onStartDeckFlashcards,
}: VocabularyExplorerProps) {
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | 'all'>('all');
  const [deckId, setDeckId] = useState<string | 'all'>('all');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(VOCAB_FOLDERS.map((f) => [f.id, true]))
  );
  const [statusFilter, setStatusFilter] = useState<StudyStatus | 'all'>('all');
  const [showPinyin, setShowPinyin] = useState(true);
  const [showExample, setShowExample] = useState(true);
  const [showAllRows, setShowAllRows] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedWordId, setSelectedWordId] = useState<number>(1);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [isEditingWord, setIsEditingWord] = useState(false);
  const [editForm, setEditForm] = useState({
    viMeaning: '',
    posVi: '',
    example: '',
    examplePinyin: '',
    exampleVi: '',
  });

  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const availableDecks = useMemo(() => getDecksByFolder(folderId), [folderId]);
  const selectedDeck = deckId !== 'all' ? DECK_BY_ID[deckId] : undefined;
  const selectedFolder = folderId !== 'all' ? FOLDER_BY_ID[folderId] : undefined;

  const filteredWords = useMemo(
    () =>
      filterVocab(words, progressMap, {
        query,
        folderId,
        deckId,
        status: statusFilter,
      }),
    [words, progressMap, query, folderId, deckId, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredWords.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [query, folderId, deckId, statusFilter]);

  useEffect(() => {
    if (
      filteredWords.length > 0 &&
      !filteredWords.some((w) => w.id === selectedWordId)
    ) {
      setSelectedWordId(filteredWords[0].id);
    }
  }, [filteredWords, selectedWordId]);

  const visibleWords = useMemo(() => {
    if (showAllRows) return filteredWords;
    const start = (page - 1) * PAGE_SIZE;
    return filteredWords.slice(start, start + PAGE_SIZE);
  }, [filteredWords, page, showAllRows]);

  const selectedWord = useMemo(
    () => words.find((w) => w.id === selectedWordId) ?? words[0],
    [words, selectedWordId]
  );

  useEffect(() => {
    setIsEditingWord(false);
    setEditForm({
      viMeaning: selectedWord.viMeaning,
      posVi: selectedWord.posVi,
      example: selectedWord.example,
      examplePinyin: selectedWord.examplePinyin,
      exampleVi: selectedWord.exampleVi,
    });
  }, [selectedWord]);

  useEffect(() => {
    if (!mobileInspectorOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileInspectorOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileInspectorOpen]);

  const selectedProgress = getWordProgress(progressMap, selectedWord.id);
  const selectedInsight =
    insightCache[selectedWord.id] ?? WORD_INSIGHTS[selectedWord.id];
  const hasOverride = Boolean(overrides[selectedWord.id]);

  async function handleFetchInsight(word: VocabWord) {
    if (insightCache[word.id] || WORD_INSIGHTS[word.id]) return;
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch('/api/word-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể phân tích từ vựng.');
      }
      onSaveInsight(data as WordInsight);
    } catch (err) {
      setInsightError(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ AI.'
      );
    } finally {
      setInsightLoading(false);
    }
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    onSaveOverride(selectedWord.id, {
      viMeaning: editForm.viMeaning.trim(),
      posVi: editForm.posVi.trim(),
      example: editForm.example.trim(),
      examplePinyin: editForm.examplePinyin.trim(),
      exampleVi: editForm.exampleVi.trim(),
    });
    setIsEditingWord(false);
  }

  function handleSelectFolder(nextFolderId: string | 'all') {
    setFolderId(nextFolderId);
    setDeckId('all');
    if (nextFolderId !== 'all') {
      setExpandedFolders((prev) => ({ ...prev, [nextFolderId]: true }));
    }
  }

  function handleSelectDeck(nextFolderId: string, nextDeckId: string | 'all') {
    setFolderId(nextFolderId);
    setDeckId(nextDeckId);
    setExpandedFolders((prev) => ({ ...prev, [nextFolderId]: true }));
  }

  function toggleFolderExpand(id: string) {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function clearFilters() {
    setQuery('');
    setFolderId('all');
    setDeckId('all');
    setStatusFilter('all');
  }

  const scopeTitle = selectedDeck
    ? `${selectedDeck.order}. ${selectedDeck.name}`
    : selectedFolder
      ? selectedFolder.name
      : 'Tất cả từ vựng';

  const hasActiveFilter =
    query.trim() !== '' ||
    folderId !== 'all' ||
    deckId !== 'all' ||
    statusFilter !== 'all';

  return (
    <section
      aria-label="Thư viện từ vựng"
      className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12"
    >
      {/* Left Rail: Thư mục -> Bộ thẻ (Desktop Tree) */}
      <aside
        aria-label="Cây thư mục và bộ thẻ"
        className="hidden lg:block lg:col-span-3 lg:sticky lg:top-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="border-b border-slate-100 dark:border-slate-800 p-2">
          <button
            type="button"
            onClick={() => handleSelectFolder('all')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
              folderId === 'all' && deckId === 'all'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span>Tất cả thư mục</span>
            <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {words.length}
            </span>
          </button>
        </div>

        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2">
          {VOCAB_FOLDERS.map((folder) => {
            const isFolderActive = folderId === folder.id;
            const isFolderOnly = isFolderActive && deckId === 'all';
            const isExpanded = expandedFolders[folder.id] ?? true;
            const folderDecks = getDecksByFolder(folder.id);

            return (
              <div key={folder.id} className="py-1.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} ${folder.name}`}
                    aria-expanded={isExpanded}
                    onClick={() => toggleFolderExpand(folder.id)}
                    className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFolder(folder.id)}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                      isFolderOnly
                        ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200'
                        : isFolderActive
                          ? 'text-teal-800 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isExpanded ? (
                        <FolderOpen
                          className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Folder
                          className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {folder.cardCount}
                    </span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-1 space-y-0.5 pl-6">
                    {folderDecks.map((d) => {
                      const active = deckId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSelectDeck(folder.id, d.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? 'bg-teal-700 dark:bg-teal-600 font-semibold text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-mono tabular-nums">
                              {d.order}.
                            </span>{' '}
                            {d.name}
                          </span>
                          <span
                            className={`font-mono text-[11px] tabular-nums shrink-0 ${
                              active
                                ? 'text-teal-100'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {d.cardCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Center Column: Scope Header, Filters & Word List */}
      <div className="lg:col-span-5 space-y-3">
        {/* Mobile Folder/Deck Selectors */}
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <div>
            <label htmlFor="mobile-folder-filter" className="sr-only">
              Chọn thư mục
            </label>
            <select
              id="mobile-folder-filter"
              value={folderId}
              onChange={(e) => handleSelectFolder(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-3 pr-9 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none truncate"
            >
              <option value="all">Tất cả thư mục ({words.length})</option>
              {VOCAB_FOLDERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.cardCount})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mobile-deck-filter" className="sr-only">
              Chọn bộ thẻ
            </label>
            <select
              id="mobile-deck-filter"
              value={deckId}
              onChange={(e) => {
                const nextDeck = e.target.value;
                if (nextDeck === 'all') {
                  setDeckId('all');
                } else {
                  const found = DECK_BY_ID[nextDeck];
                  handleSelectDeck(found ? found.folderId : folderId, nextDeck);
                }
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-3 pr-9 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none truncate"
            >
              <option value="all">Tất cả bộ thẻ ({availableDecks.length})</option>
              {availableDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.order}. {d.name} ({d.cardCount})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Workspace Toolbar */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 space-y-2.5 sm:space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {scopeTitle}
              </h1>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {filteredWords.length} thẻ
                {selectedDeck ? ` · ${selectedDeck.folderName}` : ''}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {selectedDeck && (
                <button
                  type="button"
                  onClick={() =>
                    onStartDeckFlashcards(selectedDeck.folderId, selectedDeck.id)
                  }
                  className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 dark:bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:hover:bg-teal-500 whitespace-nowrap shrink-0"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Học thẻ</span>
                </button>
              )}
              <button
                type="button"
                disabled={filteredWords.length === 0}
                onClick={() =>
                  onStartAiQuizWithWords(
                    filteredWords.slice(0, 25),
                    selectedDeck
                      ? `${selectedDeck.name} (${filteredWords.length} thẻ)`
                      : hasActiveFilter
                        ? `${scopeTitle} (${Math.min(filteredWords.length, 25)} thẻ)`
                        : 'Nhóm 25 thẻ đầu tiên'
                  )
                }
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Bài tập AI</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <label htmlFor="vocab-search" className="sr-only">
              Tìm từ vựng
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              id="vocab-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm Hán tự, Pinyin, nghĩa..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 sm:py-2 pl-9 pr-10 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label="Trạng thái học"
              className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto items-center gap-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5"
            >
              {(
                [
                  ['all', 'Tất cả'],
                  [StudyStatus.NEW, 'Chưa học'],
                  [StudyStatus.LEARNING, 'Đang ôn'],
                  [StudyStatus.MASTERED, 'Thuộc'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={`min-h-[36px] sm:min-h-0 rounded-md px-2 sm:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === val
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <label className="min-h-[32px] sm:min-h-0 inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showPinyin}
                  onChange={(e) => setShowPinyin(e.target.checked)}
                  className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-500 focus:ring-teal-700 dark:focus:ring-teal-500"
                />
                <span>Pinyin</span>
              </label>
              <label className="min-h-[32px] sm:min-h-0 inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showExample}
                  onChange={(e) => setShowExample(e.target.checked)}
                  className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-500 focus:ring-teal-700 dark:focus:ring-teal-500"
                />
                <span>Ví dụ</span>
              </label>
            </div>
          </div>
        </div>

        {/* Word List */}
        {filteredWords.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Không có từ phù hợp
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleWords.map((item) => {
                const prog = getWordProgress(progressMap, item.id);
                const isSelected = selectedWord.id === item.id;
                const isEdited = Boolean(overrides[item.id]);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-2 px-3 py-3 sm:px-3.5 transition-colors ${
                      isSelected
                        ? 'bg-teal-50/70 dark:bg-teal-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWordId(item.id);
                        setInsightError(null);
                        if (window.innerWidth < 1024) {
                          setMobileInspectorOpen(true);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2 sm:gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-500"
                    >
                      <span className="hidden sm:inline-block mt-1 w-7 shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {String(item.id).padStart(3, '0')}
                      </span>

                      <div className="min-w-[64px] sm:min-w-[74px] shrink-0">
                        <div className="font-hanzi text-xl font-semibold text-slate-900 dark:text-slate-100">
                          {item.word}
                        </div>
                        {showPinyin && (
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {item.pinyin}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.viMeaning}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{item.posVi}</span>
                          {!selectedDeck && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.topic}</span>
                            </>
                          )}
                          {isEdited && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-teal-700 dark:text-teal-400">
                                Đã sửa
                              </span>
                            </>
                          )}
                        </div>
                        {showExample && item.example && (
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            <span className="font-hanzi text-slate-800 dark:text-slate-200">
                              {item.example}
                            </span>
                            {item.exampleVi && (
                              <>
                                {' '}
                                <span className="text-slate-400 dark:text-slate-500">
                                  —
                                </span>{' '}
                                <span>{item.exampleVi}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        title={STATUS_LABELS[prog.status]}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                          prog.status === StudyStatus.MASTERED
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : prog.status === StudyStatus.LEARNING
                              ? 'text-sky-700 dark:text-sky-400'
                              : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {prog.status === StudyStatus.MASTERED && (
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        {prog.status === StudyStatus.LEARNING && (
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span className="hidden sm:inline">
                          {prog.status !== StudyStatus.NEW
                            ? STATUS_LABELS[prog.status]
                            : ''}
                        </span>
                      </span>

                      <button
                        type="button"
                        aria-label={`Phát âm ${item.word}`}
                        onClick={() => speakChinese(item.word)}
                        className="inline-flex min-h-[42px] min-w-[42px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300"
                      >
                        <Volume2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 sm:px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setShowAllRows((prev) => !prev)}
                className="min-h-[36px] sm:min-h-0 font-medium text-teal-800 dark:text-teal-400 hover:underline"
              >
                {showAllRows
                  ? 'Phân trang (20/trang)'
                  : `Hiện tất cả (${filteredWords.length})`}
              </button>

              {!showAllRows && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    aria-label="Trang trước"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 sm:p-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  </button>
                  <span className="font-mono tabular-nums px-1">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    aria-label="Trang sau"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 sm:p-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Desktop Sticky Inspector */}
      <aside
        id="word-inspector"
        aria-label="Chi tiết từ vựng"
        className="hidden lg:block lg:col-span-4 lg:sticky lg:top-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                #{String(selectedWord.id).padStart(3, '0')}
              </span>{' '}
              · {selectedWord.topic} · {selectedWord.posVi}
            </div>
            <div className="mt-1.5 font-hanzi text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {selectedWord.word}
            </div>
            <div className="mt-1 font-mono text-base text-slate-600 dark:text-slate-400">
              {selectedWord.pinyin}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-label={`Sửa nghĩa và ví dụ của ${selectedWord.word}`}
              onClick={() => setIsEditingWord((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isEditingWord
                  ? 'border-teal-700 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isEditingWord ? 'Đóng' : 'Sửa'}</span>
            </button>
            <button
              type="button"
              aria-label={`Nghe phát âm từ ${selectedWord.word}`}
              onClick={() => speakChinese(selectedWord.word)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nghe</span>
            </button>
          </div>
        </div>

        {isEditingWord ? (
          <form
            onSubmit={handleSaveEdit}
            className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4"
          >
            <div className="space-y-1">
              <label
                htmlFor="edit-pos"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Loại từ
              </label>
              <input
                id="edit-pos"
                type="text"
                required
                value={editForm.posVi}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, posVi: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-meaning"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Nghĩa tiếng Việt
              </label>
              <input
                id="edit-meaning"
                type="text"
                required
                value={editForm.viMeaning}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, viMeaning: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-example"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Ví dụ (chữ Hán)
              </label>
              <input
                id="edit-example"
                type="text"
                required
                value={editForm.example}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, example: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-hanzi text-sm text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-example-pinyin"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Pinyin ví dụ
              </label>
              <input
                id="edit-example-pinyin"
                type="text"
                value={editForm.examplePinyin}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    examplePinyin: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="edit-example-vi"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Nghĩa ví dụ
              </label>
              <input
                id="edit-example-vi"
                type="text"
                value={editForm.exampleVi}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, exampleVi: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {hasOverride ? (
                <button
                  type="button"
                  onClick={() => {
                    onResetOverride(selectedWord.id);
                    setIsEditingWord(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Mặc định</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingWord(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 dark:bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 dark:hover:bg-teal-500"
                >
                  Lưu
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="text-lg font-bold text-teal-800 dark:text-teal-300">
              {selectedWord.viMeaning}
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Ví dụ
                </span>
                <button
                  type="button"
                  aria-label={`Nghe câu ví dụ của ${selectedWord.word}`}
                  onClick={() => speakChinese(selectedWord.example)}
                  className="inline-flex items-center gap-1 rounded bg-white dark:bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-teal-800 dark:hover:text-teal-300"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Nghe</span>
                </button>
              </div>
              <p className="font-hanzi text-base font-semibold text-slate-900 dark:text-slate-100">
                {selectedWord.example}
              </p>
              {selectedWord.examplePinyin && (
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {selectedWord.examplePinyin}
                </p>
              )}
              {selectedWord.exampleVi && (
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {selectedWord.exampleVi}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mastery Status Switcher */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                [StudyStatus.NEW, 'Chưa học'],
                [StudyStatus.LEARNING, 'Đang ôn'],
                [StudyStatus.MASTERED, 'Thuộc'],
              ] as const
            ).map(([statusVal, label]) => {
              const active = selectedProgress.status === statusVal;
              return (
                <button
                  key={statusVal}
                  type="button"
                  onClick={() => onUpdateStatus(selectedWord.id, statusVal)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'border-teal-700 dark:border-teal-600 bg-teal-700 dark:bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Word Insight */}
        <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Chiết tự &amp; Mở rộng
            </h2>
            {!selectedInsight && (
              <button
                type="button"
                disabled={insightLoading}
                onClick={() => handleFetchInsight(selectedWord)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 transition-colors hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{insightLoading ? 'Đang tạo...' : 'Phân tích AI'}</span>
              </button>
            )}
          </div>

          {insightError && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/80 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
              <span>{insightError}</span>
              <button
                type="button"
                onClick={() => handleFetchInsight(selectedWord)}
                className="font-semibold underline shrink-0"
              >
                Thử lại
              </button>
            </div>
          )}

          {selectedInsight && (
            <div className="space-y-3 text-xs">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                {selectedInsight.characterBreakdown.map((ch, idx) => (
                  <div
                    key={`${ch.char}-${idx}`}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <span className="font-hanzi text-base font-bold text-slate-900 dark:text-slate-100">
                      {ch.char}
                    </span>
                    <span className="text-right text-slate-600 dark:text-slate-300">
                      {ch.meaningVi}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {selectedInsight.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3 space-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-hanzi text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ex.chinese}
                      </p>
                      <button
                        type="button"
                        aria-label={`Nghe ví dụ mở rộng ${idx + 1}`}
                        onClick={() => speakChinese(ex.chinese)}
                        className="shrink-0 rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 hover:text-teal-800 dark:hover:text-teal-300"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {ex.pinyin}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      {ex.vietnamese}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-teal-50/70 dark:bg-teal-950/50 p-3 leading-relaxed text-teal-950 dark:text-teal-100 space-y-1">
                <p>
                  <span className="font-semibold">Mẹo: </span>
                  {selectedInsight.memoryTipVi}
                </p>
                <p>
                  <span className="font-semibold">Dùng: </span>
                  {selectedInsight.usageNoteVi}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Slide-Up Bottom Sheet Inspector */}
      {mobileInspectorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết từ ${selectedWord.word}`}
          className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
        >
          <button
            type="button"
            aria-label="Đóng chi tiết từ vựng"
            onClick={() => setMobileInspectorOpen(false)}
            className="absolute inset-0 bg-slate-900/45 dark:bg-black/65 backdrop-blur-[2px]"
          />

          <div className="relative z-10 flex max-h-[86dvh] flex-col rounded-t-3xl bg-white dark:bg-slate-900 border-t border-transparent dark:border-slate-800 shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
              <span className="w-10" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700"
              />
              <button
                type="button"
                aria-label="Đóng chi tiết từ vựng"
                onClick={() => setMobileInspectorOpen(false)}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-6 pt-1 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      #{String(selectedWord.id).padStart(3, '0')}
                    </span>{' '}
                    · {selectedWord.topic} · {selectedWord.posVi}
                  </div>
                  <div className="mt-1 font-hanzi text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {selectedWord.word}
                  </div>
                  <div className="mt-1 font-mono text-base text-slate-600 dark:text-slate-400">
                    {selectedWord.pinyin}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Sửa nghĩa và ví dụ của ${selectedWord.word}`}
                    onClick={() => setIsEditingWord((prev) => !prev)}
                    className={`min-h-[40px] inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isEditingWord
                        ? 'border-teal-700 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300'
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isEditingWord ? 'Đóng' : 'Sửa'}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Nghe phát âm từ ${selectedWord.word}`}
                    onClick={() => speakChinese(selectedWord.word)}
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:border-teal-700 dark:hover:border-teal-500 hover:text-teal-800 dark:hover:text-teal-300"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Nghe</span>
                  </button>
                </div>
              </div>

              {isEditingWord ? (
                <form
                  onSubmit={handleSaveEdit}
                  className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3.5"
                >
                  <div className="space-y-1">
                    <label
                      htmlFor="mobile-edit-pos"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Loại từ
                    </label>
                    <input
                      id="mobile-edit-pos"
                      type="text"
                      required
                      value={editForm.posVi}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, posVi: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="mobile-edit-meaning"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Nghĩa tiếng Việt
                    </label>
                    <input
                      id="mobile-edit-meaning"
                      type="text"
                      required
                      value={editForm.viMeaning}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          viMeaning: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="mobile-edit-example"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Ví dụ (chữ Hán)
                    </label>
                    <input
                      id="mobile-edit-example"
                      type="text"
                      required
                      value={editForm.example}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, example: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-hanzi text-base text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="mobile-edit-example-pinyin"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Pinyin ví dụ
                    </label>
                    <input
                      id="mobile-edit-example-pinyin"
                      type="text"
                      value={editForm.examplePinyin}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          examplePinyin: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="mobile-edit-example-vi"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Nghĩa ví dụ
                    </label>
                    <input
                      id="mobile-edit-example-vi"
                      type="text"
                      value={editForm.exampleVi}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          exampleVi: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {hasOverride ? (
                      <button
                        type="button"
                        onClick={() => {
                          onResetOverride(selectedWord.id);
                          setIsEditingWord(false);
                        }}
                        className="min-h-[40px] inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Mặc định</span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingWord(false)}
                        className="min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="min-h-[40px] rounded-lg bg-teal-700 dark:bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:hover:bg-teal-500"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3.5">
                  <div className="text-lg font-bold text-teal-800 dark:text-teal-300">
                    {selectedWord.viMeaning}
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Ví dụ
                      </span>
                      <button
                        type="button"
                        aria-label={`Nghe câu ví dụ của ${selectedWord.word}`}
                        onClick={() => speakChinese(selectedWord.example)}
                        className="min-h-[34px] inline-flex items-center gap-1 rounded bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-teal-800 dark:hover:text-teal-300"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Nghe</span>
                      </button>
                    </div>
                    <p className="font-hanzi text-base font-semibold text-slate-900 dark:text-slate-100">
                      {selectedWord.example}
                    </p>
                    {selectedWord.examplePinyin && (
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {selectedWord.examplePinyin}
                      </p>
                    )}
                    {selectedWord.exampleVi && (
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        {selectedWord.exampleVi}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      [StudyStatus.NEW, 'Chưa học'],
                      [StudyStatus.LEARNING, 'Đang ôn'],
                      [StudyStatus.MASTERED, 'Thuộc'],
                    ] as const
                  ).map(([statusVal, label]) => {
                    const active = selectedProgress.status === statusVal;
                    return (
                      <button
                        key={statusVal}
                        type="button"
                        onClick={() => onUpdateStatus(selectedWord.id, statusVal)}
                        className={`min-h-[44px] rounded-lg border px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'border-teal-700 dark:border-teal-600 bg-teal-700 dark:bg-teal-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Chiết tự &amp; Mở rộng
                  </h2>
                  {!selectedInsight && (
                    <button
                      type="button"
                      disabled={insightLoading}
                      onClick={() => handleFetchInsight(selectedWord)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 transition-colors hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50"
                    >
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {insightLoading ? 'Đang tạo...' : 'Phân tích AI'}
                      </span>
                    </button>
                  )}
                </div>

                {insightError && (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/80 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
                    <span>{insightError}</span>
                    <button
                      type="button"
                      onClick={() => handleFetchInsight(selectedWord)}
                      className="font-semibold underline shrink-0"
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                {selectedInsight && (
                  <div className="space-y-3 text-xs">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                      {selectedInsight.characterBreakdown.map((ch, idx) => (
                        <div
                          key={`${ch.char}-${idx}`}
                          className="flex items-baseline justify-between gap-3 px-3 py-2"
                        >
                          <span className="font-hanzi text-base font-bold text-slate-900 dark:text-slate-100">
                            {ch.char}
                          </span>
                          <span className="text-right text-slate-600 dark:text-slate-300">
                            {ch.meaningVi}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {selectedInsight.examples.map((ex, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3 space-y-0.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-hanzi text-sm font-medium text-slate-900 dark:text-slate-100">
                              {ex.chinese}
                            </p>
                            <button
                              type="button"
                              aria-label={`Nghe ví dụ mở rộng ${idx + 1}`}
                              onClick={() => speakChinese(ex.chinese)}
                              className="min-h-[34px] min-w-[34px] shrink-0 rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 hover:text-teal-800 dark:hover:text-teal-300 inline-flex items-center justify-center"
                            >
                              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {ex.pinyin}
                          </p>
                          <p className="text-slate-700 dark:text-slate-300">
                            {ex.vietnamese}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg bg-teal-50/70 dark:bg-teal-950/50 p-3 leading-relaxed text-teal-950 dark:text-teal-100 space-y-1">
                      <p>
                        <span className="font-semibold">Mẹo: </span>
                        {selectedInsight.memoryTipVi}
                      </p>
                      <p>
                        <span className="font-semibold">Dùng: </span>
                        {selectedInsight.usageNoteVi}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
