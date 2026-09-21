// ==UserScript==
// @name         gboss Local Calculator
// @namespace    http://tampermonkey.net/
// @version      3.10.0
// @description  Standalone guild boss calculator, rollcalls and pacing.
// @match        https://lyrania.co.uk/game.php*
// @match        https://dev.lyrania.co.uk/game.php*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(() => {
  // gboss/calculator.js
  var SCALE = 1e21;
  function plainNumber(value) {
    if (value === null || !Number.isFinite(value)) return "";
    const text = String(value);
    if (!/[eE]/.test(text)) return text;
    const [mantissa, exponent] = text.toLowerCase().split("e");
    const negative = mantissa.startsWith("-");
    const unsigned = negative ? mantissa.slice(1) : mantissa;
    const [whole, fraction = ""] = unsigned.split(".");
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    const expanded = point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
    return (negative ? "-" : "") + expanded;
  }
  function parseBoss(text) {
    const m = text.replace(/\s+/g, " ").match(/The Dragon has ([\d,]+) health points? remaining and will continue to be vulnerable for another (?:(\d+) minutes?\b(?:\s+and\s+|\s*)?)?(?:(\d+) seconds?\b)?/i);
    if (!m || !m[2] && !m[3]) return null;
    return { hp: m[1].replaceAll(",", ""), minutes: Number(m[2] || 0), seconds: Number(m[3] || 0) };
  }
  function parseRollcalls(text) {
    return text.split("\n").map((x) => x.trim()).filter(Boolean).map((line, i) => {
      const raw = line;
      const value = Number(raw.replace(",", "."));
      if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw) || !Number.isFinite(value)) throw new Error(`Rollcall line ${i + 1}: enter only a non-negative number in sextillions, such as 125.5.`);
      return { value };
    });
  }
  function calculate(rollcalls, status) {
    const target = rollcalls.reduce((sum, row) => sum + row.value, 0);
    if (!Number.isFinite(target) || target < 0) throw new Error("Rollcall total must be finite and non-negative.");
    const minLeft = status ? status.minutes + status.seconds / 60 : null;
    const perMinute = target > 0 ? target / 15 : null;
    const expected = target > 0 && minLeft > 0 ? perMinute * minLeft : null;
    const remaining = status ? Number(status.hp) / SCALE : null;
    const delta = expected === null ? null : expected - remaining;
    return {
      target,
      count: rollcalls.length,
      rp: rollcalls.length * 3024,
      offering: target > 0 ? Math.exp((Math.log(target * 1e6) + 15 * Math.log(10) - Math.log(7)) / 2.2) / 50 : null,
      minLeft,
      perMinute,
      perAttack: (perMinute || 0) / 12,
      expected,
      remaining,
      ahead: delta > 0 ? delta : null,
      behind: delta < 0 ? -delta : null,
      secondsAhead: delta > 0 ? Math.round(delta / perMinute * 600) / 10 : null,
      secondsBehind: delta < 0 ? Math.round(-delta / perMinute * 600) / 10 : null
    };
  }

  // gboss/standalone.js
  (() => {
    "use strict";
    const KEY = "gboss-local-v3:" + location.hostname;
    const defaults = { rollcalls: "0\n0\n0\n0", channel: "1", open: false, compact: false };
    let state;
    try {
      state = { ...defaults, ...JSON.parse(GM_getValue(KEY, "{}")) };
    } catch {
      state = { ...defaults };
    }
    let live = null, lastRead = 0, visibleBoss = false;
    let root, host, metrics, statusLabel, notice, panel, toggle, rollInput, channelInput, compactButton;
    const fmt = (n) => n === null || !Number.isFinite(n) ? "\u2014" : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    const rawHP = (s) => s ? BigInt(s.hp).toLocaleString("en-US") : "\u2014";
    function save() {
      try {
        GM_setValue(KEY, JSON.stringify(state));
      } catch (e) {
        tell("Could not save: " + e.message);
      }
    }
    function tell(text) {
      notice.textContent = text;
    }
    function el(tag, text, parent, cls) {
      const n = document.createElement(tag);
      if (text != null) n.textContent = text;
      if (cls) n.className = cls;
      if (parent) parent.append(n);
      return n;
    }
    function button(text, parent, action) {
      const b = el("button", text, parent);
      b.type = "button";
      b.addEventListener("click", action);
      return b;
    }
    function label(text, parent) {
      return el("label", text, parent);
    }
    function show() {
      panel.hidden = !state.open;
      toggle.setAttribute("aria-expanded", String(state.open));
      panel.className = state.compact ? "window compact" : "window";
      compactButton.textContent = state.compact ? "Expand" : "Compact";
      compactButton.setAttribute("aria-pressed", String(state.compact));
    }
    function toggleWindow() {
      state.open = !state.open;
      show();
      save();
    }
    function stats() {
      return calculate(parseRollcalls(rollInput.value), live);
    }
    function render() {
      if (!root) return;
      statusLabel.textContent = live ? `${visibleBoss ? "Reading game" : "Last known values \u2022 boss not visible"} \xB7 updated ${Math.floor((Date.now() - lastRead) / 1e3)}s ago` : "Waiting for Dragon status in the game";
      try {
        const c = stats();
        const s = live;
        const rows = [["Rollcall total / target (s)", c.target], ["Rollcalls", c.count], ["Estimated RP", c.rp], ["Gold offering", c.offering], ["Boss HP (exact)", rawHP(s)], ["Boss health (s)", c.remaining], ["Minutes / seconds", s ? `${s.minutes}m ${s.seconds}s` : "\u2014"], ["Minutes left (real)", c.minLeft], ["Average damage / minute (s)", c.perMinute], ["Average damage / attack (s)", c.perAttack], ["Target HP left now (s)", c.expected], ["Damage ahead (s)", c.ahead], ["Damage behind (s)", c.behind], ["Seconds ahead", c.secondsAhead], ["Seconds behind", c.secondsBehind]];
        metrics.replaceChildren();
        for (const [name, value] of state.compact ? rows.slice(-4) : rows) {
          const display = typeof value === "string" ? value : fmt(value);
          el("dt", name, metrics);
          el("dd", display, metrics);
        }
      } catch (e) {
        metrics.replaceChildren();
        el("p", e.message, metrics, "error");
      }
    }
    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        tell("Copied: " + text);
      } catch {
        tell("Clipboard unavailable. Copy this text: " + text);
      }
    }
    function insertChat(message) {
      const channel = channelInput.value.trim();
      if (!/^\d+$/.test(channel)) return tell("Enter a channel number using digits only.");
      const input = document.getElementById("inputchat");
      if (!input || input.disabled || input.readOnly) return tell("The game chat input is unavailable.");
      input.value = "/" + channel + " " + message;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      tell("Placed in chat: " + input.value);
    }
    function mount() {
      if (host) {
        if (!host.isConnected && document.documentElement) document.documentElement.append(host);
        return;
      }
      if (!document.documentElement) return;
      host = document.createElement("div");
      host.id = "gboss-local-app";
      host.style.cssText = "all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important";
      root = host.attachShadow({ mode: "open" });
      el("style", `:host{color-scheme:dark}*{box-sizing:border-box} [hidden]{display:none!important}button,input,textarea{font:inherit}button{cursor:pointer;background:#263d50;border:1px solid #597589;color:#f2f7fa;border-radius:6px;padding:7px 10px}button:hover{background:#36576e}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #78dfcb}input,textarea{background:#101d29;color:#fff;border:1px solid #526779;border-radius:5px;padding:8px;max-width:100%}textarea{display:block;width:100%;min-height:280px;resize:vertical}label{display:block;margin:12px 0 6px}p{line-height:1.5}.window{font:13px/1.4 system-ui,sans-serif;background:#13222e;color:#e6edf2;border:1px solid #597589;border-radius:12px;width:min(510px,calc(100vw - 32px));height:auto;max-height:calc(100vh - 86px);margin-bottom:10px;overflow:auto;box-shadow:0 12px 50px #0008;padding:18px}.window.compact{width:min(360px,calc(100vw - 32px))}.compact .full-only{display:none!important}.notice:empty{display:none}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{margin:0;font-size:21px}h3{margin-bottom:8px}.muted{color:#a9becc;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;background:#0d1923;padding:14px;border-radius:8px}dt{color:#b4c9d6}dd{margin:0;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.error{color:#ffb5a9}.notice{white-space:pre-wrap;overflow-wrap:anywhere;color:#8ce2d0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;border-bottom:1px solid #334959;padding:8px}th{color:#a9becc} .launcher{font:600 14px system-ui;float:right;background:#1e5e60}summary{cursor:pointer}.rollcall-layout{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;margin-top:12px}.rollcall-layout label{margin-top:0}.chat-controls input{display:block;width:80px;margin-top:6px}.chat-controls .actions{display:flex;flex-direction:column;align-items:stretch}.chat-controls button{text-align:left}@media(max-width:420px){.rollcall-layout{grid-template-columns:1fr}}`, root);
      panel = el("section", null, root, "window");
      panel.setAttribute("aria-label", "Guild boss calculator");
      const head = el("div", null, panel, "head");
      el("h2", "Guild boss", head);
      compactButton = button("Compact", head, () => {
        state.compact = !state.compact;
        notice.textContent = "";
        show();
        render();
        save();
      });
      button("Close", head, toggleWindow);
      el("p", "Local calculator \xB7 s = 10\xB2\xB9 HP \xB7 Alt+Shift+G to toggle", panel, "muted full-only");
      statusLabel = el("p", "", panel, "muted full-only");
      metrics = el("dl", null, panel);
      const goldButton = button("Copy gold offering", panel, () => {
        try {
          const value = plainNumber(stats().offering === null ? null : Math.floor(stats().offering));
          if (!value) return tell("Enter a positive rollcall total to calculate a gold offering.");
          copy(value);
        } catch (e) {
          tell(e.message);
        }
      });
      goldButton.className = "full-only";
      const layout = el("div", null, panel, "rollcall-layout full-only");
      const rl = label("Rollcalls", layout);
      rollInput = el("textarea", null, rl);
      rollInput.value = state.rollcalls;
      rollInput.addEventListener("input", () => {
        state.rollcalls = rollInput.value;
        save();
        render();
      });
      const controls = el("div", null, layout, "chat-controls");
      const channelLabel = label("Chat channel number", controls);
      channelInput = el("input", null, channelLabel);
      channelInput.type = "text";
      channelInput.inputMode = "numeric";
      channelInput.value = state.channel;
      channelInput.addEventListener("input", () => {
        state.channel = channelInput.value;
        save();
      });
      const chat = el("div", null, controls, "actions");
      for (const text of ["<<<< ROLLCALL >>>>", "Setting up...", "Spawning in 10...", "Attack!!!"]) button("Insert " + text, chat, () => insertChat(text));
      button("Insert pace", panel, () => {
        try {
          const c = stats();
          if (c.expected === null) return tell("Enter a positive rollcall total and open the active Dragon fight first.");
          insertChat(c.secondsAhead !== null ? "+" + c.secondsAhead : c.secondsBehind !== null ? "-" + c.secondsBehind : "0");
        } catch (e) {
          tell(e.message);
        }
      });
      el("p", "Command buttons fill the chat box. Press Enter in chat when ready to send.", controls, "muted");
      notice = el("p", "", panel, "notice");
      notice.setAttribute("role", "status");
      toggle = button("Guild boss", root, toggleWindow);
      toggle.className = "launcher";
      show();
      document.documentElement.append(host);
      render();
    }
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.shiftKey && e.code === "KeyG" && !e.repeat) {
        e.preventDefault();
        if (root) toggleWindow();
      }
    });
    function tick() {
      mount();
      const content = document.getElementById("content");
      const parsed = content && parseBoss(content.textContent || "");
      visibleBoss = !!parsed;
      if (parsed && JSON.stringify(parsed) !== JSON.stringify(live)) {
        live = parsed;
        lastRead = Date.now();
      }
      render();
    }
    setInterval(tick, 250);
    tick();
  })();
})();
