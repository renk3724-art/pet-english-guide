import {
  STORAGE_KEY,
  RESET_PHRASE,
  addAttempt,
  blankQuestionIds,
  buildExport,
  emptyProgress,
  flattenQuestions,
  lessonStatus,
  markLessonComplete,
  quizSections,
  resetConfirmed,
  scoreQuiz,
  touchLesson,
  validateImport,
  wrongItems,
} from "./logic.mjs";
import { escapeHtml, renderMarkdown } from "./markdown.mjs";

const OFFICIAL_LISTENING = "https://www.cambridgeenglish.org/exams-and-tests/qualifications/preliminary/preparation/";

const state = {
  course: null,
  quizzes: new Map(),
  progress: emptyProgress(),
  storageBlocked: false,
  loadError: "",
  importPreview: null,
  lessonCache: new Map(),
};

let quizSession = null;
let timerId = null;

const main = document.querySelector("#main");

function asset(path) {
  return new URL(path, document.baseURI).href;
}

function lessonIds() {
  return state.course.lessons.map((lesson) => lesson.id);
}

function quizIds() {
  return [...state.quizzes.keys()];
}

function findLesson(id) {
  return state.course.lessons.find((lesson) => lesson.id === id) || null;
}

function findQuiz(id) {
  return state.quizzes.get(id) || null;
}

function save() {
  if (state.storageBlocked) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildExport(state.progress)));
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
  const done = state.progress.completedLessonIds.length;
  const total = state.course.lessons.length;
  const last = findLesson(state.progress.lastLessonId);
  const resume = last
    ? `<a class="button" href="#/lesson/${last.id}">继续上次的课：${escapeHtml(last.title)}</a>`
    : `<a class="button" href="#/lesson/overview">从考试概览开始</a>`;
  const rows = state.course.lessons.map((lesson, index) => {
    const status = lessonStatus(state.progress, lesson.id);
    return `<li class="lesson-row">
      <span class="status ${status}">${statusLabel(status)}</span>
      <div>
        <a href="#/lesson/${lesson.id}">${index + 1}. ${escapeHtml(lesson.title)}</a>
        <p class="muted">${escapeHtml(lesson.summary)} 约 ${lesson.minutes} 分钟阅读。</p>
      </div>
      ${lesson.quizId ? `<a class="text-link" href="#/quiz/${lesson.quizId}">练习</a>` : "<span></span>"}
    </li>`;
  }).join("");
  const downloads = state.course.lessons.map((lesson) =>
    `<li><a href="${escapeHtml(asset(lesson.file))}">${escapeHtml(lesson.title)}</a></li>`).join("");
  return `<section class="hero">
    <div>
      <p class="kicker">打开即可学习</p>
      <h1>准备 B1 Preliminary</h1>
      <p class="lead">给大约 A2、正在走向 B1 的中文学习者。先读教程，再做自编练习。进度记在这个浏览器里。</p>
      <div class="actions">${resume}<a class="button-secondary" href="#/progress">管理进度</a></div>
    </div>
    <aside class="card">
      <p class="kicker">本机进度</p>
      <p><strong>${done} / ${total}</strong> 课已标记完成</p>
      <p class="muted">${escapeHtml(state.course.storageNote)}</p>
      <p class="muted">已保存 ${state.progress.attempts.length} 次练习。</p>
    </aside>
  </section>
  ${state.loadError ? `<aside class="banner warn"><strong>本地进度无法读取。</strong> ${escapeHtml(state.loadError)} 旧数据还留在浏览器里，没有被空进度覆盖。请到进度页确认后再清除。</aside>` : ""}
  <h2>课程</h2>
  <ol class="lesson-list">${rows}</ol>
  <h2>下载 Markdown 原文</h2>
  <ul>${downloads}
    <li><a href="${escapeHtml(asset("tutorial/08-practice.md"))}">自编练习卷</a></li>
    <li><a href="${escapeHtml(asset("tutorial/09-answer-keys.md"))}">参考答案与解析</a></li>
  </ul>`;
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
    state.progress = touchLesson(state.progress, lesson.id);
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
    const mark = detail.correct ? "正确" : "错误";
    return `<article class="result-item ${detail.correct ? "correct" : "wrong"}">
      <p class="mark ${detail.correct ? "correct" : "wrong"}">${mark}</p>
      <p>${escapeHtml(detail.prompt)}</p>
      <p>你的答案：${escapeHtml(detail.responseLabel || detail.response || "（未作答）")}</p>
      <p>参考答案：${escapeHtml(detail.expectedLabel)}</p>
      <p>${escapeHtml(detail.explanation)}</p>
    </article>`;
  }).join("");
  return `<div aria-live="polite">
    <aside class="banner ${attempt.score === attempt.total ? "ok" : "warn"}">
      <strong>${attempt.score} / ${attempt.total}</strong>
      <p>${escapeHtml(listeningNote)}</p>
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
  if (lesson && !state.storageBlocked && state.progress.lastLessonId !== lesson.id) {
    state.progress = touchLesson(state.progress, lesson.id);
    save();
  }
  let body = "";
  if (quizSession.result) {
    body = resultsBody(quizSession.result);
  } else if (quiz.kind === "listening-tts" && !quizSession.mode) {
    body = `<div class="actions">
      <button type="button" class="primary" data-action="choose-mode" data-mode="tts">播放语音练习（记为非正式听力）</button>
      <button type="button" class="secondary" data-action="choose-mode" data-mode="transcript-support">改用文字稿（不记为听力）</button>
    </div>`;
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

function viewReview() {
  const attempts = [...state.progress.attempts].reverse();
  if (!attempts.length) return `<h1>练习记录</h1><p>还没有提交过练习。</p>`;
  const items = attempts.map((attempt) => {
    const flag = attempt.kind === "listening-tts" ? (attempt.countsAsListening ? "非正式听力" : "文字稿支持，非听力分") : "知识练习";
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
  else if (route.name === "lesson") html = await viewLesson(route.id);
  else if (route.name === "quiz") html = viewQuiz(route.id);
  else if (route.name === "review") html = viewReview();
  else if (route.name === "attempt") html = viewAttempt(route.id);
  else if (route.name === "wrong") html = viewWrong();
  else if (route.name === "progress") html = viewProgress();
  else html = `<h1>页面不存在</h1><p><a href="#/">回到课程</a></p>`;
  main.innerHTML = html;
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

function startTimer() {
  if (timerId) clearInterval(timerId);
  let left = 60;
  const readout = document.querySelector("#timer-readout");
  if (readout) readout.textContent = "剩余 60 秒";
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
  const result = validateImport(text, lessonIds(), quizIds());
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
    startTimer();
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
});
document.addEventListener("input", (event) => {
  if (event.target.id === "reset-phrase") {
    const button = document.querySelector("#reset-confirm");
    if (button) button.disabled = !resetConfirmed(event.target.value);
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "import-file" && event.target.files[0]) readImport(event.target.files[0]);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReset();
});

async function init() {
  try {
    const [courseResponse, quizResponse] = await Promise.all([
      fetch(asset("data/course.json")),
      fetch(asset("data/quizzes.json")),
    ]);
    if (!courseResponse.ok || !quizResponse.ok) throw new Error("课程文件没有加载成功");
    state.course = await courseResponse.json();
    const quizFile = await quizResponse.json();
    state.quizzes = new Map(quizFile.quizzes.map((quiz) => [quiz.id, quiz]));
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const result = validateImport(raw, lessonIds(), quizIds());
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
