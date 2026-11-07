import {
  STORAGE_KEY,
  RESET_PHRASE,
  addAttempt,
  blankQuestionIds,
  buildExport,
  countWords,
  emptyProgress,
  flattenQuestions,
  lessonStatus,
  markLessonComplete,
  quizSections,
  rememberStop,
  resetConfirmed,
  saveDraft,
  scoreQuiz,
  touchLesson,
  validateImport,
  wrongItems,
} from "./logic.mjs";
import { escapeHtml, renderMarkdown } from "./markdown.mjs";
import { starterCourse } from "./starter-course.mjs";
import { dueCards, gradeActivity, isLessonUnlocked, normaliseAnswer, scheduleCard } from "./starter.mjs";
import { activityHtml, feedbackHtml, reviewHtml, starterPathHtml, summaryHtml, teachHtml } from "./starter-ui.mjs";

const OFFICIAL_LISTENING = "https://www.cambridgeenglish.org/exams-and-tests/qualifications/preliminary/preparation/";

const state = {
  course: null,
  quizzes: new Map(),
  tasks: new Map(),
  progress: emptyProgress(),
  storageBlocked: false,
  loadError: "",
  importPreview: null,
  lessonCache: new Map(),
};

let quizSession = null;
let taskSession = null;
let timerId = null;
let starterRun = null;
let recordStream = null;

const main = document.querySelector("#main");

function asset(path) {
  return new URL(path, document.baseURI).href;
}

function lessonIds() {
  return state.course.lessons.map((lesson) => lesson.id);
}

function quizIds() {
  return [...state.quizzes.keys(), ...state.tasks.keys()];
}

function taskIds() {
  return [...state.tasks.keys()];
}

function findLesson(id) {
  return state.course.lessons.find((lesson) => lesson.id === id) || null;
}

function findQuiz(id) {
  return state.quizzes.get(id) || null;
}

function findTask(id) {
  return state.tasks.get(id) || null;
}

function validateStored(raw) {
  return validateImport(raw, lessonIds(), quizIds(), taskIds());
}

function save() {
  if (state.storageBlocked) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildExport(state.progress)));
}

function resumeHref() {
  const stop = state.progress.lastStop;
  if (stop?.kind === "task" && state.tasks.has(stop.id)) return `#/task/${stop.id}`;
  if (stop?.kind === "quiz" && state.quizzes.has(stop.id)) return `#/quiz/${stop.id}`;
  if (stop?.kind === "lesson" && findLesson(stop.id)) return `#/lesson/${stop.id}`;
  if (findLesson(state.progress.lastLessonId)) return `#/lesson/${state.progress.lastLessonId}`;
  return "#/quiz/reading";
}

function resolveLink(url) {
  const name = url.split("#")[0].split("?")[0].split("/").pop();
  const lesson = state.course.lessons.find((item) => item.file.endsWith(`/${name}`) || item.file === name);
  if (lesson) return `#/lesson/${lesson.id}`;
  if (name.endsWith(".md")) return `tutorial/${name}`;
  return url;
}

function parseRoute() {
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "lesson" && parts[1]) return { name: "lesson", id: parts[1] };
  if (parts[0] === "quiz" && parts[1]) return { name: "quiz", id: parts[1] };
  if (parts[0] === "task" && parts[1]) return { name: "task", id: parts[1] };
  if (parts[0] === "practice") return { name: "practice" };
  if (parts[0] === "starter" && parts[1]) return { name: "starter-lesson", id: parts[1] };
  if (parts[0] === "starter-review") return { name: "starter-review" };
  if (parts[0] === "starter") return { name: "starter" };
  if (parts[0] === "review" && parts[1]) return { name: "attempt", id: parts[1] };
  if (parts[0] === "review") return { name: "review" };
  if (parts[0] === "wrong") return { name: "wrong" };
  if (parts[0] === "progress") return { name: "progress" };
  return { name: "missing" };
}

function statusLabel(status) {
  if (status === "complete") return "已完成";
  if (status === "current") return "上次学到";
  return "未开始";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function unofficialBanner(extra = "") {
  return `<aside class="banner unofficial"><strong>非正式自编练习。</strong> 这些题目不是剑桥英语真题、官方样卷或过去试卷。${extra}</aside>`;
}

function stopSpeechAndTimer() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (timerId) clearInterval(timerId);
  timerId = null;
}

async function loadLesson(lesson) {
  if (state.lessonCache.has(lesson.id)) return state.lessonCache.get(lesson.id);
  const response = await fetch(asset(lesson.file));
  if (!response.ok) throw new Error(`无法读取 ${lesson.file}`);
  const text = await response.text();
  state.lessonCache.set(lesson.id, text);
  return text;
}

function viewHome() {
  const starter = state.progress.starter || { completedIds: [], vocab: {} };
  const done = starter.completedIds?.length || 0;
  const total = starterCourse.lessons.length;
  const resumeId = starter.cursor?.lessonId || starterCourse.lessons.find((lesson) => !(starter.completedIds || []).includes(lesson.id))?.id || "s01";
  return `<section class="hero practice-hero">
    <div>
      <p class="kicker">中文讲解 · 不假设你学过英语</p>
      <h1>从零开始学英语</h1>
      <p class="lead">先学几个字母和日常说法，马上做题。已完成 ${done} / ${total} 课。后面还有进阶的 B1 Preliminary，但零基础先从这里开始。</p>
      <div class="actions entry-actions">
        <a class="button large" href="#/starter">从零开始</a>
        <a class="button large secondary" href="#/starter/${resumeId}">继续学习</a>
      </div>
    </div>
  </section>
  ${state.loadError ? `<aside class="banner warn"><strong>本地进度无法读取。</strong> ${escapeHtml(state.loadError)} 旧的 PET 进度还留在浏览器里。</aside>` : ""}
  <p><a class="button-secondary" href="#/starter-review">复习到期的词</a></p>
  <details class="more-lessons">
    <summary>进阶：B1 Preliminary 考试练习</summary>
    <p>适合已经能读简单英文的人。下面这些题不是零基础课。</p>
    <div class="practice-grid">${practiceSkills().map((skill) => `<a class="practice-card" href="${skill.href}"><strong>${escapeHtml(skill.title)}</strong><span>${escapeHtml(skill.blurb)}</span></a>`).join("")}</div>
    ${lessonList()}
  </details>`;
}

