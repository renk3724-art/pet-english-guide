import assert from "node:assert/strict";
import test from "node:test";
import { emptyStarter, validateImport } from "../js/logic.mjs";
import { starterCourse } from "../js/starter-course.mjs";
import { dueCards, gradeActivity, isLessonUnlocked, scheduleCard } from "../js/starter.mjs";

const lessonIds = ["overview", "reading"];
const quizIds = ["overview", "writing-email"];

test("starter course is 16 finished lessons with varied activities", () => {
  assert.equal(starterCourse.lessons.length, 16);
  const types = new Set();
  let total = 0;
  for (const lesson of starterCourse.lessons) {
    assert.ok(lesson.activities.length >= 6 && lesson.activities.length <= 10, lesson.id);
    assert.ok(lesson.teach.length >= 2, lesson.id);
    for (const activity of lesson.activities) types.add(activity.type);
    total += lesson.activities.length;
  }
  for (const type of ["hear-choose", "choose", "type", "produce", "order", "dictation", "speak"]) {
    assert.ok(types.has(type), type);
  }
  assert.ok(total >= 100);
  assert.match(starterCourse.upcoming, /B1 Preliminary/);
});

test("answers grade only after the taught form, and transcript listening is not a listening score", () => {
  const activity = starterCourse.lessons[0].activities.find((item) => item.type === "hear-choose");
  const right = gradeActivity(activity, { choice: activity.answer }, { ttsAvailable: true, listened: true });
  assert.equal(right.correct, true);
  assert.equal(right.countsAsListening, true);
  const looked = gradeActivity(activity, { choice: activity.answer }, { ttsAvailable: true, listened: false, usedTranscript: true });
  assert.equal(looked.correct, true);
  assert.equal(looked.countsAsListening, false);
  const spoken = starterCourse.lessons[0].activities.find((item) => item.type === "speak");
  const self = gradeActivity(spoken, {}, {});
  assert.equal(self.selfAssessed, true);
  assert.equal(self.objective, false);
});

test("spaced review uses fixed intervals and keeps misses due now", () => {
  const now = Date.parse("2026-11-07T00:00:00.000Z");
  const first = scheduleCard({ en: "cat", zh: "猫" }, true, now);
  assert.equal(first.stage, 1);
  assert.equal(first.dueAt, now + 86400000);
  const missed = scheduleCard(first, false, now + 1000);
  assert.equal(missed.stage, 0);
  assert.equal(missed.dueAt, now + 1000);
  assert.equal(dueCards({ cat: missed }, now + 1000).length, 1);
  assert.equal(dueCards({ cat: first }, now).length, 0);
  assert.equal(isLessonUnlocked(starterCourse.lessons, [], "s01"), true);
  assert.equal(isLessonUnlocked(starterCourse.lessons, [], "s02"), false);
  assert.equal(isLessonUnlocked(starterCourse.lessons, ["s01"], "s02"), true);
});

test("old PET progress imports without being wiped", () => {
  const legacy = {
    format: "pet-english-guide-progress",
    version: 1,
    exportedAt: "2026-11-07T00:00:00.000Z",
    data: {
      completedLessonIds: ["reading"],
      lastLessonId: "reading",
      attempts: [],
    },
  };
  const imported = validateImport(JSON.stringify(legacy), lessonIds, quizIds, ["writing-email"]);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.progress.completedLessonIds, ["reading"]);
  assert.deepEqual(imported.progress.starter.completedIds, []);
  assert.deepEqual(imported.progress.starter.vocab, {});
  const again = validateImport(JSON.stringify({
    ...legacy,
    data: { ...legacy.data, starter: emptyStarter(), lastStop: { kind: "starter", id: "s03" } },
  }), lessonIds, quizIds, ["writing-email"]);
  assert.equal(again.ok, true);
  assert.equal(again.progress.lastStop.id, "s03");
  assert.deepEqual(again.progress.completedLessonIds, ["reading"]);
});
