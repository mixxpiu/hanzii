import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Volume2,
  Wand2,
  XCircle,
} from 'lucide-react';
import {
  VOCAB_DECKS,
  VOCAB_FOLDERS,
  getDecksByFolder,
} from '../data/vocabCatalog';
import {
  DifficultyLevel,
  ExerciseType,
  type AiExerciseQuestion,
  type AiExerciseSet,
  type ProgressMap,
  type VocabWord,
} from '../types/vocab';
import { speakChinese } from '../utils/speech';
import {
  generateLocalExerciseSet,
  gradeExerciseSet,
  selectStudyDeck,
  type ExerciseUserAnswer,
  type GradedExerciseSummary,
} from '../utils/studyLogic';

interface AiExerciseStudioProps {
  words: VocabWord[];
  progressMap: ProgressMap;
  preselectedWords?: VocabWord[] | null;
  preselectedLabel?: string | null;
  onClearPreselection: () => void;
  onApplyQuizResults: (correctIds: number[], wrongIds: number[]) => void;
}

type ScopeMode = 'topic' | 'weak' | 'random' | 'custom';

const KIND_LABELS: Record<AiExerciseQuestion['kind'], string> = {
  multiple_choice: 'Trắc nghiệm',
  fill_blank: 'Điền từ',
  matching: 'Ghép cặp',
  sentence_order: 'Sắp xếp câu',
};

