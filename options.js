const DEFAULT_SETTINGS = {
  minutes: 5,
  sites: [
    "bilibili.com",
    "youtube.com",
    "x.com",
    "twitter.com"
  ]
};

const form = document.getElementById("settings-form");
const minutes = document.getElementById("minutes");
const sites = document.getElementById("sites");
const status = document.getElementById("status");

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = {
    minutes: clampMinutes(Number(minutes.value)),
    sites: sites.value
      .split("\n")
      .map((site) => site.trim())
      .filter(Boolean)
  };

  await chrome.storage.local.set({ settings });
  status.textContent = "已保存";
  setTimeout(() => {
    status.textContent = "";
  }, 1600);
});

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
    sites: Array.isArray(settings?.sites) && settings.sites.length
      ? settings.sites
      : DEFAULT_SETTINGS.sites
  };

  minutes.value = merged.minutes;
  sites.value = merged.sites.join("\n");
}

function clampMinutes(value) {
  return Math.min(240, Math.max(1, Number.isFinite(value) ? value : 5));
}
