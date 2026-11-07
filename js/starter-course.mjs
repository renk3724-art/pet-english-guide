function card(id, en, zh, speak = en, note = "") {
  return { id, en, zh, speak, review: true, note };
}

function hear(id, prompt, speak, options, answer, explanation) {
  return {
    id, type: "hear-choose", prompt, speak,
    options: options.map((text) => ({ id: text, text })),
    answer, explanation, skill: "listening",
  };
}

function choose(id, prompt, options, answer, explanation) {
  return {
    id, type: "choose", prompt,
    options: options.map((text) => ({ id: text, text })),
    answer, explanation, skill: "reading",
  };
}

function type(id, prompt, accept, explanation, skill = "writing") {
  return { id, type: "type", prompt, accept, explanation, skill };
}

function produce(id, prompt, accept, explanation) {
  return { id, type: "produce", prompt, accept, explanation, skill: "writing" };
}

function order(id, prompt, answer, explanation) {
  return { id, type: "order", prompt, answer, tokens: [...answer], explanation, skill: "writing" };
}

function dictation(id, prompt, speak, accept, explanation) {
  return { id, type: "dictation", prompt, speak, accept, explanation, skill: "listening" };
}

function speak(id, prompt, model, explanation) {
  return { id, type: "speak", prompt, model, explanation, skill: "speaking", selfAssessed: true };
}

function letterLesson(id, title, letters) {
  const shown = letters.join("、");
  return {
    id,
    title,
    stage: "字母",
    intro: `先看 ${shown} 的字母名字，再做题。字母名字是人们称呼这个字母时的读法，不是它在所有单词里的发音。不要把某一个中文音当成永远的规则。`,
    teach: letters.map((letter) => card(`letter-${letter}`, letter, `字母 ${letter} 的名字`, letter, "只记名字。")),
    activities: [
      hear(`${id}-h1`, "先播放，再选出你听到的字母。", letters[0], letters, letters[0], `听到的是字母 ${letters[0]} 的名字。`),
      hear(`${id}-h2`, "再听一个字母名字。", letters[letters.length - 1], letters, letters[letters.length - 1], `这是字母 ${letters[letters.length - 1]} 的名字。`),
      choose(`${id}-c1`, `哪一个是字母 ${letters[1]}？`, letters, letters[1], "看形状，不要只凭声音猜。"),
      type(`${id}-t1`, `请输入字母 ${letters[2]}。大小写都可以。`, [letters[2], letters[2].toLowerCase()], "这一题看中文说明来写，不依赖听力。"),
      produce(`${id}-p1`, `写出字母 ${letters[0]}。`, [letters[0], letters[0].toLowerCase()], `答案是 ${letters[0]}。`),
      choose(`${id}-c2`, "这些是字母名字，还是单词里的发音规则？", ["字母名字", "永远不变的发音"], "字母名字", "这里学的是名字。同一个字母在不同单词里可以有不同的音。"),
      speak(`${id}-s1`, "播放后跟着读这些字母的名字。读完自己打勾。页面不给发音分。", letters.join(", "), "跟读只看你有没有练，不判断读得对不对。"),
    ],
  };
}