export function AiExerciseStudio({
  words,
  progressMap,
  preselectedWords,
  preselectedLabel,
  onClearPreselection,
  onApplyQuizResults,
}: AiExerciseStudioProps) {
  const [scope, setScope] = useState<ScopeMode>(
    preselectedWords?.length ? 'custom' : 'topic'
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all'>(
    VOCAB_FOLDERS[0].id
  );
  const [selectedDeckId, setSelectedDeckId] = useState<string | 'all'>(
    VOCAB_DECKS[0].id
  );
  const [exerciseType, setExerciseType] = useState<ExerciseType>(
    ExerciseType.MIXED
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(
    DifficultyLevel.BASIC
  );
  const [countPreset, setCountPreset] = useState<
    '10' | '20' | '30' | '40' | '50' | 'custom'
  >('10');
  const [customCountInput, setCustomCountInput] = useState<string>('25');

  const parsedCustomCount = Number.parseInt(customCountInput, 10);
  const isCustomCountValid =
    countPreset !== 'custom' ||
    (Number.isInteger(parsedCustomCount) &&
      parsedCustomCount >= 1 &&
      parsedCustomCount <= 100);
  const questionCount =
    countPreset === 'custom'
      ? isCustomCountValid
        ? parsedCustomCount
        : 0
      : Number(countPreset);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exerciseSet, setExerciseSet] = useState<AiExerciseSet | null>(null);
  const [lastGenerationSource, setLastGenerationSource] = useState<
    'local' | 'ai'
  >('local');
  const [answers, setAnswers] = useState<Record<string, ExerciseUserAnswer>>({});
  const [defaultShowPinyin, setDefaultShowPinyin] = useState<boolean>(true);
  const [pinyinOverrides, setPinyinOverrides] = useState<
    Record<string, boolean>
  >({});
  const [summary, setSummary] = useState<GradedExerciseSummary | null>(null);

  useEffect(() => {
    if (preselectedWords && preselectedWords.length > 0) {
      setScope('custom');
    }
  }, [preselectedWords]);

  const availableDecks = useMemo(
    () => getDecksByFolder(selectedFolderId),
    [selectedFolderId]
  );

  const targetWords = useMemo(() => {
    if (scope === 'custom' && preselectedWords?.length) {
      return preselectedWords.slice(0, 50);
    }
    if (scope === 'topic') {
      if (selectedDeckId !== 'all') {
        return words.filter((w) => w.deckId === selectedDeckId);
      }
      const folderWords =
        selectedFolderId === 'all'
          ? words
          : words.filter((w) => w.folderId === selectedFolderId);
      return folderWords.slice(0, 50);
    }
    if (scope === 'weak') {
      const weak = selectStudyDeck(words, progressMap, {
        mode: 'weak',
        limit: 50,
      });
      return weak.length >= 4
        ? weak
        : selectStudyDeck(words, progressMap, { mode: 'due', limit: 50 });
    }
    return selectStudyDeck(words, progressMap, {
      mode: 'all_random',
      limit: 50,
    });
  }, [
    scope,
    preselectedWords,
    words,
    selectedFolderId,
    selectedDeckId,
    progressMap,
  ]);

  function resetSessionState() {
    setSummary(null);
    setAnswers({});
    setPinyinOverrides({});
    setDefaultShowPinyin(true);
  }

  async function handleGenerate() {
    if (!isCustomCountValid || questionCount < 1) return;
    setLoading(true);
    setError(null);
    resetSessionState();
    setLastGenerationSource('ai');

    try {
      const res = await fetch('/api/exercises/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: targetWords,
          exerciseType,
          difficulty,
          count: questionCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tạo bài tập AI.');
      }
      setExerciseSet(data as AiExerciseSet);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể kết nối tới dịch vụ tạo bài tập AI.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGenerateLocal() {
    if (!isCustomCountValid || questionCount < 1) return;
    setError(null);
    resetSessionState();
    setLastGenerationSource('local');
    const localSet = generateLocalExerciseSet(targetWords, words, {
      exerciseType,
      difficulty,
      count: questionCount,
    });
    setExerciseSet(localSet);
  }

  function setQuestionAnswer(questionId: string, val: ExerciseUserAnswer) {
    if (summary) return;
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  }

  function handleSubmitQuiz() {
    if (!exerciseSet) return;
    const graded = gradeExerciseSet(exerciseSet.questions, answers);
    setSummary(graded);
    if (graded.correctWordIds.length > 0 || graded.wrongWordIds.length > 0) {
      onApplyQuizResults(graded.correctWordIds, graded.wrongWordIds);
    }
  }

  const hasPinyinHints = useMemo(
    () => Boolean(exerciseSet?.questions.some((q) => Boolean(q.pinyinHint))),
    [exerciseSet]
  );

  const answeredCount = useMemo(() => {
    if (!exerciseSet) return 0;
    return exerciseSet.questions.filter((q) => {
      const a = answers[q.id];
      if (!a) return false;
      if (q.kind === 'matching' && typeof a === 'object' && !Array.isArray(a)) {
        return (
          (q.matchingPairs?.length ?? 0) > 0 &&
          q.matchingPairs!.every((p) => Boolean(a[p.id]))
        );
      }
      if (q.kind === 'sentence_order' && Array.isArray(a)) {
        return a.length > 0;
      }
      return typeof a === 'string' && a.trim().length > 0;
    }).length;
  }, [exerciseSet, answers]);

  return (
    <section aria-label="Bài tập AI" className="mx-auto max-w-4xl space-y-5">
      {/* Compact Config Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label
              htmlFor="quiz-scope"
              className="block text-xs font-medium text-slate-600"
            >
              Nguồn từ
            </label>
            <select
              id="quiz-scope"
              value={scope}
              onChange={(e) => {
                const next = e.target.value as ScopeMode;
                if (next !== 'custom') onClearPreselection();
                setScope(next);
              }}
              className="min-h-[42px] sm:min-h-0 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
            >
              {preselectedWords?.length ? (
                <option value="custom">
                  Nhóm đã chọn ({preselectedLabel ?? `${preselectedWords.length} thẻ`})
                </option>
              ) : null}
              <option value="topic">Theo thư mục &amp; bộ thẻ</option>
              <option value="weak">Từ đang ôn / Hay sai</option>
              <option value="random">50 thẻ ngẫu nhiên</option>
            </select>
          </div>

          {scope === 'topic' && (
            <>
              <div className="space-y-1">
                <label
                  htmlFor="quiz-folder"
                  className="block text-xs font-medium text-slate-600"
                >
                  Thư mục
                </label>
                <select
                  id="quiz-folder"
                  aria-label="Chọn thư mục bài tập"
                  value={selectedFolderId}
                  onChange={(e) => {
                    const nextFolder = e.target.value;
                    setSelectedFolderId(nextFolder);
                    const nextDecks = getDecksByFolder(nextFolder);
                    setSelectedDeckId(nextDecks[0]?.id ?? 'all');
                  }}
                  className="min-h-[42px] sm:min-h-0 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
                >
                  <option value="all">Tất cả thư mục (23 bộ thẻ)</option>
                  {VOCAB_FOLDERS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.cardCount} thẻ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="quiz-deck"
                  className="block text-xs font-medium text-slate-600"
                >
                  Bộ thẻ
                </label>
                <select
                  id="quiz-deck"
                  aria-label="Chọn bộ thẻ bài tập"
                  value={selectedDeckId}
                  onChange={(e) => setSelectedDeckId(e.target.value)}
                  className="min-h-[42px] sm:min-h-0 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
                >
                  <option value="all">Tất cả bộ thẻ (50 thẻ đầu)</option>
                  {availableDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {selectedFolderId === 'all' ? `[${d.folderName}] ` : ''}
                      {d.order}. {d.name} ({d.cardCount} thẻ)
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label
              htmlFor="quiz-type"
              className="block text-xs font-medium text-slate-600"
            >
              Dạng bài
            </label>
            <select
              id="quiz-type"
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value as ExerciseType)}
              className="min-h-[42px] sm:min-h-0 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
            >
              <option value={ExerciseType.MIXED}>Tổng hợp (4 dạng)</option>
              <option value={ExerciseType.MULTIPLE_CHOICE}>Trắc nghiệm</option>
              <option value={ExerciseType.FILL_BLANK}>Điền từ vào câu</option>
              <option value={ExerciseType.MATCHING}>Ghép cặp</option>
              <option value={ExerciseType.SENTENCE_ORDER}>Sắp xếp câu</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="quiz-difficulty"
              className="block text-xs font-medium text-slate-600"
            >
              Độ khó
            </label>
            <select
              id="quiz-difficulty"
              aria-label="Độ khó"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="min-h-[42px] sm:min-h-0 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
            >
              <option value={DifficultyLevel.BASIC}>Cơ bản</option>
              <option value={DifficultyLevel.INTERMEDIATE}>Trung bình</option>
              <option value={DifficultyLevel.ADVANCED}>Nâng cao</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="quiz-count"
              className="block text-xs font-medium text-slate-600"
            >
              Số câu
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="quiz-count"
                aria-label="Số lượng câu hỏi"
                value={countPreset}
                onChange={(e) =>
                  setCountPreset(
                    e.target.value as
                      | '10'
                      | '20'
                      | '30'
                      | '40'
                      | '50'
                      | 'custom'
                  )
                }
                className="min-h-[42px] sm:min-h-0 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none truncate"
              >
                <option value="10">10 câu</option>
                <option value="20">20 câu</option>
                <option value="30">30 câu</option>
                <option value="40">40 câu</option>
                <option value="50">50 câu</option>
                <option value="custom">Tự nhập</option>
              </select>

              {countPreset === 'custom' && (
                <input
                  id="quiz-count-custom"
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  aria-label="Nhập số câu tùy chỉnh (1 đến 100)"
                  placeholder="1-100"
                  value={customCountInput}
                  onChange={(e) => setCustomCountInput(e.target.value)}
                  className={`min-h-[42px] sm:min-h-0 w-16 sm:w-20 shrink-0 rounded-lg border px-2 py-2 font-mono text-base sm:text-xs font-medium text-slate-900 tabular-nums focus:outline-none ${
                    isCustomCountValid
                      ? 'border-slate-200 bg-white focus:border-teal-700'
                      : 'border-rose-400 bg-rose-50 focus:border-rose-600'
                  }`}
                />
              )}
            </div>
            {!isCustomCountValid && (
              <p className="text-[11px] font-medium text-rose-700">
                Nhập từ 1 đến 100 câu.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {targetWords.length} từ
            </span>{' '}
            ·{' '}
            {targetWords
              .slice(0, 5)
              .map((w) => w.word)
              .join('、')}
            {targetWords.length > 5 ? '…' : ''}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center w-full sm:w-auto">
            <button
              type="button"
              disabled={
                loading || targetWords.length === 0 || !isCustomCountValid
              }
              onClick={handleGenerateLocal}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <BookCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Luyện tập nhanh</span>
            </button>

            <button
              type="button"
              disabled={
                loading || targetWords.length === 0 || !isCustomCountValid
              }
              onClick={handleGenerate}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? 'Đang tạo...'
                  : exerciseSet
                    ? 'Tạo đề AI mới'
                    : 'Tạo đề AI'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          aria-live="polite"
          className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-2"
        >
          <RefreshCw
            className="mx-auto h-5 w-5 animate-spin text-teal-700"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-slate-800">
            Đang tạo {questionCount} câu hỏi...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
        >
          <div className="flex items-center gap-2.5 text-rose-900">
            <AlertCircle
              className="h-4 w-4 shrink-0 text-rose-700"
              aria-hidden="true"
            />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleGenerateLocal}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 whitespace-nowrap"
            >
              Luyện tập nhanh
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 whitespace-nowrap"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Active Exercise Set */}
      {exerciseSet && !loading && (
        <div className="space-y-4">
          {summary && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
                {summary.correct} / {summary.total} câu đúng (
                {summary.scorePercent}%)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetSessionState}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Làm lại</span>
                </button>
                <button
                  type="button"
                  onClick={
                    lastGenerationSource === 'ai'
                      ? handleGenerate
                      : handleGenerateLocal
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Đề mới</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h1 className="font-display text-lg font-bold text-slate-900">
              {exerciseSet.title}
            </h1>
            <div className="flex items-center gap-3">
              {hasPinyinHints && (
                <button
                  type="button"
                  aria-pressed={defaultShowPinyin}
                  onClick={() => {
                    setDefaultShowPinyin((prev) => !prev);
                    setPinyinOverrides({});
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
                >
                  {defaultShowPinyin ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {defaultShowPinyin ? 'Ẩn Pinyin' : 'Hiện Pinyin'}
                  </span>
                </button>
              )}
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {answeredCount} / {exerciseSet.questions.length}
              </span>
            </div>
          </div>

          <div className="space-y-3.5">
            {exerciseSet.questions.map((q, qIdx) => {
              const userAnswer = answers[q.id];
              const isSummaryDone = summary !== null;
              const isQuestionGraded = isSummaryDone;
              const isQuestionCorrect = isSummaryDone
                ? summary!.results[q.id]
                : false;
              const isPinyinVisible =
                pinyinOverrides[q.id] ?? defaultShowPinyin;

              return (
                <article
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        Câu {qIdx + 1}
                      </span>{' '}
                      · {KIND_LABELS[q.kind]}
                    </span>

                    {isQuestionGraded ? (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isQuestionCorrect
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {isQuestionCorrect ? (
                          <>
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>Đúng</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Sai</span>
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-base font-semibold text-slate-900">
                      {q.promptVi}
                    </p>

                        {q.chinesePrompt && (
                          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3.5 py-2.5">
                            <span className="font-hanzi text-xl font-semibold text-slate-900">
                              {q.chinesePrompt}
                            </span>
                            <button
                              type="button"
                              aria-label={`Nghe câu tiếng Trung câu ${qIdx + 1}`}
                              onClick={() => speakChinese(q.chinesePrompt!)}
                              className="rounded bg-white p-1.5 text-slate-600 hover:text-teal-800"
                            >
                              <Volume2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}

                        {q.pinyinHint && isPinyinVisible && (
                          <p className="font-mono text-xs text-slate-500">
                            {q.pinyinHint}
                          </p>
                        )}
                      </div>

                      {(q.kind === 'multiple_choice' || q.kind === 'fill_blank') &&
                        q.options && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {q.options.map((opt, optIdx) => {
                              const selected = userAnswer === opt;
                              const isOptionCorrect =
                                isSummaryDone && q.correctAnswer === opt;
                              const isOptionWrong =
                                isSummaryDone &&
                                selected &&
                                q.correctAnswer !== opt;

                              return (
                                <button
                                  key={`${q.id}-opt-${optIdx}`}
                                  type="button"
                                  disabled={isSummaryDone}
                                  onClick={() => setQuestionAnswer(q.id, opt)}
                                  className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                                    isOptionCorrect
                                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                                      : isOptionWrong
                                        ? 'border-rose-500 bg-rose-50 text-rose-900'
                                        : selected
                                          ? 'border-teal-700 bg-teal-50 text-teal-950'
                                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{opt}</span>
                                  {isOptionCorrect && (
                                    <CheckCircle2
                                      className="h-4 w-4 shrink-0 text-emerald-700"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {isOptionWrong && (
                                    <XCircle
                                      className="h-4 w-4 shrink-0 text-rose-700"
                                      aria-hidden="true"
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                      {q.kind === 'matching' && q.matchingPairs && (
                        <MatchingQuestionBlock
                          question={q}
                          userMapping={
                            (userAnswer as Record<string, string> | undefined) ??
                            {}
                          }
                          isGraded={isSummaryDone}
                          onChange={(nextMap) =>
                            setQuestionAnswer(q.id, nextMap)
                          }
                        />
                      )}

                      {q.kind === 'sentence_order' && q.orderTokens && (
                        <SentenceOrderBlock
                          question={q}
                          selectedTokens={
                            Array.isArray(userAnswer) ? userAnswer : []
                          }
                          isGraded={isSummaryDone}
                          onChange={(nextTokens) =>
                            setQuestionAnswer(q.id, nextTokens)
                          }
                        />
                      )}

                  {isQuestionGraded && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 space-y-1">
                      {q.correctAnswer && !isQuestionCorrect && (
                        <p className="font-semibold text-emerald-800">
                          Đáp án: {q.correctAnswer}
                        </p>
                      )}
                      {!isQuestionCorrect && q.correctOrder && (
                        <p className="font-semibold text-emerald-800">
                          Thứ tự: {q.correctOrder.join(' ')}
                        </p>
                      )}
                      <p>{q.explanationVi}</p>
                      {q.memoryTipVi && (
                        <p className="text-teal-900">Mẹo: {q.memoryTipVi}</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {!summary && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSubmitQuiz}
                className="min-h-[48px] w-full sm:w-auto sm:min-h-0 rounded-xl sm:rounded-lg bg-slate-900 px-5 py-3 sm:py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 tabular-nums"
              >
                Nộp bài ({answeredCount}/{exerciseSet.questions.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MatchingQuestionBlock({
  question,
  userMapping,
  isGraded,
  onChange,
}: {
  question: AiExerciseQuestion;
  userMapping: Record<string, string>;
  isGraded: boolean;
  onChange: (next: Record<string, string>) => void;
}) {
  const pairs = question.matchingPairs ?? [];
  const rightOptions = useMemo(() => {
    const rights = pairs.map((p) => p.right);
    if (rights.length <= 1) return rights;
    return [...rights.slice(1), rights[0]].sort((a, b) => a.localeCompare(b));
  }, [pairs]);

  return (
    <div className="space-y-2">
      {pairs.map((pair) => {
        const chosen = userMapping[pair.id] ?? '';
        const pairCorrect = isGraded && chosen === pair.right;
        const pairWrong = isGraded && chosen !== pair.right;
        return (
          <div
            key={pair.id}
            className={`grid grid-cols-1 gap-2 rounded-lg border p-2.5 sm:grid-cols-12 sm:items-center ${
              pairCorrect
                ? 'border-emerald-300 bg-emerald-50/50'
                : pairWrong
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div className="sm:col-span-5 font-hanzi text-base font-semibold text-slate-900">
              {pair.left}
            </div>
            <div className="sm:col-span-7 space-y-1">
              <label
                htmlFor={`match-${question.id}-${pair.id}`}
                className="sr-only"
              >
                Chọn nghĩa cho {pair.left}
              </label>
              <select
                id={`match-${question.id}-${pair.id}`}
                disabled={isGraded}
                value={chosen}
                onChange={(e) =>
                  onChange({ ...userMapping, [pair.id]: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-1.5 text-sm text-slate-800 focus:border-teal-700 focus:outline-none disabled:bg-slate-100"
              >
                <option value="">-- Chọn nghĩa --</option>
                {rightOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {pairWrong && (
                <p className="text-xs font-medium text-emerald-800">
                  Đáp án: {pair.right}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SentenceOrderBlock({
  question,
  selectedTokens,
  isGraded,
  onChange,
}: {
  question: AiExerciseQuestion;
  selectedTokens: string[];
  isGraded: boolean;
  onChange: (tokens: string[]) => void;
}) {
  const allTokens = question.orderTokens ?? [];
  const availableTokens = useMemo(() => {
    const usedCounts = new Map<string, number>();
    selectedTokens.forEach((t) =>
      usedCounts.set(t, (usedCounts.get(t) ?? 0) + 1)
    );
    return allTokens.map((token, idx) => {
      const used = usedCounts.get(token) ?? 0;
      if (used > 0) {
        usedCounts.set(token, used - 1);
        return { token, idx, isUsed: true };
      }
      return { token, idx, isUsed: false };
    });
  }, [allTokens, selectedTokens]);

  return (
    <div className="space-y-2.5">
      <div className="min-h-[48px] rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-wrap items-center gap-1.5">
        {selectedTokens.length === 0 ? (
          <span className="text-xs text-slate-400">Chọn từ bên dưới...</span>
        ) : (
          selectedTokens.map((tok, i) => (
            <button
              key={`${tok}-${i}`}
              type="button"
              disabled={isGraded}
              onClick={() =>
                onChange(selectedTokens.filter((_, idx) => idx !== i))
              }
              className="rounded-md border border-teal-700 bg-white px-2.5 py-1 font-hanzi text-base font-semibold text-teal-900 hover:bg-rose-50 disabled:cursor-default"
            >
              {tok}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {availableTokens.map(({ token, idx, isUsed }) => (
            <button
              key={`${token}-${idx}`}
              type="button"
              disabled={isGraded || isUsed}
              onClick={() => onChange([...selectedTokens, token])}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-hanzi text-base font-medium text-slate-900 transition-colors hover:border-teal-700 disabled:opacity-30"
            >
              {token}
            </button>
          ))}
        </div>

        {!isGraded && selectedTokens.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Chọn lại
          </button>
        )}
      </div>
    </div>
  );
}
