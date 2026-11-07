import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const port = 8773;
const root = await mkdtemp(path.join(tmpdir(), "pet-pages-"));
await new Promise((resolve, reject) => {
  const link = spawn("ln", ["-s", "/workspace", path.join(root, "pet-english-guide")]);
  link.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("link failed"))));
});
const server = spawn("python3", ["-m", "http.server", String(port), "--directory", root], { stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 300));
const base = `http://127.0.0.1:${port}/pet-english-guide/`;

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: "networkidle" });
  const start = page.locator("#main").getByRole("link", { name: "从零开始" });
  await start.waitFor();
  const box = await start.boundingBox();
  assert.ok(box && box.y < 700);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await page.getByRole("link", { name: "继续学习" }).waitFor();

  await start.click();
  await page.getByRole("link", { name: /字母名字 A 到 E/ }).click();
  await page.getByRole("button", { name: "播放" }).first().waitFor();
  await page.getByRole("button", { name: "我学过了，开始做题" }).click();
  await page.getByRole("button", { name: "听不了，显示文字（这题不记听力）" }).click();
  await page.locator("input[value='A']").check();
  await page.getByRole("button", { name: "看答案" }).click();
  await page.getByText("听到的是字母 A 的名字").waitFor();
  await page.getByRole("button", { name: "下一题" }).click();
  await page.reload();
  await page.getByText("再听一个字母名字").waitFor();

  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await page.screenshot({ path: "/opt/cursor/artifacts/iphone-starter-activity.png" });

  const legacy = {
    format: "pet-english-guide-progress",
    version: 1,
    exportedAt: "2026-11-07T00:00:00.000Z",
    data: { completedLessonIds: ["reading"], lastLessonId: "reading", attempts: [] },
  };
  await page.evaluate((payload) => localStorage.setItem("pet-english-guide-progress-v1", payload), JSON.stringify(legacy));
  await page.goto(`${base}#/`);
  await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pet-english-guide-progress-v1")));
  assert.deepEqual(stored.data.completedLessonIds, ["reading"]);
  await page.locator("#main").getByRole("link", { name: "从零开始" }).waitFor();
  await page.goto(`${base}#/task/writing-email`);
  await page.locator("#task-draft").waitFor();
  console.log("browser checks passed");
} finally {
  await browser.close();
  server.kill();
  await rm(root, { recursive: true, force: true });
}