function practiceSkills() {
  return [
    { title: "阅读练习", href: "#/quiz/reading", blurb: "先看通知例题，再做 5 则短文、8 门课程配对和两篇短文。" },
    { title: "写作练习", href: "#/task/writing-email", blurb: "写一封约 100 词的邮件：有字数、自动保存的草稿，交卷后才看范文。" },
    { title: "听力练习", href: "#/quiz/listening", blurb: "先播放自编稿再答题。不能播放时改看文字稿，那次不记听力分。" },
    { title: "口语练习", href: "#/task/speaking-photo", blurb: "看原创简图说一分钟，或改用文字题。没有发音评分。" },
    { title: "语法词汇练习", href: "#/quiz/grammar", blurb: "在句子和一封短信里填空，提交后看为什么。" },
  ];
}

function lessonList() {
  const rows = state.course.lessons.map((lesson, index) => {
    const status = lessonStatus(state.progress, lesson.id);
    const practice = lesson.quizId ? `<a class="button-secondary" href="#/quiz/${lesson.quizId}">做${escapeHtml(lesson.title)}练习</a>` : "";
    return `<li class="lesson-row">
      <span class="status ${status}">${statusLabel(status)}</span>
      <div>
        <a href="#/lesson/${lesson.id}">${index + 1}. ${escapeHtml(lesson.title)}</a>
        <p class="muted">${escapeHtml(lesson.summary)}</p>
        ${practice}
      </div>
    </li>`;
  }).join("");
  return `<ol class="lesson-list">${rows}</ol>
    <p><a href="${escapeHtml(asset("tutorial/09-answer-keys.md"))}">文字版参考答案（做完再打开）</a></p>`;
}

function viewPractice() {
  const cards = practiceSkills().map((skill) => `<a class="practice-card" href="${skill.href}"><strong>${escapeHtml(skill.title)}</strong><span>${escapeHtml(skill.blurb)}</span></a>`).join("");
  return `<h1>进阶练习</h1>
    <p>这是 B1 Preliminary 的自编题，不是零基础第一课。</p>
    ${unofficialBanner()}
    <div class="practice-grid">${cards}</div>
    <p><a href="#/task/writing-story">还有一道故事写作</a> · <a href="#/task/speaking-choice">还有一道口语选择讨论</a></p>`;
}

function starterLessonById(id) {
  return starterCourse.lessons.find((lesson) => lesson.id === id) || null;
}

function saveStarterCursor(run) {
  state.progress.starter = state.progress.starter || { completedIds: [], cursor: null, vocab: {}, badges: [] };
  state.progress.starter.cursor = {
    lessonId: run.lessonId,
    phase: run.phase === "feedback" ? "activity" : run.phase,
    index: run.index,
    results: run.results,
  };
  state.progress = rememberStop(state.progress, { kind: "starter", id: run.lessonId });
  save();
}

function beginStarterRun(lesson) {
  const cursor = state.progress.starter?.cursor;
  const same = cursor && cursor.lessonId === lesson.id;
  starterRun = {
    lessonId: lesson.id,
    phase: same ? (cursor.phase === "summary" ? "summary" : cursor.phase) : "teach",
    index: same ? cursor.index : 0,
    listened: false,
    usedTranscript: false,
    built: [],
    pool: null,
    results: same && Array.isArray(cursor.results) ? cursor.results : [],
    retry: [],
    retryMode: false,
    feedback: null,
  };
  if (starterRun.index >= lesson.activities.length) starterRun.phase = "summary";
}

function currentActivity(lesson) {
  if (starterRun.retryMode) return starterRun.retry[0] ? lesson.activities.find((item) => item.id === starterRun.retry[0]) : null;
  return lesson.activities[starterRun.index] || null;
}

function rememberVocab(activity, correct) {
  const answers = [activity.answer, ...(activity.accept || []), activity.speak].filter(Boolean).map((item) => normaliseAnswer(item));
  const source = starterLessonById(starterRun.lessonId).teach.find((item) => answers.includes(normaliseAnswer(item.en)) || answers.includes(normaliseAnswer(item.speak)));
  if (!source) return;
  const key = source.en.toLowerCase();
  const vocab = state.progress.starter.vocab || {};
  vocab[key] = scheduleCard({ ...(vocab[key] || {}), en: source.en, zh: source.zh }, correct);
  state.progress.starter.vocab = vocab;
}

function viewStarterLesson(id) {
  const lesson = starterLessonById(id);
  if (!lesson) return `<h1>没有这一课</h1><p><a href="#/starter">返回</a></p>`;
  state.progress.starter = state.progress.starter || { completedIds: [], cursor: null, vocab: {}, badges: [] };
  if (!isLessonUnlocked(starterCourse.lessons, state.progress.starter.completedIds, id)) {
    return `<h1>先完成上一课</h1><p><a class="button" href="#/starter">返回课程列表</a></p>`;
  }
  if (!starterRun || starterRun.lessonId !== id) beginStarterRun(lesson);
  saveStarterCursor(starterRun);
  if (starterRun.phase === "teach") return teachHtml(lesson);
  if (starterRun.phase === "summary") {
    const done = state.progress.starter.completedIds.includes(lesson.id);
    return summaryHtml(lesson, starterRun.results, lessonLinkNext(lesson.id), done);
  }
  if (starterRun.phase === "feedback" && starterRun.feedback) return feedbackHtml(starterRun.feedback.activity, starterRun.feedback.result);
  const activity = currentActivity(lesson);
  if (!activity) {
    starterRun.phase = "summary";
    return summaryHtml(lesson, starterRun.results, lessonLinkNext(lesson.id), false);
  }
  const number = starterRun.retryMode ? starterRun.results.length : starterRun.index + 1;
  return activityHtml(lesson, activity, starterRun, number, lesson.activities.length);
}

