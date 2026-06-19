const DEFAULT_SETTINGS = {
  minutes: 5,
  sites: [
    "bilibili.com",
    "youtube.com",
    "x.com",
    "twitter.com"
  ]
};

const sessionKey = (domain) => `site:${domain}`;
const alarmName = (domain) => `in-and-out:${domain}`;

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

  const domain = alarm.name.replace("in-and-out:", "");
  const session = await getSession(domain);
  if (!session || session.endTime > Date.now()) return;

  await clearSession(domain);
  await closeTabsByDomain(domain);
});

async function handleMessage(message, sender) {
  const tabId = sender.tab?.id;
  const url = sender.tab?.url || sender.url || "";
  if (!tabId) return { ok: false, error: "Missing tab id." };

  const domain = normalizeDomain(new URL(url).hostname);

  if (message.type === "getSettings") {
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "getPurposeHistory") {
    return { ok: true, history: await getPurposeHistory() };
  }

  if (message.type === "getSession") {
    const session = await getSession(domain);
    if (!session || session.endTime <= Date.now()) {
      await clearSession(domain);
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
    await saveSession(domain, session);
    if (session.purpose) {
      await addPurposeHistory(session.purpose);
    }
    return { ok: true, session };
  }

  if (message.type === "extendSession") {
    const existing = await getSession(domain);
    if (!existing) return { ok: false, error: "No active session." };

    const minutes = clampMinutes(Number(message.minutes) || 5);
    const session = {
      ...existing,
      endTime: Math.max(Date.now(), existing.endTime) + minutes * 60 * 1000
    };
    await saveSession(domain, session);
    return { ok: true, session };
  }

  if (message.type === "reduceSession") {
    const existing = await getSession(domain);
    if (!existing) return { ok: false, error: "No active session." };

    const minutes = clampMinutes(Number(message.minutes) || 3);
    const newEnd = existing.endTime - minutes * 60 * 1000;
    const session = {
      ...existing,
      endTime: Math.max(Date.now() + 1000, newEnd)
    };
    await saveSession(domain, session);
    return { ok: true, session };
  }

  if (message.type === "finishNow") {
    await clearSession(domain);
    await closeTabsByDomain(domain);
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

async function getSession(domain) {
  const store = await chrome.storage.session.get(sessionKey(domain));
  return store[sessionKey(domain)] || null;
}

async function saveSession(domain, session) {
  await chrome.storage.session.set({ [sessionKey(domain)]: session });
  chrome.alarms.create(alarmName(domain), {
    when: session.endTime + 1200
  });
}

async function clearSession(domain) {
  await chrome.storage.session.remove(sessionKey(domain));
  await chrome.alarms.clear(alarmName(domain));
}

function normalizeDomain(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

async function closeTabsByDomain(domain) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const tabDomain = normalizeDomain(new URL(tab.url).hostname);
      if (tabDomain === domain || tabDomain.endsWith(`.${domain}`)) {
        chrome.tabs.remove(tab.id).catch(() => {});
      }
    } catch {}
  }
}

function clampMinutes(value) {
  return Math.min(240, Math.max(1, value));
}

async function getPurposeHistory() {
  const { purposeHistory } = await chrome.storage.local.get("purposeHistory");
  return Array.isArray(purposeHistory) ? purposeHistory : [];
}

async function addPurposeHistory(purpose) {
  const trimmed = purpose.trim();
  if (!trimmed) return;
  const list = (await getPurposeHistory()).filter((item) => item !== trimmed);
  list.unshift(trimmed);
  await chrome.storage.local.set({ purposeHistory: list.slice(0, 8) });
}
