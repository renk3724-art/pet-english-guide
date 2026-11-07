import { normaliseText } from "./logic.mjs";

/** Expanding intervals in days. Stage 0 is due immediately (a miss). A first success moves to stage 1, due after 1 day, then 3, 7 and 14 days. This is a simple schedule, not a claim about optimal memory. */
export const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14];
const DAY = 86400000;

export function scheduleCard(card, correct, now = Date.now()) {
  const current = {
    en: card?.en || "",
    zh: card?.zh || "",
    stage: Number(card?.stage) || 0,
    dueAt: Number(card?.dueAt) || now,
    correct: Number(card?.correct) || 0,
    wrong: Number(card?.wrong) || 0,
  };
  if (!correct) {
    return { ...current, stage: 0, wrong: current.wrong + 1, dueAt: now };
  }
  const stage = Math.min(current.stage + 1, REVIEW_INTERVAL_DAYS.length - 1);
  return {
    ...current,
    stage,
    correct: current.correct + 1,
    dueAt: now + REVIEW_INTERVAL_DAYS[stage] * DAY,
  };
}

export function dueCards(vocab, now = Date.now()) {
  return Object.values(vocab || {}).filter((card) => Number(card.dueAt) <= now);
}

export function isLessonUnlocked(lessons, completedIds, lessonId) {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index <= 0) return index === 0;
  const previous = lessons[index - 1];
  return (completedIds || []).includes(previous.id);
}

export function nextLessonId(lessons, lessonId) {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  return lessons[index + 1]?.id || null;
}

export function normaliseAnswer(value) {
  return normaliseText(value).replace(/[.!?。！？]/g, "").trim();
}

export function gradeActivity(activity, input, meta = {}) {
  const kind = activity.type;
  if (kind === "speak") {
    return {
      objective: false,
      selfAssessed: true,
      correct: false,
      countsAsListening: false,
      explanation: activity.explanation,
      expectedLabel: "自评：跟着读过即可，没有发音分",
    };
  }
  let correct = false;
  let expectedLabel = "";
  if (kind === "hear-choose" || kind === "choose") {
    correct = input.choice === activity.answer;
    const option = (activity.options || []).find((item) => item.id === activity.answer);
    expectedLabel = option ? option.text : activity.answer;
  } else if (kind === "type" || kind === "produce" || kind === "dictation") {
    const given = normaliseAnswer(input.text);
    const accept = (activity.accept || []).map(normaliseAnswer);
    correct = given.length > 0 && accept.includes(given);
    expectedLabel = activity.accept.join(" / ");
  } else if (kind === "order") {
    const given = (input.order || []).map(normaliseAnswer).join(" ");
    const expected = (activity.answer || []).map(normaliseAnswer).join(" ");
    correct = given === expected && given.length > 0;
    expectedLabel = (activity.answer || []).join(" ");
  } else {
    throw new Error(`未知题型：${kind}`);
  }
  const countsAsListening = kind === "hear-choose" || kind === "dictation"
    ? meta.ttsAvailable === true && meta.listened === true && meta.usedTranscript !== true
    : false;
  return { objective: true, selfAssessed: false, correct, countsAsListening, explanation: activity.explanation, expectedLabel };
}