export const starterCourse = {
  title: "从零开始",
  upcoming: "这 16 课只到字母名字、少量读音对比、问候、数字、日常名词和简单句。更长的对话、时态变化和 B1 Preliminary 考试练习不在这里，它们在进阶课程。后面没有用空课冒充已完成的内容。",
  lessons: [
    letterLesson("s01", "字母名字 A 到 E", ["A", "B", "C", "D", "E"]),
    letterLesson("s02", "字母名字 F 到 J", ["F", "G", "H", "I", "J"]),
    letterLesson("s03", "字母名字 K 到 O", ["K", "L", "M", "N", "O"]),
    letterLesson("s04", "字母名字 P 到 T", ["P", "Q", "R", "S", "T"]),
    letterLesson("s05", "字母名字 U 到 Z", ["U", "V", "W", "X", "Y", "Z"]),
    {
      id: "s06",
      title: "字母名和单词里的音",
      stage: "读音",
      intro: "字母 A 的名字，和 ape 开头的音很接近。cat 里的 a 不是这个名字。这里只比较这两个例子，不告诉你“A 永远读某个音”。合成语音只能作参考。",
      teach: [
        card("name-a", "A", "字母 A 的名字", "A", "字母歌里的叫法。"),
        card("word-ape", "ape", "猿。开头的音接近字母 A 的名字。", "ape"),
        card("word-cat", "cat", "猫。这里的 a 和字母名 A 不同。", "cat"),
      ],
      activities: [
        hear("s06-h1", "播放后选择：你听到的是字母名，还是单词 cat？", "A", ["字母名 A", "单词 cat"], "字母名 A", "字母名 A 听起来像字母歌，不像 cat。"),
        hear("s06-h2", "再听一个。", "cat", ["字母名 A", "单词 cat", "单词 ape"], "单词 cat", "cat 的元音和字母名 A 不同。"),
        hear("s06-h3", "ape 和 cat 哪一个开头更接近字母名 A？先听 ape。", "ape", ["ape", "cat"], "ape", "ape 的开头接近字母名。这不表示字母 A 在所有词里都这样读。"),
        choose("s06-c1", "哪一句是稳妥的说法？", ["A 永远读啊", "A 在不同单词里可以有不同的音"], "A 在不同单词里可以有不同的音", "不要把一个例子记成永远的规则。"),
        type("s06-t1", "猫，用英文写这个刚学的词。", ["cat"], "cat。"),
        produce("s06-p1", "写出字母 A 的大写。", ["A", "a"], "字母形状是 A。"),
        speak("s06-s1", "跟着读：A, ape, cat。只练听和跟读。", "A. ape. cat.", "没有自动评分。"),
      ],
    },
    {
      id: "s07",
      title: "问候",
      stage: "词语",
      intro: "先看这四个说法的意思，再听、再选、再写。",
      teach: [
        card("hello", "hello", "你好"),
        card("hi", "hi", "嗨，也是你好，更短"),
        card("goodbye", "goodbye", "再见"),
        card("thanks", "thank you", "谢谢", "thank you"),
      ],
      activities: [
        hear("s07-h1", "听到哪一句？", "hello", ["hello", "goodbye", "thank you"], "hello", "hello 是你好。"),
        hear("s07-h2", "再听一句。", "goodbye", ["hi", "goodbye", "hello"], "goodbye", "goodbye 是再见。"),
        choose("s07-c1", "“谢谢”是哪一句？", ["thank you", "goodbye", "hello"], "thank you", "thank you 是谢谢。"),
        type("s07-t1", "输入：你好（用 hello）。", ["hello"], "hello。"),
        produce("s07-p1", "用英文写“再见”。", ["goodbye", "good bye"], "goodbye。"),
        order("s07-o1", "把“谢谢”排成英文。", ["thank", "you"], "thank you 是两个词。"),
        speak("s07-s1", "跟着读 hello 和 thank you。", "Hello. Thank you.", "跟读不做发音打分。"),
      ],
    },
    {
      id: "s08",
      title: "说自己的名字",
      stage: "短语",
      intro: "先学两句固定说法。名字可以用 Sam 练习，也可以换成你自己的拼音名字。",
      teach: [
        card("my-name", "My name is Sam.", "我的名字是 Sam。", "My name is Sam."),
        card("i-am", "I am Sam.", "我是 Sam。", "I am Sam."),
      ],
      activities: [
        hear("s08-h1", "哪一句在说名字？", "My name is Sam.", ["My name is Sam.", "Goodbye.", "Thank you."], "My name is Sam.", "My name is 用来介绍名字。"),
        choose("s08-c1", "“我是 Sam”选哪一句？", ["I am Sam.", "My name is Sam.", "Hello."], "I am Sam.", "I am 是“我是”。"),
        order("s08-o1", "排成：我的名字是 Sam。", ["My", "name", "is", "Sam"], "顺序是 My name is Sam。"),
        type("s08-t1", "输入 hello，复习问候。", ["hello"], "hello 仍然是你好。"),
        produce("s08-p1", "写出：我是 Sam。句号可有可无。", ["I am Sam", "I am Sam.", "I'm Sam", "I'm Sam."], "I am Sam 或 I'm Sam 都可以。"),
        dictation("s08-d1", "再听一遍，写出这句。", "My name is Sam.", ["My name is Sam", "My name is Sam."], "听的是 My name is Sam."),
        speak("s08-s1", "跟着说：My name is Sam.", "My name is Sam.", "你可以换成自己的名字来练，页面仍然不打分。"),
      ],
    },
    {
      id: "s09",
      title: "数字 1 到 5",
      stage: "词语",
      intro: "先把中文数字和英文对上，再听。",
      teach: [
        card("n1", "one", "1"),
        card("n2", "two", "2"),
        card("n3", "three", "3"),
        card("n4", "four", "4"),
        card("n5", "five", "5"),
      ],
      activities: [
        hear("s09-h1", "听到的数字是？", "two", ["one", "two", "five"], "two", "two 是 2。"),
        hear("s09-h2", "再听一个。", "five", ["three", "four", "five"], "five", "five 是 5。"),
        choose("s09-c1", "3 是哪个词？", ["three", "tree", "ten"], "three", "three 是 3。tree 是树，这里不学。"),
        type("s09-t1", "输入 1 的英文。", ["one"], "one。"),
        produce("s09-p1", "写出 4。", ["four", "4"], "four。写阿拉伯数字 4 也可以算对。"),
        order("s09-o1", "从 1 排到 3。", ["one", "two", "three"], "one two three。"),
        speak("s09-s1", "跟着数 one 到 five。", "one, two, three, four, five", "跟读不评分。"),
      ],
    },
    {
      id: "s10",
      title: "数字 6 到 10",
      stage: "词语",
      intro: "继续五个数字。three 是 3，thirteen 先不学。",
      teach: [
        card("n6", "six", "6"),
        card("n7", "seven", "7"),
        card("n8", "eight", "8"),
        card("n9", "nine", "9"),
        card("n10", "ten", "10"),
      ],
      activities: [
        hear("s10-h1", "听到哪一个？", "six", ["six", "seven", "ten"], "six", "six 是 6。"),
        hear("s10-h2", "再听。", "ten", ["nine", "ten", "two"], "ten", "ten 是 10。"),
        choose("s10-c1", "8 是哪个词？", ["eight", "ate", "three"], "eight", "eight 是 8。"),
        type("s10-t1", "输入 7 的英文。", ["seven"], "seven。"),
        produce("s10-p1", "写出 9。", ["nine", "9"], "nine。"),
        dictation("s10-d1", "听写这个数字词。", "seven", ["seven"], "seven。"),
        speak("s10-s1", "跟着读 six, seven, eight, nine, ten。", "six, seven, eight, nine, ten", "跟读不评分。"),
      ],
    },
    {
      id: "s11",
      title: "身边的名词",
      stage: "词语",
      intro: "四个很常见的东西。先看中文，再认英文。",
      teach: [
        card("book", "book", "书"),
        card("pen", "pen", "笔"),
        card("water", "water", "水"),
        card("apple", "apple", "苹果"),
      ],
      activities: [
        choose("s11-c1", "“书”是哪个词？", ["book", "pen", "water"], "book", "book 是书。"),
        hear("s11-h1", "听到的是什么东西？", "water", ["water", "apple", "book"], "water", "water 是水。"),
        hear("s11-h2", "再听一个。", "apple", ["pen", "apple", "book"], "apple", "apple 是苹果。"),
        type("s11-t1", "输入“笔”。", ["pen"], "pen。"),
        produce("s11-p1", "写出“水”。", ["water"], "water。"),
        choose("s11-c2", "apple 的意思是？", ["苹果", "书", "水"], "苹果", "apple 是苹果。"),
        speak("s11-s1", "跟着读 book, pen, water, apple。", "book, pen, water, apple", "跟读不评分。"),
      ],
    },
    {
      id: "s12",
      title: "人",
      stage: "词语",
      intro: "三个称呼。mum 和 dad 是口语里很常见的说法。",
      teach: [
        card("mum", "mum", "妈妈"),
        card("dad", "dad", "爸爸"),
        card("friend", "friend", "朋友"),
      ],
      activities: [
        choose("s12-c1", "“朋友”是？", ["friend", "mum", "dad"], "friend", "friend 是朋友。"),
        hear("s12-h1", "听到谁？", "mum", ["mum", "dad", "friend"], "mum", "mum 是妈妈。"),
        type("s12-t1", "输入“爸爸”。", ["dad"], "dad。"),
        produce("s12-p1", "写出“妈妈”。", ["mum", "mom"], "mum。mom 是另一种拼写，也接受。"),
        choose("s12-c2", "dad 的意思？", ["爸爸", "朋友", "书"], "爸爸", "dad 是爸爸。"),
        order("s12-o1", "复习：排出谢谢。", ["thank", "you"], "thank you。"),
        speak("s12-s1", "跟着读 mum, dad, friend。", "mum, dad, friend", "跟读不评分。"),
      ],
    },
    {
      id: "s13",
      title: "短句礼貌用语",
      stage: "短语",
      intro: "三句日常礼貌话。please 常放在请求的后面或前面，这里先整句记。",
      teach: [
        card("morning", "Good morning.", "早上好。", "Good morning."),
        card("please", "Water, please.", "请给我水。", "Water, please."),
        card("sorry", "I'm sorry.", "对不起。", "I'm sorry."),
      ],
      activities: [
        hear("s13-h1", "听到哪一句？", "Good morning.", ["Good morning.", "I'm sorry.", "Goodbye."], "Good morning.", "Good morning 是早上好。"),
        choose("s13-c1", "“对不起”是？", ["I'm sorry.", "Good morning.", "Thank you."], "I'm sorry.", "I'm sorry 是对不起。"),
        order("s13-o1", "排成：早上好。", ["Good", "morning"], "Good morning。"),
        order("s13-o2", "排成：请给我水。", ["Water", "please"], "Water, please。"),
        produce("s13-p1", "写出“对不起”。", ["I'm sorry", "I am sorry", "I'm sorry."], "I'm sorry 或 I am sorry。"),
        dictation("s13-d1", "听写这句问候。", "Good morning.", ["Good morning", "Good morning."], "Good morning."),
        speak("s13-s1", "跟着读 Good morning 和 I'm sorry。", "Good morning. I'm sorry.", "跟读不评分。"),
      ],
    },
    {
      id: "s14",
      title: "两个简单句型",
      stage: "句子",
      intro: "This is 用来指出一个东西。I have 表示“我有”。冠词 a 先出现在这两个句子里，后面的课还会再遇到。",
      teach: [
        card("this-is", "This is a book.", "这是一本书。", "This is a book."),
        card("i-have", "I have a pen.", "我有一支笔。", "I have a pen."),
      ],
      activities: [
        choose("s14-c1", "“这是一本书”是哪一句？", ["This is a book.", "I have a pen.", "Good morning."], "This is a book.", "This is 是“这是”。"),
        hear("s14-h1", "听到的是哪一句？", "I have a pen.", ["I have a pen.", "This is a book.", "Thank you."], "I have a pen.", "I have a pen 是我有一支笔。"),
        order("s14-o1", "排成：这是一本书。", ["This", "is", "a", "book"], "This is a book。"),
        order("s14-o2", "排成：我有一支笔。", ["I", "have", "a", "pen"], "I have a pen。"),
        produce("s14-p1", "写出：这是一支笔。", ["This is a pen", "This is a pen."], "把 book 换成 pen。"),
        dictation("s14-d1", "听写。", "This is a book.", ["This is a book", "This is a book."], "This is a book."),
        speak("s14-s1", "跟着说这两句。", "This is a book. I have a pen.", "跟读不评分。"),
      ],
    },
    {
      id: "s15",
      title: "听写和组句",
      stage: "句子",
      intro: "这一课不再教新规则，只用前面学过的句子。先看一遍，再听写。",
      teach: [
        card("rev-name", "My name is Sam.", "我的名字是 Sam。", "My name is Sam."),
        card("rev-book", "This is a book.", "这是一本书。", "This is a book."),
        card("rev-water", "Water, please.", "请给我水。", "Water, please."),
      ],
      activities: [
        dictation("s15-d1", "听写问候句。", "Good morning.", ["Good morning", "Good morning."], "Good morning."),
        dictation("s15-d2", "听写介绍名字。", "My name is Sam.", ["My name is Sam", "My name is Sam."], "My name is Sam."),
        order("s15-o1", "排成：我有一本书。", ["I", "have", "a", "book"], "I have a book。"),
        produce("s15-p1", "写出：这是水。", ["This is water", "This is water."], "water 前面这里不加 a，因为这一课把 water 当作水这种东西。"),
        hear("s15-h1", "听到的是数字几？", "three", ["two", "three", "ten"], "three", "three 是 3。"),
        type("s15-t1", "输入“谢谢”的两个词，中间有空格。", ["thank you"], "thank you。"),
        speak("s15-s1", "跟着说 My name is Sam.", "My name is Sam.", "跟读不评分。"),
      ],
    },
    {
      id: "s16",
      title: "混合复习",
      stage: "混合",
      intro: "听、认、写、说各做一点。全部来自前面的课，没有新语法。",
      teach: [
        card("mix-hi", "hello", "你好"),
        card("mix-ten", "ten", "10"),
        card("mix-friend", "friend", "朋友"),
        card("mix-sentence", "I have a book.", "我有一本书。", "I have a book."),
      ],
      activities: [
        hear("s16-h1", "听到哪一个词？", "friend", ["friend", "water", "goodbye"], "friend", "friend 是朋友。"),
        choose("s16-c1", "10 是？", ["ten", "two", "pen"], "ten", "ten 是 10。"),
        type("s16-t1", "输入“苹果”。", ["apple"], "apple。"),
        produce("s16-p1", "写出：早上好。", ["Good morning", "Good morning."], "Good morning."),
        order("s16-o1", "排成：我有一本书。", ["I", "have", "a", "book"], "I have a book。"),
        dictation("s16-d1", "听写这句礼貌话。", "Thank you.", ["Thank you", "Thank you."], "Thank you."),
        choose("s16-c2", "字母 A 的名字和 cat 里的 a：", ["一定相同", "在这两个例子里不相同"], "在这两个例子里不相同", "第 6 课只比较了字母名 A 和 cat，不能推广成永远的规则。"),
        speak("s16-s1", "跟着说：Hello. I have a book.", "Hello. I have a book.", "这是最后的跟读，仍然没有发音分。"),
      ],
    },
  ],
};
