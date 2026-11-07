import { readFile, writeFile } from "node:fs/promises";
import { flattenQuestions } from "../js/logic.mjs";

const quizzes = JSON.parse(await readFile(new URL("../data/quizzes.json", import.meta.url), "utf8"));

function optionLines(question) {
  if (question.type !== "single") return "";
  return question.options.map((option) => `   - ${option.id}. ${option.text}`).join("\n");
}

function questionBlock(question, index) {
  const lines = [`${index}. ${question.prompt}`];
  const options = optionLines(question);
  if (options) lines.push(options);
  if (question.type === "text") lines.push("   - 请写答案：____________");
  return lines.join("\n");
}

const paper = [];
paper.push("# 自编练习卷");
paper.push("");
paper.push("> **非正式练习。** 这些题目是为本教程原创的，不是剑桥英语真题、官方样卷或过去试卷。不要把分数换成 Cambridge English Scale 分数。");
paper.push("");
paper.push("听力各段附有文字稿，供无法播放时对照。只阅读文字稿不能当作听力成绩。语音请在学习站里用标明为浏览器合成的按钮播放，或使用[官方备考页](https://www.cambridgeenglish.org/exams-and-tests/qualifications/preliminary/preparation/)的样卷录音。");
paper.push("");
paper.push("解析在 [09-answer-keys.md](09-answer-keys.md)。");
paper.push("");

const keys = [];
keys.push("# 参考答案与解析");
keys.push("");
keys.push("> 答案属于上一份**非正式自编练习**，不是官方评分标准。建议先做完 [08-practice.md](08-practice.md) 再打开本页。");
keys.push("");

for (const quiz of quizzes.quizzes) {
  paper.push(`## ${quiz.title}`);
  paper.push("");
  keys.push(`## ${quiz.title}`);
  keys.push("");
  let number = 1;
  for (const section of quiz.sections) {
    paper.push(`### ${section.title}`);
    paper.push("");
    keys.push(`### ${section.title}`);
    keys.push("");
    if (section.intro) {
      paper.push(section.intro);
      paper.push("");
    }
    if (section.text) {
      paper.push(section.text);
      paper.push("");
    }
    if (section.audioScript) {
      paper.push("文字稿（阅读支持，不是听力评估）：");
      paper.push("");
      paper.push(`> ${section.audioScript}`);
      paper.push("");
    }
    for (const question of section.questions || []) {
      paper.push(questionBlock(question, number));
      paper.push("");
      const answer = question.type === "single"
        ? `${question.answer}. ${(question.options.find((option) => option.id === question.answer) || {}).text || ""}`
        : (question.accept || []).join(" / ");
      keys.push(`${number}. **${answer}**`);
      keys.push("");
      keys.push(question.explanation);
      keys.push("");
      number += 1;
    }
  }
}

paper.push("回到[综合自测说明](08-practice-intro.md)。");
paper.push("");
keys.push("回到[综合自测说明](08-practice-intro.md)。");
keys.push("");

await writeFile(new URL("../tutorial/08-practice.md", import.meta.url), paper.join("\n"));
await writeFile(new URL("../tutorial/09-answer-keys.md", import.meta.url), keys.join("\n"));

const count = quizzes.quizzes.reduce((sum, quiz) => sum + flattenQuestions(quiz).length, 0);
console.log(`Wrote practice pages with ${count} questions.`);