function lessonLinkNext(id) {
  const index = starterCourse.lessons.findIndex((lesson) => lesson.id === id);
  return starterCourse.lessons[index + 1]?.id || null;
}

function viewStarterReview() {
  const vocab = state.progress.starter?.vocab || {};
  const cards = dueCards(vocab);
  const feedback = starterRun?.reviewFeedback;
  starterRun = { reviewCard: cards[0] || null, reviewFeedback: null };
  const banner = feedback ? `<aside class="banner ${feedback.correct ? "ok" : "warn"}">${feedback.correct ? "对了。这个词会按间隔再出现。" : `参考答案：${escapeHtml(feedback.expected)}。错了的词可以马上再做。`}</aside>` : "";
  return banner + reviewHtml(cards);
}

function lessonActions(lesson) {
  const index = state.course.lessons.findIndex((item) => item.id === lesson.id);
  const previous = state.course.lessons[index - 1];
  const next = state.course.lessons[index + 1];
  const complete = state.progress.completedLessonIds.includes(lesson.id);
  return `<div class="actions">
    ${previous ? `<a class="button-secondary" href="#/lesson/${previous.id}">上一课</a>` : ""}
    ${next ? `<a class="button-secondary" href="#/lesson/${next.id}">下一课</a>` : ""}
    ${lesson.quizId ? `<a class="button" href="#/quiz/${lesson.quizId}">做本课练习</a>` : ""}
    <button type="button" class="${complete ? "secondary" : "primary"}" data-action="toggle-complete" data-lesson="${lesson.id}">${complete ? "取消完成标记" : "我已学完这一课"}</button>
    <a class="text-link" href="${escapeHtml(asset(lesson.file))}">下载本章 Markdown</a>
  </div>`;
}

async function viewLesson(id) {
  const lesson = findLesson(id);
  if (!lesson) return `<h1>没有这一课</h1><p><a href="#/">回到课程</a></p>`;
  if (!state.storageBlocked) {
    state.progress = rememberStop(touchLesson(state.progress, lesson.id), { kind: "lesson", id: lesson.id });
    save();
  }
  let article = "";
  try {
    const markdown = await loadLesson(lesson);
    article = renderMarkdown(markdown, { resolveLink });
  } catch (error) {
    article = `<aside class="banner warn">${escapeHtml(error.message)}。请通过本地网页服务器或 GitHub Pages 打开，不要直接用 file://。</aside>`;
  }
  return `${lessonActions(lesson)}<article class="article">${article}</article>${lessonActions(lesson)}`;
}

function ensureSession(quiz) {
  if (!quizSession || quizSession.quizId !== quiz.id) {
    quizSession = {
      quizId: quiz.id,
      mode: quiz.kind === "listening-tts" ? null : "standard",
      listened: false,
      allowIncomplete: false,
      result: null,
    };
  }
}

function questionField(question, index) {
  const prompt = `${index}. ${question.prompt}`;
  if (question.type === "single") {
    const options = question.options.map((option) =>
      `<label><input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(option.id)}"> <span>${escapeHtml(option.id)}. ${escapeHtml(option.text)}</span></label>`).join("");
    return `<fieldset><legend>${escapeHtml(prompt)}</legend>${options}</fieldset>`;
  }
  return `<fieldset><legend>${escapeHtml(prompt)}</legend><label>答案 <input type="text" name="${escapeHtml(question.id)}" autocomplete="off"></label></fieldset>`;
}

function sectionBody(section, startIndex, showScript) {
  let html = `<section><h2>${escapeHtml(section.title)}</h2>`;
  if (section.intro) html += `<p>${escapeHtml(section.intro)}</p>`;
  if (section.example) {
    html += `<aside class="card example"><p class="kicker">例题</p><p>${escapeHtml(section.example.prompt)}</p><p><strong>例题答案：${escapeHtml(section.example.answer)}</strong></p><p>${escapeHtml(section.example.why)}</p></aside><h3>现在自己做</h3>`;
  }
  if (section.text) html += `<p class="stimulus">${escapeHtml(section.text)}</p>`;
  if (section.audioScript && showScript) {
    html += `<p class="stimulus">${escapeHtml(section.audioScript)}</p>`;
  }
  if (section.audioScript && quizSession.mode === "tts" && !quizSession.result) {
    html += `<button type="button" class="secondary" data-action="speak" data-section="${escapeHtml(section.id)}">播放这一段（浏览器合成语音）</button>`;
  }
  section.questions.forEach((question, offset) => {
    html += questionField(question, startIndex + offset);
  });
  html += "</section>";
  return html;
}

function resultsBody(attempt) {
  const listeningNote = attempt.kind === "listening-tts"
    ? (attempt.countsAsListening
      ? "这次使用了浏览器合成语音，记为非正式听力练习，仍然不是官方听力成绩。"
      : "这次使用了文字稿或没有完成播放，只作为阅读支持，不记为听力成绩。")
    : "";
  const items = attempt.details.map((detail) => {
    const mark = attempt.selfAssessed
      ? (detail.correct ? "已勾选" : "未勾选")
      : (detail.correct ? "正确" : "错误");
    const tone = attempt.selfAssessed ? "self" : (detail.correct ? "correct" : "wrong");
    return `<article class="result-item ${tone}">
      <p class="mark ${tone}">${mark}</p>
      <p>${escapeHtml(detail.prompt)}</p>
      <p>你的答案：${escapeHtml(detail.responseLabel || detail.response || "（未作答）")}</p>
      <p>参考答案：${escapeHtml(detail.expectedLabel)}</p>
      <p>${escapeHtml(detail.explanation)}</p>
    </article>`;
  }).join("");
  return `<div aria-live="polite">
    <aside class="banner ${attempt.selfAssessed ? "unofficial" : (attempt.score === attempt.total ? "ok" : "warn")}">
      <strong>${attempt.selfAssessed ? "自评" : "得分"} ${attempt.score} / ${attempt.total}</strong>
      <p>${attempt.selfAssessed ? "这是你自己勾选的检查项，不是考官分数，也不是发音评分。" : escapeHtml(listeningNote)}</p>
      ${attempt.responseText ? `<p class="stimulus">${escapeHtml(attempt.responseText)}</p>` : ""}
    </aside>
    ${items}
    <div class="actions">
      <button type="button" class="primary" data-action="retry-quiz" data-quiz="${escapeHtml(attempt.quizId)}">再做一次</button>
      <a class="button-secondary" href="#/wrong">只看错题</a>
      ${attempt.lessonId ? `<a class="button-secondary" href="#/lesson/${escapeHtml(attempt.lessonId)}">回到本课</a>` : ""}
      ${attempt.lessonId ? `<button type="button" class="primary" data-action="toggle-complete" data-lesson="${escapeHtml(attempt.lessonId)}">${state.progress.completedLessonIds.includes(attempt.lessonId) ? "取消完成标记" : "标记本课完成"}</button>` : ""}
    </div>
  </div>`;
}

