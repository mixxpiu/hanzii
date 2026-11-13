import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ProgressMap,
  StudyStreakState,
  VocabOverride,
  VocabOverridesMap,
  WordInsight,
  WordProgress,
} from '../types/vocab';
import {
  mergeInsightMaps,
  mergeOverridesMaps,
  mergeProgressMaps,
  sanitizeVocabOverridePayload,
  sanitizeWordInsightPayload,
  sanitizeWordProgressPayload,
} from '../utils/cloudSync';
import { mergeStreakStates, sanitizeStreakState } from '../utils/streakLogic';

const MAX_BATCH_OPS = 400;

export async function ensureUserWorkspace(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      try {
        await setDoc(userRef, {
          uid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
    } else {
      try {
        await updateDoc(userRef, {
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const profilePath = `users/${user.uid}/private/profile`;
  const profileRef = doc(db, 'users', user.uid, 'private', 'profile');
  const profileFields = {
    displayName: (user.displayName || 'Người học').trim().slice(0, 120),
    email: (user.email || '').trim().slice(0, 200),
    photoURL: (user.photoURL || '').trim().slice(0, 500),
  };

  try {
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      try {
        await setDoc(profileRef, {
          uid: user.uid,
          ...profileFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, profilePath);
      }
    } else {
      try {
        await updateDoc(profileRef, {
          ...profileFields,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, profilePath);
  }
}

function docToWordProgress(data: Record<string, unknown>): WordProgress | null {
  const wordId = Number(data.wordId);
  if (!Number.isInteger(wordId) || wordId < 1) return null;
  return {
    wordId,
    status: data.status as WordProgress['status'],
    easeFactor: Number(data.easeFactor ?? 2.5),
    intervalDays: Number(data.intervalDays ?? 0),
    repetitions: Number(data.repetitions ?? 0),
    correctCount: Number(data.correctCount ?? 0),
    wrongCount: Number(data.wrongCount ?? 0),
    lastReviewedAt:
      typeof data.lastReviewedAt === 'number' ? data.lastReviewedAt : null,
    nextReviewAt:
      typeof data.nextReviewAt === 'number' ? data.nextReviewAt : null,
  };
}

function docToOverride(
  data: Record<string, unknown>
): { wordId: number; override: VocabOverride } | null {
  const wordId = Number(data.wordId);
  if (!Number.isInteger(wordId) || wordId < 1) return null;
  return {
    wordId,
    override: {
      viMeaning: typeof data.viMeaning === 'string' ? data.viMeaning : '',
      posVi: typeof data.posVi === 'string' ? data.posVi : '',
      example: typeof data.example === 'string' ? data.example : '',
      examplePinyin:
        typeof data.examplePinyin === 'string' ? data.examplePinyin : '',
      exampleVi: typeof data.exampleVi === 'string' ? data.exampleVi : '',
    },
  };
}

function docToInsight(data: Record<string, unknown>): WordInsight | null {
  const wordId = Number(data.wordId);
  if (!Number.isInteger(wordId) || wordId < 1) return null;
  return {
    wordId,
    characterBreakdown: Array.isArray(data.characterBreakdown)
      ? (data.characterBreakdown as WordInsight['characterBreakdown'])
      : [],
    examples: Array.isArray(data.examples)
      ? (data.examples as WordInsight['examples'])
      : [],
    usageNoteVi: typeof data.usageNoteVi === 'string' ? data.usageNoteVi : '',
    memoryTipVi: typeof data.memoryTipVi === 'string' ? data.memoryTipVi : '',
  };
}

function docToStreakState(data: Record<string, unknown>): StudyStreakState {
  return sanitizeStreakState({
    studyDates: Array.isArray(data.studyDates)
      ? (data.studyDates as string[])
      : [],
    bestStreak: typeof data.bestStreak === 'number' ? data.bestStreak : 0,
  });
}

export async function syncLocalDataWithCloud(
  uid: string,
  localData: {
    progress: ProgressMap;
    overrides: VocabOverridesMap;
    insights: Record<number, WordInsight>;
    streak: StudyStreakState;
  }
): Promise<{
  progress: ProgressMap;
  overrides: VocabOverridesMap;
  insights: Record<number, WordInsight>;
  streak: StudyStreakState;
}> {
  const progressPath = `users/${uid}/progress`;
  const overridesPath = `users/${uid}/overrides`;
  const insightsPath = `users/${uid}/insights`;
  const streakPath = `users/${uid}/stats/streak`;

  const cloudProgress: ProgressMap = {};
  const cloudOverrides: VocabOverridesMap = {};
  const cloudInsights: Record<number, WordInsight> = {};
  let cloudStreak: StudyStreakState | null = null;

  try {
    const snap = await getDocs(
      query(collection(db, progressPath), where('ownerId', '==', uid))
    );
    snap.forEach((d) => {
      const parsed = docToWordProgress(d.data());
      if (parsed) cloudProgress[parsed.wordId] = parsed;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, progressPath);
  }

  try {
    const snap = await getDocs(
      query(collection(db, overridesPath), where('ownerId', '==', uid))
    );
    snap.forEach((d) => {
      const parsed = docToOverride(d.data());
      if (parsed) cloudOverrides[parsed.wordId] = parsed.override;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, overridesPath);
  }

  try {
    const snap = await getDocs(
      query(collection(db, insightsPath), where('ownerId', '==', uid))
    );
    snap.forEach((d) => {
      const parsed = docToInsight(d.data());
      if (parsed) cloudInsights[parsed.wordId] = parsed;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, insightsPath);
  }

  try {
    const streakSnap = await getDoc(doc(db, streakPath));
    if (streakSnap.exists()) {
      cloudStreak = docToStreakState(streakSnap.data());
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, streakPath);
  }

  const mergedProgress = mergeProgressMaps(localData.progress, cloudProgress);
  const mergedOverrides = mergeOverridesMaps(localData.overrides, cloudOverrides);
  const mergedInsights = mergeInsightMaps(localData.insights, cloudInsights);
  const mergedStreak = mergeStreakStates(localData.streak, cloudStreak);

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const item of mergedProgress.toUpload) {
    const payload = sanitizeWordProgressPayload(uid, item);
    const ref = doc(db, progressPath, String(payload.wordId));
    ops.push((batch) =>
      batch.set(ref, { ...payload, updatedAt: serverTimestamp() })
    );
  }

  for (const item of mergedOverrides.toUpload) {
    const payload = sanitizeVocabOverridePayload(uid, item.wordId, item.override);
    const ref = doc(db, overridesPath, String(payload.wordId));
    ops.push((batch) =>
      batch.set(ref, { ...payload, updatedAt: serverTimestamp() })
    );
  }

  for (const item of mergedInsights.toUpload) {
    const payload = sanitizeWordInsightPayload(uid, item);
    const ref = doc(db, insightsPath, String(payload.wordId));
    ops.push((batch) =>
      batch.set(ref, { ...payload, updatedAt: serverTimestamp() })
    );
  }

  if (mergedStreak.shouldUpload) {
    const cleanStreak = sanitizeStreakState(mergedStreak.merged);
    const ref = doc(db, streakPath);
    ops.push((batch) =>
      batch.set(ref, {
        ownerId: uid,
        studyDates: cleanStreak.studyDates,
        bestStreak: cleanStreak.bestStreak,
        updatedAt: serverTimestamp(),
      })
    );
  }

  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const chunk = ops.slice(i, i + MAX_BATCH_OPS);
    const batch = writeBatch(db);
    chunk.forEach((apply) => apply(batch));
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  }

  return {
    progress: mergedProgress.merged,
    overrides: mergedOverrides.merged,
    insights: mergedInsights.merged,
    streak: mergedStreak.merged,
  };
}

export function subscribeUserCloudData(
  uid: string,
  callbacks: {
    onProgress: (map: ProgressMap) => void;
    onOverrides: (map: VocabOverridesMap) => void;
    onInsights: (map: Record<number, WordInsight>) => void;
    onStreak: (streak: StudyStreakState) => void;
    onError: (err: unknown) => void;
  }
): Unsubscribe {
  const progressPath = `users/${uid}/progress`;
  const overridesPath = `users/${uid}/overrides`;
  const insightsPath = `users/${uid}/insights`;
  const streakPath = `users/${uid}/stats/streak`;

  const unsubProgress = onSnapshot(
    query(collection(db, progressPath), where('ownerId', '==', uid)),
    (snap) => {
      const next: ProgressMap = {};
      snap.forEach((d) => {
        const parsed = docToWordProgress(d.data());
        if (parsed) next[parsed.wordId] = parsed;
      });
      callbacks.onProgress(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, progressPath);
      } catch (err) {
        callbacks.onError(err);
      }
    }
  );

  const unsubOverrides = onSnapshot(
    query(collection(db, overridesPath), where('ownerId', '==', uid)),
    (snap) => {
      const next: VocabOverridesMap = {};
      snap.forEach((d) => {
        const parsed = docToOverride(d.data());
        if (parsed) next[parsed.wordId] = parsed.override;
      });
      callbacks.onOverrides(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, overridesPath);
      } catch (err) {
        callbacks.onError(err);
      }
    }
  );

  const unsubInsights = onSnapshot(
    query(collection(db, insightsPath), where('ownerId', '==', uid)),
    (snap) => {
      const next: Record<number, WordInsight> = {};
      snap.forEach((d) => {
        const parsed = docToInsight(d.data());
        if (parsed) next[parsed.wordId] = parsed;
      });
      callbacks.onInsights(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, insightsPath);
      } catch (err) {
        callbacks.onError(err);
      }
    }
  );

  const unsubStreak = onSnapshot(
    doc(db, streakPath),
    (snap) => {
      if (snap.exists()) {
        callbacks.onStreak(docToStreakState(snap.data()));
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, streakPath);
      } catch (err) {
        callbacks.onError(err);
      }
    }
  );

  return () => {
    unsubProgress();
    unsubOverrides();
    unsubInsights();
    unsubStreak();
  };
}

export async function upsertWordProgressCloud(
  uid: string,
  progress: WordProgress
): Promise<void> {
  const payload = sanitizeWordProgressPayload(uid, progress);
  const path = `users/${uid}/progress/${payload.wordId}`;
  try {
    await setDoc(doc(db, path), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertWordProgressBatchCloud(
  uid: string,
  items: WordProgress[]
): Promise<void> {
  if (items.length === 0) return;
  const basePath = `users/${uid}/progress`;
  for (let i = 0; i < items.length; i += MAX_BATCH_OPS) {
    const chunk = items.slice(i, i + MAX_BATCH_OPS);
    const batch = writeBatch(db);
    for (const item of chunk) {
      const payload = sanitizeWordProgressPayload(uid, item);
      batch.set(doc(db, basePath, String(payload.wordId)), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, basePath);
    }
  }
}

export async function clearAllProgressCloud(uid: string): Promise<void> {
  const basePath = `users/${uid}/progress`;
  let snap;
  try {
    snap = await getDocs(
      query(collection(db, basePath), where('ownerId', '==', uid))
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, basePath);
  }

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += MAX_BATCH_OPS) {
    const chunk = docs.slice(i, i + MAX_BATCH_OPS);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, basePath);
    }
  }

  const streakPath = `users/${uid}/stats/streak`;
  try {
    await deleteDoc(doc(db, streakPath));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, streakPath);
  }
}

export async function upsertStreakCloud(
  uid: string,
  streak: StudyStreakState
): Promise<void> {
  const clean = sanitizeStreakState(streak);
  const path = `users/${uid}/stats/streak`;
  try {
    await setDoc(doc(db, path), {
      ownerId: uid,
      studyDates: clean.studyDates,
      bestStreak: clean.bestStreak,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertOverrideCloud(
  uid: string,
  wordId: number,
  override: VocabOverride
): Promise<void> {
  const payload = sanitizeVocabOverridePayload(uid, wordId, override);
  const path = `users/${uid}/overrides/${payload.wordId}`;
  try {
    await setDoc(doc(db, path), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteOverrideCloud(
  uid: string,
  wordId: number
): Promise<void> {
  const path = `users/${uid}/overrides/${wordId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertInsightCloud(
  uid: string,
  insight: WordInsight
): Promise<void> {
  const payload = sanitizeWordInsightPayload(uid, insight);
  const path = `users/${uid}/insights/${payload.wordId}`;
  try {
    await setDoc(doc(db, path), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
