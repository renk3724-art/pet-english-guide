import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import course from "../data/course.json" with { type: "json" };
import quizFile from "../data/quizzes.json" with { type: "json" };
import {
  buildExport,
  countWords,
  emptyProgress,
  flattenQuestions,
  listeningCredit,
  markLessonComplete,
  resetConfirmed,
  scoreQuiz,
  validateImport,
  wrongItems,
} from "../js/logic.mjs";
import { renderMarkdown } from "../js/markdown.mjs";

const lessonIds = course.lessons.map((lesson) => lesson.id);
const quizIds = quizFile.quizzes.map((quiz) => quiz.id);

function perfectResponses(quiz) {
  const responses = {};
  for (const question of flattenQuestions(quiz)) {
    responses[question.id] = question.type === "single" ? question.answer : question.accept[0];
  }
  return responses;
}

test("every lesson points at a markdown file and a known quiz", async () => {
  assert.equal(new Set(lessonIds).size, lessonIds.length);
  for (const lesson of course.lessons) {
    const text = await readFile(new URL(`../${lesson.file}`, import.meta.url), "utf8");
    assert.match(text, /^# /);
    if (lesson.quizId) assert.ok(quizIds.includes(lesson.quizId));
  }
});

test("official-format quizzes score perfectly when the key is used", () => {
  assert.ok(flattenQuestions(quizFile.quizzes[0]).length >= 5);
  let total = 0;
  for (const quiz of quizFile.quizzes) {
    const result = scoreQuiz(quiz, perfectResponses(quiz), { lessonId: quiz.lessonId, mode: "standard", listened: false });
    assert.equal(result.score, result.total, quiz.id);
    assert.equal(result.unofficial, true);
    assert.equal(result.countsAsListening, false);
    total += result.total;
    for (const detail of result.details) assert.ok(detail.explanation.length > 10);
  }
  assert.ok(total >= 40);
});

test("a wrong listening answer is stored with an explanation and no listening credit", () => {
  const quiz = quizFile.quizzes.find((item) => item.id === "listening");
  const responses = perfectResponses(quiz);
  responses.l1a = "A";
  const tts = scoreQuiz(quiz, responses, { lessonId: "listening", mode: "tts", listened: true });
  assert.equal(tts.score, tts.total - 1);
  assert.equal(tts.countsAsListening, true);
  assert.match(tts.details.find((detail) => detail.id === "l1a").explanation, /周六|亲戚|match/);
  const transcript = scoreQuiz(quiz, responses, { lessonId: "listening", mode: "transcript-support", listened: false });
  assert.equal(transcript.countsAsListening, false);
  assert.equal(listeningCredit("listening-tts", "transcript-support", true), false);
  assert.equal(listeningCredit("listening-tts", "tts", false), false);
});

test("text answers ignore case and extra spaces", () => {
  const quiz = quizFile.quizzes.find((item) => item.id === "grammar");
  const result = scoreQuiz(quiz, { ...perfectResponses(quiz), g1a: "  HAS   KNOWN " });
  assert.equal(result.details.find((detail) => detail.id === "g1a").correct, true);
});

test("export and import round-trip, and bad files are rejected", () => {
  let progress = markLessonComplete(emptyProgress(), "reading");
  const quiz = quizFile.quizzes.find((item) => item.id === "overview");
  const scored = scoreQuiz(quiz, perfectResponses(quiz), { lessonId: "overview" });
  progress = {
    ...progress,
    attempts: [{ ...scored, id: "attempt-1", finishedAt: "2026-11-07T00:00:00.000Z" }],
  };
  const raw = JSON.stringify(buildExport(progress, new Date("2026-11-07T00:00:00.000Z")));
  const imported = validateImport(raw, lessonIds, quizIds);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.progress.completedLessonIds, ["reading"]);
  assert.equal(imported.progress.attempts[0].score, scored.total);
  assert.equal(wrongItems(imported.progress).length, 0);

  const tampered = JSON.parse(raw);
  tampered.data.attempts[0].score = 0;
  assert.equal(validateImport(JSON.stringify(tampered), lessonIds, quizIds).ok, false);
  assert.match(validateImport("{", lessonIds, quizIds).error, /JSON/);
  assert.match(validateImport(JSON.stringify({ format: "other", version: 1, data: {} }), lessonIds, quizIds).error, /不是本学习站/);
  const wrongVersion = JSON.parse(raw);
  wrongVersion.version = 2;
  assert.match(validateImport(JSON.stringify(wrongVersion), lessonIds, quizIds).error, /版本/);
  const unknownLesson = JSON.parse(raw);
  unknownLesson.data.completedLessonIds.push("not-a-lesson");
  assert.match(validateImport(JSON.stringify(unknownLesson), lessonIds, quizIds).error, /未知课程/);
});