function viewQuiz(id) {
  const quiz = findQuiz(id);
  if (!quiz) return `<h1>没有这个练习</h1><p><a href="#/">回到课程</a></p>`;
  ensureSession(quiz);
  const lesson = findLesson(quiz.lessonId);
  if (lesson && !state.storageBlocked && state.progress.lastStop?.id !== quiz.id) {
    state.progress = rememberStop(touchLesson(state.progress, lesson.id), { kind: "quiz", id: quiz.id });
    save();
  }
  let body = "";
  if (quizSession.result) {
    body = resultsBody(quizSession.result);
    if (quiz.kind === "listening-tts") {
      const scripts = quizSections(quiz).filter((section) => section.audioScript).map((section) =>
        `<h3>${escapeHtml(section.title)}</h3><p class="stimulus">${escapeHtml(section.audioScript)}</p>`).join("");
      body += `<section><h2>交卷后才显示的文字稿</h2><p>用来核对听写。打开文字稿再作答的那次，不会记为听力分。</p>${scripts}</section>`;
    }
  } else if (quiz.kind === "listening-tts" && !quizSession.mode) {
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    body = canSpeak
      ? `<p>先播放，再做题。交卷前不显示文字稿。</p>
         <div class="actions">
           <button type="button" class="primary large" data-action="listen-start">播放录音（浏览器合成，非正式听力）</button>
           <button type="button" class="secondary" data-action="choose-mode" data-mode="transcript-support">无法播放，改看文字稿（不记听力分）</button>
         </div>`
      : `<aside class="banner warn">这个浏览器不能合成语音，所以不能记听力分。可以改看文字稿，或到剑桥备考页听官方样卷。</aside>
         <button type="button" class="secondary" data-action="choose-mode" data-mode="transcript-support">改看文字稿（不记听力分）</button>`;
  } else {
    const showScript = quizSession.mode === "transcript-support";
    let index = 1;
    const sections = quizSections(quiz).map((section) => {
      const html = sectionBody(section, index, showScript);
      index += (section.questions || []).length;
      return html;
    }).join("");
    const listeningHelp = quiz.kind === "listening-tts" && quizSession.mode === "tts"
      ? `<p id="listen-status">${quizSession.listened ? "已播放过语音。交卷后可以对照解析。" : "请至少播放一段语音后再提交。"}</p>
         <p><button type="button" class="secondary" data-action="choose-mode" data-mode="transcript-support">改为文字稿模式</button></p>`
      : "";
    const speakingTimer = quiz.id === "speaking"
      ? `<aside class="card"><h2>一分钟描述计时器</h2><p>这只帮助你把照片说满约 1 分钟。它不录音、不打分、不记入练习成绩。</p><button type="button" class="secondary" data-action="start-timer">开始 60 秒</button><p id="timer-readout" aria-live="polite">尚未开始</p></aside>`
      : "";
    body = `${speakingTimer}${listeningHelp}
      <form id="quiz-form">${sections}
        <p id="form-error" class="mark wrong"></p>
        <div class="actions"><button type="submit" class="primary">提交并查看解析</button></div>
      </form>`;
  }
  const officialListening = quiz.kind === "listening-tts"
    ? `<p>官方录音、答案和录音稿在 <a href="${OFFICIAL_LISTENING}">剑桥备考页</a>。这里若播放声音，是浏览器当场合成的，不是考试录音。</p>`
    : "";
  return `<p class="kicker">${lesson ? `<a href="#/lesson/${lesson.id}">${escapeHtml(lesson.title)}</a>` : "练习"}</p>
    <h1>${escapeHtml(quiz.title)}</h1>
    ${unofficialBanner(quiz.kind === "listening-tts" ? " 浏览器语音合成不是剑桥录音。" : "")}
    ${officialListening}
    ${body}`;
}

