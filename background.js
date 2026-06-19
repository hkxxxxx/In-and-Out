const DEFAULT_SETTINGS = {
  minutes: 5,
  sites: [
    "bilibili.com",
    "youtube.com",
    "x.com",
    "twitter.com"
  ]
};

const sessionKey = (tabId) => `tab:${tabId}`;
const alarmName = (tabId) => `in-and-out:${tabId}`;

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("in-and-out:")) return;

  const tabId = Number(alarm.name.replace("in-and-out:", ""));
  const session = await getSession(tabId);
  if (!session || session.endTime > Date.now()) return;

  await clearSession(tabId);
  closeTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearSession(tabId);
});

async function handleMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { ok: false, error: "Missing tab id." };

  if (message.type === "getSettings") {
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "getSession") {
    const session = await getSession(tabId);
    if (!session || session.endTime <= Date.now()) {
      await clearSession(tabId);
      return { ok: true, session: null };
    }
    return { ok: true, session };
  }

  if (message.type === "startSession") {
    const settings = await getSettings();
    const minutes = clampMinutes(Number(message.minutes) || settings.minutes);
    const session = {
      purpose: String(message.purpose || "").trim(),
      endTime: Date.now() + minutes * 60 * 1000
    };
    await saveSession(tabId, session);
    return { ok: true, session };
  }

  if (message.type === "extendSession") {
    const existing = await getSession(tabId);
    if (!existing) return { ok: false, error: "No active session." };

    const minutes = clampMinutes(Number(message.minutes) || 5);
    const session = {
      ...existing,
      endTime: Math.max(Date.now(), existing.endTime) + minutes * 60 * 1000
    };
    await saveSession(tabId, session);
    return { ok: true, session };
  }

  if (message.type === "finishNow") {
    await clearSession(tabId);
    closeTab(tabId);
    return { ok: true };
  }

  return { ok: false, error: "Unknown message." };
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    sites: Array.isArray(settings?.sites) && settings.sites.length
      ? settings.sites
      : DEFAULT_SETTINGS.sites
  };
}

async function getSession(tabId) {
  const store = await chrome.storage.session.get(sessionKey(tabId));
  return store[sessionKey(tabId)] || null;
}

async function saveSession(tabId, session) {
  await chrome.storage.session.set({ [sessionKey(tabId)]: session });
  chrome.alarms.create(alarmName(tabId), {
    when: session.endTime + 1200
  });
}

async function clearSession(tabId) {
  await chrome.storage.session.remove(sessionKey(tabId));
  await chrome.alarms.clear(alarmName(tabId));
}

function closeTab(tabId) {
  chrome.tabs.remove(tabId).catch(() => {});
}

function clampMinutes(value) {
  return Math.min(240, Math.max(1, value));
}
