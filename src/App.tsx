import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AiExerciseStudio } from './components/AiExerciseStudio';
import { FlashcardStudio } from './components/FlashcardStudio';
import { ProgressOverview } from './components/ProgressOverview';
import {
  MobileSectionBar,
  TopBar,
  type CloudSyncState,
  type CloudUserInfo,
} from './components/TopBar';
import { TypingPracticeStudio } from './components/TypingPracticeStudio';
import { VocabularyExplorer } from './components/VocabularyExplorer';
import { ALL_VOCAB, VOCAB_DECKS } from './data/vocabCatalog';
import {
  auth,
  getFirestoreUpgradeUrl,
  signInWithGooglePopup,
  signOutFirebase,
  testConnection,
} from './firebase';
import {
  clearAllProgressCloud,
  deleteOverrideCloud,
  ensureUserWorkspace,
  subscribeUserCloudData,
  syncLocalDataWithCloud,
  upsertInsightCloud,
  upsertOverrideCloud,
  upsertStreakCloud,
  upsertWordProgressBatchCloud,
  upsertWordProgressCloud,
} from './services/firestoreSync';
import {
  StudyStatus,
  type AppSection,
  type ProgressMap,
  type StudyStreakState,
  type VocabOverride,
  type VocabOverridesMap,
  type VocabWord,
  type WordInsight,
} from './types/vocab';
import { formatCloudSyncError } from './utils/cloudSync';
import {
  bootstrapStreakFromProgress,
  computeStreakSummary,
  recordStudyDay,
  sanitizeStreakState,
  toLocalDateKey,
} from './utils/streakLogic';
import {
  applyVocabOverrides,
  computeProgressStats,
  computeSrsUpdate,
  getWordProgress,
  type DeckMode,
  type ReviewRating,
} from './utils/studyLogic';

