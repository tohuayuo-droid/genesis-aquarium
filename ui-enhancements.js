(() => {
  "use strict";

  const dramaScene = document.getElementById("dramaScene");
  const seedInput = document.getElementById("seedInput");
  const worldId = document.getElementById("streamWorldId");

  if (!dramaScene) return;

  const iconMap = {
    "🧑": "🧑",
    "🦊": "🦊",
    "🦅": "🦅",
    "🌿": "🌿",
    "🍄": "🍄",
    "🪼": "🪼",
    "🌱": "🌱",
    "⚔️": "⚔️",
    "💡": "💡",
    "🌪️": "🌪️",
    "🕯️": "🕯️",
    "✨": "✨",
    "🏘️": "🏘️"
  };

  let lastSignature = "";

  function updateWorldId() {
    if (!worldId || !seedInput) return;
    const seed = String(seedInput.value || "").trim();
    worldId.textContent = seed ? `Genesis-${seed.slice(-6).toUpperCase()}` : "Genesis";
  }

  function enhanceDrama() {
    const header = dramaScene.querySelector(".drama-header");
    const cast = dramaScene.querySelector(".drama-cast");
    const text = dramaScene.querySelector(".drama-text");

    if (!header || !cast || !text) return;

    const signature = `${header.textContent}|${cast.textContent}|${text.textContent}`;
    if (signature === lastSignature && dramaScene.querySelector(".drama-illustration")) {
      updateWorldId();
      return;
    }

    lastSignature = signature;

    dramaScene.querySelector(".drama-illustration")?.remove();

    const avatars = Array.from(cast.querySelectorAll(".drama-avatar"))
      .map((el) => el.textContent.trim())
      .filter(Boolean);

    const first = avatars[0] || "🌍";
    const second = avatars[1] || "";

    const illustration = document.createElement("div");
    illustration.className = "drama-illustration";
    illustration.innerHTML = `
      <span class="illustration-emoji">${iconMap[first] || first}</span>
      ${second ? `<span class="illustration-emoji secondary">${iconMap[second] || second}</span>` : ""}
    `;

    dramaScene.prepend(illustration);
    updateWorldId();
  }

  function loop() {
    enhanceDrama();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
