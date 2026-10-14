(() => {
  "use strict";

  // Visual identity for each emotion: the whole page recolours to match.
  const EMOTIONS = {
    sadness:  { emoji: "😢", a: "#5b8def", b: "#8fd3ff", base: "#070b17", blurb: "Heavy words, quiet tone." },
    joy:      { emoji: "😄", a: "#ffc233", b: "#ff8a4c", base: "#150f06", blurb: "Bright, warm and full of energy." },
    love:     { emoji: "😍", a: "#ff5fa2", b: "#ff9bd0", base: "#170813", blurb: "Tender words, held close." },
    anger:    { emoji: "😡", a: "#ff4b4b", b: "#ff9a3c", base: "#170708", blurb: "Sharp and charged." },
    fear:     { emoji: "😨", a: "#9b6bff", b: "#5f7bff", base: "#0d0818", blurb: "Tense, on edge, looking over a shoulder." },
    surprise: { emoji: "😲", a: "#16d9c4", b: "#6bb8ff", base: "#05130f", blurb: "Unexpected, and it shows." },
  };
  const ORDER = ["sadness", "joy", "love", "anger", "fear", "surprise"];
  const CIRCUMFERENCE = 2 * Math.PI * 52;

  const $ = (id) => document.getElementById(id);
  const form = $("form"), textEl = $("text"), counter = $("counter"), submitBtn = $("submit");
  const errorEl = $("error"), idle = $("idle"), reading = $("reading");
  const emojiEl = $("emoji"), emotionEl = $("emotion"), blurbEl = $("blurb"), confEl = $("confidence");
  const ringFill = $("ringFill"), barsEl = $("bars"), burst = $("burst");
  const historyWrap = $("historyWrap"), historyEl = $("history");
  const history = [];

  // ---- input niceties ----
  const updateCounter = () => { counter.textContent = `${textEl.value.length} / ${window.MAX_CHARS}`; };
  textEl.addEventListener("input", updateCounter);
  textEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); form.requestSubmit(); }
  });
  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      textEl.value = chip.dataset.text;
      updateCounter();
      form.requestSubmit();
    })
  );

  // ---- submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) return showError("Type a sentence first.");

    hideError();
    setLoading(true);
    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The server didn't respond. Try again in a moment.");
      render(data);
      remember(text, data.emotion);
    } catch (err) {
      showError(err.message || "Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("loading", on);
    submitBtn.querySelector(".cta-label").textContent = on ? "Reading…" : "Read the emotion";
  }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function hideError() { errorEl.hidden = true; }

  // ---- render result ----
  function render({ emotion, confidence, probabilities }) {
    const cfg = EMOTIONS[emotion] || EMOTIONS.joy;

    // 1. recolour the whole page
    const root = document.documentElement.style;
    root.setProperty("--accent", cfg.a);
    root.setProperty("--accent2", cfg.b);
    root.setProperty("--base", cfg.base);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", cfg.base);

    // 2. headline details
    idle.hidden = true;
    reading.hidden = false;
    emojiEl.textContent = cfg.emoji;
    emotionEl.textContent = emotion;
    blurbEl.textContent = cfg.blurb;
    reading.classList.remove("pop");
    void reading.offsetWidth;            // restart the pop animation
    reading.classList.add("pop");

    // 3. confidence ring + count-up
    ringFill.style.transition = "none";
    ringFill.style.strokeDashoffset = CIRCUMFERENCE;
    void ringFill.getBoundingClientRect();
    ringFill.style.transition = "";
    requestAnimationFrame(() => { ringFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - confidence); });
    countUp(confEl, confidence * 100);

    // 4. probability bars (highest first)
    barsEl.innerHTML = "";
    const rows = ORDER.map((k) => [k, probabilities[k] || 0]).sort((x, y) => y[1] - x[1]);
    rows.forEach(([k, p], i) => {
      const li = document.createElement("li");
      li.className = "bar-row" + (i === 0 ? " top" : "");
      li.innerHTML =
        `<span>${EMOTIONS[k].emoji}</span><span class="name">${k}</span>` +
        `<div class="track"><div class="fill"></div></div><span class="pct">${(p * 100).toFixed(1)}%</span>`;
      barsEl.appendChild(li);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        li.querySelector(".fill").style.width = Math.max(p * 100, 1.5) + "%";
      }));
    });

    // 5. one moment of delight
    emojiBurst(cfg.emoji);
    if (window.matchMedia("(max-width: 880px)").matches) {
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function countUp(el, target) {
    const start = performance.now(), dur = 1100;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(1) + "%";
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function emojiBurst(emoji) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("span");
      s.textContent = emoji;
      s.style.setProperty("--dx", (Math.random() * 90 - 45) + "vw");
      s.style.setProperty("--dy", -(30 + Math.random() * 55) + "vh");
      s.style.setProperty("--rot", (Math.random() * 120 - 60) + "deg");
      s.style.setProperty("--size", (1.2 + Math.random() * 2) + "rem");
      s.style.animationDelay = (Math.random() * 0.25) + "s";
      burst.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  // ---- history ----
  function remember(text, emotion) {
    history.unshift({ text, emotion });
    if (history.length > 6) history.pop();
    historyEl.innerHTML = "";
    history.forEach((h) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const icon = document.createElement("span");
      icon.textContent = EMOTIONS[h.emotion].emoji;
      const label = document.createElement("span");
      label.textContent = h.text;          // textContent: user text is never parsed as HTML
      btn.append(icon, label);
      btn.addEventListener("click", () => { textEl.value = h.text; updateCounter(); form.requestSubmit(); });
      li.appendChild(btn);
      historyEl.appendChild(li);
    });
    historyWrap.hidden = false;
  }

  // ---- subtle 3D tilt on the two panels (desktop pointers only) ----
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".tilt").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--ry", (x * 4).toFixed(2) + "deg");
        el.style.setProperty("--rx", (-y * 4).toFixed(2) + "deg");
      });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });
  }

  updateCounter();
})();
