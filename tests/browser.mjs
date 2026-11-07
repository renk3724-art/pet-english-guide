import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const port = 8765;
const root = await mkdtemp(path.join(tmpdir(), "pet-pages-"));
const site = path.join(root, "pet-english-guide");
await new Promise((resolve, reject) => {
  const link = spawn("ln", ["-s", "/workspace", site]);
  link.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("link failed"))));
});

const server = spawn("python3", ["-m", "http.server", String(port), "--directory", root], {
  stdio: "ignore",
});
await new Promise((resolve) => setTimeout(resolve, 400));
const base = `http://127.0.0.1:${port}/pet-english-guide/`;

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base);
  await page.getByRole("heading", { name: "准备 B1 Preliminary" }).waitFor();
  assert.ok((await overflow(page)) <= 1, "desktop overflow");
  await page.locator(".lesson-list").getByRole("link", { name: "1. 考试概览" }).click();
  await page.getByRole("heading", { name: "考试概览" }).waitFor();
  assert.match(await page.locator("article").innerText(), /45 分钟/);
  await page.getByRole("link", { name: "做本课练习" }).first().click();
  await page.getByRole("heading", { name: "考试概览小测" }).waitFor();
  const answers = { ov1: "B", ov2: "A", ov3: "B", ov4: "A", ov5: "B", ov6: "B" };
  for (const [name, value] of Object.entries(answers)) {
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
  }
  await page.locator("#quiz-form button[type='submit']").click();
  await page.getByText("5 / 6").waitFor();
  assert.match(await page.locator("main").innerText(), /140–152 是 Grade C/);
  await page.getByRole("button", { name: "标记本课完成" }).click();
  await page.getByRole("button", { name: "取消完成标记" }).waitFor();
  await page.goto(`${base}#/review`);
  await page.reload();
  await page.getByText("5 / 6").waitFor();

  await page.goto(`${base}#/`);
  await page.getByText("已保存 1 次练习").waitFor();
  await page.getByText("1 / 9").waitFor();
  await page.goto(`${base}#/wrong`);
  assert.match(await page.locator("main").innerText(), /Grade C 对应哪一段分数/);

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${base}#/`);
  await page.getByRole("heading", { name: "准备 B1 Preliminary" }).waitFor();
  assert.ok((await overflow(page)) <= 1, "mobile overflow");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}#/quiz/listening`);
  assert.match(await page.locator("main").innerText(), /浏览器语音合成不是剑桥录音/);
  await page.getByRole("button", { name: "改用文字稿（不记为听力）" }).click();
  await page.locator('input[name="l1a"][value="B"]').check();
  await page.locator('input[name="l2a"]').fill("station entrance");
  await page.locator('input[name="l2b"]').fill("9:30");
  await page.locator('input[name="l2c"]').fill("library");
  await page.locator('input[name="l3a"][value="B"]').check();
  await page.locator('input[name="l3b"][value="B"]').check();
  await page.locator("#quiz-form button[type='submit']").click();
  assert.match(await page.locator("main").innerText(), /不记为听力成绩/);
  assert.match(await page.locator("main").innerText(), /6 \/ 6/);

  await page.goto(`${base}#/progress`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出进度 JSON" }).click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.format, "pet-english-guide-progress");
  assert.equal(exported.version, 1);
  assert.ok(exported.data.completedLessonIds.includes("overview"));

  await page.getByRole("button", { name: "清除本浏览器的进度" }).click();
  await page.locator("#reset-phrase").fill("先不要删");
  assert.equal(await page.locator("#reset-confirm").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => localStorage.getItem("pet-english-guide-progress-v1") !== null), true);

  await page.getByRole("button", { name: "清除本浏览器的进度" }).click();
  await page.locator("#reset-phrase").fill("清除进度");
  await page.locator("#reset-confirm").click();
  await page.getByText("已完成 0 课").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("pet-english-guide-progress-v1")), null);

  await page.locator("#import-file").setInputFiles({
    name: "progress.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await page.getByRole("button", { name: "确认覆盖并导入" }).click();
  await page.getByText("已完成 1 课").waitFor();
  await page.goto(`${base}#/`);
  await page.getByText("继续上次的课").waitFor();

  await page.goto(`${base}#/progress`);
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  assert.match(await page.locator("main").innerText(), /不是有效的 JSON/);
  assert.match(await page.locator("main").innerText(), /没有覆盖现有进度/);
  await page.goto(`${base}#/`);
  await page.getByText("已保存 2 次练习").waitFor();

  await page.goto(`${base}#/`);
  await page.goto(`${base}#/quiz/listening`);
  await page.reload();
  await page.getByRole("button", { name: "播放语音练习（记为非正式听力）" }).click();
  const ttsText = await page.locator("main").innerText();
  assert.match(ttsText, /播放这一段（浏览器合成语音）/);
  assert.equal(ttsText.includes("Welcome to the Saturday photography walk"), false);
  assert.match(ttsText, /剑桥备考页/);

  const asset = await page.request.get(`${base}data/course.json`);
  assert.equal(asset.status(), 200);
  const style = await page.request.get(`${base}css/styles.css`);
  assert.equal(style.status(), 200);
  console.log("browser checks passed");
} finally {
  await browser.close();
  server.kill();
  await rm(root, { recursive: true, force: true });
}
