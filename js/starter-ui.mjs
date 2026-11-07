import { escapeHtml } from "./markdown.mjs";
import { dueCards, isLessonUnlocked, nextLessonId } from "./starter.mjs";

export function starterPathHtml(course, starter) {
  const done = new Set(starter.completedIds || []);
  const due = dueCards(starter.vocab).length;
  const cards = course.lessons.map((lesson, index) => {
    const unlocked = isLessonUnlocked(course.lessons, starter.completedIds, lesson.id);
    const status = done.has(lesson.id) ? "已完成" : unlocked ? "可以学" : "先学上一课";
    const href = unlocked ? `#/starter/${lesson.id}` : "#/starter";
    return `<a class="practice-card ${unlocked ? "" : "locked"}" href="${href}"><strong>${index + 1}. ${escapeHtml(lesson.title)}</strong><span>${escapeHtml(lesson.stage)} · ${status}</span></a>`;
  }).join("");
  return `<p class="kicker">零基础 · 先学再测</p>
    <h1>从零开始</h1>
    <p>顺序是：字母名字、一个读音对比、问候、名字、数字、名词、短语、简单句，最后混合。合成语音只是参考。口语只跟读，不打分。</p>
    <p><a class="button" href="#/starter-review">到期复习（${due}）</a></p>
    <div class="practice-grid">${cards}</div>
    <aside class="banner unofficial">${escapeHtml(course.upcoming)}</aside>`;
}

export function teachHtml(lesson) {
  const cards = lesson.teach.map((item) => `<article class="card teach-card">
      <p class="kicker">${escapeHtml(item.zh)}</p>
      <p class="big-en">${escapeHtml(item.en)}</p>
      ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
      <div class="actions">
        <button type="button" class="primary" data-action="starter-speak" data-text="${escapeHtml(item.speak)}" data-rate="0.9">播放</button>
        <button type="button" class="secondary" data-action="starter-speak" data-text="${escapeHtml(item.speak)}" data-rate="0.65">慢速</button>
      </div>
    </article>`).join("");
  return `<p class="kicker">${escapeHtml(lesson.stage)}</p>
    <h1>${escapeHtml(lesson.title)}</h1>
    <p>${escapeHtml(lesson.intro)}</p>
    <p class="muted">播放使用浏览器合成语音，不是老师录音。点了才播放。</p>
    ${cards}
    <button type="button" class="primary large" data-action="starter-start">我学过了，开始做题</button>`;
}

function activityBody(activity, run) {
  const play = activity.speak || activity.model
    ? `<div class="actions">
        <button type="button" class="primary" data-action="starter-speak" data-text="${escapeHtml(activity.speak || activity.model)}" data-rate="0.9">播放</button>
        <button type="button" class="secondary" data-action="starter-speak" data-text="${escapeHtml(activity.speak || activity.model)}" data-rate="0.65">慢速</button>
        <button type="button" class="secondary" data-action="starter-speak" data-text="${escapeHtml(activity.speak || activity.model)}" data-rate="0.9">再听一次</button>
      </div>`
    : "";
  const transcript = activity.type === "hear-choose" || activity.type === "dictation"
    ? `<button type="button" class="secondary" data-action="starter-transcript">听不了，显示文字（这题不记听力）</button>
       ${run.usedTranscript ? `<p class="stimulus">${escapeHtml(activity.speak)}</p>` : ""}`
    : "";
  let controls = "";
  if (activity.type === "hear-choose" || activity.type === "choose") {
    controls = activity.options.map((option) => `<label class="choice-label"><input type="radio" name="starter-choice" value="${escapeHtml(option.id)}"> <span>${escapeHtml(option.text)}</span></label>`).join("");
  } else if (activity.type === "type" || activity.type === "produce" || activity.type === "dictation") {
    controls = `<label for="starter-answer">英文<input id="starter-answer" autocomplete="off" autocapitalize="off"></label>`;
  } else if (activity.type === "order") {
    const pool = run.pool || activity.tokens;
    controls = `<p id="starter-built" class="stimulus">${escapeHtml((run.built || []).join(" ") || "按顺序点下面的词")}</p>
      <div class="actions">${pool.map((token) => `<button type="button" class="secondary" data-action="starter-add" data-token="${escapeHtml(token)}">${escapeHtml(token)}</button>`).join("")}
      <button type="button" class="secondary" data-action="starter-undo">撤销</button></div>`;
  } else if (activity.type === "speak") {
    controls = `<p>先播放例句，再跟着读。可选录音只留在这台设备里，不上传，也不做语音识别，所以没有发音分。</p>
      <button type="button" class="secondary" data-action="starter-record">录音并回放（需点允许麦克风）</button>
      <p id="starter-record-note"></p>
      <audio id="starter-playback" controls hidden></audio>
      <label class="choice-label"><input id="starter-spoke" type="checkbox"> <span>我跟着读过了（自评）</span></label>`;
  }
  return `${play}${transcript}<div class="choice-grid">${controls}</div>
    <button type="button" class="primary large" data-action="starter-submit">看答案</button>`;
}