const PROGRESS_STORAGE_KEY = 'hanviet_hsk1_323_progress_v1';
const OVERRIDES_STORAGE_KEY = 'hanviet_hsk1_323_overrides_v1';
const INSIGHTS_STORAGE_KEY = 'hanviet_hsk1_323_insights_v1';
const STREAK_STORAGE_KEY = 'hanviet_hsk1_323_streak_v1';
const LAST_UID_STORAGE_KEY = 'hanviet_hsk1_323_last_uid_v1';

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toCloudUserInfo(user: User | null): CloudUserInfo | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
}

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('explore');
  const [progressMap, setProgressMap] = useState<ProgressMap>(() =>
    loadStoredJson<ProgressMap>(PROGRESS_STORAGE_KEY, {})
  );
  const [overrides, setOverrides] = useState<VocabOverridesMap>(() =>
    loadStoredJson<VocabOverridesMap>(OVERRIDES_STORAGE_KEY, {})
  );
  const [insightCache, setInsightCache] = useState<Record<number, WordInsight>>(
    () => loadStoredJson<Record<number, WordInsight>>(INSIGHTS_STORAGE_KEY, {})
  );
  const [streakState, setStreakState] = useState<StudyStreakState>(() => {
    const stored = loadStoredJson<Partial<StudyStreakState> | null>(
      STREAK_STORAGE_KEY,
      null
    );
    if (stored && (Array.isArray(stored.studyDates) || typeof stored.bestStreak === 'number')) {
      return sanitizeStreakState(stored);
    }
    const existingProgress = loadStoredJson<ProgressMap>(PROGRESS_STORAGE_KEY, {});
    return bootstrapStreakFromProgress(existingProgress);
  });

  const [authReady, setAuthReady] = useState(false);
  const [cloudUser, setCloudUser] = useState<CloudUserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncState>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [quotaUpgradeUrl, setQuotaUpgradeUrl] = useState<string | null>(null);

  const latestLocalRef = useRef({
    progress: progressMap,
    overrides,
    insights: insightCache,
    streak: streakState,
  });
  latestLocalRef.current = {
    progress: progressMap,
    overrides,
    insights: insightCache,
    streak: streakState,
  };

  const [flashcardInit, setFlashcardInit] = useState<{
    mode: DeckMode;
    folderId: string | 'all';
    deckId: string;
    key: number;
  }>({
    mode: 'due',
    folderId: 'all',
    deckId: VOCAB_DECKS[0].id,
    key: 0,
  });

  const [aiPreselection, setAiPreselection] = useState<{
    words: VocabWord[];
    label: string;
  } | null>(null);

  useEffect(() => {
    void testConnection();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PROGRESS_STORAGE_KEY,
        JSON.stringify(progressMap)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [progressMap]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OVERRIDES_STORAGE_KEY,
        JSON.stringify(overrides)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [overrides]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INSIGHTS_STORAGE_KEY,
        JSON.stringify(insightCache)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [insightCache]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STREAK_STORAGE_KEY,
        JSON.stringify(streakState)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [streakState]);

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let isCancelled = false;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      setAuthReady(true);
      const userInfo = toCloudUserInfo(firebaseUser);
      setCloudUser(userInfo);

      if (!firebaseUser) {
        setSyncStatus('local');
        setSyncError(null);
        setQuotaUpgradeUrl(null);
        return;
      }

      const uid = firebaseUser.uid;
      let localSeed = latestLocalRef.current;

      try {
        const previousUid = window.localStorage.getItem(LAST_UID_STORAGE_KEY);
        if (previousUid && previousUid !== uid) {
          localSeed = {
            progress: {},
            overrides: {},
            insights: {},
            streak: { studyDates: [], bestStreak: 0 },
          };
          setProgressMap({});
          setOverrides({});
          setInsightCache({});
          setStreakState({ studyDates: [], bestStreak: 0 });
        }
        window.localStorage.setItem(LAST_UID_STORAGE_KEY, uid);
      } catch {
        // Ignore storage access errors
      }

      setSyncStatus('syncing');
      setSyncError(null);
      setQuotaUpgradeUrl(null);

      void (async () => {
        try {
          await ensureUserWorkspace(firebaseUser);
          if (isCancelled) return;

          const merged = await syncLocalDataWithCloud(uid, localSeed);
          if (isCancelled) return;

          setProgressMap(merged.progress);
          setOverrides(merged.overrides);
          setInsightCache(merged.insights);
          setStreakState(merged.streak);

          unsubFirestore = subscribeUserCloudData(uid, {
            onProgress: (nextProgress) => {
              if (!isCancelled) setProgressMap(nextProgress);
            },
            onOverrides: (nextOverrides) => {
              if (!isCancelled) setOverrides(nextOverrides);
            },
            onInsights: (nextInsights) => {
              if (!isCancelled) setInsightCache(nextInsights);
            },
            onStreak: (nextStreak) => {
              if (!isCancelled) setStreakState(nextStreak);
            },
            onError: (err) => {
              if (isCancelled) return;
              const formatted = formatCloudSyncError(err);
              setSyncStatus('error');
              setSyncError(formatted.message || 'Lỗi đồng bộ Firestore.');
              const raw = err instanceof Error ? err.message : String(err);
              if (raw.includes('Free daily read units per project')) {
                setQuotaUpgradeUrl(getFirestoreUpgradeUrl());
              }
            },
          });

          if (!isCancelled) {
            setSyncStatus('synced');
          }
        } catch (err) {
          if (isCancelled) return;
          const formatted = formatCloudSyncError(err);
          setSyncStatus('error');
          setSyncError(
            formatted.message || 'Không thể kết nối Firestore lúc này.'
          );
          const raw = err instanceof Error ? err.message : String(err);
          if (raw.includes('Free daily read units per project')) {
            setQuotaUpgradeUrl(getFirestoreUpgradeUrl());
          }
        }
      })();
    });

    return () => {
      isCancelled = true;
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  function reportCloudWriteError(err: unknown) {
    const formatted = formatCloudSyncError(err);
    if (!formatted.message) return;
    setSyncStatus('error');
    setSyncError(formatted.message);
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Free daily read units per project')) {
      setQuotaUpgradeUrl(getFirestoreUpgradeUrl());
    }
  }

  async function handleSignIn() {
    setAuthLoading(true);
    setSyncError(null);
    setQuotaUpgradeUrl(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const formatted = formatCloudSyncError(err);
      if (formatted.message) {
        setSyncStatus('error');
        setSyncError(formatted.message);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setSyncError(null);
    setQuotaUpgradeUrl(null);
    try {
      await signOutFirebase();
    } catch (err) {
      reportCloudWriteError(err);
    }
  }

  const effectiveWords = useMemo(
    () => applyVocabOverrides(ALL_VOCAB, overrides),
    [overrides]
  );

  const stats = useMemo(
    () => computeProgressStats(effectiveWords, progressMap),
    [effectiveWords, progressMap]
  );

  const streakSummary = useMemo(
    () => computeStreakSummary(streakState),
    [streakState]
  );

  function recordTodayStudy(now: number) {
    const todayKey = toLocalDateKey(now);
    const currentStreakState = latestLocalRef.current.streak;
    if (currentStreakState.studyDates.includes(todayKey)) {
      return;
    }
    const nextStreak = recordStudyDay(currentStreakState, now);
    setStreakState(nextStreak);
    if (cloudUser) {
      void upsertStreakCloud(cloudUser.uid, nextStreak).catch(
        reportCloudWriteError
      );
    }
  }

  function handleUpdateStatus(wordId: number, status: StudyStatus) {
    const current = getWordProgress(progressMap, wordId);
    const now = Date.now();
    const updated = {
      ...current,
      status,
      lastReviewedAt: now,
      nextReviewAt:
        status === StudyStatus.MASTERED
          ? now + 7 * 24 * 60 * 60 * 1000
          : status === StudyStatus.LEARNING
            ? now + 24 * 60 * 60 * 1000
            : null,
    };

    setProgressMap((prev) => ({
      ...prev,
      [wordId]: updated,
    }));

    if (status !== StudyStatus.NEW) {
      recordTodayStudy(now);
    }

    if (cloudUser) {
      void upsertWordProgressCloud(cloudUser.uid, updated).catch(
        reportCloudWriteError
      );
    }
  }

  function handleRateWord(wordId: number, rating: ReviewRating) {
    const now = Date.now();
    const current = getWordProgress(progressMap, wordId);
    const updated = computeSrsUpdate(current, rating, now);

    setProgressMap((prev) => ({
      ...prev,
      [wordId]: updated,
    }));

    recordTodayStudy(now);

    if (cloudUser) {
      void upsertWordProgressCloud(cloudUser.uid, updated).catch(
        reportCloudWriteError
      );
    }
  }

  function handleApplyQuizResults(correctIds: number[], wrongIds: number[]) {
    const now = Date.now();
    const changedItems: Record<number, ReturnType<typeof computeSrsUpdate>> =
      {};
    const nextSnapshot = { ...progressMap };

    for (const id of correctIds) {
      const cur = getWordProgress(nextSnapshot, id);
      const updated = computeSrsUpdate(cur, 'good', now);
      nextSnapshot[id] = updated;
      changedItems[id] = updated;
    }
    for (const id of wrongIds) {
      const cur = getWordProgress(nextSnapshot, id);
      const updated = computeSrsUpdate(cur, 'again', now);
      nextSnapshot[id] = updated;
      changedItems[id] = updated;
    }

    setProgressMap(nextSnapshot);

    if (correctIds.length > 0 || wrongIds.length > 0) {
      recordTodayStudy(now);
    }

    if (cloudUser) {
      const batchItems = Object.values(changedItems);
      void upsertWordProgressBatchCloud(cloudUser.uid, batchItems).catch(
        reportCloudWriteError
      );
    }
  }

  function handleSaveOverride(wordId: number, override: VocabOverride) {
    setOverrides((prev) => ({
      ...prev,
      [wordId]: override,
    }));

    if (cloudUser) {
      void upsertOverrideCloud(cloudUser.uid, wordId, override).catch(
        reportCloudWriteError
      );
    }
  }

  function handleResetOverride(wordId: number) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[wordId];
      return next;
    });

    if (cloudUser) {
      void deleteOverrideCloud(cloudUser.uid, wordId).catch(
        reportCloudWriteError
      );
    }
  }

  function handleSaveInsight(insight: WordInsight) {
    setInsightCache((prev) => ({
      ...prev,
      [insight.wordId]: insight,
    }));

    if (cloudUser) {
      void upsertInsightCloud(cloudUser.uid, insight).catch(
        reportCloudWriteError
      );
    }
  }

  function handleResetProgress() {
    setProgressMap({});
    setStreakState({ studyDates: [], bestStreak: 0 });
    if (cloudUser) {
      void clearAllProgressCloud(cloudUser.uid).catch(reportCloudWriteError);
    }
  }

  function handleStartAiQuizWithWords(words: VocabWord[], label: string) {
    setAiPreselection({ words, label });
    setActiveSection('ai-quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleStartDeckFlashcards(folderId: string, deckId: string) {
    setFlashcardInit((prev) => ({
      mode: 'topic',
      folderId,
      deckId,
      key: prev.key + 1,
    }));
    setActiveSection('flashcards');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSelectSection(next: AppSection) {
    setActiveSection(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        authReady={authReady}
        user={cloudUser}
        syncStatus={syncStatus}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-3.5 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-5 md:pb-8 lg:px-8">
        {activeSection === 'explore' && (
          <VocabularyExplorer
            words={effectiveWords}
            progressMap={progressMap}
            overrides={overrides}
            insightCache={insightCache}
            onSaveInsight={handleSaveInsight}
            onUpdateStatus={handleUpdateStatus}
            onSaveOverride={handleSaveOverride}
            onResetOverride={handleResetOverride}
            onStartAiQuizWithWords={handleStartAiQuizWithWords}
            onStartDeckFlashcards={handleStartDeckFlashcards}
          />
        )}

        {activeSection === 'flashcards' && (
          <FlashcardStudio
            key={flashcardInit.key}
            words={effectiveWords}
            progressMap={progressMap}
            initialMode={flashcardInit.mode}
            initialFolderId={flashcardInit.folderId}
            initialDeckId={flashcardInit.deckId}
            onRateWord={handleRateWord}
            onStartAiQuizWithWords={handleStartAiQuizWithWords}
          />
        )}

        {activeSection === 'typing' && (
          <TypingPracticeStudio
            words={effectiveWords}
            progressMap={progressMap}
            onRateWord={handleRateWord}
          />
        )}

        {activeSection === 'ai-quiz' && (
          <AiExerciseStudio
            words={effectiveWords}
            progressMap={progressMap}
            preselectedWords={aiPreselection?.words ?? null}
            preselectedLabel={aiPreselection?.label ?? null}
            onClearPreselection={() => setAiPreselection(null)}
            onApplyQuizResults={handleApplyQuizResults}
          />
        )}

        {activeSection === 'progress' && (
          <ProgressOverview
            words={effectiveWords}
            progressMap={progressMap}
            stats={stats}
            streak={streakSummary}
            onStartDeckFlashcards={handleStartDeckFlashcards}
            onStartAiQuizWithWords={handleStartAiQuizWithWords}
            onResetProgress={handleResetProgress}
            authReady={authReady}
            user={cloudUser}
            syncStatus={syncStatus}
            syncError={syncError}
            quotaUpgradeUrl={quotaUpgradeUrl}
            authLoading={authLoading}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      <MobileSectionBar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
      />
    </div>
  );
}
