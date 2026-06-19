const ROOT_ID = "in-and-out-root";
const BANNER_ID = "in-and-out-banner";

let timerId = null;
let ringing = false;

init();

async function init() {
  if (window.top !== window) return;
  if (document.documentElement.dataset.inAndOutLoaded) return;
  document.documentElement.dataset.inAndOutLoaded = "true";

  const settingsResponse = await sendMessage({ type: "getSettings" });
  if (!settingsResponse?.ok || !matchesSite(location.hostname, settingsResponse.settings.sites)) {
    return;
  }

  const sessionResponse = await sendMessage({ type: "getSession" });
  if (sessionResponse?.session) {
    showBanner(sessionResponse.session);
  } else {
    showGate(settingsResponse.settings);
  }
}

function showGate(settings) {
  waitForBody(async () => {
    document.documentElement.classList.add("in-and-out-locked");

    const historyResponse = await sendMessage({ type: "getPurposeHistory" });
    const history = historyResponse?.history || [];

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="iao-backdrop"></div>
      <form class="iao-gate" autocomplete="off">
        <div class="iao-kicker">In-and-Out</div>
        <label class="iao-title" for="iao-purpose">你来这里是为了干什么？</label>
        <textarea id="iao-purpose" class="iao-purpose" maxlength="120" rows="2" placeholder="例如：查一个 B 站代码教程"></textarea>
        <div class="iao-history" id="iao-history"></div>
        <div class="iao-row">
          <label class="iao-minutes-label" for="iao-minutes">分钟</label>
          <input id="iao-minutes" class="iao-minutes" type="number" min="1" max="240" step="1" value="${escapeHtml(settings.minutes)}">
          <button class="iao-start" type="submit">开始</button>
        </div>
      </form>
    `;

    document.documentElement.append(root);

    const form = root.querySelector("form");
    const purposeInput = root.querySelector("#iao-purpose");
    const minutesInput = root.querySelector("#iao-minutes");

    const historyContainer = root.querySelector("#iao-history");
    history.forEach((text) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "iao-history-tag";
      tag.textContent = text;
      tag.addEventListener("click", () => {
        purposeInput.value = text;
        purposeInput.focus();
      });
      historyContainer.appendChild(tag);
    });

    purposeInput.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const purpose = purposeInput.value.trim();
      if (!purpose) {
        purposeInput.classList.add("iao-shake");
        setTimeout(() => purposeInput.classList.remove("iao-shake"), 260);
        return;
      }

      const response = await sendMessage({
        type: "startSession",
        purpose,
        minutes: minutesInput.value
      });
      if (!response?.ok) return;

      root.remove();
      document.documentElement.classList.remove("in-and-out-locked");
      showBanner(response.session);
    });
  });
}

function showBanner(session) {
  waitForBody(() => {
    document.getElementById(BANNER_ID)?.remove();

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <div class="iao-banner-main">
        <div class="iao-banner-copy">
          <strong class="iao-countdown">--:--</strong>
          <span class="iao-goal"></span>
        </div>
      </div>
      <div class="iao-actions">
        <button type="button" data-reduce="3">-3</button>
        <button type="button" data-reduce="5">-5</button>
        <button type="button" data-extend="3">+3</button>
        <button type="button" data-extend="5">+5</button>
        <button type="button" data-finish>结束</button>
      </div>
    `;

    const collapseToggle = document.createElement("button");
    collapseToggle.type = "button";
    collapseToggle.className = "iao-collapse-toggle";
    collapseToggle.setAttribute("aria-label", "折叠");
    collapseToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5.5 3L9.5 7L5.5 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    banner.appendChild(collapseToggle);

    document.documentElement.append(banner);
    banner.querySelector(".iao-goal").textContent = session.purpose;

    if (readBannerCollapsed()) {
      banner.classList.add("iao-collapsed");
    }

    collapseToggle.addEventListener("click", () => {
      banner.classList.toggle("iao-collapsed");
      saveBannerCollapsed(banner.classList.contains("iao-collapsed"));
    });

    banner.addEventListener("click", async (event) => {
      const reduce = event.target.closest("[data-reduce]");
      if (reduce) {
        const response = await sendMessage({
          type: "reduceSession",
          minutes: reduce.dataset.reduce
        });
        if (response?.ok) {
          startCountdown(banner, response.session);
        }
        return;
      }

      const extend = event.target.closest("[data-extend]");
      if (extend) {
        const response = await sendMessage({
          type: "extendSession",
          minutes: extend.dataset.extend
        });
        if (response?.ok) {
          startCountdown(banner, response.session);
        }
        return;
      }

      if (event.target.closest("[data-finish]")) {
        sendMessage({ type: "finishNow" });
      }
    });

    startCountdown(banner, session);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "session") return;
      const domain = location.hostname.toLowerCase().replace(/^www\./, "");
      const key = `site:${domain}`;
      if (!changes[key]) return;
      const updated = changes[key].newValue;
      if (updated && updated.endTime > Date.now()) {
        banner.querySelector(".iao-goal").textContent = updated.purpose;
        startCountdown(banner, updated);
      }
    });
  });
}


function saveBannerCollapsed(collapsed) {
  try {
    localStorage.setItem("in-and-out-collapsed", collapsed ? "1" : "");
  } catch {}
}

function readBannerCollapsed() {
  try {
    return localStorage.getItem("in-and-out-collapsed") === "1";
  } catch {
    return false;
  }
}

function startCountdown(banner, session) {
  clearInterval(timerId);
  ringing = false;

  const countdown = banner.querySelector(".iao-countdown");
  const tick = () => {
    const remaining = session.endTime - Date.now();
    countdown.textContent = formatRemaining(remaining);

    if (remaining <= 0 && !ringing) {
      ringing = true;
      ringBell();
      banner.classList.remove("iao-collapsed");
      saveBannerCollapsed(false);
      banner.classList.add("iao-expired");
      setTimeout(() => sendMessage({ type: "finishNow" }), 900);
    }
  };

  tick();
  timerId = setInterval(tick, 250);
}

function matchesSite(hostname, sites) {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, "");
  return sites.some((site) => {
    const normalizedSite = String(site).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    return normalizedSite && (normalizedHost === normalizedSite || normalizedHost.endsWith(`.${normalizedSite}`));
  });
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}


function waitForBody(callback) {
  if (document.body) {
    callback();
    return;
  }

  const observer = new MutationObserver(() => {
    if (!document.body) return;
    observer.disconnect();
    callback();
  });
  observer.observe(document.documentElement, { childList: true });
}

function ringBell() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const now = context.currentTime;

  [0, 0.18].forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1180, now + offset);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + offset + 0.16);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.18);
  });

  setTimeout(() => context.close(), 700);
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value);
  return node.innerHTML;
}
