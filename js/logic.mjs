export const PROGRESS_FORMAT = "pet-english-guide-progress";
export const PROGRESS_VERSION = 1;
export const STORAGE_KEY = "pet-english-guide-progress-v1";
export const RESET_PHRASE = "清除进度";
export const MAX_IMPORT_CHARS = 1_000_000;
export const MAX_ATTEMPTS = 500;

export function emptyStarter() {
  return { completedIds: [], cursor: null, vocab: {}, badges: [] };
}

export function emptyProgress() {
  return {
    completedLessonIds: [],
    lastLessonId: null,
    lastStop: null,
    drafts: {},
    attempts: [],
    starter: emptyStarter(),
  };
}

export function countWords(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function normaliseText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function quizSections(quiz) {
  return Array.isArray(quiz?.sections) ? quiz.sections : [];
}

export function flattenQuestions(quiz) {
  const questions = [];
  for (const section of quizSections(quiz)) {
    for (const question of section.questions || []) {
      questions.push(question);
    }
  }
  return questions;
}

export function listeningCredit(kind, mode, listened) {
  return kind === "listening-tts" && mode === "tts" && listened === true;
}

function optionText(question, id) {
  const option = (question.options || []).find((item) => item.id === id);
  return option ? `${option.id}. ${option.text}` : String(id ?? "");
}

export function scoreQuestion(question, response) {
  if (question.type === "single") {
    const correct = response === question.answer;
    return {
      correct,
      responseLabel: response ? optionText(question, response) : "（未作答）",
      expectedLabel: optionText(question, question.answer),
    };
  }
  if (question.type === "text") {
    const given = normaliseText(response);
    const accept = (question.accept || []).map(normaliseText).filter(Boolean);
    const correct = given.length > 0 && accept.includes(given);
    return {
      correct,
      responseLabel: given ? String(response).trim() : "（未作答）",
      expectedLabel: (question.accept || []).join(" / "),
    };
  }
  throw new Error(`未知题型：${question.type}`);
}

export function scoreQuiz(quiz, responses, meta = {}) {
  const details = flattenQuestions(quiz).map((question) => {
    const result = scoreQuestion(question, responses[question.id]);
    return {
      id: question.id,
      prompt: question.prompt,
      response: responses[question.id] ?? "",
      responseLabel: result.responseLabel,
      correct: result.correct,
      expectedLabel: result.expectedLabel,
      explanation: question.explanation,
    };
  });
  const total = details.length;
  const score = details.filter((item) => item.correct).length;
  const mode = meta.mode || "standard";
  return {
    quizId: quiz.id,
    lessonId: meta.lessonId || null,
    title: quiz.title,
    unofficial: true,
    kind: quiz.kind || "standard",
    mode,
    countsAsListening: listeningCredit(quiz.kind, mode, meta.listened),
    score,
    total,
    details,
  };
}

export function blankQuestionIds(quiz, responses) {
  return flattenQuestions(quiz)
    .filter((question) => normaliseText(responses[question.id]) === "")
    .map((question) => question.id);
}

export function lessonStatus(progress, lessonId) {
  if (progress.completedLessonIds.includes(lessonId)) return "complete";
  if (progress.lastLessonId === lessonId) return "current";
  return "new";
}

export function markLessonComplete(progress, lessonId, complete = true) {
  const completed = new Set(progress.completedLessonIds);
  if (complete) completed.add(lessonId);
  else completed.delete(lessonId);
  return {
    ...progress,
    completedLessonIds: [...completed],
    lastLessonId: lessonId,
  };
}

export function touchLesson(progress, lessonId) {
  return { ...progress, lastLessonId: lessonId };
}

export function addAttempt(progress, attempt) {
  return {
    ...progress,
    lastLessonId: attempt.lessonId || progress.lastLessonId,
    attempts: [...progress.attempts, attempt],
  };
}

export function saveDraft(progress, taskId, text) {
  return {
    ...progress,
    drafts: { ...(progress.drafts || {}), [taskId]: String(text ?? "").slice(0, 8000) },
    lastStop: { kind: "task", id: taskId },
  };
}

export function rememberStop(progress, stop) {
  return { ...progress, lastStop: stop };
}

export function wrongItems(progress) {
  const items = [];
  for (const attempt of progress.attempts) {
    if (attempt.selfAssessed) continue;
    for (const detail of attempt.details) {
      if (!detail.correct) {
        items.push({
          attemptId: attempt.id,
          quizId: attempt.quizId,
          quizTitle: attempt.title,
          finishedAt: attempt.finishedAt,
          mode: attempt.mode,
          countsAsListening: attempt.countsAsListening,
          ...detail,
        });
      }
    }
  }
  return items;
}

export function buildExport(progress, now = new Date()) {
  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    exportedAt: now.toISOString(),
    note: "进度只保存在导出它的那一台设备的浏览器里。此文件不会自动同步到其他设备或账号。",
    data: {
      completedLessonIds: [...progress.completedLessonIds],
      lastLessonId: progress.lastLessonId,
      lastStop: progress.lastStop ?? null,
      drafts: progress.drafts || {},
      attempts: progress.attempts,
      starter: progress.starter || emptyStarter(),
    },
  };
}