test("version 1 progress without drafts still imports", () => {
  const legacy = {
    format: "pet-english-guide-progress",
    version: 1,
    exportedAt: "2026-11-07T00:00:00.000Z",
    data: {
      completedLessonIds: ["overview"],
      lastLessonId: "overview",
      attempts: [],
    },
  };
  const imported = validateImport(JSON.stringify(legacy), lessonIds, quizIds, ["writing-email"]);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.progress.drafts, {});
  assert.equal(imported.progress.lastStop, null);
  assert.deepEqual(imported.progress.completedLessonIds, ["overview"]);
});

test("drafts and self-assessed writing stay compatible with objective wrong answers", () => {
  const quiz = quizFile.quizzes.find((item) => item.id === "overview");
  const responses = {};
  for (const section of quiz.sections) {
    for (const question of section.questions) responses[question.id] = question.answer;
  }
  responses.ov1 = "A";
  const scored = scoreQuiz(quiz, responses, { lessonId: "overview" });
  const progress = {
    completedLessonIds: [],
    lastLessonId: null,
    lastStop: { kind: "task", id: "writing-email" },
    drafts: { "writing-email": "Hi Priya, I can help in the afternoon." },
    attempts: [
      { ...scored, id: "attempt-old", finishedAt: "2026-11-07T00:00:00.000Z" },
      {
        id: "attempt-write",
        quizId: "writing-email",
        lessonId: "writing",
        title: "写作：回复一封邮件",
        finishedAt: "2026-11-07T01:00:00.000Z",
        kind: "self-check",
        mode: "standard",
        selfAssessed: true,
        responseText: "Hi Priya, I can help in the afternoon because I have class.",
        score: 1,
        total: 1,
        details: [{
          id: "afternoon",
          prompt: "我写了下午",
          response: "yes",
          responseLabel: "已勾选",
          correct: true,
          expectedLabel: "自评项",
          explanation: "原因",
        }],
      },
    ],
  };
  const raw = JSON.stringify(buildExport(progress, new Date("2026-11-07T01:00:00.000Z")));
  const imported = validateImport(raw, lessonIds, [...quizIds, "writing-email"], ["writing-email"]);
  assert.equal(imported.ok, true);
  assert.match(imported.progress.drafts["writing-email"], /afternoon/);
  assert.equal(imported.progress.attempts[1].selfAssessed, true);
  assert.equal(wrongItems(imported.progress).length, 1);
  assert.equal(wrongItems(imported.progress)[0].id, "ov1");
  assert.equal(countWords("Hi Priya I can help"), 5);
});

test("reset requires the exact confirmation phrase", () => {
  assert.equal(resetConfirmed("清除进度"), true);
  assert.equal(resetConfirmed(" 清除进度"), false);
  assert.equal(resetConfirmed("删除"), false);
});

test("markdown rendering escapes html and drops unsafe links", () => {
  const html = renderMarkdown("# 标题\n\n<script>alert(1)</script>\n\n[好的](https://www.cambridgeenglish.org/)\n\n[坏的](javascript:alert(1))\n\n| 项目 | 时间 |\n| --- | --- |\n| 阅读 | 45 |\n");
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/www.cambridgeenglish.org\/"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<td>45<\/td>/);
});
