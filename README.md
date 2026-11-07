# pet-english-guide

面向零基础中文使用者的英语起步课，以及已经有基础之后的剑桥英语 **B1 Preliminary**（旧称 PET）进阶练习。打开网页先看到 **从零开始** 和 **继续学习**。零基础课先讲解，再做听、选、写和跟读。进度仍只保存在这个浏览器，文件版本仍是 1。没有 `starter` 字段的旧进度可以继续导入，原有 PET 记录不会被清掉。

教程 Markdown 在 [`tutorial/`](tutorial/) ，可以单独下载阅读。交互练习、进度和错题复习在静态网页里。

## 本地打开

在仓库根目录运行：

```bash
python3 -m http.server 8080
```

然后打开 `http://127.0.0.1:8080/` 。不要直接双击 `index.html`。浏览器会拦截 `file://` 对课程文件的读取。

页面使用相对路径和 `#/` 路由，因此放在 GitHub Pages 的仓库子路径下也可以打开，例如 `https://<用户名>.github.io/pet-english-guide/`。不需要构建步骤，也没有必须安装的依赖。

检查课程数据、评分和导入校验：

```bash
node --test tests/logic.test.mjs
```

## 进度存在哪里

进度写在这个浏览器的 `localStorage` 里，键名是 `pet-english-guide-progress-v1`。没有账号，也不会同步到手机、另一台电脑或另一个浏览器。

进度页可以导出、导入版本 1 的 JSON。导入时会检查文件格式、课程编号和分数是否与作答明细一致。清除进度前必须输入 `清除进度`。取消或输入其他文字不会删除记录。

## 练习的性质

学习站和 [`tutorial/08-practice.md`](tutorial/08-practice.md) 里的题目都是**非正式自编练习**，不是剑桥真题、官方样卷或过去试卷。参考答案在 [`tutorial/09-answer-keys.md`](tutorial/09-answer-keys.md)。

听力练习用浏览器语音合成朗读自编稿。它不是官方录音。只有点击播放后提交，才记为非正式听力练习。改用文字稿时，成绩会保存，但标明不记为听力。官方录音在剑桥备考页。

## 课程

1. [考试概览](tutorial/01-overview.md)
2. [阅读](tutorial/02-reading.md)
3. [写作](tutorial/03-writing.md)
4. [听力](tutorial/04-listening.md)
5. [口语](tutorial/05-speaking.md)
6. [语法与词汇](tutorial/06-grammar-vocabulary.md)
7. [八周示例计划](tutorial/07-study-plan.md)（示例，不是官方课表）
8. [综合自测](tutorial/08-practice-intro.md)
9. [官方资源与核对说明](tutorial/10-resources.md)

八周计划假设每周大约 8 小时，可以按自己的时间改。考试形式、分数和样卷入口以 [官方资源](tutorial/10-resources.md) 所列页面为准。核对日期是 2026-11-07。

## GitHub Pages

仓库里的 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会在推送到 `main` 时，用 GitHub Actions 发布当前静态文件。它**还没有部署成功**。2026-11-07 查询本仓库的 Pages 站点得到 404，说明 Pages 尚未创建；`https://renk3724-art.github.io/pet-english-guide/` 同样返回 404。

还需要仓库管理员做的设置（本代理没有修改仓库设置）：

1. 把本分支合并进 `main`。工作流程文件只监听 `main`。
2. 打开 GitHub 仓库的 Settings → Pages。
3. Build and deployment 的 Source 选 **GitHub Actions**。
4. 等 Actions 里的 Deploy GitHub Pages 成功。成功后的网址显示在那次部署和 Pages 设置里。

在这一步完成之前，没有可以放进桌面快捷方式的正式网址。快捷方式要在你自己的电脑上创建，指向 Pages 设置里显示的地址：

- Windows：桌面右键 → 新建 → 快捷方式。
- macOS：用浏览器打开后，把地址拖到桌面，或制作包含该网址的 `.webloc`。
- Linux：创建一个 `Type=Link` 的 `.desktop` 文件，`URL=` 填 Pages 给出的地址。

不要把尚未开通的地址写成已经可以学习的网站。