export function resetConfirmed(phrase) {
  return phrase === RESET_PHRASE;
}

function fail(error) {
  return { ok: false, error };
}

function validateAttempt(attempt, quizIds) {
  if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) {
    return fail("练习记录格式不正确。");
  }
  for (const key of ["id", "quizId", "finishedAt", "score", "total", "details"]) {
    if (attempt[key] == null || attempt[key] === "") return fail(`练习记录缺少 ${key}。`);
  }
  if (typeof attempt.id !== "string" || attempt.id.length > 80) return fail("练习记录编号无效。");
  if (typeof attempt.quizId !== "string" || !quizIds.has(attempt.quizId)) {
    return fail(`未知练习：${attempt.quizId}`);
  }
  if (typeof attempt.finishedAt !== "string" || Number.isNaN(Date.parse(attempt.finishedAt))) {
    return fail("练习时间无效。");
  }
  if (typeof attempt.score !== "number" || typeof attempt.total !== "number") {
    return fail("分数必须是数字。");
  }
  if (!Array.isArray(attempt.details) || attempt.details.length > 200) {
    return fail("练习明细无效。");
  }
  const details = [];
  for (const detail of attempt.details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return fail("题目明细无效。");
    if (typeof detail.id !== "string" || detail.id.length > 80) return fail("题目编号无效。");
    details.push({
      id: detail.id,
      prompt: typeof detail.prompt === "string" ? detail.prompt.slice(0, 2000) : "",
      response: detail.response == null ? "" : String(detail.response).slice(0, 500),
      responseLabel: typeof detail.responseLabel === "string" ? detail.responseLabel.slice(0, 500) : "",
      correct: detail.correct === true,
      expectedLabel: typeof detail.expectedLabel === "string" ? detail.expectedLabel.slice(0, 1000) : "",
      explanation: typeof detail.explanation === "string" ? detail.explanation.slice(0, 4000) : "",
    });
  }
  const correctCount = details.filter((detail) => detail.correct).length;
  if (attempt.total !== details.length || attempt.score !== correctCount) {
    return fail("分数与作答明细不一致。");
  }
  const modes = new Set(["standard", "tts", "transcript-support"]);
  const mode = modes.has(attempt.mode) ? attempt.mode : "standard";
  return {
    ok: true,
    attempt: {
      id: attempt.id,
      quizId: attempt.quizId,
      lessonId: typeof attempt.lessonId === "string" ? attempt.lessonId : null,
      title: typeof attempt.title === "string" ? attempt.title.slice(0, 200) : "",
      finishedAt: attempt.finishedAt,
      unofficial: true,
      kind: typeof attempt.kind === "string" ? attempt.kind.slice(0, 40) : "standard",
      mode,
      countsAsListening: attempt.countsAsListening === true && mode === "tts",
      selfAssessed: attempt.selfAssessed === true,
      responseText: typeof attempt.responseText === "string" ? attempt.responseText.slice(0, 8000) : "",
      score: attempt.score,
      total: attempt.total,
      details,
    },
  };
}

function validateDrafts(drafts, taskIds) {
  if (drafts == null) return { ok: true, drafts: {} };
  if (typeof drafts !== "object" || Array.isArray(drafts)) return fail("drafts 必须是对象。");
  const keys = Object.keys(drafts);
  if (keys.length > 40) return fail("草稿过多。");
  const clean = {};
  for (const key of keys) {
    if (typeof key !== "string" || !taskIds.has(key)) return fail(`未知草稿：${key}`);
    if (typeof drafts[key] !== "string") return fail("草稿必须是文字。");
    clean[key] = drafts[key].slice(0, 8000);
  }
  return { ok: true, drafts: clean };
}

function validateLastStop(stop, lessonIds, quizIds) {
  if (stop == null) return { ok: true, lastStop: null };
  if (typeof stop !== "object" || Array.isArray(stop)) return fail("lastStop 无效。");
  const kinds = ["lesson", "quiz", "task", "starter"];
  if (!kinds.includes(stop.kind) || typeof stop.id !== "string") return fail("lastStop 无效。");
  if (stop.kind === "lesson" && !lessonIds.has(stop.id)) return fail("lastStop 课程无效。");
  if (stop.kind === "starter" && !/^s\d{2}$/.test(stop.id)) return fail("lastStop 练习无效。");
  if (stop.kind !== "lesson" && stop.kind !== "starter" && !quizIds.has(stop.id)) return fail("lastStop 练习无效。");
  return { ok: true, lastStop: { kind: stop.kind, id: stop.id } };
}

