import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

interface VocabInput {
  id: number;
  word: string;
  pinyin: string;
  posVi: string;
  viMeaning: string;
  example?: string;
  exampleVi?: string;
  topic?: string;
  folderName?: string;
}

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-3.5-flash-lite';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('ETIMEDOUT');
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function mapAiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === 'MISSING_API_KEY') {
    return {
      status: 500,
      message:
        'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Khóa GEMINI_API_KEY không hợp lệ hoặc chưa đủ quyền. Vui lòng kiểm tra Settings > Secrets.',
    };
  }
  if (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('429') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('503')
  ) {
    return {
      status: 503,
      message:
        'Hệ thống AI đang quá tải tạm thời. Vui lòng thử lại sau vài giây.',
    };
  }
  return {
    status: 502,
    message:
      'Không thể tạo nội dung AI lúc này. Vui lòng thử lại sau giây lát.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  app.post('/api/exercises/generate', async (req, res) => {
    try {
      const { words, exerciseType, difficulty, count } = req.body as {
        words?: VocabInput[];
        exerciseType?: string;
        difficulty?: string;
        count?: number;
      };

      if (!Array.isArray(words) || words.length === 0) {
        res.status(400).json({
          error: 'Vui lòng chọn ít nhất một từ vựng để tạo bài tập.',
        });
        return;
      }

      const safeCount = Math.min(Math.max(Math.round(Number(count)) || 10, 1), 100);
      const selectedWords = words.slice(0, 50);
      const allowedKinds =
        exerciseType === 'multiple_choice'
          ? ['multiple_choice']
          : exerciseType === 'fill_blank'
            ? ['fill_blank']
            : exerciseType === 'matching'
              ? ['matching']
              : exerciseType === 'sentence_order'
                ? ['sentence_order']
                : [
                    'multiple_choice',
                    'fill_blank',
                    'matching',
                    'sentence_order',
                  ];

      const difficultyDesc =
        difficulty === 'advanced'
          ? 'Nâng cao (câu ghép tự nhiên, kiểm tra ngữ cảnh và phân biệt cách dùng)'
          : difficulty === 'intermediate'
            ? 'Trung bình (câu giao tiếp hoàn chỉnh 6-10 chữ Hán, ít gợi ý Pinyin)'
            : 'Cơ bản (câu ngắn 3-7 chữ Hán rõ ràng, dễ hiểu)';

      const ai = getAiClient();

      const numBatches = Math.max(1, Math.ceil(safeCount / 15));
      const baseBatchSize = Math.floor(safeCount / numBatches);
      const remainder = safeCount % numBatches;
      const batchCounts = Array.from({ length: numBatches }, (_, idx) =>
        baseBatchSize + (idx < remainder ? 1 : 0)
      );

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Tiêu đề bộ bài tập ngắn gọn bằng tiếng Việt.',
          },
          subtitle: {
            type: Type.STRING,
            description: 'Mô tả ngắn về trọng tâm bài tập.',
          },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: {
                  type: Type.STRING,
                  enum: allowedKinds,
                  description:
                    'One of: multiple_choice, fill_blank, matching, sentence_order',
                },
                targetWordIds: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                promptVi: { type: Type.STRING },
                chinesePrompt: { type: Type.STRING },
                pinyinHint: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Bắt buộc cho multiple_choice và fill_blank: đúng 4 lựa chọn khác nhau (bằng chữ Hán nếu là fill_blank).',
                },
                correctAnswer: {
                  type: Type.STRING,
                  description:
                    'Bắt buộc cho multiple_choice và fill_blank (khớp 1 phần tử trong options).',
                },
                matchingPairs: {
                  type: Type.ARRAY,
                  description:
                    'Bắt buộc cho matching: 4 cặp từ tiếng Trung và nghĩa tiếng Việt.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      left: { type: Type.STRING },
                      right: { type: Type.STRING },
                    },
                    required: ['id', 'left', 'right'],
                  },
                },
                orderTokens: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Bắt buộc cho sentence_order: các mảnh từ bị xáo trộn để người học sắp xếp.',
                },
                correctOrder: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Bắt buộc cho sentence_order: các mảnh từ trong orderTokens đã sắp xếp đúng thứ tự ngữ pháp.',
                },
                explanationVi: { type: Type.STRING },
                memoryTipVi: { type: Type.STRING },
              },
              required: [
                'id',
                'kind',
                'targetWordIds',
                'promptVi',
                'explanationVi',
                'memoryTipVi',
              ],
            },
          },
        },
        required: ['title', 'subtitle', 'questions'],
      };

      const batchResults = await Promise.allSettled(
        batchCounts.map(async (batchCount, batchIdx) => {
          const offset =
            selectedWords.length > 0
              ? (batchIdx * Math.max(1, Math.floor(selectedWords.length / numBatches))) %
                selectedWords.length
              : 0;
          const rotatedWords = [
            ...selectedWords.slice(offset),
            ...selectedWords.slice(0, offset),
          ].slice(0, 20);

          const vocabSummary = rotatedWords
            .map(
              (w) =>
                `#${w.id}: ${w.word} [${w.pinyin}] | ${w.viMeaning} | ${w.posVi}${w.example ? ` | VD: ${w.example}${w.exampleVi ? ` (${w.exampleVi})` : ''}` : ''}`
            )
            .join('\n');

          const prompt = `Tạo ĐÚNG ${batchCount} câu hỏi bài tập tiếng Trung cho người Việt từ danh sách từ vựng sau. KHÔNG dùng âm Hán-Việt.

Độ khó: ${difficultyDesc}
Chỉ dùng "kind" trong: ${allowedKinds.join(', ')}

Từ vựng:
${vocabSummary}

Yêu cầu từng dạng:
- multiple_choice: hỏi nghĩa tiếng Việt (chinesePrompt là từ Hán, options là 4 nghĩa Việt) HOẶC chọn từ Hán theo nghĩa/ngữ cảnh (KHÔNG điền chinesePrompt hay pinyinHint trùng đáp án), correctAnswer khớp 100% một phần tử trong options.
- fill_blank: promptVi, chinesePrompt (câu tiếng Trung chứa đúng 1 chỗ trống "___"), pinyinHint (nghĩa tiếng Việt câu), options (4 từ chữ Hán), correctAnswer (khớp 100% một phần tử trong options).
- matching: promptVi, matchingPairs (4 cặp { id: "p1".."p4", left: "Hán tự (Pinyin)", right: "Nghĩa Việt" }).
- sentence_order: promptVi (câu tiếng Việt cần sắp xếp), BẮT BUỘC điền CẢ orderTokens (3-6 mảnh chữ Hán đã xáo trộn) VÀ correctOrder (mảng chính các mảnh đó xếp đúng ngữ pháp).
Mọi câu đều cần: id, kind, targetWordIds (mảng số nguyên), explanationVi (giải thích tiếng Việt ngắn gọn có Pinyin), memoryTipVi (mẹo nhớ ngắn).`;

          const response = await withRetry(() =>
            ai.models.generateContent({
              model: MODEL_NAME,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema,
              },
            })
          );

          const rawText = (response.text ?? '').trim();
          return JSON.parse(rawText) as {
            title?: string;
            subtitle?: string;
            questions?: Array<Record<string, unknown>>;
          };
        })
      );

      const fulfilled = batchResults.filter(
        (r): r is PromiseFulfilledResult<{
          title?: string;
          subtitle?: string;
          questions?: Array<Record<string, unknown>>;
        }> => r.status === 'fulfilled'
      );

      if (fulfilled.length === 0) {
        const firstRejected = batchResults.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected'
        );
        throw firstRejected?.reason ?? new Error('AI request failed');
      }

      const firstTitle = fulfilled[0].value.title;
      const firstSubtitle = fulfilled[0].value.subtitle;
      const rawQuestions = fulfilled.flatMap((r) => r.value.questions || []);

      const normalizedQuestions = rawQuestions
        .map((rawQ, idx) => {
          const kind = String(rawQ.kind || '').trim();
          if (!allowedKinds.includes(kind)) return null;

          const base = {
            ...rawQ,
            kind,
            id: `q-${idx + 1}`,
            targetWordIds: Array.isArray(rawQ.targetWordIds)
              ? rawQ.targetWordIds.map(Number).filter((n) => !Number.isNaN(n))
              : [selectedWords[0].id],
          };

          if (kind === 'multiple_choice' || kind === 'fill_blank') {
            const options = Array.isArray(rawQ.options)
              ? rawQ.options.map((o) => String(o).trim()).filter(Boolean)
              : [];
            let correctAnswer =
              typeof rawQ.correctAnswer === 'string'
                ? rawQ.correctAnswer.trim()
                : '';
            if (options.length < 2 || !correctAnswer) return null;

            const exactMatch = options.find(
              (o) => o.toLowerCase() === correctAnswer.toLowerCase()
            );
            if (exactMatch) {
              correctAnswer = exactMatch;
            } else {
              if (options.length >= 4) {
                options[options.length - 1] = correctAnswer;
              } else {
                options.push(correctAnswer);
              }
            }
            const cleanBase: Record<string, unknown> = { ...base };
            if (
              kind === 'multiple_choice' &&
              typeof cleanBase.chinesePrompt === 'string' &&
              cleanBase.chinesePrompt.trim() === correctAnswer
            ) {
              delete cleanBase.chinesePrompt;
            }
            return { ...cleanBase, options, correctAnswer };
          }

          if (kind === 'matching') {
            const matchingPairs = Array.isArray(rawQ.matchingPairs)
              ? rawQ.matchingPairs
                  .map((p, pIdx) => {
                    const pair = p as Record<string, unknown>;
                    return {
                      id: String(pair?.id || `p${pIdx + 1}`),
                      left: String(pair?.left || '').trim(),
                      right: String(pair?.right || '').trim(),
                    };
                  })
                  .filter((p) => p.left && p.right)
              : [];
            if (matchingPairs.length < 2) return null;
            return { ...base, matchingPairs };
          }

          if (kind === 'sentence_order') {
            const orderTokens = Array.isArray(rawQ.orderTokens)
              ? rawQ.orderTokens.map((t) => String(t).trim()).filter(Boolean)
              : [];
            const correctOrder = Array.isArray(rawQ.correctOrder)
              ? rawQ.correctOrder.map((t) => String(t).trim()).filter(Boolean)
              : [];
            if (orderTokens.length < 2 || correctOrder.length < 2) return null;
            return { ...base, orderTokens, correctOrder };
          }

          return null;
        })
        .filter((q): q is NonNullable<typeof q> => q !== null)
        .slice(0, safeCount);

      if (normalizedQuestions.length === 0) {
        res.status(502).json({
          error: 'AI trả về định dạng bài tập chưa hợp lệ. Vui lòng thử tạo lại.',
        });
        return;
      }

      res.json({
        title: firstTitle || 'Bài tập ôn luyện tiếng Trung',
        subtitle:
          firstSubtitle ||
          `${normalizedQuestions.length} câu hỏi tạo tự động theo danh sách đã chọn`,
        difficulty: difficulty || 'basic',
        generatedAt: Date.now(),
        questions: normalizedQuestions,
      });
    } catch (err) {
      const mapped = mapAiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/exercises/check-meaning', async (req, res) => {
    try {
      const {
        word,
        pinyin,
        expectedMeaning,
        acceptedAnswers,
        userAnswer,
        example,
      } = req.body as {
        word?: string;
        pinyin?: string;
        expectedMeaning?: string;
        acceptedAnswers?: string[];
        userAnswer?: string;
        example?: string;
      };

      if (!expectedMeaning || !userAnswer || !userAnswer.trim()) {
        res.status(400).json({ error: 'Thiếu dữ liệu cần kiểm tra.' });
        return;
      }

      const ai = getAiClient();
      const prompt = `Chấm nghĩa tiếng Việt người học tự nhập cho từ tiếng Trung sau (KHÔNG dùng hay nhắc âm Hán-Việt):
Từ tiếng Trung: ${word || '(không rõ)'}${pinyin ? ` [${pinyin}]` : ''}
Nghĩa chuẩn từ điển: ${expectedMeaning}
${Array.isArray(acceptedAnswers) && acceptedAnswers.length > 0 ? `Nghĩa tham khảo khác: ${acceptedAnswers.join(', ')}\n` : ''}${example ? `Ngữ cảnh / Giải thích: ${example}\n` : ''}Câu trả lời của người học: "${userAnswer.trim()}"

Quy tắc chấm:
- "exact": Đúng chính xác với nghĩa từ điển (kể cả viết hoa/thường hoặc thiếu dấu nhẹ).
- "near": Gần đúng / đồng nghĩa tự nhiên bằng tiếng Việt, diễn đạt tương đương sát nghĩa của từ trong giao tiếp, hoặc sai chính tả rất nhẹ nhưng hiểu đúng nghĩa (ví dụ "vui" ~ "mừng rỡ", "cảm thấy" ~ "thấy rằng", "không có gì" ~ "không có chi"). Trả về isCorrect = true.
- "wrong": Sai nghĩa, trái nghĩa, quá mơ hồ không thể hiện đúng nghĩa từ, hoặc trả lời từ khác. Trả về isCorrect = false.
Viết "feedbackVi" thật ngắn gọn (1 câu tiếng Việt) giải thích vì sao chấp nhận hoặc sửa ngắn gọn.`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isCorrect: { type: Type.BOOLEAN },
                matchLevel: {
                  type: Type.STRING,
                  enum: ['exact', 'near', 'wrong'],
                },
                feedbackVi: { type: Type.STRING },
              },
              required: ['isCorrect', 'matchLevel', 'feedbackVi'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        isCorrect?: boolean;
        matchLevel?: 'exact' | 'near' | 'wrong';
        feedbackVi?: string;
      };

      const matchLevel =
        parsed.matchLevel === 'exact' ||
        parsed.matchLevel === 'near' ||
        parsed.matchLevel === 'wrong'
          ? parsed.matchLevel
          : parsed.isCorrect
            ? 'near'
            : 'wrong';

      res.json({
        isCorrect: matchLevel !== 'wrong',
        matchLevel,
        feedbackVi:
          typeof parsed.feedbackVi === 'string' ? parsed.feedbackVi.trim() : '',
      });
    } catch (err) {
      const mapped = mapAiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/word-insight', async (req, res) => {
    try {
      const { word } = req.body as { word?: VocabInput };
      if (!word || !word.word) {
        res.status(400).json({ error: 'Thiếu thông tin từ vựng.' });
        return;
      }

      const ai = getAiClient();
      const prompt = `Phân tích từ vựng tiếng Trung sau cho người Việt học (KHÔNG dùng hay nhắc tới âm Hán-Việt):
Từ: ${word.word}
Pinyin: ${word.pinyin}
Nghĩa tiếng Việt: ${word.viMeaning}
Loại từ: ${word.posVi}
${word.example ? `Ví dụ hiện có: ${word.example}${word.exampleVi ? ` (${word.exampleVi})` : ''}\n` : ''}
Hãy trả về:
1. characterBreakdown: Phân tích từng chữ Hán trong từ (chữ Hán, nghĩa ngắn bằng tiếng Việt).
2. examples: 2 câu ví dụ giao tiếp mới, tự nhiên, dễ hiểu (chinese, pinyin, vietnamese).
3. usageNoteVi: Ghi chú ngắn về cách dùng hoặc ngữ pháp cần lưu ý.
4. memoryTipVi: Mẹo ghi nhớ nhanh theo hình chữ hoặc ngữ cảnh sử dụng thực tế.`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                characterBreakdown: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      char: { type: Type.STRING },
                      meaningVi: { type: Type.STRING },
                    },
                    required: ['char', 'meaningVi'],
                  },
                },
                examples: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      chinese: { type: Type.STRING },
                      pinyin: { type: Type.STRING },
                      vietnamese: { type: Type.STRING },
                    },
                    required: ['chinese', 'pinyin', 'vietnamese'],
                  },
                },
                usageNoteVi: { type: Type.STRING },
                memoryTipVi: { type: Type.STRING },
              },
              required: [
                'characterBreakdown',
                'examples',
                'usageNoteVi',
                'memoryTipVi',
              ],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        wordId: word.id,
        ...parsed,
      });
    } catch (err) {
      const mapped = mapAiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
