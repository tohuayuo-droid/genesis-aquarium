(() => {
  "use strict";

  const canvas = document.getElementById("worldCanvas");
  const ctx = canvas.getContext("2d");
  const seedInput = document.getElementById("seedInput");
  const newWorldBtn = document.getElementById("newWorldBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const speedSelect = document.getElementById("speedSelect");
  const nextDramaBtn = document.getElementById("nextDramaBtn");
  const clearNewsBtn = document.getElementById("clearNewsBtn");
  const dramaScene = document.getElementById("dramaScene");
  const newsFeed = document.getElementById("newsFeed");
  const worldState = document.getElementById("worldState");
  const civilizationState = document.getElementById("civilizationState");
  const castState = document.getElementById("castState");
  const worldSummary = document.getElementById("worldSummary");

  const COLS = 24;
  const ROWS = 14;
  const DRAMA_AUTO_SECONDS = 8;
  const WORLD_RESTART_DELAY = 8;

  const ICONS = {
    human: "🧑",
    beast: "🦊",
    bird: "🦅",
    plant: "🌿",
    fungus: "🍄",
    aquatic: "🪼",
    birth: "✨",
    conflict: "⚔️",
    discovery: "💡",
    disaster: "🌪️",
    society: "🏘️",
    nature: "🌱",
    death: "🕯️",
  };

  const DISASTERS = ["war", "plague", "earthquake", "fire", "typhoon"];

  let world = null;
  let running = true;
  let lastTime = performance.now();
  let dramaAutoElapsed = 0;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function pick(rng, array) {
    return array[Math.floor(rng() * array.length)];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomSeed() {
    if (window.crypto && crypto.getRandomValues) {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return values[0] || 1;
    }
    return Math.floor(Math.random() * 4294967295) || 1;
  }

  function findLandCells(tiles) {
    const cells = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (tiles[y][x].type !== "water" && tiles[y][x].type !== "mountain") {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  function generateTerrain(seed, rng) {
    const profile = {
      seaLevel: 0.34 + rng() * 0.28,
      forestBias: 0.2 + rng() * 0.34,
      mountainBias: 0.68 + rng() * 0.2,
      islandCount: randInt(rng, 2, 5),
      ridgeAngle: rng() * Math.PI,
      ridgeOffset: rng() * 2 - 1,
    };

    const islands = Array.from({ length: profile.islandCount }, () => ({
      x: rng() * (COLS - 1),
      y: rng() * (ROWS - 1),
      radiusX: 3.8 + rng() * 7,
      radiusY: 2.8 + rng() * 4.8,
      height: 0.72 + rng() * 0.65,
    }));

    const lakes = Array.from({ length: randInt(rng, 0, 3) }, () => ({
      x: randInt(rng, 3, COLS - 4),
      y: randInt(rng, 3, ROWS - 4),
      radius: 1.2 + rng() * 1.8,
    }));

    const tiles = [];

    for (let y = 0; y < ROWS; y++) {
      const row = [];

      for (let x = 0; x < COLS; x++) {
        let height = -0.42;

        for (const island of islands) {
          const dx = (x - island.x) / island.radiusX;
          const dy = (y - island.y) / island.radiusY;
          height = Math.max(height, island.height - (dx * dx + dy * dy));
        }

        const ridge = Math.sin(
          (x * Math.cos(profile.ridgeAngle) + y * Math.sin(profile.ridgeAngle)) * 0.72 +
            profile.ridgeOffset * 4
        );

        height += ridge * 0.1;
        height += (rng() - 0.5) * 0.42;
        height += Math.sin(x * 0.91 + y * 0.37 + (seed % 17)) * 0.08;

        let type = height < profile.seaLevel ? "water" : "grass";

        if (type !== "water") {
          const mountainScore = height + ridge * 0.12 + rng() * 0.12;

          if (mountainScore > profile.mountainBias) {
            type = "mountain";
          } else {
            const moisture =
              (Math.sin(x * 0.33 + (seed % 13)) +
                Math.cos(y * 0.46 + (seed % 19))) *
                0.16 +
              rng();

            if (moisture < profile.forestBias) {
              type = "forest";
            }
          }
        }

        if (type !== "mountain") {
          for (const lake of lakes) {
            const dx = x - lake.x;
            const dy = y - lake.y;

            if (dx * dx + dy * dy < lake.radius * lake.radius) {
              type = "water";
              break;
            }
          }
        }

        row.push({
          type,
          originalType: type,
          fertility: rng(),
          heat: rng(),
          damage: 0,
        });
      }

      tiles.push(row);
    }

    return tiles;
  }

  function createExtinctionPlan(rng) {
    const longLived = rng() < 0.2;
    const earliestYear = longLived
      ? randInt(rng, 1300, 2200)
      : randInt(rng, 650, 1300);

    return {
      earliestYear,
      latestYear: longLived
        ? randInt(rng, 2600, 4800)
        : randInt(rng, earliestYear + 600, earliestYear + 2200),
      riskPerYear: longLived
        ? 0.00015 + rng() * 0.00035
        : 0.00035 + rng() * 0.00075,
      cause: pick(rng, [
        "長期的な気候崩壊",
        "連続する巨大噴火",
        "海と大気の急変",
        "生態系の連鎖崩壊",
        "恒星活動の異常",
        "資源循環の停止",
      ]),
    };
  }

  function createWorld(seed) {
    const rng = mulberry32(seed);
    const tiles = generateTerrain(seed, rng);
    const landCells = findLandCells(tiles);

    if (!landCells.length) {
      tiles[Math.floor(ROWS / 2)][Math.floor(COLS / 2)].type = "grass";
      landCells.push({ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) });
    }

    const home = pick(rng, landCells);
    const speciesType = pick(rng, [
      "human",
      "beast",
      "bird",
      "plant",
      "fungus",
      "aquatic",
    ]);

    const speciesNames = {
      human: ["ミナ", "カル", "セナ", "リオ", "トワ", "イラ"],
      beast: ["ガウ", "ルゥ", "キバ", "ネネ", "モク", "ハク"],
      bird: ["ソラ", "カゼ", "ツバサ", "アオ", "ヒナ", "レイ"],
      plant: ["若枝", "深根", "白花", "木環", "緑芽", "梢"],
      fungus: ["胞子七", "環菌", "白傘", "深糸", "月菌", "苔環"],
      aquatic: ["ミオ", "ナギ", "アワ", "シオ", "ウミ", "ルカ"],
    }[speciesType];

    const settlement = {
      name: `${pick(rng, ["灰樹", "青潮", "風環", "深根", "白雲", "赤土"])}の共同体`,
      x: home.x,
      y: home.y,
      population: 0,
      stage: "生命前",
      culture: pick(rng, [
        "記憶を歌で残す",
        "季節ごとに移動する",
        "根や巣で情報を共有する",
        "星の位置で約束を決める",
        "死者の名前を地形に刻む",
        "争いを物語として保存する",
      ]),
      technology: "なし",
      stability: randInt(rng, 58, 88),
      food: randInt(rng, 25, 50),
      resources: randInt(rng, 25, 50),
      knowledge: 0,
      industry: 0,
      military: 0,
      medicine: 0,
    };

    const w = {
      seed,
      rng,
      tiles,
      year: 0,
      season: 0,
      temperature: randInt(rng, 8, 28),
      biodiversity: randInt(rng, 2, 12),
      lifeLevel: 0,
      cast: [],
      speciesType,
      speciesNames,
      home,
      graves: [],
      settlement,
      news: [],
      dramas: [],
      dramaIndex: 0,
      eventFlags: new Set(),
      meteor: null,
      selectedCell: null,
      phase: "alive",
      extinctionElapsed: 0,
      nextSeed: null,
      extinctionPlan: createExtinctionPlan(rng),
      disasterCooldown: randInt(rng, 80, 180),
    };

    addDrama(
      w,
      "nature",
      [],
      "風と水だけが動いている。まだ、この世界に名前を持つものはいない。",
      "無生物の世界"
    );

    addNews(
      w,
      "nature",
      "新しい世界が形成された",
      "岩、水、大気がゆっくり循環し始めた。生命はまだ存在しない。"
    );

    return w;
  }

  function addNews(w, type, title, text) {
    w.news.push({
      id: `${Math.floor(w.year)}-${w.news.length}-${type}`,
      year: Math.floor(w.year),
      type,
      title,
      text,
    });

    if (w.news.length > 120) {
      w.news.shift();
    }
  }

  function addDrama(w, type, participants, text, title) {
    const safeParticipants = (participants || []).filter(Boolean);

    w.dramas.push({
      type,
      participants: safeParticipants.map((person) => person.id),
      text,
      title,
      year: Math.floor(w.year),
    });

    if (w.dramas.length > 30) {
      w.dramas.shift();
    }

    w.dramaIndex = w.dramas.length - 1;
    dramaAutoElapsed = 0;
  }

  function createPersonality(rng) {
    return {
      curiosity: randInt(rng, 0, 100),
      aggression: randInt(rng, 0, 100),
      empathy: randInt(rng, 0, 100),
      sociability: randInt(rng, 0, 100),
      caution: randInt(rng, 0, 100),
      adaptability: randInt(rng, 0, 100),
    };
  }

  function decideRole(personality) {
    const scores = {
      探索者: personality.curiosity,
      守り手: personality.caution,
      仲介者: personality.empathy,
      まとめ役: personality.sociability,
      戦士: personality.aggression,
      開拓者: personality.adaptability,
    };

    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  }

  function spawnNamedCast(w) {
    if (w.cast.length) return;

    w.cast = w.speciesNames.slice(0, 4).map((name, index) => {
      const personality = createPersonality(w.rng);

      return {
        id: `c${index}`,
        name,
        species: w.speciesType,
        personality,
        role: decideRole(personality),
        age: randInt(w.rng, 12, 46),
        x: clamp(w.home.x + randInt(w.rng, -2, 2), 1, COLS - 2),
        y: clamp(w.home.y + randInt(w.rng, -2, 2), 1, ROWS - 2),
        relation: "まだ関係はない",
        mood: "観察中",
        alive: true,
        nextActionYear: w.year + randInt(w.rng, 8, 30),
      };
    });
  }

  function changeStage(w, stage, message, technology) {
    const s = w.settlement;

    if (s.stage === stage) return;

    s.stage = stage;

    if (technology) {
      s.technology = technology;
    }

    const participants = w.cast.filter((person) => person.alive).slice(0, 2);

    addNews(w, "discovery", `${stage}へ移行`, message);
    addDrama(w, "discovery", participants, message, `${stage}の始まり`);
  }

  function advanceCivilizationStage(w) {
    const s = w.settlement;

    if (!w.cast.length || s.population <= 0) return;

    if (
      s.population >= 20 &&
      (s.stage === "小さな集まり" || s.stage === "知性の芽生え")
    ) {
      changeStage(w, "定住集落", "住居と食料庫が作られた。", "保存食と住居");
    }

    if (
      s.population >= 70 &&
      s.food >= 38 &&
      s.knowledge >= 12 &&
      s.stage === "定住集落"
    ) {
      changeStage(w, "農耕社会", "作物を育て、食料を蓄えるようになった。", "農耕");
    }

    if (
      s.population >= 140 &&
      s.resources >= 40 &&
      s.knowledge >= 28 &&
      s.stage === "農耕社会"
    ) {
      changeStage(w, "都市社会", "金属の道具と大きな集落が生まれた。", "金属加工");
    }

    if (
      s.population >= 240 &&
      s.resources >= 52 &&
      s.knowledge >= 48 &&
      s.stability >= 30 &&
      s.stage === "都市社会"
    ) {
      s.industry = Math.max(s.industry, 20);
      changeStage(
        w,
        "産業革命",
        "熱と圧力を動力として利用し始めた。",
        "蒸気機関"
      );
    }

    if (
      s.population >= 420 &&
      s.knowledge >= 72 &&
      s.industry >= 55 &&
      s.stage === "産業革命"
    ) {
      changeStage(
        w,
        "機械文明",
        "機械が生産と移動を大きく変えた。",
        "機械生産"
      );
    }
  }

  function updateCivilization(w, years) {
    const s = w.settlement;

    if (!w.cast.length || s.population <= 0) return;

    const aliveCount = w.cast.filter((person) => person.alive).length;

    s.food = clamp(
      s.food + (w.rng() - 0.39) * years * 0.14 + aliveCount * years * 0.003,
      0,
      100
    );

    s.resources = clamp(
      s.resources + (w.rng() - 0.44) * years * 0.11,
      0,
      100
    );

    s.knowledge = clamp(
      s.knowledge + years * (0.045 + aliveCount * 0.003),
      0,
      100
    );

    s.medicine = clamp(
      s.medicine + s.knowledge * years * 0.0007,
      0,
      100
    );

    if (s.stage === "産業革命" || s.stage === "機械文明") {
      s.industry = clamp(
        s.industry + years * 0.08 + s.knowledge * years * 0.0005,
        0,
        100
      );
      s.resources = clamp(s.resources - years * 0.025, 0, 100);
    }

    if (s.food > 30 && s.stability > 20) {
      s.population += years * (0.11 + s.food * 0.0015);
    }

    if (s.food < 15) {
      s.population -= years * 0.18;
      s.stability -= years * 0.06;
    }

    s.population = Math.max(0, s.population);
    s.stability = clamp(s.stability, 0, 100);

    advanceCivilizationStage(w);
  }

  function performCharacterAction(w, character, action) {
    const others = w.cast.filter(
      (person) => person.alive && person.id !== character.id
    );

    const target = others.length ? pick(w.rng, others) : null;

    if (action === "explore") {
      character.x = clamp(
        character.x + randInt(w.rng, -2, 2),
        1,
        COLS - 2
      );
      character.y = clamp(
        character.y + randInt(w.rng, -2, 2),
        1,
        ROWS - 2
      );
      character.mood = "好奇心";

      addDrama(
        w,
        "discovery",
        [character],
        `${character.name}「まだ見たことのない場所へ行きたい」`,
        "未知への探索"
      );
      return;
    }

    if (action === "help" && target) {
      character.relation = `友人：${target.name}`;
      target.relation = `友人：${character.name}`;
      character.mood = "穏やか";
      w.settlement.stability = clamp(w.settlement.stability + 3, 0, 100);

      addDrama(
        w,
        "society",
        [character, target],
        `${character.name}は${target.name}へ食料を分け与えた。`,
        "助け合い"
      );
      return;
    }

    if (action === "conflict" && target) {
      character.relation = `対立：${target.name}`;
      target.relation = `対立：${character.name}`;
      character.mood = "怒り";
      w.settlement.stability = clamp(w.settlement.stability - 5, 0, 100);
      w.settlement.military = clamp(w.settlement.military + 2, 0, 100);

      addDrama(
        w,
        "conflict",
        [character, target],
        `${character.name}「お前の考えには従えない」`,
        "意見の衝突"
      );
      return;
    }

    if (action === "protect") {
      character.mood = "警戒";
      w.settlement.stability = clamp(w.settlement.stability + 2, 0, 100);

      addDrama(
        w,
        "society",
        [character],
        `${character.name}は共同体の周囲を見回っている。`,
        "共同体を守る"
      );
      return;
    }

    if (action === "invent") {
      const invention = pick(w.rng, [
        "新しい保存方法",
        "水を運ぶ器",
        "風を読む印",
        "胞子の伝言",
        "石を磨く道具",
        "夜に光る標識",
      ]);

      character.mood = "集中";
      w.settlement.technology = invention;
      w.settlement.knowledge = clamp(w.settlement.knowledge + 5, 0, 100);

      addNews(
        w,
        "discovery",
        `${character.name}が発見した`,
        `${invention}が共同体へ広がった。`
      );

      addDrama(
        w,
        "discovery",
        [character],
        `${character.name}「これなら、前とは違うことができる」`,
        "新しい発見"
      );
    }
  }

  function runPersonalityActions(w) {
    for (const character of w.cast) {
      if (!character.alive) continue;
      if (w.year < character.nextActionYear) continue;

      character.nextActionYear = w.year + randInt(w.rng, 12, 40);

      const p = character.personality;

      const actions = [
        { type: "explore", score: p.curiosity + p.adaptability * 0.4 },
        { type: "help", score: p.empathy + p.sociability * 0.3 },
        { type: "conflict", score: p.aggression - p.caution * 0.3 },
        { type: "protect", score: p.caution + p.empathy * 0.3 },
        { type: "invent", score: p.curiosity + p.caution * 0.2 },
      ];

      actions.sort((a, b) => b.score - a.score);
      performCharacterAction(w, character, actions[0].type);
    }
  }

  function killCharacter(w, character, cause) {
    if (!character || !character.alive) return;

    character.alive = false;

    w.graves.push({
      x: character.x,
      y: character.y,
      name: character.name,
      year: Math.floor(w.year),
      cause,
    });

    addDrama(
      w,
      "death",
      [],
      `${character.name}は${cause}によって命を失った。墓標だけが残された。`,
      `${character.name}の死`
    );
  }

  function damageRandomTiles(w, count, damageType) {
    const cells = [];

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (w.tiles[y][x].type !== "water") {
          cells.push({ x, y });
        }
      }
    }

    for (let i = 0; i < count && cells.length; i++) {
      const index = randInt(w.rng, 0, cells.length - 1);
      const cell = cells.splice(index, 1)[0];

      w.tiles[cell.y][cell.x].damage = damageType;

      if (damageType === "fire") {
        w.tiles[cell.y][cell.x].type = "burned";
      }
    }
  }

  function triggerWar(w) {
    const s = w.settlement;
    const loss = Math.floor(s.population * (0.08 + w.rng() * 0.22));

    s.population = Math.max(0, s.population - loss);
    s.stability = clamp(s.stability - randInt(w.rng, 15, 35), 0, 100);
    s.resources = clamp(s.resources - randInt(w.rng, 10, 30), 0, 100);
    s.military = clamp(s.military + randInt(w.rng, 8, 20), 0, 100);

    const alive = w.cast.filter((person) => person.alive);

    if (alive.length && w.rng() < 0.38) {
      killCharacter(w, pick(w.rng, alive), "戦争");
    }

    addNews(
      w,
      "conflict",
      "大規模な戦争",
      `${loss}の人口が失われ、共同体は大きく分裂した。`
    );

    addDrama(
      w,
      "conflict",
      alive.slice(0, 2),
      "争いは長く続き、帰らない者の名前が増えていった。",
      "戦争"
    );
  }

  function triggerPlague(w) {
    const s = w.settlement;
    const protection = s.medicine / 100;
    const rate = Math.max(0.05, 0.42 - protection * 0.32);
    const loss = Math.floor(s.population * rate);

    s.population = Math.max(0, s.population - loss);
    s.stability = clamp(s.stability - 18, 0, 100);

    const alive = w.cast.filter((person) => person.alive);

    if (alive.length && w.rng() < rate) {
      killCharacter(w, pick(w.rng, alive), "疫病");
    }

    addNews(
      w,
      "death",
      "未知の疫病",
      `${loss}の生命が失われた。医療水準が被害を左右した。`
    );

    addDrama(
      w,
      "death",
      alive.slice(0, 2),
      "集落は静まり、互いの無事を確かめる声だけが残った。",
      "疫病"
    );
  }

  function triggerEarthquake(w) {
    const s = w.settlement;
    const loss = Math.min(
      Math.floor(s.population),
      randInt(w.rng, 4, Math.max(8, Math.floor(s.population * 0.15)))
    );

    s.population = Math.max(0, s.population - loss);
    s.stability = clamp(s.stability - 20, 0, 100);
    s.resources = clamp(s.resources - 15, 0, 100);

    damageRandomTiles(w, randInt(w.rng, 4, 9), "quake");

    addNews(
      w,
      "disaster",
      "大地震",
      "地面が割れ、住居と道が崩壊した。"
    );

    addDrama(
      w,
      "disaster",
      w.cast.filter((person) => person.alive).slice(0, 2),
      "足元が大きく揺れ、見慣れた風景が崩れていった。",
      "大地震"
    );
  }

  function triggerFire(w) {
    const s = w.settlement;

    s.food = clamp(s.food - 20, 0, 100);
    s.resources = clamp(s.resources - 18, 0, 100);
    s.stability = clamp(s.stability - 12, 0, 100);

    damageRandomTiles(w, randInt(w.rng, 5, 12), "fire");

    addNews(
      w,
      "disaster",
      "大火災",
      "火が集落へ広がり、食料庫と住居が焼けた。"
    );

    addDrama(
      w,
      "disaster",
      w.cast.filter((person) => person.alive).slice(0, 2),
      "赤い光が夜を照らし、皆が水を運んだ。",
      "大火災"
    );
  }

  function triggerTyphoon(w) {
    const s = w.settlement;

    s.food = clamp(s.food - randInt(w.rng, 10, 28), 0, 100);
    s.population = Math.max(0, s.population - randInt(w.rng, 0, 12));
    s.stability = clamp(s.stability - 8, 0, 100);

    damageRandomTiles(w, randInt(w.rng, 3, 8), "storm");

    addNews(
      w,
      "disaster",
      "巨大な台風",
      "暴風と洪水が海岸や農地を飲み込んだ。"
    );

    addDrama(
      w,
      "disaster",
      w.cast.filter((person) => person.alive).slice(0, 2),
      "風は何日も止まず、誰も外へ出られなかった。",
      "巨大な台風"
    );
  }

  function triggerDisaster(w, type) {
    if (type === "war") triggerWar(w);
    if (type === "plague") triggerPlague(w);
    if (type === "earthquake") triggerEarthquake(w);
    if (type === "fire") triggerFire(w);
    if (type === "typhoon") triggerTyphoon(w);

    checkCivilizationCollapse(w);
  }

  function checkDisasters(w, years) {
    if (w.phase !== "alive") return;
    if (!w.cast.length) return;

    w.disasterCooldown -= years;

    if (w.disasterCooldown > 0) return;

    const type = pick(w.rng, DISASTERS);
    triggerDisaster(w, type);

    w.disasterCooldown = randInt(w.rng, 90, 260);
  }

  function checkCivilizationCollapse(w) {
    const s = w.settlement;

    if (s.population <= 0 || !w.cast.some((person) => person.alive)) {
      beginExtinction(w, "文明と名前を持つ個体がすべて失われた");
      return;
    }

    if (s.stability <= 0) {
      s.stage = "崩壊した文明";
      s.technology = "失われた技術";
      s.population = Math.max(4, Math.floor(s.population * 0.3));
      s.stability = 20;
      s.knowledge *= 0.4;
      s.industry = 0;

      addNews(
        w,
        "death",
        "文明崩壊",
        "社会制度が失われ、生存者は小さな集団へ戻った。"
      );

      addDrama(
        w,
        "death",
        w.cast.filter((person) => person.alive).slice(0, 2),
        "かつての仕組みは失われた。それでも、生き残った者は集まり直した。",
        "文明の崩壊"
      );
    }
  }

  function beginExtinction(w, cause) {
    if (w.phase === "extinction") return;

    w.eventFlags.add("extinction");
    w.phase = "extinction";
    w.extinctionElapsed = 0;
    w.nextSeed = randomSeed();

    for (const character of w.cast) {
      if (character.alive && w.rng() < 0.82) {
        killCharacter(w, character, cause || w.extinctionPlan.cause);
      }
    }

    w.settlement.population = Math.max(
      0,
      Math.floor(w.settlement.population * 0.06)
    );

    w.settlement.stability = 0;
    w.settlement.stage = "崩壊跡";
    w.biodiversity = Math.max(0, Math.floor(w.biodiversity * 0.08));

    addNews(
      w,
      "death",
      "世界規模の終焉",
      `${cause || w.extinctionPlan.cause}により、この世界の営みは静かに途切れた。`
    );

    addDrama(
      w,
      "death",
      w.cast.filter((person) => person.alive).slice(0, 2),
      "空は灰色に沈み、残された名前も風景の中へ消えていった。",
      "世界の終わり"
    );
  }

  function triggerMilestones(w) {
    if (w.year >= 18 && !w.eventFlags.has("firstLife")) {
      w.eventFlags.add("firstLife");
      w.lifeLevel = 1;
      w.biodiversity = Math.max(w.biodiversity, 14);

      addNews(
        w,
        "birth",
        "最初の生命反応",
        "浅い水辺で、自己複製する小さな生命が生まれた。"
      );

      addDrama(
        w,
        "birth",
        [],
        "水面の下で、ごく小さな生命が増え始めた。まだ名前も、意思もない。",
        "生命の誕生"
      );
    }

    if (w.year >= 58 && !w.eventFlags.has("complexLife")) {
      w.eventFlags.add("complexLife");
      w.lifeLevel = 2;
      w.biodiversity = Math.max(w.biodiversity, 28);

      addNews(
        w,
        "nature",
        "複雑な生物が広がった",
        "移動し、食べ、逃げる生物が各地へ広がり始めた。"
      );

      addDrama(
        w,
        "nature",
        [],
        "群れはまだ個体を区別しない。ただ環境に応じて増え、減っている。",
        "生態系の形成"
      );
    }

    if (w.year >= 105 && !w.eventFlags.has("namedLife")) {
      w.eventFlags.add("namedLife");
      w.lifeLevel = 3;
      spawnNamedCast(w);

      w.settlement.population = randInt(w.rng, 12, 30);
      w.settlement.stage = "小さな集まり";
      w.settlement.technology = "採集と簡単な道具";

      const first = w.cast[0];

      addNews(
        w,
        "birth",
        "名前を持つ個体が現れた",
        `${first.name}たちは互いを識別し、記憶を共有し始めた。`
      );

      addDrama(
        w,
        "birth",
        [first],
        `${first.name}は、共同体の外に広がる世界を初めて見つめた。`,
        "最初の名前"
      );
    }
  }

  function updateMeteor(w, dt, speed) {
    if (!w.meteor || w.meteor.done) return;

    w.meteor.progress += dt * speed * 0.18;

    if (w.meteor.progress < 1) return;

    w.meteor.done = true;
    w.settlement.population = Math.max(
      4,
      Math.floor(w.settlement.population * 0.44)
    );
    w.settlement.stability = Math.max(
      8,
      w.settlement.stability - 32
    );
    w.biodiversity = Math.max(5, w.biodiversity - 24);

    const living = w.cast.filter((person) => person.alive);
    const victim = living.length ? living[living.length - 1] : null;

    if (victim) {
      killCharacter(w, victim, "隕石衝突");

      addNews(
        w,
        "disaster",
        "隕石衝突",
        `${w.settlement.name}は大きな被害を受け、${victim.name}の記録はここで途切れた。`
      );
    } else {
      addNews(
        w,
        "disaster",
        "隕石衝突",
        `${w.settlement.name}は大きな被害を受けた。`
      );
    }

    checkCivilizationCollapse(w);
  }

  function update(dt) {
    if (!running || !world) return;

    const speed = Number(speedSelect.value);

    if (world.phase === "extinction") {
      world.extinctionElapsed += dt;

      if (world.extinctionElapsed >= WORLD_RESTART_DELAY) {
        reset(world.nextSeed || randomSeed());
      }

      return;
    }

    const years = dt * speed * 2.2;

    world.year += years;
    world.season = (world.year / 8) % 4;
    world.temperature += (world.rng() - 0.5) * 0.025;
    world.biodiversity = clamp(
      world.biodiversity + (world.rng() - 0.48) * 0.03,
      0,
      100
    );

    triggerMilestones(world);
    runPersonalityActions(world);
    updateCivilization(world, years);
    checkDisasters(world, years);
    updateMeteor(world, dt, speed);

    for (const character of world.cast) {
      if (!character.alive) continue;

      if (world.rng() < 0.02 * dt * speed) {
        character.x = clamp(
          character.x + randInt(world.rng, -1, 1),
          1,
          COLS - 2
        );
        character.y = clamp(
          character.y + randInt(world.rng, -1, 1),
          1,
          ROWS - 2
        );
      }
    }

    const plan = world.extinctionPlan;

    if (
      !world.eventFlags.has("extinction") &&
      world.year >= plan.earliestYear
    ) {
      const agePressure = clamp(
        (world.year - plan.earliestYear) /
          Math.max(1, plan.latestYear - plan.earliestYear),
        0,
        1
      );

      const risk =
        plan.riskPerYear *
        (0.35 + agePressure * 2.4) *
        years;

      if (world.year >= plan.latestYear || world.rng() < risk) {
        beginExtinction(world, plan.cause);
      }
    }

    if (
      world.year >= 410 &&
      !world.eventFlags.has("meteor") &&
      world.rng() < 0.003 * years
    ) {
      world.eventFlags.add("meteor");
      world.meteor = {
        progress: 0,
        x: randInt(world.rng, 8, COLS - 8),
        y: randInt(world.rng, 5, ROWS - 5),
        done: false,
      };

      addNews(
        world,
        "disaster",
        "空に強い光",
        "巨大な天体が世界へ近づいている。誰にも止められない。"
      );

      addDrama(
        world,
        "disaster",
        world.cast.filter((person) => person.alive).slice(0, 2),
        "皆は空を見上げた。言葉はなかった。",
        "隕石接近"
      );
    }

    checkCivilizationCollapse(world);
  }

  function drawTree(x, y, size) {
    ctx.fillStyle = "#70472f";
    ctx.fillRect(x - size * 0.08, y + size * 0.1, size * 0.16, size * 0.32);

    ctx.fillStyle = "#205f3a";
    ctx.beginPath();
    ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2f7b49";
    ctx.beginPath();
    ctx.arc(x - size * 0.16, y + size * 0.05, size * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + size * 0.17, y + size * 0.05, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(x, y, size, lit = false) {
    ctx.fillStyle = "#ead4a4";
    ctx.fillRect(x - size * 0.3, y - size * 0.02, size * 0.6, size * 0.45);

    ctx.fillStyle = "#9b4f3d";
    ctx.beginPath();
    ctx.moveTo(x - size * 0.38, y);
    ctx.lineTo(x, y - size * 0.36);
    ctx.lineTo(x + size * 0.38, y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#70472f";
    ctx.fillRect(x - size * 0.07, y + size * 0.18, size * 0.14, size * 0.25);

    ctx.fillStyle = lit ? "#ffd36b" : "#84b9ce";
    ctx.fillRect(x - size * 0.23, y + size * 0.1, size * 0.12, size * 0.12);
    ctx.fillRect(x + size * 0.11, y + size * 0.1, size * 0.12, size * 0.12);
  }

  function drawCharacter(character, x, y, size) {
    const emoji = ICONS[character.species] || "🧑";

    ctx.save();
    ctx.translate(x, y);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(26, Math.floor(size * 0.78))}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,.95)";
    ctx.shadowBlur = Math.max(6, size * 0.13);
    ctx.shadowOffsetY = 3;
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  function drawWorld() {
    if (!world) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cw = canvas.width / COLS;
    const ch = canvas.height / ROWS;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = world.tiles[y][x];
        const px = x * cw;
        const py = y * ch;

        const colors = {
          water: "#3d91c7",
          grass: "#80b96b",
          forest: "#3e7b4c",
          mountain: "#777b84",
          burned: "#4b4038",
        };

        ctx.fillStyle = colors[tile.type] || "#80b96b";
        ctx.fillRect(px, py, cw + 1, ch + 1);

        if (tile.type === "water") {
          ctx.strokeStyle = "rgba(255,255,255,.22)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.18, py + ch * 0.48);
          ctx.quadraticCurveTo(
            px + cw * 0.5,
            py + ch * 0.33,
            px + cw * 0.82,
            py + ch * 0.48
          );
          ctx.stroke();
        }

        if (tile.type === "forest") {
          drawTree(px + cw * 0.5, py + ch * 0.45, Math.min(cw, ch) * 0.9);
        }

        if (tile.type === "mountain") {
          ctx.fillStyle = "#5f626b";
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.08, py + ch * 0.92);
          ctx.lineTo(px + cw * 0.5, py + ch * 0.08);
          ctx.lineTo(px + cw * 0.92, py + ch * 0.92);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#e8edf3";
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.35, py + ch * 0.38);
          ctx.lineTo(px + cw * 0.5, py + ch * 0.08);
          ctx.lineTo(px + cw * 0.65, py + ch * 0.38);
          ctx.closePath();
          ctx.fill();
        }

        if (tile.damage === "quake") {
          ctx.strokeStyle = "#332d2b";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.1, py + ch * 0.2);
          ctx.lineTo(px + cw * 0.45, py + ch * 0.55);
          ctx.lineTo(px + cw * 0.25, py + ch * 0.9);
          ctx.stroke();
        }

        if (tile.damage === "storm") {
          ctx.fillStyle = "rgba(95,130,170,.32)";
          ctx.fillRect(px, py, cw + 1, ch + 1);
        }

        if (tile.damage === "fire") {
          ctx.font = `${Math.floor(Math.min(cw, ch) * 0.65)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🔥", px + cw / 2, py + ch / 2);
        }
      }
    }

    if (world.cast.length && world.settlement.population > 0) {
      const sx = (world.settlement.x + 0.5) * cw;
      const sy = (world.settlement.y + 0.55) * ch;

      drawHouse(sx, sy, Math.min(cw, ch) * 0.9, true);

      if (
        ["農耕社会", "都市社会", "産業革命", "機械文明"].includes(
          world.settlement.stage
        )
      ) {
        ctx.fillStyle = "#d6b25f";
        ctx.fillRect(
          sx + cw * 0.45,
          sy - ch * 0.2,
          cw * 1.1,
          ch * 0.85
        );

        ctx.strokeStyle = "#8a6d35";
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + cw * 0.5, sy - ch * 0.1 + i * ch * 0.2);
          ctx.lineTo(sx + cw * 1.5, sy - ch * 0.1 + i * ch * 0.2);
          ctx.stroke();
        }
      }

      if (
        world.settlement.stage === "産業革命" ||
        world.settlement.stage === "機械文明"
      ) {
        ctx.fillStyle = "#656b70";
        ctx.fillRect(sx - cw * 1.5, sy - ch * 0.55, cw * 0.9, ch * 1.05);
        ctx.fillRect(sx - cw * 1.35, sy - ch * 1.05, cw * 0.2, ch * 0.6);

        ctx.fillStyle = "rgba(60,60,60,.35)";
        ctx.beginPath();
        ctx.arc(sx - cw * 1.25, sy - ch * 1.25, cw * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const grave of world.graves) {
      const gx = (grave.x + 0.5) * cw;
      const gy = (grave.y + 0.55) * ch;

      ctx.font = `${Math.floor(Math.min(cw, ch) * 0.75)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪦", gx, gy);
    }

    for (const character of world.cast) {
      if (!character.alive) continue;

      const x = (character.x + 0.5) * cw;
      const y = (character.y + 0.5) * ch;

      drawCharacter(character, x, y, Math.min(cw, ch));

      ctx.font = `bold ${Math.max(11, Math.floor(ch * 0.25))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      const label = character.name;
      const width = ctx.measureText(label).width + 12;

      ctx.fillStyle = "rgba(18,28,50,.92)";
      ctx.fillRect(x - width / 2, y - ch * 0.63, width, ch * 0.28);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x, y - ch * 0.38);
    }

    if (world.meteor && !world.meteor.done) {
      const progress = world.meteor.progress;
      const startX = canvas.width * 0.9;
      const startY = -40;
      const endX = (world.meteor.x + 0.5) * cw;
      const endY = (world.meteor.y + 0.5) * ch;
      const mx = startX + (endX - startX) * progress;
      const my = startY + (endY - startY) * progress;

      ctx.font = "46px sans-serif";
      ctx.fillText("☄️", mx, my);
    }

    if (world.phase === "extinction") {
      ctx.fillStyle = "rgba(25,20,30,.72)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("この世界は滅びた", canvas.width / 2, canvas.height / 2 - 12);

      ctx.font = "18px sans-serif";
      ctx.fillText(
        `次の世界まで ${Math.max(
          0,
          Math.ceil(WORLD_RESTART_DELAY - world.extinctionElapsed)
        )} 秒`,
        canvas.width / 2,
        canvas.height / 2 + 28
      );
    }
  }

  function renderNews() {
    if (!world) return;

    newsFeed.innerHTML = "";

    for (const item of world.news) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `news-item news-${item.type}`;
      row.innerHTML = `
        <span class="news-icon">${ICONS[item.type] || "•"}</span>
        <span class="news-body">
          <strong>${item.title}</strong>
          <small>世界歴 ${item.year} 年</small>
          <span>${item.text}</span>
        </span>
      `;
      newsFeed.appendChild(row);
    }

    newsFeed.scrollTop = newsFeed.scrollHeight;
  }

  function renderDrama() {
    if (!world || !world.dramas.length) {
      dramaScene.innerHTML = "<p>まだドラマはありません。</p>";
      return;
    }

    const drama =
      world.dramas[
        clamp(world.dramaIndex, 0, world.dramas.length - 1)
      ];

    const participants = drama.participants
      .map((id) => world.cast.find((person) => person.id === id))
      .filter(Boolean);

    const castHtml = participants.length
      ? participants
          .map(
            (person) => `
              <div class="drama-character">
                <div class="drama-avatar">${ICONS[person.species] || "🧑"}</div>
                <div>
                  <strong>${person.name}</strong>
                  <small>${person.role}・${person.mood}</small>
                </div>
              </div>
            `
          )
          .join("")
      : `<div class="drama-character"><div class="drama-avatar">${ICONS[drama.type] || "🌍"}</div></div>`;

    dramaScene.innerHTML = `
      <div class="drama-header">
        <strong>${drama.title}</strong>
        <span>世界歴 ${drama.year} 年</span>
      </div>
      <div class="drama-cast">${castHtml}</div>
      <p class="drama-text">${drama.text}</p>
    `;
  }

  function renderPanels() {
    if (!world) return;

    const s = world.settlement;
    const living = world.cast.filter((person) => person.alive);

    worldState.innerHTML = `
      <dl>
        <div><dt>世界歴</dt><dd>${Math.floor(world.year).toLocaleString()} 年</dd></div>
        <div><dt>気温</dt><dd>${world.temperature.toFixed(1)} ℃</dd></div>
        <div><dt>生物多様性</dt><dd>${world.biodiversity.toFixed(0)}</dd></div>
        <div><dt>生命段階</dt><dd>${["生命前", "原始生命", "複雑な生命", "名前を持つ生命"][world.lifeLevel] || "不明"}</dd></div>
      </dl>
    `;

    civilizationState.innerHTML = `
      <dl>
        <div><dt>共同体</dt><dd>${s.name}</dd></div>
        <div><dt>段階</dt><dd>${s.stage}</dd></div>
        <div><dt>人口</dt><dd>${Math.floor(s.population).toLocaleString()}</dd></div>
        <div><dt>技術</dt><dd>${s.technology}</dd></div>
        <div><dt>安定度</dt><dd>${Math.floor(s.stability)}</dd></div>
        <div><dt>食料</dt><dd>${Math.floor(s.food)}</dd></div>
        <div><dt>資源</dt><dd>${Math.floor(s.resources)}</dd></div>
        <div><dt>知識</dt><dd>${Math.floor(s.knowledge)}</dd></div>
        <div><dt>産業</dt><dd>${Math.floor(s.industry)}</dd></div>
        <div><dt>医療</dt><dd>${Math.floor(s.medicine)}</dd></div>
      </dl>
    `;

    castState.innerHTML = living.length
      ? living
          .map(
            (person) => `
              <article class="cast-card">
                <strong>${ICONS[person.species]} ${person.name}</strong>
                <span>${person.role}・${person.mood}</span>
                <small>${person.relation}</small>
              </article>
            `
          )
          .join("")
      : "<p>名前付き個体はまだいません。</p>";

    worldSummary.textContent =
      world.phase === "extinction"
        ? "世界は終焉を迎えています。"
        : `${s.stage}。${s.culture}文化を持つ。`;
  }

  function render() {
    drawWorld();
    renderDrama();
    renderPanels();
    renderNews();
  }

  function reset(seed) {
    const safeSeed = Number(seed) >>> 0 || randomSeed();
    world = createWorld(safeSeed);
    seedInput.value = String(safeSeed);
    running = true;
    pauseBtn.textContent = "一時停止";
    dramaAutoElapsed = 0;
    render();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);

    dramaAutoElapsed += dt;

    if (
      world &&
      world.dramas.length > 1 &&
      dramaAutoElapsed >= DRAMA_AUTO_SECONDS
    ) {
      world.dramaIndex =
        (world.dramaIndex + 1) % world.dramas.length;
      dramaAutoElapsed = 0;
    }

    render();
    requestAnimationFrame(frame);
  }

  newWorldBtn.addEventListener("click", () => {
    const inputSeed = Number(seedInput.value);
    reset(inputSeed || randomSeed());
  });

  pauseBtn.addEventListener("click", () => {
    running = !running;
    pauseBtn.textContent = running ? "一時停止" : "再開";
  });

  nextDramaBtn.addEventListener("click", () => {
    if (!world || !world.dramas.length) return;

    world.dramaIndex =
      (world.dramaIndex + 1) % world.dramas.length;
    dramaAutoElapsed = 0;
    renderDrama();
  });

  clearNewsBtn.addEventListener("click", () => {
    if (!world) return;
    world.news = [];
    renderNews();
  });

  canvas.addEventListener("click", (event) => {
    if (!world) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((event.clientX - rect.left) / rect.width) * COLS
    );
    const y = Math.floor(
      ((event.clientY - rect.top) / rect.height) * ROWS
    );

    world.selectedCell = { x, y };

    const character = world.cast.find(
      (person) => person.alive && person.x === x && person.y === y
    );

    if (character) {
      addDrama(
        world,
        "society",
        [character],
        `${character.name}は${character.mood}な様子で、${character.relation}。`,
        `${character.name}を観測`
      );
    }
  });

  reset(randomSeed());
  requestAnimationFrame(frame);
})();
