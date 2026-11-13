import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Flame,
  FolderOpen,
  Loader2,
  LogOut,
  RotateCcw,
  Trophy,
  Volume2,
  Wand2,
} from 'lucide-react';
import { DECK_BY_ID, VOCAB_FOLDERS } from '../data/vocabCatalog';
import { StudyStatus, type ProgressMap, type VocabWord } from '../types/vocab';
import { speakChinese } from '../utils/speech';
import { type StreakSummary } from '../utils/streakLogic';
import { getWordProgress, type ProgressStats } from '../utils/studyLogic';
import type { CloudSyncState, CloudUserInfo } from './TopBar';

interface ProgressOverviewProps {
  words: VocabWord[];
  progressMap: ProgressMap;
  stats: ProgressStats;
  streak: StreakSummary;
  onStartDeckFlashcards: (folderId: string, deckId: string) => void;
  onStartAiQuizWithWords: (words: VocabWord[], label: string) => void;
  onResetProgress: () => void;
  authReady: boolean;
  user: CloudUserInfo | null;
  syncStatus: CloudSyncState;
  syncError: string | null;
  quotaUpgradeUrl: string | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function ProgressOverview({
  words,
  progressMap,
  stats,
  streak,
  onStartDeckFlashcards,
  onStartAiQuizWithWords,
  onResetProgress,
  authReady,
  user,
  syncStatus,
  syncError,
  quotaUpgradeUrl,
  authLoading,
  onSignIn,
  onSignOut,
}: ProgressOverviewProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  const weakWords = useMemo(() => {
    return words
      .filter((w) => {
        const p = getWordProgress(progressMap, w.id);
        return p.wrongCount > 0 || p.status === StudyStatus.LEARNING;
      })
      .sort((a, b) => {
        const pa = getWordProgress(progressMap, a.id);
        const pb = getWordProgress(progressMap, b.id);
        return pb.wrongCount - pa.wrongCount || pa.easeFactor - pb.easeFactor;
      })
      .slice(0, 12);
  }, [words, progressMap]);

  const masteredPercent = Math.round(
    (stats.masteredCount / Math.max(1, stats.total)) * 100
  );

  return (
    <section aria-label="Tiến độ học tập" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
            Tiến độ
          </h1>
          <span className="font-mono text-xs font-semibold text-teal-800 tabular-nums">
            {stats.masteredCount} / {stats.total} thuộc ({masteredPercent}%)
          </span>
        </div>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Đặt lại</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onResetProgress();
                setConfirmReset(false);
              }}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
            >
              Xác nhận xóa
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
          </div>
        )}
      </div>

      {/* Cloud Sync Card */}
      {authReady && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {user ? (
                syncStatus === 'syncing' ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-teal-700"
                    aria-hidden="true"
                  />
                ) : syncStatus === 'error' ? (
                  <CloudOff
                    className="h-4 w-4 shrink-0 text-rose-600"
                    aria-hidden="true"
                  />
                ) : (
                  <Cloud
                    className="h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                )
              ) : (
                <Cloud
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  {user
                    ? `Đã kết nối: ${user.displayName || user.email}`
                    : 'Đang lưu cục bộ trên trình duyệt'}
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed">
                  {user
                    ? syncStatus === 'syncing'
                      ? 'Đang đồng bộ tiến độ với Firestore...'
                      : syncStatus === 'error'
                        ? 'Tạm không thể đồng bộ Cloud'
                        : `${user.email || 'Cloud Firestore'} · Tự động đồng bộ đa thiết bị`
                    : 'Đăng nhập Google để đồng bộ tiến độ, chỉnh sửa từ và chiết tự AI giữa các thiết bị.'}
                </div>
              </div>
            </div>

            {user ? (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-rose-700 shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Đăng xuất</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={onSignIn}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 shrink-0"
              >
                {authLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Đăng nhập Google</span>
              </button>
            )}
          </div>

          {syncError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
              <p>{syncError}</p>
              {quotaUpgradeUrl && (
                <a
                  href={quotaUpgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold underline"
                >
                  Xem hạn mức Firestore trong Firebase Console
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Study Streak Card */}
      <div
        data-testid="study-streak-card"
        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                streak.currentStreak > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <Flame className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {streak.currentStreak}
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  ngày liên tiếp
                </span>
                {streak.studiedToday ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Đã giữ chuỗi hôm nay
                  </span>
                ) : streak.currentStreak > 0 ? (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Học 1 từ hôm nay để giữ chuỗi
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {streak.studiedToday
                  ? 'Tuyệt vời, duy trì đều đặn mỗi ngày giúp ghi nhớ lâu hơn.'
                  : streak.currentStreak > 0
                    ? 'Chuỗi hôm qua vẫn đang được giữ — ôn thêm một thẻ ngay nhé.'
                    : 'Ôn tập ít nhất 1 thẻ hoặc bài tập hôm nay để bắt đầu chuỗi mới.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Trophy className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              <span>Kỷ lục:</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {streak.bestStreak} ngày
              </span>
            </div>
            <div className="text-slate-600">
              <span>Tổng: </span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {streak.totalStudyDays} ngày
              </span>
            </div>
          </div>
        </div>

        <div
          aria-label="Hoạt động 7 ngày gần nhất"
          className="grid grid-cols-7 gap-1.5 sm:gap-2"
        >
          {streak.last7Days.map((day) => (
            <div
              key={day.dateKey}
              className={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-center transition-colors ${
                day.studied
                  ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                  : day.isToday
                    ? 'border-teal-300 bg-teal-50/40 text-slate-700'
                    : 'border-slate-100 bg-slate-50 text-slate-400'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {day.isToday ? 'Nay' : day.weekdayLabel}
              </span>
              <div
                className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-mono tabular-nums ${
                  day.studied
                    ? 'bg-amber-500 font-bold text-white'
                    : day.isToday
                      ? 'border border-dashed border-teal-500 text-teal-700 font-semibold'
                      : 'text-slate-400'
                }`}
              >
                {day.studied ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  day.dayNumber
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-500">Thành thạo</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {stats.masteredCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-500">Đang ôn tập</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold text-sky-700 tabular-nums">
            {stats.learningCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-500">Chưa học</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold text-slate-700 tabular-nums">
            {stats.newCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-500">Độ chính xác</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.accuracyPercent}%
          </div>
        </div>
      </div>

      {/* Folder -> Deck Breakdown */}
      <div className="space-y-6">
        {VOCAB_FOLDERS.map((folder) => {
          const folderStat = stats.folderBreakdown.find(
            (f) => f.folderId === folder.id
          );
          const folderDecks = stats.topicBreakdown.filter(
            (d) => d.folderId === folder.id
          );
          const folderMastered = folderStat?.mastered ?? 0;
          const folderTotal = folderStat?.total ?? folder.cardCount;

          return (
            <div key={folder.id} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <FolderOpen
                    className="h-4 w-4 text-teal-700 shrink-0"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {folder.name}
                  </h2>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {folder.deckCount} bộ · {folderTotal} thẻ
                  </span>
                </div>
                <div className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                  {folderMastered} / {folderTotal}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {folderDecks.map((item) => {
                  const deckMeta = DECK_BY_ID[item.deckId];
                  const pct = Math.round((item.mastered / item.total) * 100);
                  const deckWords = words.filter(
                    (w) => w.deckId === item.deckId
                  );
                  return (
                    <div
                      key={item.deckId}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {deckMeta ? `${deckMeta.order}. ` : ''}
                          {item.topic}
                        </div>
                        <div className="shrink-0 font-mono text-xs font-medium text-slate-600 tabular-nums">
                          {item.mastered}/{item.total}
                        </div>
                      </div>

                      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-emerald-600 origin-left transition-transform"
                          style={{
                            transform: `scaleX(${Math.max(0, pct / 100)})`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-label={`Học thẻ ${item.topic}`}
                          onClick={() =>
                            onStartDeckFlashcards(item.folderId, item.deckId)
                          }
                          className="min-h-[38px] sm:min-h-0 flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <BookOpen
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>Học</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Bài tập AI ${item.topic}`}
                          onClick={() =>
                            onStartAiQuizWithWords(
                              deckWords,
                              `${item.topic} (${item.total} thẻ)`
                            )
                          }
                          className="min-h-[38px] sm:min-h-0 flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-md bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>AI</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weakest Words */}
      {weakWords.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-slate-900">
              Đang ôn &amp; cần chú ý ({weakWords.length})
            </h2>
            <button
              type="button"
              onClick={() =>
                onStartAiQuizWithWords(
                  weakWords,
                  `Nhóm ${weakWords.length} từ cần củng cố`
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ôn bằng AI</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {weakWords.map((w) => {
              const p = getWordProgress(progressMap, w.id);
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-hanzi text-lg font-bold text-slate-900">
                        {w.word}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {w.pinyin}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-700">
                      {w.viMeaning}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                      Đúng {p.correctCount} · Sai {p.wrongCount}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Phát âm ${w.word}`}
                    onClick={() => speakChinese(w.word)}
                    className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-teal-700 hover:text-teal-800"
                  >
                    <Volume2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