export function activityHtml(lesson, activity, run, number, total) {
  return `<p class="kicker">${escapeHtml(lesson.title)} · ${number} / ${total}${run.retryMode ? " · 错题再做" : ""}</p>
    <h1>${escapeHtml(activity.prompt)}</h1>
    <p class="muted">${activity.selfAssessed || activity.type === "speak" ? "这一题是口语自评。" : "先做完再看解析。"}</p>
    ${activityBody(activity, run)}`;
}

export function feedbackHtml(activity, result) {
  const title = result.selfAssessed ? "这是自评" : result.correct ? "做对了" : "再看一次";
  return `<h1>${title}</h1>
    <p>${escapeHtml(result.explanation || "")}</p>
    ${result.objective ? `<p>参考答案：${escapeHtml(result.expectedLabel)}</p>` : "<p>没有发音分数。</p>"}
    ${result.objective && (activity.type === "hear-choose" || activity.type === "dictation") && !result.countsAsListening ? "<p>这题没有记成听力分，因为没有用合成语音听完，或改成了看文字。</p>" : ""}
    <button type="button" class="primary large" data-action="starter-next">下一题</button>`;
}

export function summaryHtml(lesson, results, nextId, completed) {
  const objective = results.filter((item) => item.objective);
  const correct = objective.filter((item) => item.correct).length;
  const listening = results.filter((item) => item.countsAsListening).length;
  return `<h1>${escapeHtml(lesson.title)}做完了</h1>
    <p>客观题 ${correct} / ${objective.length}。口语自评不计入这个分数。</p>
    <p>记成听力的题：${listening}。看文字完成的听写或听辨，不算听力分。</p>
    <p>答对的词会在 1 天后、然后是 3 天、7 天、14 天再出现。答错的词可以马上在复习里再做。这是固定间隔，不是智能预测。</p>
    ${completed ? `<p>这课已记下完成。</p><a class="button large" href="${nextId ? `#/starter/${nextId}` : "#/starter"}">${nextId ? "下一课" : "返回课程列表"}</a>` : `<button type="button" class="primary large" data-action="starter-finish">完成本课并解锁下一课</button>`}`;
}

export function reviewHtml(cards) {
  if (!cards.length) {
    return `<h1>到期复习</h1><p>现在没有到时间的词。答对的词会在 1、3、7、14 天后回来。答错的词会立刻出现在这里。</p><a class="button" href="#/starter">返回从零开始</a>`;
  }
  const card = cards[0];
  return `<h1>到期复习</h1>
    <p>还剩 ${cards.length} 个。写出英文。大小写不限。</p>
    <p class="big-en">${escapeHtml(card.zh)}</p>
    <form id="starter-review-form">
      <label>英文<input id="starter-answer" name="answer" autocomplete="off" autocapitalize="off"></label>
      <button type="submit" class="primary large">提交</button>
    </form>
    <p class="muted">间隔：错了马上再练；对了依次隔 1、3、7、14 天。</p>`;
}

export function lessonLink(lessons, id) {
  return nextLessonId(lessons, id);
}
