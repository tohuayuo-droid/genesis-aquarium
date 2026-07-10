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

  const TILE = 40;
  const COLS = 24;
  const ROWS = 14;

  const ICONS = {
    human: "🧑", beast: "🦊", bird: "🦅", plant: "🌿", fungus: "🍄", aquatic: "🪼",
    birth: "✨", conflict: "⚔️", discovery: "💡", disaster: "☄️", society: "🏘️", nature: "🌱", death: "🕯️"
  };

  let world = null;
  let running = true;
  let lastTime = performance.now();
  let accumulator = 0;
  let dramaAutoElapsed = 0;
  const DRAMA_AUTO_SECONDS = 8;
  const WORLD_RESTART_DELAY = 8;

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

  function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function randomSeed() {
    if (crypto?.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] || 1;
    }
    return Math.floor(Math.random() * 4294967295) || 1;
  }

  function createWorld(seed) {
    const rng = mulberry32(seed);

    // Seedごとに地形の骨格そのものを変える。
    // 海の多さ、島の中心、山脈、森の密度、湖の位置が毎回変わる。
    const terrainProfile = {
      seaLevel: 0.34 + rng() * 0.28,
      forestBias: 0.20 + rng() * 0.34,
      mountainBias: 0.68 + rng() * 0.20,
      islandCount: randInt(rng, 2, 5),
      ridgeAngle: rng() * Math.PI,
      ridgeOffset: rng() * 2 - 1
    };
    const islands = Array.from({ length: terrainProfile.islandCount }, () => ({
      x: rng() * (COLS - 1),
      y: rng() * (ROWS - 1),
      radiusX: 3.8 + rng() * 7.0,
      radiusY: 2.8 + rng() * 4.8,
      height: 0.72 + rng() * 0.65
    }));
    const lakeCenters = Array.from({ length: randInt(rng, 0, 3) }, () => ({
      x: randInt(rng, 3, COLS - 4),
      y: randInt(rng, 3, ROWS - 4),
      radius: 1.2 + rng() * 1.8
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
        const ridge = Math.sin((x * Math.cos(terrainProfile.ridgeAngle) + y * Math.sin(terrainProfile.ridgeAngle)) * 0.72 + terrainProfile.ridgeOffset * 4);
        const noise = (rng() - 0.5) * 0.42 + Math.sin(x * 0.91 + y * 0.37 + seed % 17) * 0.08;
        height += ridge * 0.10 + noise;

        let type = height < terrainProfile.seaLevel ? "water" : "grass";
        if (type !== "water") {
          const mountainScore = height + ridge * 0.12 + rng() * 0.12;
          if (mountainScore > terrainProfile.mountainBias) type = "mountain";
          else {
            const moisture = (Math.sin(x * 0.33 + seed % 13) + Math.cos(y * 0.46 + seed % 19)) * 0.16 + rng();
            if (moisture < terrainProfile.forestBias) type = "forest";
          }
        }

        if (type !== "mountain") {
          for (const lake of lakeCenters) {
            const dx = x - lake.x;
            const dy = y - lake.y;
            if (dx * dx + dy * dy < lake.radius * lake.radius) { type = "water"; break; }
          }
        }

        row.push({ type, fertility: rng(), heat: rng() });
      }
      tiles.push(row);
    }

    const speciesType = pick(rng, ["human", "beast", "bird", "plant", "fungus", "aquatic"]);
    const names = {
      human: ["ミナ", "カル", "セナ", "リオ", "トワ", "イラ"],
      beast: ["ガウ", "ルゥ", "キバ", "ネネ", "モク", "ハク"],
      bird: ["ソラ", "カゼ", "ツバサ", "アオ", "ヒナ", "レイ"],
      plant: ["若枝", "深根", "白花", "木環", "緑芽", "梢"],
      fungus: ["胞子七", "環菌", "白傘", "深糸", "月菌", "苔環"],
      aquatic: ["ミオ", "ナギ", "アワ", "シオ", "ウミ", "ルカ"]
    }[speciesType];

    const landCells = [];
    for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
      if (tiles[y][x].type !== "water" && tiles[y][x].type !== "mountain") landCells.push({x,y});
    }
    const home = pick(rng, landCells);

    // 世界の開始時点では、名前付き個体は存在しない。
    // 環境が整い、生命が生まれ、知性を持つ個体が現れた時点で初めて生成する。
    const cast = [];

    const settlement = {
      name: `${pick(rng, ["灰樹", "青潮", "風環", "深根", "白雲", "赤土"])}の共同体`,
      x: home.x,
      y: home.y,
      population: 0,
      stage: "生命前",
      culture: pick(rng, ["記憶を歌で残す", "季節ごとに移動する", "根や巣で情報を共有する", "星の位置で約束を決める"]),
      technology: "なし",
      stability: randInt(rng, 58, 88)
    };

    const w = {
      seed, rng, tiles, year: 0, season: 0, temperature: randInt(rng, 8, 28),
      biodiversity: randInt(rng, 2, 12),
      cast, speciesType, speciesNames: names, home,
      graves: [], lifeLevel: 0,
      settlement, news: [], dramas: [], dramaIndex: 0,
      eventFlags: new Set(), meteor: null, selectedCell: null,
      phase: "alive", extinctionElapsed: 0, nextSeed: null,
      extinctionPlan: createExtinctionPlan(rng)
    };

    addDrama(w, "nature", [], "風と水だけが動いている。まだ、この世界に名前を持つものはいない。", "無生物の世界");
    addNews(w, "nature", "新しい世界が形成された", "岩、水、大気がゆっくり循環し始めた。生命はまだ存在しない。");
    return w;
  }


  function createExtinctionPlan(rng) {
    const longLived = rng() < 0.18;
    const earliestYear = longLived ? randInt(rng, 900, 1500) : randInt(rng, 320, 760);
    const latestYear = longLived ? randInt(rng, 1800, 3200) : randInt(rng, earliestYear + 260, earliestYear + 1100);
    return {
      earliestYear,
      latestYear,
      riskPerYear: longLived ? 0.0008 + rng() * 0.0018 : 0.0018 + rng() * 0.0048,
      cause: pick(rng, [
        "長期的な気候崩壊",
        "連続する巨大噴火",
        "海と大気の急変",
        "生態系の連鎖崩壊",
        "恒星活動の異常",
        "資源循環の停止"
      ])
    };
  }

  function beginExtinction(w) {
    if (w.phase === "extinction") return;
    w.eventFlags.add("extinction");
    w.phase = "extinction";
    w.extinctionElapsed = 0;
    w.nextSeed = randomSeed();
    w.cast.forEach(cast => { if (w.rng() < 0.82) cast.alive = false; });
    w.settlement.population = Math.max(0, Math.floor(w.settlement.population * 0.06));
    w.settlement.stability = 0;
    w.settlement.stage = "崩壊跡";
    w.biodiversity = Math.max(0, Math.floor(w.biodiversity * 0.08));
    addNews(w, "death", "世界規模の終焉", `${w.extinctionPlan.cause}により、この世界の営みは静かに途切れた。`);
    const survivors = w.cast.filter(x => x.alive);
    addDrama(w, "death", survivors.length ? survivors.slice(0, 2) : [w.cast[0]], "空は灰色に沈み、残された名前も風景の中へ消えていった。", "世界の終わり");
  }

  function addNews(w, type, title, text) {
    w.news.push({ id: `${w.year}-${w.news.length}-${type}`, year: w.year, type, title, text });
    if (w.news.length > 120) w.news.shift();
  }

  function addDrama(w, type, participants, text, title) {
    w.dramas.push({ type, participants: participants.map(p => p.id), text, title, year: w.year });
    if (w.dramas.length > 24) w.dramas.shift();
    w.dramaIndex = w.dramas.length - 1;
    dramaAutoElapsed = 0;
  }

  function spawnNamedCast(w) {
    if (w.cast.length) return;
    const roles = ["探索者", "育て手", "記録者", "守り手"];
    w.cast = w.speciesNames.slice(0, 4).map((name, i) => ({
      id: `c${i}`,
      name,
      species: w.speciesType,
      role: roles[i],
      age: randInt(w.rng, 12, 46),
      x: clamp(w.home.x + randInt(w.rng, -2, 2), 1, COLS - 2),
      y: clamp(w.home.y + randInt(w.rng, -2, 2), 1, ROWS - 2),
      relation: i === 0 ? `友人：${w.speciesNames[1]}` : i === 1 ? `家族：${w.speciesNames[0]}` : i === 2 ? `対立：${w.speciesNames[3]}` : `恩人：${w.speciesNames[1]}`,
      mood: pick(w.rng, ["穏やか", "好奇心", "警戒", "希望"]),
      alive: true
    }));
  }

  function triggerMilestones() {
    const w = world;
    const r = w.rng;

    if (w.year >= 18 && !w.eventFlags.has("firstLife")) {
      w.eventFlags.add("firstLife");
      w.lifeLevel = 1;
      w.biodiversity = Math.max(w.biodiversity, 14);
      addNews(w, "birth", "最初の生命反応", "浅い水辺で、自己複製する小さな生命が生まれた。");
      addDrama(w, "birth", [], "水面の下で、ごく小さな生命が増え始めた。まだ名前も、意思もない。", "生命の誕生");
    }

    if (w.year >= 58 && !w.eventFlags.has("complexLife")) {
      w.eventFlags.add("complexLife");
      w.lifeLevel = 2;
      w.biodiversity = Math.max(w.biodiversity, 28);
      addNews(w, "nature", "複雑な生物が広がった", "移動し、食べ、逃げる生物が各地へ広がり始めた。");
      addDrama(w, "nature", [], "群れはまだ個体を区別しない。ただ環境に応じて増え、減っている。", "生態系の形成");
    }

    if (w.year >= 105 && !w.eventFlags.has("namedLife")) {
      w.eventFlags.add("namedLife");
      w.lifeLevel = 3;
      spawnNamedCast(w);
      w.settlement.population = randInt(w.rng, 12, 30);
      w.settlement.stage = "小さな集まり";
      w.settlement.technology = "採集と簡単な道具";
      const c = w.cast;
      addNews(w, "birth", "名前を持つ個体が現れた", `${c[0].name}たちは互いを識別し、記憶を共有し始めた。`);
      addDrama(w, "birth", [c[0]], `${c[0].name}は、共同体の外に広がる森を初めて見つめた。`, "最初の名前");
    }

    if (!w.cast.length) return;
    const c = w.cast;

    if (w.year >= 145 && !w.eventFlags.has("bond")) {
      w.eventFlags.add("bond");
      addNews(w, "society", "最初の強い絆", `${c[0].name}と${c[1].name}は食べ物と居場所を分け合った。`);
      addDrama(w, "society", [c[0], c[1]], `「ここを、戻ってこられる場所にしよう」`, "最初の約束");
    }
    if (w.year >= 195 && !w.eventFlags.has("settlement")) {
      w.eventFlags.add("settlement");
      w.settlement.stage = "定住集落";
      w.settlement.population += 45;
      w.settlement.technology = "保存食と住居";
      addNews(w, "society", `${w.settlement.name}が形になった`, "住居と食料置き場が集まり、帰る場所が生まれた。");
      addDrama(w, "society", [c[1], c[2]], `${c[1].name}は住居を増やしたい。${c[2].name}は森を残すべきだと考えている。`, "集落の最初の意見対立");
    }
    if (w.year >= 255 && !w.eventFlags.has("discovery")) {
      w.eventFlags.add("discovery");
      w.settlement.technology = pick(r, ["火と焼成", "水路", "胞子通信", "風を使う運搬", "貝殻の記録板"]);
      addNews(w, "discovery", "新しい技術が生まれた", `${c[2].name}が「${w.settlement.technology}」を共同体へ伝えた。`);
      addDrama(w, "discovery", [c[2], c[0]], `${c[2].name}「これで季節を越えられる」`, "発見の共有");
    }
    if (w.year >= 325 && !w.eventFlags.has("conflict")) {
      w.eventFlags.add("conflict");
      w.settlement.stability -= 18;
      addNews(w, "conflict", "共同体が二つの考えに割れた", `${c[2].name}と${c[3].name}は資源の使い方を巡って対立した。`);
      addDrama(w, "conflict", [c[2], c[3]], `「今を生きるために使う」「未来のために残す」`, "資源を巡る対立");
    }
    if (w.year >= 410 && !w.eventFlags.has("meteor")) {
      w.eventFlags.add("meteor");
      w.meteor = { progress: 0, x: randInt(r, 8, COLS - 8), y: randInt(r, 5, ROWS - 5), done: false };
      addNews(w, "disaster", "空に強い光", "巨大な天体が世界へ近づいている。誰にも止められない。");
      addDrama(w, "disaster", [c[0], c[1]], `二人は空を見上げた。言葉はなかった。`, "隕石接近");
    }
    if (w.year >= 510 && !w.eventFlags.has("recovery")) {
      w.eventFlags.add("recovery");
      w.biodiversity = Math.max(12, w.biodiversity + 8);
      addNews(w, "nature", "焼け跡に新しい芽", "災害の跡地から、以前とは異なる生命が広がり始めた。");
      const alive = c.filter(x => x.alive);
      if (alive.length) addDrama(w, "nature", alive.slice(0,2), `${alive[0].name}は、墓標のそばに芽吹いた小さな命を見つけた。`, "再生");
    }
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
    world.year += dt * speed * 2.2;
    world.season = (world.year / 8) % 4;
    world.temperature += (world.rng() - 0.5) * 0.025;
    world.biodiversity = clamp(world.biodiversity + (world.rng() - 0.48) * 0.03, 0, 100);

    // 滅亡時期はSeedごとに変わる。最短年以降は毎年少しずつ確率が上がり、最長年で必ず発生する。
    const plan = world.extinctionPlan;
    if (!world.eventFlags.has("extinction") && world.year >= plan.earliestYear) {
      const yearsAdvanced = dt * speed * 2.2;
      const agePressure = clamp((world.year - plan.earliestYear) / Math.max(1, plan.latestYear - plan.earliestYear), 0, 1);
      const risk = (plan.riskPerYear * (0.35 + agePressure * 2.4)) * yearsAdvanced;
      if (world.year >= plan.latestYear || world.rng() < risk) beginExtinction(world);
    }

    for (const c of world.cast) {
      if (!c.alive) continue;
      if (world.rng() < 0.02 * dt * speed) {
        c.x = clamp(c.x + randInt(world.rng, -1, 1), 1, COLS - 2);
        c.y = clamp(c.y + randInt(world.rng, -1, 1), 1, ROWS - 2);
      }
    }

    if (world.meteor && !world.meteor.done) {
      world.meteor.progress += dt * speed * 0.18;
      if (world.meteor.progress >= 1) {
        world.meteor.done = true;
        world.settlement.population = Math.max(4, Math.floor(world.settlement.population * 0.44));
        world.settlement.stability = Math.max(8, world.settlement.stability - 32);
        world.biodiversity = Math.max(5, world.biodiversity - 24);
        const living = world.cast.filter(c => c.alive);
        const victim = living.length ? living[living.length - 1] : null;
        if (victim) {
          victim.alive = false;
          world.graves.push({ x: victim.x, y: victim.y, name: victim.name, year: Math.floor(world.year) });
          const witness = world.cast.find(c => c.alive);
          addNews(world, "disaster", "隕石衝突", `${world.settlement.name}は大きな被害を受け、${victim.name}の記録はここで途切れた。`);
          addDrama(world, "death", witness ? [witness] : [], witness ? `${witness.name}は、失われた${victim.name}のために墓標を立てた。` : `${victim.name}の名を刻んだ墓標だけが残った。`, "喪失の記憶");
        } else {
          addNews(world, "disaster", "隕石衝突", `${world.settlement.name}は大きな被害を受けた。`);
        }
      }
    }

    triggerMilestones();
  }

  function drawTree(x, y, size) {
    ctx.fillStyle = "#70472f";
    ctx.fillRect(x - size * 0.08, y + size * 0.1, size * 0.16, size * 0.32);
    ctx.fillStyle = "#205f3a";
    ctx.beginPath(); ctx.arc(x, y, size * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f7b49";
    ctx.beginPath(); ctx.arc(x - size * 0.16, y + size * 0.05, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.17, y + size * 0.05, size * 0.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawHouse(x, y, size, lit = false) {
    ctx.fillStyle = "#ead4a4";
    ctx.fillRect(x - size * 0.3, y - size * 0.02, size * 0.6, size * 0.45);
    ctx.fillStyle = "#9b4f3d";
    ctx.beginPath();
    ctx.moveTo(x - size * 0.38, y); ctx.lineTo(x, y - size * 0.36); ctx.lineTo(x + size * 0.38, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#70472f";
    ctx.fillRect(x - size * 0.07, y + size * 0.18, size * 0.14, size * 0.25);
    ctx.fillStyle = lit ? "#ffd36b" : "#84b9ce";
    ctx.fillRect(x - size * 0.23, y + size * 0.1, size * 0.12, size * 0.12);
    ctx.fillRect(x + size * 0.11, y + size * 0.1, size * 0.12, size * 0.12);
  }

  function drawCharacter(c, x, y, size) {
    const emoji = ICONS[c.species] || "🧑";
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
    const w = world;
    if (!w) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cw = canvas.width / COLS;
    const ch = canvas.height / ROWS;

    // Large, readable RPG-like tiles.
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = w.tiles[y][x];
      const px = x * cw, py = y * ch;
      if (t.type === "water") {
        ctx.fillStyle = "#3c91b7"; ctx.fillRect(px, py, cw + 1, ch + 1);
        ctx.strokeStyle = "rgba(210,245,255,.45)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px+cw*.12,py+ch*.38); ctx.quadraticCurveTo(px+cw*.36,py+ch*.26,px+cw*.58,py+ch*.38); ctx.quadraticCurveTo(px+cw*.78,py+ch*.49,px+cw*.92,py+ch*.38); ctx.stroke();
      } else {
        ctx.fillStyle = t.type === "forest" ? "#7cac62" : t.type === "mountain" ? "#8d987c" : "#9cc676";
        ctx.fillRect(px, py, cw + 1, ch + 1);
        ctx.fillStyle = "rgba(255,255,255,.05)";
        ctx.fillRect(px+2,py+2,cw-4,ch-4);
        if (t.type === "forest") {
          drawTree(px+cw*.35, py+ch*.43, Math.min(cw,ch)*.8);
          if ((x+y)%2===0) drawTree(px+cw*.72, py+ch*.6, Math.min(cw,ch)*.56);
        } else if (t.type === "mountain") {
          ctx.fillStyle = "#69706c";
          ctx.beginPath(); ctx.moveTo(px+cw*.08,py+ch*.82); ctx.lineTo(px+cw*.5,py+ch*.12); ctx.lineTo(px+cw*.94,py+ch*.82); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#dce3dc";
          ctx.beginPath(); ctx.moveTo(px+cw*.37,py+ch*.34); ctx.lineTo(px+cw*.5,py+ch*.12); ctx.lineTo(px+cw*.63,py+ch*.34); ctx.closePath(); ctx.fill();
        } else if ((x*7+y*11)%9===0) {
          ctx.fillStyle = "#d8e89c";
          for (let i=0;i<3;i++){ctx.beginPath();ctx.arc(px+cw*(.25+i*.18),py+ch*.62,2.2,0,Math.PI*2);ctx.fill();}
        }
      }
      ctx.strokeStyle = "rgba(23,49,51,.10)"; ctx.lineWidth = 1; ctx.strokeRect(px,py,cw,ch);
    }

    const s = w.settlement;
    const sx = (s.x + .5) * cw, sy = (s.y + .5) * ch;
    // 名前付き個体が社会を作るまでは、道・畑・住居を描かない。
    if (s.stage !== "生命前") {
      ctx.strokeStyle = "#c3a77a"; ctx.lineWidth = Math.max(5,cw*.12); ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(sx-cw*2.2,sy+ch*.75); ctx.lineTo(sx+cw*2.2,sy+ch*.75); ctx.stroke();
      ctx.fillStyle = "#d3b76f";
      for(let r=0;r<3;r++) for(let c2=0;c2<4;c2++) ctx.fillRect(sx+cw*(.8+c2*.16),sy+ch*(-.35+r*.18),cw*.09,ch*.12);
      drawHouse(sx-cw*.65, sy-ch*.05, Math.min(cw,ch)*.9, true);
      drawHouse(sx+cw*.15, sy-ch*.1, Math.min(cw,ch)*1.0, false);
      if (s.stage === "定住集落") drawHouse(sx+cw*.82, sy+ch*.02, Math.min(cw,ch)*.82, true);
    }

    // Named characters: large sprite + name plaque.
    for (const c of w.cast) {
      if (!c.alive) continue;
      const px = (c.x + .5) * cw;
      const py = (c.y + .56) * ch;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(px,py+ch*.22,cw*.26,ch*.11,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.beginPath(); ctx.arc(px, py-ch*.02, Math.min(cw,ch)*.38, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = c.species === "plant" ? "#173c24" : "#10192d"; ctx.lineWidth = 4; ctx.stroke();
      drawCharacter(c, px, py, Math.min(cw,ch)*.92);
      ctx.font = `800 ${Math.max(14, Math.floor(ch*.3))}px system-ui`;
      const tw = ctx.measureText(c.name).width + 18;
      const labelY = py - ch * .78;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.55)";
      ctx.shadowBlur = 5;
      ctx.fillStyle = "rgba(15,25,48,.94)";
      ctx.strokeStyle = "rgba(156,181,236,.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px - tw / 2, labelY, tw, ch * .36, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.name, px, labelY + ch * .18);
    }

    // 亡くなった名前付き個体の場所には墓標を残す。
    for (const grave of w.graves) {
      const gx = (grave.x + .5) * cw;
      const gy = (grave.y + .58) * ch;
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath(); ctx.ellipse(gx, gy + ch*.2, cw*.25, ch*.10, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#d8d2c6";
      ctx.strokeStyle = "#3f454b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(gx - cw*.18, gy - ch*.15, cw*.36, ch*.42, 7);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#646b72";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gx, gy - ch*.08); ctx.lineTo(gx, gy + ch*.12);
      ctx.moveTo(gx - cw*.08, gy); ctx.lineTo(gx + cw*.08, gy);
      ctx.stroke();
      ctx.font = `800 ${Math.max(12, Math.floor(ch*.23))}px system-ui`;
      const tw = ctx.measureText(grave.name).width + 14;
      ctx.fillStyle = "rgba(15,25,48,.94)";
      ctx.beginPath(); ctx.roundRect(gx - tw/2, gy - ch*.52, tw, ch*.28, 6); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(grave.name, gx, gy - ch*.38);
    }

    if (w.meteor && !w.meteor.done) {
      const m = w.meteor, tx=(m.x+.5)*cw, ty=(m.y+.5)*ch, sx2=canvas.width+80, sy2=-80;
      const px=sx2+(tx-sx2)*m.progress, py=sy2+(ty-sy2)*m.progress;
      ctx.strokeStyle="#ffbd6a";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(px+70,py-55);ctx.lineTo(px,py);ctx.stroke();
      ctx.fillStyle="#ff7c82";ctx.beginPath();ctx.arc(px,py,16,0,Math.PI*2);ctx.fill();
    }
    if (w.meteor?.done) {
      const px=(w.meteor.x+.5)*cw, py=(w.meteor.y+.5)*ch;
      ctx.fillStyle="rgba(45,28,24,.82)";ctx.beginPath();ctx.ellipse(px,py,cw*.55,ch*.35,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#ff9a66";ctx.lineWidth=3;ctx.stroke();
    }
    if (w.phase === "extinction") {
      const p = clamp(w.extinctionElapsed / WORLD_RESTART_DELAY, 0, 1);
      ctx.fillStyle = `rgba(48, 25, 28, ${0.46 + p * 0.3})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `rgba(20, 20, 26, ${0.25 + p * 0.45})`;
      for (let i = 0; i < 28; i++) {
        const rx = ((i * 83 + w.seed) % canvas.width);
        const ry = ((i * 47 + w.seed) % canvas.height);
        ctx.beginPath(); ctx.arc(rx, ry, 12 + (i % 5) * 7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff1e7";
      ctx.font = "800 34px system-ui";
      ctx.fillText("この世界は滅びた", canvas.width / 2, canvas.height / 2 - 18);
      ctx.font = "600 17px system-ui";
      const remain = Math.max(0, Math.ceil(WORLD_RESTART_DELAY - w.extinctionElapsed));
      ctx.fillText(`次の世界を生成するまで ${remain} 秒`, canvas.width / 2, canvas.height / 2 + 22);
    }
    if (w.selectedCell) {
      ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.strokeRect(w.selectedCell.x*cw+3,w.selectedCell.y*ch+3,cw-6,ch-6);
    }
  }

  function renderDrama() {
    if (!world.dramas.length) {
      dramaScene.innerHTML = '<div class="empty">まだ記録できるドラマはない。</div>';
      return;
    }
    const d = world.dramas[clamp(world.dramaIndex, 0, world.dramas.length - 1)];
    const participants = d.participants.map(id => world.cast.find(c => c.id === id)).filter(Boolean);
    const cards = participants.map((c, i) => `
      <article class="speech-card">
        <div class="cast-head">
          <div class="cast-icon">${ICONS[c.species]}</div>
          <div><div class="cast-name">${c.name}</div><div class="cast-meta">${c.role}・${c.alive ? `${Math.floor(c.age + world.year/20)}歳` : "記録上は死亡"}</div></div>
        </div>
        <p class="speech">${i === 0 ? d.text : responseFor(d.type, c)}</p>
        <div class="relation">${c.relation}</div>
      </article>`).join("");
    dramaScene.innerHTML = cards + `<article class="speech-card"><div class="cast-name">${ICONS[d.type] || "📖"} ${d.title}</div><div class="cast-meta">世界歴 ${Math.floor(d.year)}年</div><p class="speech">この場面は世界ニュースと地図上の変化から自動生成された。</p></article>`;
  }

  function responseFor(type, c) {
    const text = {
      society: `「${c.mood === "警戒" ? "急ぎすぎてはいけない" : "一緒なら続けられる"}」`,
      discovery: `「この知識を失わないようにしよう」`,
      conflict: `「私には別の未来が見えている」`,
      disaster: `「あの光は、何を連れてくるのだろう」`,
      nature: `「終わったと思った場所にも、命は戻る」`,
      death: `「名前を忘れなければ、完全には消えない」`,
      birth: `「ここには、まだ知らないものがある」`
    };
    return text[type] || `「${c.mood}な気持ちで見守っている」`;
  }

  function renderInfo() {
    const w = world;
    worldSummary.textContent = `世界歴 ${Math.floor(w.year)}年・Seed ${w.seed}`;
    worldState.innerHTML = `<dl>
      <dt>気温</dt><dd>${w.temperature.toFixed(1)}℃</dd>
      <dt>生物多様性</dt><dd>${Math.floor(w.biodiversity)}%</dd>
      <dt>季節</dt><dd>${["芽吹き", "繁茂", "実り", "休眠"][Math.floor(w.season)]}</dd>
      <dt>災害</dt><dd>${w.phase === "extinction" ? "世界滅亡" : w.meteor && !w.meteor.done ? "隕石接近中" : w.meteor?.done ? "衝突跡あり" : "目立つ兆候なし"}</dd>
    </dl>`;
    civilizationState.innerHTML = w.settlement.stage === "生命前"
      ? `<p class="empty">文明や共同体はまだ存在しない。</p>`
      : `<dl>
          <dt>名前</dt><dd>${w.settlement.name}</dd>
          <dt>段階</dt><dd>${w.settlement.stage}</dd>
          <dt>人口</dt><dd>${w.settlement.population}</dd>
          <dt>技術</dt><dd>${w.settlement.technology}</dd>
          <dt>文化</dt><dd>${w.settlement.culture}</dd>
          <dt>安定度</dt><dd>${w.settlement.stability}%</dd>
        </dl>`;
    castState.innerHTML = w.cast.length
      ? `<dl>${w.cast.map(c => `<dt>${ICONS[c.species]} ${c.name}</dt><dd>${c.alive ? c.role : "死亡・墓標あり"}</dd>`).join("")}</dl>`
      : `<p class="empty">まだ名前を持つ個体はいない。</p>`;
  }

  function renderNews() {
    const nearBottom = newsFeed.scrollHeight - newsFeed.scrollTop - newsFeed.clientHeight < 90;
    newsFeed.innerHTML = world.news.map(n => `
      <article class="news-item">
        <div class="news-avatar">${ICONS[n.type] || "🌍"}</div>
        <div>
          <div class="news-time">世界歴 ${Math.floor(n.year)}年</div>
          <div class="news-title">${n.title}</div>
          <div class="news-text">${n.text}</div>
          <span class="tag">${n.type}</span>
        </div>
      </article>`).join("");
    if (nearBottom) newsFeed.scrollTop = newsFeed.scrollHeight;
  }

  function render() {
    drawWorld();
    renderDrama();
    renderInfo();
    renderNews();
  }

  function reset(seed) {
    world = createWorld(seed >>> 0 || 1);
    dramaAutoElapsed = 0;
    seedInput.value = String(world.seed);
    running = true;
    pauseBtn.textContent = "一時停止";
    render();
  }

  newWorldBtn.addEventListener("click", () => {
    const input = Number(seedInput.value.trim());
    reset(Number.isFinite(input) && input > 0 ? input : randomSeed());
  });
  pauseBtn.addEventListener("click", () => {
    running = !running;
    pauseBtn.textContent = running ? "一時停止" : "再開";
  });
  nextDramaBtn.addEventListener("click", () => {
    if (!world.dramas.length) return;
    world.dramaIndex = (world.dramaIndex + 1) % world.dramas.length;
    dramaAutoElapsed = 0;
    renderDrama();
  });
  clearNewsBtn.addEventListener("click", () => {
    if (world.news.length > 12) world.news = world.news.slice(-12);
    renderNews();
  });
  canvas.addEventListener("click", e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * COLS);
    const y = Math.floor((e.clientY - rect.top) / rect.height * ROWS);
    world.selectedCell = {x: clamp(x,0,COLS-1), y: clamp(y,0,ROWS-1)};
    drawWorld();
  });

  function loop(now) {
    const dt = Math.min(.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += dt;
    dramaAutoElapsed += dt;
    update(dt);

    if (world?.dramas.length > 1 && dramaAutoElapsed >= DRAMA_AUTO_SECONDS) {
      dramaAutoElapsed = 0;
      world.dramaIndex = (world.dramaIndex + 1) % world.dramas.length;
      renderDrama();
    }

    if (accumulator > .12) {
      accumulator = 0;
      render();
    } else {
      drawWorld();
    }
    requestAnimationFrame(loop);
  }

  reset(randomSeed());
  requestAnimationFrame(loop);
})();