function viewTask(id) {
  const task = findTask(id);
  if (!task) return `<h1>没有这个练习</h1><p><a href="#/practice">回到练习</a></p>`;
  if (!taskSession || taskSession.id !== id) taskSession = { id, revealed: false, saved: false };
  if (!state.storageBlocked && state.progress.lastStop?.id !== id) {
    state.progress = rememberStop(state.progress, { kind: "task", id });
    save();
  }
  const draft = state.progress.drafts?.[id] || "";
  const words = countWords(draft);
  const example = task.example
    ? `<aside class="card example"><p class="kicker">先看这个短例</p><p>${escapeHtml(task.example.prompt)}</p><p class="stimulus">${escapeHtml(task.example.answer)}</p></aside>`
    : "";
  const notes = (task.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const image = task.image
    ? `<figure class="task-figure"><img src="${escapeHtml(asset(task.image))}" alt="${escapeHtml(task.imageAlt || "练习用原创简图")}">
        <details><summary>图片无法显示时，打开文字题</summary><p>${escapeHtml(task.textAlternative || "")}</p></details></figure>`
    : "";
  const writing = task.model
    ? `<label for="task-draft">你的英文</label>
       <textarea id="task-draft" data-task="${escapeHtml(task.id)}" rows="10">${escapeHtml(draft)}</textarea>
       <p id="word-count" aria-live="polite">当前 ${words} 词，目标约 ${task.targetWords} 词。</p>`
    : `<p>计时器只帮助你说够时间。它不录音，也不评分。</p>
       <button type="button" class="secondary" data-action="start-timer" data-seconds="${task.seconds || 60}">开始 ${task.seconds || 60} 秒</button>
       <p id="timer-readout" aria-live="polite">尚未开始</p>`;
  const after = taskSession.revealed
    ? `<section class="card"><h2>${task.model ? "范文（交卷后才显示）" : "示例回答（说完才显示）"}</h2>
        <p class="stimulus">${escapeHtml(task.model || task.exampleAnswer)}</p>
        <form id="self-check">
          <fieldset><legend>自评，不是考官打分</legend>
            ${(task.rubric || []).map((item) => `<label><input type="checkbox" name="rubric" value="${escapeHtml(item.id)}"> <span>${escapeHtml(item.text)} ${escapeHtml(item.hint || "")}</span></label>`).join("")}
          </fieldset>
          <button type="submit" class="primary">保存这次自评</button>
        </form>
        ${taskSession.saved ? `<p class="banner ok">已保存在这个浏览器。这不是考试分数。</p>` : ""}
      </section>`
    : `<button type="button" class="primary large" data-action="reveal-task" data-task="${escapeHtml(task.id)}">${task.model ? "我写完了，查看范文和自评" : "我已说完，查看示例和自评"}</button>`;
  return `<p class="kicker"><a href="#/practice">全部练习</a></p>
    <h1>${escapeHtml(task.title)}</h1>
    ${unofficialBanner(task.model ? "" : " 不评估发音。")}
    <p>${escapeHtml(task.instructions)}</p>
    ${example}
    <h2>现在自己做</h2>
    <p>${escapeHtml(task.prompt)}</p>
    ${task.stimulus ? `<p class="stimulus">${escapeHtml(task.stimulus)}</p>` : ""}
    ${notes ? `<ul>${notes}</ul>` : ""}
    ${image}
    ${writing}
    <div class="actions">${after}</div>
    ${task.id === "writing-email" ? `<p><a href="#/task/writing-story">下一题：写故事</a></p>` : ""}
    ${task.id === "speaking-photo" ? `<p><a href="#/task/speaking-choice">下一题：比较并选择</a></p>` : ""}`;
}

function viewReview() {
  const attempts = [...state.progress.attempts].reverse();
  if (!attempts.length) return `<h1>练习记录</h1><p>还没有提交过练习。</p>`;
  const items = attempts.map((attempt) => {
    const flag = attempt.selfAssessed
      ? "自评，不是考官分"
      : (attempt.kind === "listening-tts" ? (attempt.countsAsListening ? "非正式听力" : "文字稿支持，非听力分") : "客观题");
    return `<li class="lesson-row"><div><a href="#/review/${encodeURIComponent(attempt.id)}">${escapeHtml(attempt.title)}</a><p class="muted">${formatWhen(attempt.finishedAt)} · ${escapeHtml(flag)}</p></div><strong>${attempt.score} / ${attempt.total}</strong></li>`;
  }).join("");
  return `<h1>练习记录</h1><ol class="lesson-list">${items}</ol>`;
}

function viewAttempt(id) {
  const attempt = state.progress.attempts.find((item) => item.id === id);
  if (!attempt) return `<h1>没有这条记录</h1><p><a href="#/review">回到练习记录</a></p>`;
  return `<h1>${escapeHtml(attempt.title)}</h1><p class="muted">${formatWhen(attempt.finishedAt)}</p>${unofficialBanner()}${resultsBody(attempt)}`;
}

function viewWrong() {
  const items = wrongItems(state.progress);
  if (!items.length) return `<h1>错题</h1><p>目前没有错题。提交一次练习后，答错的题会留在这里。</p>`;
  const cards = items.map((item) => `<article class="result-item wrong">
      <p class="muted">${escapeHtml(item.quizTitle || item.quizId)} · ${formatWhen(item.finishedAt)}</p>
      <p>${escapeHtml(item.prompt)}</p>
      <p>你的答案：${escapeHtml(item.responseLabel || item.response || "（未作答）")}</p>
      <p>参考答案：${escapeHtml(item.expectedLabel)}</p>
      <p>${escapeHtml(item.explanation)}</p>
      <p><a href="#/quiz/${escapeHtml(item.quizId)}">重做这组成套练习</a></p>
    </article>`).join("");
  return `<h1>错题</h1><p>这里汇总本浏览器里所有未做对的题。听力若当时用的是文字稿，解析仍然可以看，但那次不代表听力分。</p>${cards}`;
}

function viewProgress() {
  const preview = state.importPreview;
  let previewHtml = "";
  if (preview?.error) previewHtml = `<aside class="banner warn">${escapeHtml(preview.error)} 没有覆盖现有进度。</aside>`;
  if (preview?.progress) {
    previewHtml = `<aside class="banner ok"><p>文件可以导入。它包含 ${preview.progress.completedLessonIds.length} 课完成标记和 ${preview.progress.attempts.length} 次练习。</p><p>确认后会覆盖这个浏览器里的当前进度。</p><button type="button" class="primary" data-action="confirm-import">确认覆盖并导入</button></aside>`;
  }
  return `<h1>进度</h1>
    <aside class="banner unofficial"><strong>只存在于这台设备的这个浏览器。</strong> 没有账号，也不会自动同步。清除浏览器数据、换浏览器或使用无痕模式，都会看不到这些记录。换设备前请导出 JSON。</aside>
    ${state.loadError ? `<aside class="banner warn">现有本地数据无法读取：${escapeHtml(state.loadError)}</aside>` : ""}
    <p>已完成 ${state.progress.completedLessonIds.length} 课，练习 ${state.progress.attempts.length} 次。</p>
    <div class="actions"><button type="button" class="primary" data-action="export-progress">导出进度 JSON</button></div>
    <h2>导入</h2>
    <p>只导入本学习站导出的版本 1 文件。系统会检查课程编号、练习编号，以及分数是否和作答明细一致。</p>
    <label>选择 JSON 文件 <input id="import-file" type="file" accept="application/json,.json"></label>
    ${previewHtml}
    <h2>清除</h2>
    <p>清除前必须输入确认语。取消不会删除任何内容。</p>
    <button type="button" class="secondary" data-action="open-reset">清除本浏览器的进度</button>
    <div id="reset-layer" class="dialog-backdrop" hidden>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">确认清除</h2>
        <p>此操作只删除这台设备上这个浏览器中的学习记录，不能撤销。请输入 <strong>${RESET_PHRASE}</strong>。</p>
        <label>确认语 <input id="reset-phrase" type="text" autocomplete="off"></label>
        <div class="actions">
          <button type="button" id="reset-confirm" class="primary" data-action="perform-reset" disabled>确认清除</button>
          <button type="button" class="secondary" data-action="close-reset">取消</button>
        </div>
      </div>
    </div>`;
}

async function render() {
  stopSpeechAndTimer();
  const route = parseRoute();
  document.title = "B1 Preliminary 自学站";
  let html = "";
  if (route.name === "home") html = viewHome();
  else if (route.name === "practice") html = viewPractice();
  else if (route.name === "starter") html = starterPathHtml(starterCourse, state.progress.starter || { completedIds: [], vocab: {} });
  else if (route.name === "starter-review") html = viewStarterReview();
  else if (route.name === "starter-lesson") html = viewStarterLesson(route.id);
  else if (route.name === "lesson") html = await viewLesson(route.id);
  else if (route.name === "quiz") html = viewQuiz(route.id);
  else if (route.name === "task") html = viewTask(route.id);
  else if (route.name === "review") html = viewReview();
  else if (route.name === "attempt") html = viewAttempt(route.id);
  else if (route.name === "wrong") html = viewWrong();
  else if (route.name === "progress") html = viewProgress();
  else html = `<h1>页面不存在</h1><p><a href="#/">回到课程</a></p>`;
  main.innerHTML = html;
  const pending = quizSession?.pendingSpeak;
  if (pending) {
    quizSession.pendingSpeak = null;
    const button = document.querySelector(`[data-action="speak"][data-section="${CSS.escape(pending)}"]`);
    if (button) speak(pending, button);
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function collectResponses(quiz, form) {
  const responses = {};
  for (const question of flattenQuestions(quiz)) {
    if (question.type === "single") {
      const selected = form.querySelector(`input[name="${CSS.escape(question.id)}"]:checked`);
      responses[question.id] = selected ? selected.value : "";
    } else {
      const field = form.querySelector(`[name="${CSS.escape(question.id)}"]`);
      responses[question.id] = field ? field.value : "";
    }
  }
  return responses;
}

function submitQuiz(form) {
  const quiz = findQuiz(quizSession?.quizId);
  if (!quiz) return;
  if (quiz.kind === "listening-tts" && quizSession.mode === "tts" && !quizSession.listened) {
    const error = document.querySelector("#form-error");
    if (error) error.textContent = "请先播放语音。如果不能播放，请改用文字稿模式。文字稿模式不会记为听力成绩。";
    return;
  }
  const responses = collectResponses(quiz, form);
  const blanks = blankQuestionIds(quiz, responses);
  if (blanks.length && !quizSession.allowIncomplete) {
    const error = document.querySelector("#form-error");
    if (error) {
      error.textContent = `还有 ${blanks.length} 题没有作答。`;
      if (!document.querySelector("[data-action='submit-anyway']")) {
        error.insertAdjacentHTML("afterend", `<button type="button" class="secondary" data-action="submit-anyway">仍然提交未完成的答卷</button>`);
      }
    }
    const first = form.querySelector(`[name="${CSS.escape(blanks[0])}"]`);
    if (first) first.focus();
    return;
  }
  const scored = scoreQuiz(quiz, responses, {
    lessonId: quiz.lessonId,
    mode: quizSession.mode,
    listened: quizSession.listened,
  });
  const attempt = { ...scored, id: crypto.randomUUID(), finishedAt: new Date().toISOString() };
  if (!state.storageBlocked) {
    state.progress = addAttempt(state.progress, attempt);
    save();
  }
  quizSession.result = attempt;
  render();
}

function speak(sectionId, button) {
  const quiz = findQuiz(quizSession.quizId);
  const section = quizSections(quiz).find((item) => item.id === sectionId);
  if (!section?.audioScript) return;
  if (!window.speechSynthesis) {
    const error = document.querySelector("#form-error");
    if (error) error.textContent = "这个浏览器不能合成语音。请改用文字稿模式，或到剑桥备考页听官方样卷。";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(section.audioScript);
  utterance.lang = "en-GB";
  utterance.rate = 0.92;
  button.disabled = true;
  utterance.onend = () => {
    button.disabled = false;
    quizSession.listened = true;
    const status = document.querySelector("#listen-status");
    if (status) status.textContent = "已播放过语音。交卷后可以对照解析。";
  };
  utterance.onerror = () => {
    button.disabled = false;
    const error = document.querySelector("#form-error");
    if (error) error.textContent = "语音播放失败。可以再试一次，或改用文字稿模式。";
  };
  window.speechSynthesis.speak(utterance);
}

function starterSpeak(text, rate) {
  if (!window.speechSynthesis) {
    const note = document.querySelector("#starter-record-note");
    if (note) note.textContent = "这个浏览器不能合成语音。请使用“听不了，显示文字”。";
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = Number(rate) || 0.9;
  utterance.onend = () => {
    if (starterRun) starterRun.listened = true;
  };
  window.speechSynthesis.speak(utterance);
  return true;
}

async function starterRecord() {
  const note = document.querySelector("#starter-record-note");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    if (note) note.textContent = "这台设备不能在网页里录音。请跟着播放的声音读，然后勾选自评。录音不会上传，因为根本没有开始。";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordStream = stream;
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recordStream = null;
      const audio = document.querySelector("#starter-playback");
      if (audio) {
        audio.hidden = false;
        audio.src = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      }
      if (note) note.textContent = "回放只在这台设备上。没有上传，也没有发音评分。";
    };
    recorder.start();
    if (note) note.textContent = "正在录音 4 秒……";
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 4000);
  } catch {
    if (note) note.textContent = "没有拿到麦克风权限。可以只跟读并勾选自评，不影响客观题分数。";
  }
}
  function startTimer(seconds = 60) {
  if (timerId) clearInterval(timerId);
  let left = Number(seconds) || 60;
  const readout = document.querySelector("#timer-readout");
  if (readout) readout.textContent = `剩余 ${left} 秒`;
  timerId = setInterval(() => {
    left -= 1;
    const node = document.querySelector("#timer-readout");
    if (!node) {
      clearInterval(timerId);
      return;
    }
    node.textContent = left > 0 ? `剩余 ${left} 秒` : "时间到。这不是分数。";
    if (left <= 0) clearInterval(timerId);
  }, 1000);
}

function openReset() {
  const layer = document.querySelector("#reset-layer");
  if (!layer) return;
  layer.hidden = false;
  document.querySelector("#reset-phrase")?.focus();
}

function closeReset() {
  const layer = document.querySelector("#reset-layer");
  if (layer) layer.hidden = true;
}

function performReset() {
  const phrase = document.querySelector("#reset-phrase")?.value || "";
  if (!resetConfirmed(phrase)) return;
  localStorage.removeItem(STORAGE_KEY);
  state.progress = emptyProgress();
  state.storageBlocked = false;
  state.loadError = "";
  state.importPreview = null;
  closeReset();
  render();
}

async function readImport(file) {
  const text = await file.text();
  const result = validateStored(text);
  state.importPreview = result.ok ? { progress: result.progress } : { error: result.error };
  render();
}

function confirmImport() {
  if (!state.importPreview?.progress) return;
  state.progress = state.importPreview.progress;
  state.storageBlocked = false;
  state.loadError = "";
  state.importPreview = null;
  save();
  render();
}

function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "toggle-complete") {
    if (state.storageBlocked) return;
    const lessonId = target.dataset.lesson;
    const complete = !state.progress.completedLessonIds.includes(lessonId);
    state.progress = markLessonComplete(state.progress, lessonId, complete);
    save();
    render();
  } else if (action === "choose-mode") {
    quizSession.mode = target.dataset.mode;
    quizSession.listened = false;
    quizSession.result = null;
    render();
  } else if (action === "listen-start") {
    const quiz = findQuiz(quizSession.quizId);
    const first = quizSections(quiz).find((section) => section.audioScript);
    quizSession.mode = "tts";
    quizSession.listened = false;
    quizSession.result = null;
    quizSession.pendingSpeak = first?.id || null;
    render();
  } else if (action === "speak") {
    speak(target.dataset.section, target);
  } else if (action === "submit-anyway") {
    quizSession.allowIncomplete = true;
    document.querySelector("#quiz-form")?.requestSubmit();
  } else if (action === "retry-quiz") {
    quizSession = null;
    location.hash = `#/quiz/${target.dataset.quiz}`;
    render();
  } else if (action === "start-timer") {
    startTimer(target.dataset.seconds || 60);
  } else if (action === "reveal-task") {
    if (taskSession) taskSession.revealed = true;
    render();
  } else if (action === "starter-speak") {
    const ok = starterSpeak(target.dataset.text || "", target.dataset.rate || "0.9");
    if (!ok) {
      const mainText = document.querySelector("#main");
      if (mainText && !document.querySelector("#tts-missing")) {
        mainText.insertAdjacentHTML("afterbegin", `<aside id="tts-missing" class="banner warn">这个浏览器不能朗读。听力题请点“听不了，显示文字”。那样做不记听力分。</aside>`);
      }
    }
  } else if (action === "starter-start") {
    starterRun.phase = "activity";
    starterRun.index = 0;
    starterRun.listened = false;
    saveStarterCursor(starterRun);
    render();
  } else if (action === "starter-transcript") {
    starterRun.usedTranscript = true;
    starterRun.listened = false;
    render();
  } else if (action === "starter-add") {
    starterRun.built = [...(starterRun.built || []), target.dataset.token];
    const built = document.querySelector("#starter-built");
    if (built) built.textContent = starterRun.built.join(" ");
  } else if (action === "starter-undo") {
    starterRun.built = (starterRun.built || []).slice(0, -1);
    const built = document.querySelector("#starter-built");
    if (built) built.textContent = starterRun.built.join(" ") || "按顺序点下面的词";
  } else if (action === "starter-submit") {
    submitStarterActivity();
  } else if (action === "starter-next") {
    advanceStarter();
  } else if (action === "starter-finish") {
    finishStarterLesson();
  } else if (action === "starter-record") {
    starterRecord();
  } else if (action === "export-progress") {
    const blob = new Blob([JSON.stringify(buildExport(state.progress), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pet-english-guide-progress.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } else if (action === "confirm-import") {
    confirmImport();
  } else if (action === "open-reset") {
    openReset();
  } else if (action === "close-reset") {
    closeReset();
  } else if (action === "perform-reset") {
    performReset();
  }
}

document.addEventListener("click", onClick);
document.addEventListener("submit", (event) => {
  if (event.target.id === "quiz-form") {
    event.preventDefault();
    submitQuiz(event.target);
  }
  if (event.target.id === "self-check") {
    event.preventDefault();
    submitSelfCheck(event.target);
  }
  if (event.target.id === "starter-review-form") {
    event.preventDefault();
    submitStarterReview(event.target);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "reset-phrase") {
    const button = document.querySelector("#reset-confirm");
    if (button) button.disabled = !resetConfirmed(event.target.value);
  }
  if (event.target.id === "task-draft") {
    const taskId = event.target.dataset.task;
    if (!taskId || state.storageBlocked) return;
    state.progress = saveDraft(state.progress, taskId, event.target.value);
    save();
    const count = document.querySelector("#word-count");
    const task = findTask(taskId);
    if (count && task) count.textContent = `当前 ${countWords(event.target.value)} 词，目标约 ${task.targetWords} 词。`;
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "import-file" && event.target.files[0]) readImport(event.target.files[0]);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReset();
});

function submitStarterActivity() {
  const lesson = starterLessonById(starterRun.lessonId);
  const activity = currentActivity(lesson);
  if (!activity) return;
  const ttsAvailable = typeof window.speechSynthesis !== "undefined";
  if ((activity.type === "hear-choose" || activity.type === "dictation") && ttsAvailable && !starterRun.listened && !starterRun.usedTranscript) {
    const host = document.querySelector("#main");
    if (host && !document.querySelector("#need-listen")) {
      host.insertAdjacentHTML("afterbegin", `<aside id="need-listen" class="banner warn">请先点播放。如果没有声音，点“听不了，显示文字”。看文字不算听力分。</aside>`);
    }
    return;
  }
  const input = {
    choice: document.querySelector("input[name='starter-choice']:checked")?.value || "",
    text: document.querySelector("#starter-answer")?.value || "",
    order: starterRun.built || [],
  };
  const result = gradeActivity(activity, input, {
    ttsAvailable,
    listened: starterRun.listened === true,
    usedTranscript: starterRun.usedTranscript === true || !ttsAvailable,
  });
  const record = {
    id: activity.id,
    objective: result.objective,
    correct: result.correct,
    countsAsListening: result.countsAsListening,
    selfAssessed: result.selfAssessed,
  };
  const existing = starterRun.results.find((item) => item.id === activity.id);
  if (existing && starterRun.retryMode) Object.assign(existing, record);
  else if (!starterRun.retryMode) starterRun.results.push(record);
  if (result.objective) rememberVocab(activity, result.correct);
  if (result.objective && !result.correct && !starterRun.retry.includes(activity.id)) starterRun.retry.push(activity.id);
  starterRun.feedback = { activity, result };
  starterRun.phase = "feedback";
  saveStarterCursor(starterRun);
  render();
}

function advanceStarter() {
  const lesson = starterLessonById(starterRun.lessonId);
  starterRun.listened = false;
  starterRun.usedTranscript = false;
  starterRun.built = [];
  starterRun.feedback = null;
  if (starterRun.retryMode) {
    starterRun.retry.shift();
    starterRun.phase = starterRun.retry.length ? "activity" : "summary";
  } else {
    starterRun.index += 1;
    if (starterRun.index >= lesson.activities.length) {
      starterRun.retryMode = starterRun.retry.length > 0;
      starterRun.phase = starterRun.retryMode ? "activity" : "summary";
    } else {
      starterRun.phase = "activity";
    }
  }
  saveStarterCursor(starterRun);
  render();
}

function finishStarterLesson() {
  const id = starterRun.lessonId;
  const completed = new Set(state.progress.starter.completedIds || []);
  completed.add(id);
  state.progress.starter.completedIds = [...completed];
  if (!(state.progress.starter.badges || []).includes(id)) {
    state.progress.starter.badges = [...(state.progress.starter.badges || []), id];
  }
  starterRun.phase = "summary";
  saveStarterCursor(starterRun);
  render();
}

function submitStarterReview(form) {
  const card = starterRun?.reviewCard;
  if (!card) return;
  const correct = normaliseAnswer(form.answer.value) === normaliseAnswer(card.en);
  const key = card.en.toLowerCase();
  state.progress.starter.vocab[key] = scheduleCard(state.progress.starter.vocab[key], correct);
  save();
  starterRun.reviewFeedback = { correct, expected: card.en };
  render();
}

function submitSelfCheck(form) {
  const task = findTask(taskSession?.id);
  if (!task || state.storageBlocked) return;
  const checked = new Set([...form.querySelectorAll("input[name='rubric']:checked")].map((item) => item.value));
  const details = (task.rubric || []).map((item) => ({
    id: item.id,
    prompt: item.text,
    response: checked.has(item.id) ? "yes" : "no",
    responseLabel: checked.has(item.id) ? "已勾选" : "未勾选",
    correct: checked.has(item.id),
    expectedLabel: "自评项",
    explanation: item.hint || "",
  }));
  const draft = state.progress.drafts?.[task.id] || "";
  const attempt = {
    id: crypto.randomUUID(),
    quizId: task.id,
    lessonId: task.lessonId,
    title: task.title,
    finishedAt: new Date().toISOString(),
    unofficial: true,
    kind: "self-check",
    mode: "standard",
    countsAsListening: false,
    selfAssessed: true,
    responseText: draft,
    score: details.filter((item) => item.correct).length,
    total: details.length,
    details,
  };
  state.progress = addAttempt(state.progress, attempt);
  save();
  taskSession.saved = true;
  taskSession.revealed = true;
  render();
}

async function init() {
  try {
    const [courseResponse, quizResponse, taskResponse] = await Promise.all([
      fetch(asset("data/course.json")),
      fetch(asset("data/quizzes.json")),
      fetch(asset("data/tasks.json")),
    ]);
    if (!courseResponse.ok || !quizResponse.ok || !taskResponse.ok) throw new Error("课程文件没有加载成功");
    state.course = await courseResponse.json();
    const quizFile = await quizResponse.json();
    state.quizzes = new Map(quizFile.quizzes.map((quiz) => [quiz.id, quiz]));
    const taskFile = await taskResponse.json();
    state.tasks = new Map(taskFile.tasks.map((task) => [task.id, task]));
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const result = validateStored(raw);
      if (!result.ok) {
        state.storageBlocked = true;
        state.loadError = result.error;
      } else {
        state.progress = result.progress;
      }
    }
  } catch (error) {
    main.innerHTML = `<aside class="banner warn"><strong>课程没有加载。</strong> ${escapeHtml(error.message)}。请在仓库目录运行本地服务器后打开本页，或通过 GitHub Pages 访问。直接双击 index.html 时，浏览器会拦截这些文件。</aside>`;
    return;
  }
  window.addEventListener("hashchange", render);
  render();
}

init();
