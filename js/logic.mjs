export const PROGRESS_FORMAT = "pet-english-guide-progress";
export const PROGRESS_VERSION = 1;
export const STORAGE_KEY = "pet-english-guide-progress-v1";
export const RESET_PHRASE = "清除进度";
export const MAX_IMPORT_CHARS = 1_000_000;
export const MAX_ATTEMPTS = 500;

export function emptyProgress() {
  return {
    completedLessonIds: [],
    lastLessonId: null,
    attempts: [],
  };
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

export function wrongItems(progress) {
  const items = [];
  for (const attempt of progress.attempts) {
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
      attempts: progress.attempts,
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
      score: attempt.score,
      total: attempt.total,
      details,
    },
  };
}

export function validateImport(raw, knownLessonIds, knownQuizIds) {
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
      attempts,
    },
  };
}