function validateStarter(starter) {
  if (starter == null) return { ok: true, starter: emptyStarter() };
  if (typeof starter !== "object" || Array.isArray(starter)) return fail("starter 进度无效。");
  if (starter.completedIds != null && !Array.isArray(starter.completedIds)) return fail("starter.completedIds 无效。");
  const completedIds = [];
  for (const id of starter.completedIds || []) {
    if (typeof id !== "string" || !/^s\d{2}$/.test(id)) return fail(`未知零基础课：${String(id)}`);
    completedIds.push(id);
  }
  let cursor = null;
  if (starter.cursor != null) {
    const cursorOk = starter.cursor && typeof starter.cursor === "object" && /^s\d{2}$/.test(starter.cursor.lessonId) && ["teach", "activity", "summary"].includes(starter.cursor.phase) && Number.isInteger(starter.cursor.index);
    if (!cursorOk) return fail("starter.cursor 无效。");
    const results = Array.isArray(starter.cursor.results) ? starter.cursor.results.slice(0, 40).filter((item) => item && typeof item.id === "string").map((item) => ({
      id: item.id.slice(0, 40),
      objective: item.objective === true,
      correct: item.correct === true,
      countsAsListening: item.countsAsListening === true,
      selfAssessed: item.selfAssessed === true,
    })) : [];
    cursor = { lessonId: starter.cursor.lessonId, phase: starter.cursor.phase, index: starter.cursor.index, results };
  }
  const vocab = {};
  const entries = Object.entries(starter.vocab || {});
  if (entries.length > 300) return fail("词汇复习记录过多。");
  for (const [key, card] of entries) {
    if (!card || typeof card !== "object") return fail("词汇卡片无效。");
    if (typeof card.en !== "string" || typeof card.zh !== "string") return fail("词汇卡片无效。");
    vocab[String(key).slice(0, 80)] = {
      en: card.en.slice(0, 80),
      zh: card.zh.slice(0, 80),
      stage: Math.max(0, Math.min(4, Number(card.stage) || 0)),
      dueAt: Number(card.dueAt) || 0,
      correct: Math.max(0, Number(card.correct) || 0),
      wrong: Math.max(0, Number(card.wrong) || 0),
    };
  }
  const badges = Array.isArray(starter.badges) ? starter.badges.filter((id) => typeof id === "string" && /^s\d{2}/.test(id)).slice(0, 40) : [];
  return { ok: true, starter: { completedIds: [...new Set(completedIds)], cursor, vocab, badges } };
}

export function validateImport(raw, knownLessonIds, knownQuizIds, knownTaskIds) {
  if (typeof raw !== "string") return fail("导入内容必须是文本。");
  if (raw.length === 0) return fail("文件是空的。");
  if (raw.length > MAX_IMPORT_CHARS) return fail("文件过大，已拒绝导入。");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("这不是有效的 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("进度文件的最外层必须是对象。");
  }
  if (parsed.format !== PROGRESS_FORMAT) return fail("这不是本学习站的进度文件。");
  if (parsed.version !== PROGRESS_VERSION) {
    return fail(`不支持的进度版本：${String(parsed.version)}。本学习站只读取版本 ${PROGRESS_VERSION}。`);
  }
  const data = parsed.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("缺少 data 对象。");
  if (!Array.isArray(data.completedLessonIds)) return fail("completedLessonIds 必须是数组。");
  const lessonIds = new Set(knownLessonIds);
  for (const id of data.completedLessonIds) {
    if (typeof id !== "string" || !lessonIds.has(id)) return fail(`未知课程：${String(id)}`);
  }
  if (data.lastLessonId != null && (typeof data.lastLessonId !== "string" || !lessonIds.has(data.lastLessonId))) {
    return fail("lastLessonId 无效。");
  }
  if (!Array.isArray(data.attempts)) return fail("attempts 必须是数组。");
  if (data.attempts.length > MAX_ATTEMPTS) return fail("练习记录过多，已拒绝导入。");
  const quizIds = new Set(knownQuizIds);
  const taskIds = new Set(knownTaskIds || knownQuizIds);
  const draftResult = validateDrafts(data.drafts, taskIds);
  if (!draftResult.ok) return draftResult;
  const stopResult = validateLastStop(data.lastStop, lessonIds, quizIds);
  if (!stopResult.ok) return stopResult;
  const starterResult = validateStarter(data.starter);
  if (!starterResult.ok) return starterResult;
  const attempts = [];
  for (const attempt of data.attempts) {
    const checked = validateAttempt(attempt, quizIds);
    if (!checked.ok) return checked;
    attempts.push(checked.attempt);
  }
  return {
    ok: true,
    progress: {
      completedLessonIds: [...new Set(data.completedLessonIds)],
      lastLessonId: data.lastLessonId ?? null,
      lastStop: stopResult.lastStop,
      drafts: draftResult.drafts,
      attempts,
      starter: starterResult.starter,
    },
  };
}
