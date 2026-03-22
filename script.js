const FALLBACK_DEFAULTS = {
  objective: "Trabajo",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomodorosBeforeLongBreak: 4,
  toneVolumePercent: 175,
  focusEndTone: "campana",
  breakEndTone: "suave",
  alarmRepeatSeconds: 5,
};

const APP_CONFIG = window.POMODORO_CONFIG ?? {
  storageKey: "pomodoro_settings_v1",
  defaults: FALLBACK_DEFAULTS,
};

const LOGS_STORAGE_KEY = "pomodoro_logs_v1";
const MINI_TIMER_AUTO_OPEN_KEY = "pomodoro_mini_timer_auto_open_v1";
const VALID_TYPES = new Set(["concentracion", "descanso"]);
const SHOULD_RESET_ON_LOAD = new URLSearchParams(window.location.search).get("reset") === "1";
const VALID_TONES = new Set(["campana", "suave", "digital", "alarma", "gong", "cristal", "madera", "pulso"]);
const TONE_PATTERNS = {
  campana: [
    { startOffset: 0, duration: 0.28, frequency: 784, gain: 0.24, type: "triangle" },
    { startOffset: 0.08, duration: 0.45, frequency: 1175, gain: 0.16, type: "sine" },
  ],
  suave: [
    { startOffset: 0, duration: 0.16, frequency: 523, gain: 0.09, type: "sine" },
    { startOffset: 0.2, duration: 0.18, frequency: 659, gain: 0.1, type: "sine" },
  ],
  digital: [
    { startOffset: 0, duration: 0.1, frequency: 1320, gain: 0.2, type: "triangle" },
    { startOffset: 0.12, duration: 0.1, frequency: 988, gain: 0.18, type: "triangle" },
    { startOffset: 0.24, duration: 0.1, frequency: 1320, gain: 0.2, type: "triangle" },
  ],
  alarma: [
    { startOffset: 0, duration: 0.16, frequency: 880, gain: 0.28, type: "square" },
    { startOffset: 0.2, duration: 0.16, frequency: 660, gain: 0.24, type: "square" },
    { startOffset: 0.4, duration: 0.16, frequency: 880, gain: 0.28, type: "square" },
  ],
  gong: [
    { startOffset: 0, duration: 0.38, frequency: 392, gain: 0.28, type: "triangle" },
    { startOffset: 0.05, duration: 0.58, frequency: 588, gain: 0.16, type: "sine" },
  ],
  cristal: [
    { startOffset: 0, duration: 0.1, frequency: 1318, gain: 0.18, type: "triangle" },
    { startOffset: 0.12, duration: 0.1, frequency: 1568, gain: 0.14, type: "triangle" },
    { startOffset: 0.24, duration: 0.14, frequency: 1760, gain: 0.12, type: "sine" },
  ],
  madera: [
    { startOffset: 0, duration: 0.07, frequency: 220, gain: 0.2, type: "square" },
    { startOffset: 0.11, duration: 0.07, frequency: 247, gain: 0.18, type: "square" },
    { startOffset: 0.22, duration: 0.09, frequency: 220, gain: 0.17, type: "square" },
  ],
  pulso: [
    { startOffset: 0, duration: 0.11, frequency: 740, gain: 0.18, type: "sawtooth" },
    { startOffset: 0.22, duration: 0.11, frequency: 740, gain: 0.16, type: "sawtooth" },
    { startOffset: 0.44, duration: 0.11, frequency: 740, gain: 0.14, type: "sawtooth" },
  ],
};

const bodyEl = document.body;
const objectiveLabelEl = document.getElementById("objectiveLabel");
const objectiveValueEl = document.getElementById("objectiveValue");
const toggleNoteBtn = document.getElementById("toggleNote");
const noteBoxEl = document.getElementById("noteBox");
const noteInputEl = document.getElementById("noteInput");
const timeEl = document.getElementById("time");
const resetAllTopBtn = document.getElementById("resetAllTop");
const skipStateBtn = document.getElementById("skipState");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const settingsPanelEl = document.getElementById("settingsPanel");
const overlayEl = document.getElementById("overlay");
const sparkLayerEl = document.getElementById("sparkLayer");
const focusInput = document.getElementById("focusMinutes");
const shortBreakInput = document.getElementById("shortBreakMinutes");
const longBreakInput = document.getElementById("longBreakMinutes");
const pomodorosInput = document.getElementById("pomodorosBeforeLongBreak");
const toneVolumeRange = document.getElementById("toneVolumePercentRange");
const toneVolumeInput = document.getElementById("toneVolumePercentInput");
const alarmRepeatRange = document.getElementById("alarmRepeatSecondsRange");
const alarmRepeatInput = document.getElementById("alarmRepeatSecondsInput");
const focusEndToneSelect = document.getElementById("focusEndTone");
const breakEndToneSelect = document.getElementById("breakEndTone");
const previewFocusToneBtn = document.getElementById("previewFocusTone");
const previewBreakToneBtn = document.getElementById("previewBreakTone");
const saveSettingsBtn = document.getElementById("saveSettings");
const resetCycleMainBtn = document.getElementById("resetCycleMain");
const openMiniTimerBtn = document.getElementById("openMiniTimer");
const settingsStatusEl = document.getElementById("settingsStatus");
const shutdownScreenEl = document.getElementById("shutdownScreen");
let wakeLockSentinel = null;
let wakeLockRequestId = 0;

let settings = loadSettings();
let logs = loadLogs();
let mode = "work";
let completedPomodoros = 0;
let secondsLeft = 0;
let segmentStartedAt = new Date();
let segmentInitialSeconds = 0;
let intervalId = null;
let statusTimeout = null;
let alarmAudioContext = null;
let alarmRepeatTimeoutId = null;
let previewToneTimeoutId = null;
let isEditingObjective = false;
let thresholdAlertPlayed = false;
let hasShownFilePersistenceWarning = false;
let isServerDown = false;
let isHealthCheckInFlight = false;
let healthCheckIntervalId = null;
let healthCheckFailures = 0;
let hasSeenHealthyServer = false;
let miniTimerWindow = null;
let miniTimerTimeEl = null;
let miniTimerAutoOpenEnabled = loadMiniTimerAutoOpenPreference();
let miniTimerVisibilitySyncTimeoutIds = new Set();
let isMiniTimerWindowVisuallyHidden = false;

const HEALTH_CHECK_INTERVAL_MS = 1800;
const MINI_TIMER_VISIBILITY_SYNC_DELAYS_MS = [0, 140, 420];
const MINI_TIMER_WINDOW_WIDTH = 320;
const MINI_TIMER_WINDOW_HEIGHT = 220;
const MINI_TIMER_HIDDEN_SIZE = 8;

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function sanitizeObjective(value, fallback) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.slice(0, 80);
}

function sanitizeTone(value, fallback) {
  if (typeof value !== "string") return fallback;
  if (!VALID_TONES.has(value)) return fallback;
  return value;
}

function sanitizeSettings(value) {
  return {
    objective: sanitizeObjective(value.objective, APP_CONFIG.defaults.objective),
    focusMinutes: normalizeNumber(value.focusMinutes, APP_CONFIG.defaults.focusMinutes, 1, 180),
    shortBreakMinutes: normalizeNumber(
      value.shortBreakMinutes,
      APP_CONFIG.defaults.shortBreakMinutes,
      1,
      90
    ),
    longBreakMinutes: normalizeNumber(
      value.longBreakMinutes,
      APP_CONFIG.defaults.longBreakMinutes,
      1,
      120
    ),
    pomodorosBeforeLongBreak: normalizeNumber(
      value.pomodorosBeforeLongBreak,
      APP_CONFIG.defaults.pomodorosBeforeLongBreak,
      1,
      12
    ),
    toneVolumePercent: normalizeNumber(
      value.toneVolumePercent,
      APP_CONFIG.defaults.toneVolumePercent,
      50,
      300
    ),
    focusEndTone: sanitizeTone(value.focusEndTone, APP_CONFIG.defaults.focusEndTone),
    breakEndTone: sanitizeTone(value.breakEndTone, APP_CONFIG.defaults.breakEndTone),
    alarmRepeatSeconds: normalizeNumber(
      value.alarmRepeatSeconds,
      APP_CONFIG.defaults.alarmRepeatSeconds,
      0,
      20
    ),
  };
}

function loadSettings() {
  const storedRaw = localStorage.getItem(APP_CONFIG.storageKey);
  if (!storedRaw) return sanitizeSettings(APP_CONFIG.defaults);

  try {
    return sanitizeSettings(JSON.parse(storedRaw));
  } catch {
    return sanitizeSettings(APP_CONFIG.defaults);
  }
}

function saveSettings(nextSettings) {
  localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(nextSettings));
}

function loadLogs() {
  const storedRaw = localStorage.getItem(LOGS_STORAGE_KEY);
  if (!storedRaw) return [];

  try {
    const parsed = JSON.parse(storedRaw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry) => {
      return (
        typeof entry?.fecha === "string" &&
        typeof entry?.hora === "string" &&
        VALID_TYPES.has(entry?.tipo) &&
        typeof entry?.objective === "string" &&
        entry.objective.trim().length > 0 &&
        (typeof entry?.duracion === "string" || typeof entry?.executedSeconds === "number")
      );
    });
  } catch {
    return [];
  }
}

function saveLogs(nextLogs) {
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
}

function loadMiniTimerAutoOpenPreference() {
  return localStorage.getItem(MINI_TIMER_AUTO_OPEN_KEY) !== "0";
}

function saveMiniTimerAutoOpenPreference(isEnabled) {
  if (isEnabled) {
    localStorage.setItem(MINI_TIMER_AUTO_OPEN_KEY, "1");
    return;
  }

  localStorage.setItem(MINI_TIMER_AUTO_OPEN_KEY, "0");
}

function clearMiniTimerVisibilitySyncQueue() {
  for (const timeoutId of miniTimerVisibilitySyncTimeoutIds) {
    clearTimeout(timeoutId);
  }

  miniTimerVisibilitySyncTimeoutIds.clear();
}

function shouldShowMiniTimer(options = {}) {
  const { includeFocusLoss = false } = options;
  if (document.visibilityState !== "visible") {
    return true;
  }

  if (!includeFocusLoss) {
    return false;
  }

  const hasFocus = typeof document.hasFocus !== "function" ? true : document.hasFocus();
  return !hasFocus;
}

function scheduleMiniTimerVisibilitySync(delays = MINI_TIMER_VISIBILITY_SYNC_DELAYS_MS) {
  clearMiniTimerVisibilitySyncQueue();

  const normalizedDelays = [...new Set(delays.map((delay) => Math.max(0, Number(delay) || 0)))].sort(
    (left, right) => left - right
  );

  for (const delay of normalizedDelays) {
    if (delay === 0) {
      syncMiniTimerVisibility();
      continue;
    }

    const timeoutId = window.setTimeout(() => {
      miniTimerVisibilitySyncTimeoutIds.delete(timeoutId);
      syncMiniTimerVisibility();
    }, delay);

    miniTimerVisibilitySyncTimeoutIds.add(timeoutId);
  }
}

function getDurationSeconds(nextMode) {
  if (nextMode === "work") return settings.focusMinutes * 60;
  if (nextMode === "shortBreak") return settings.shortBreakMinutes * 60;
  return settings.longBreakMinutes * 60;
}

function getObjectiveForLog() {
  return sanitizeObjective(settings.objective, "Trabajo");
}

function getTypeForLog() {
  return mode === "work" ? "concentracion" : "descanso";
}

function formatTimeDisplay(totalSeconds) {
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const min = String(Math.floor(absSeconds / 60)).padStart(2, "0");
  const sec = String(absSeconds % 60).padStart(2, "0");
  return `${isNegative ? "-" : ""}${min}:${sec}`;
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

async function persistLogToCsvFile(entry) {
  const pyApi = window.pywebview?.api;
  if (pyApi && typeof pyApi.append_log === "function") {
    try {
      await pyApi.append_log(entry);
      return;
    } catch (error) {
      console.error("No se pudo persistir el registro en CSV con pywebview:", error);
    }
  }

  const protocol = window.location.protocol;
  const isHttpContext = protocol === "http:" || protocol === "https:";
  if (!isHttpContext) {
    if (hasShownFilePersistenceWarning) return;
    hasShownFilePersistenceWarning = true;
    showSettingsStatus("Abre con ./abrir_pomodoro.command para guardar en CSV");
    return;
  }

  try {
    const response = await fetch("/api/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pomodoro-Local": "1",
      },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    if (hasShownFilePersistenceWarning) return;
    hasShownFilePersistenceWarning = true;
    showSettingsStatus("No se pudo guardar en CSV local");
    console.error("No se pudo persistir el registro en CSV:", error);
  }
}

function draw() {
  if (mode === "work") {
    toggleNoteBtn.hidden = false;
    objectiveLabelEl.hidden = false;
    objectiveValueEl.classList.add("editable");
    objectiveValueEl.classList.remove("readonly");
    objectiveValueEl.setAttribute("tabindex", "0");
    objectiveValueEl.title = "Haz clic para editar el objetivo";

    if (!isEditingObjective) {
      objectiveValueEl.textContent = settings.objective;
      objectiveValueEl.setAttribute("contenteditable", "false");
    }
  } else {
    if (isEditingObjective) {
      finishObjectiveEdit({ save: true, showStatus: false });
    }
    if (!noteBoxEl.hidden) {
      setQuickNoteOpenState(false);
    }

    toggleNoteBtn.hidden = true;
    objectiveLabelEl.hidden = true;
    objectiveValueEl.textContent = "Descanso";
    objectiveValueEl.title = "";
    objectiveValueEl.classList.remove("editable", "editing");
    objectiveValueEl.classList.add("readonly");
    objectiveValueEl.setAttribute("contenteditable", "false");
    objectiveValueEl.removeAttribute("tabindex");
    isEditingObjective = false;
  }

  timeEl.textContent = formatTimeDisplay(secondsLeft);
  bodyEl.classList.remove("mode-work", "mode-shortBreak", "mode-longBreak");
  bodyEl.classList.add(`mode-${mode}`);
  timeEl.classList.remove("work", "shortBreak", "longBreak", "running", "paused");
  timeEl.classList.add(mode, intervalId ? "running" : "paused");
  syncMiniTimerWindow();
}

function registerCurrentSegment() {
  const elapsedSeconds = segmentInitialSeconds - secondsLeft;
  const entry = {
    fecha: formatDate(segmentStartedAt),
    hora: formatTime(segmentStartedAt),
    tipo: getTypeForLog(),
    duracion: formatDuration(elapsedSeconds),
    objective: getObjectiveForLog(),
  };

  logs.push(entry);
  saveLogs(logs);
  persistLogToCsvFile(entry);
}

function transitionToMode(nextMode, options = {}) {
  if (options.registerCurrent) {
    registerCurrentSegment();
  }

  stopRepeatedAlarm();
  stopTonePreview();
  mode = nextMode;
  secondsLeft = getDurationSeconds(nextMode);
  segmentInitialSeconds = secondsLeft;
  segmentStartedAt = new Date();
  thresholdAlertPlayed = false;
  draw();
}

function fillSettingsForm() {
  focusInput.value = settings.focusMinutes;
  shortBreakInput.value = settings.shortBreakMinutes;
  longBreakInput.value = settings.longBreakMinutes;
  pomodorosInput.value = settings.pomodorosBeforeLongBreak;
  toneVolumeRange.value = String(settings.toneVolumePercent);
  toneVolumeInput.value = String(settings.toneVolumePercent);
  alarmRepeatRange.value = String(settings.alarmRepeatSeconds);
  alarmRepeatInput.value = String(settings.alarmRepeatSeconds);
  focusEndToneSelect.value = settings.focusEndTone;
  breakEndToneSelect.value = settings.breakEndTone;
}

function showSettingsStatus(message) {
  settingsStatusEl.textContent = message;
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    settingsStatusEl.textContent = "";
  }, 2200);
}

function syncSliderFromInput(inputEl, rangeEl, fallback, min, max) {
  const value = normalizeNumber(inputEl.value, fallback, min, max);
  inputEl.value = String(value);
  rangeEl.value = String(value);
  return value;
}

function getPendingAlarmRepeatSeconds() {
  return normalizeNumber(alarmRepeatInput.value, settings.alarmRepeatSeconds, 0, 20);
}

function getMiniTimerPayload() {
  return {
    mode,
    time: formatTimeDisplay(secondsLeft),
  };
}

function getNativeMiniTimerApi() {
  const api = window.pywebview?.api;
  if (!api) return null;

  if (
    typeof api.show_native_mini_timer !== "function" ||
    typeof api.hide_native_mini_timer !== "function" ||
    typeof api.sync_native_mini_timer !== "function"
  ) {
    return null;
  }

  return api;
}

function hasNativeMiniTimerSupport() {
  return getNativeMiniTimerApi() !== null;
}

function canUseMiniTimerWindow() {
  return "documentPictureInPicture" in window;
}

function setMiniTimerAutoOpenEnabled(isEnabled) {
  miniTimerAutoOpenEnabled = isEnabled;
  saveMiniTimerAutoOpenPreference(isEnabled);
  if (!isEnabled) {
    clearMiniTimerVisibilitySyncQueue();
  }
  updateMiniTimerButtonState();
}

function syncMiniTimerAvailability() {
  if (hasNativeMiniTimerSupport()) {
    openMiniTimerBtn.hidden = true;
    openMiniTimerBtn.disabled = true;
    return;
  }

  openMiniTimerBtn.hidden = false;
  const isSupported = canUseMiniTimerWindow();
  openMiniTimerBtn.disabled = !isSupported;
  if (!isSupported) {
    openMiniTimerBtn.setAttribute("aria-pressed", "false");
    openMiniTimerBtn.title = "Mini contador no disponible en este navegador";
    return;
  }

  updateMiniTimerButtonState();
}

function updateMiniTimerButtonState() {
  if (!canUseMiniTimerWindow()) return;
  openMiniTimerBtn.setAttribute("aria-pressed", String(miniTimerAutoOpenEnabled));
  openMiniTimerBtn.title = miniTimerAutoOpenEnabled
    ? "Desactivar mini contador flotante"
    : "Activar mini contador flotante";
}

function clearMiniTimerWindowState() {
  miniTimerWindow = null;
  miniTimerTimeEl = null;
  isMiniTimerWindowVisuallyHidden = false;
  updateMiniTimerButtonState();
}

function syncMiniTimerWindow() {
  const nativeMiniTimerApi = getNativeMiniTimerApi();
  if (nativeMiniTimerApi) {
    nativeMiniTimerApi.sync_native_mini_timer(getMiniTimerPayload()).catch(() => {});
    return;
  }

  if (!miniTimerWindow || miniTimerWindow.closed) {
    clearMiniTimerWindowState();
    return;
  }

  if (isMiniTimerWindowVisuallyHidden) return;

  miniTimerWindow.document.body.className = `mini-timer mode-${mode}`;
  miniTimerTimeEl.textContent = getMiniTimerPayload().time;
}

function buildMiniTimerMarkup(pipWindow) {
  const doc = pipWindow.document;
  const stylesheetUrl = new URL("mini_timer.css", window.location.href).href;

  doc.head.replaceChildren();
  doc.body.replaceChildren();

  const charsetMeta = doc.createElement("meta");
  charsetMeta.setAttribute("charset", "UTF-8");

  const viewportMeta = doc.createElement("meta");
  viewportMeta.name = "viewport";
  viewportMeta.content = "width=device-width, initial-scale=1.0";

  const titleEl = doc.createElement("title");
  titleEl.textContent = "Pomodoro";

  const stylesheetLink = doc.createElement("link");
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = stylesheetUrl;

  doc.head.append(charsetMeta, viewportMeta, titleEl, stylesheetLink);

  const timeLabel = doc.createElement("p");
  timeLabel.id = "miniTimerTime";
  timeLabel.className = "mini-time";

  doc.body.append(timeLabel);
  miniTimerTimeEl = timeLabel;
}

function handleMiniTimerWindowClosed() {
  clearMiniTimerWindowState();
  if (miniTimerAutoOpenEnabled && canUseMiniTimerWindow() && shouldShowMiniTimer()) {
    scheduleMiniTimerVisibilitySync([180, 480]);
  }
}

function resizeMiniTimerWindow(width, height) {
  if (!miniTimerWindow || miniTimerWindow.closed) return;
  if (typeof miniTimerWindow.resizeTo !== "function") return;

  try {
    miniTimerWindow.resizeTo(width, height);
  } catch {}
}

function moveMiniTimerWindow(x, y) {
  if (!miniTimerWindow || miniTimerWindow.closed) return;
  if (typeof miniTimerWindow.moveTo !== "function") return;

  try {
    miniTimerWindow.moveTo(x, y);
  } catch {}
}

function getScreenOrigin() {
  const screenObj = window.screen;
  const x = Number.isFinite(screenObj?.availLeft) ? screenObj.availLeft : 0;
  const y = Number.isFinite(screenObj?.availTop) ? screenObj.availTop : 0;
  return { x, y };
}

function getScreenBounds() {
  const screenObj = window.screen;
  const origin = getScreenOrigin();
  const width = Number.isFinite(screenObj?.availWidth) ? screenObj.availWidth : 1440;
  const height = Number.isFinite(screenObj?.availHeight) ? screenObj.availHeight : 900;
  return { ...origin, width, height };
}

function moveMiniTimerWindowToVisibleCorner() {
  const bounds = getScreenBounds();
  const targetX = bounds.x + Math.max(0, bounds.width - MINI_TIMER_WINDOW_WIDTH - 24);
  const targetY = bounds.y + Math.max(0, bounds.height - MINI_TIMER_WINDOW_HEIGHT - 56);
  moveMiniTimerWindow(targetX, targetY);
}

function moveMiniTimerWindowOffscreen() {
  const bounds = getScreenBounds();
  moveMiniTimerWindow(bounds.x + bounds.width + 200, bounds.y + bounds.height + 200);
}

function hideMiniTimerWindowVisual() {
  if (!miniTimerWindow || miniTimerWindow.closed) return;

  isMiniTimerWindowVisuallyHidden = true;
  miniTimerWindow.document.body.className = "mini-timer mini-timer-hidden";
  miniTimerTimeEl.textContent = "";
  resizeMiniTimerWindow(MINI_TIMER_HIDDEN_SIZE, MINI_TIMER_HIDDEN_SIZE);
  moveMiniTimerWindowOffscreen();
}

function showMiniTimerWindowVisual() {
  if (!miniTimerWindow || miniTimerWindow.closed) return;

  isMiniTimerWindowVisuallyHidden = false;
  resizeMiniTimerWindow(MINI_TIMER_WINDOW_WIDTH, MINI_TIMER_WINDOW_HEIGHT);
  moveMiniTimerWindowToVisibleCorner();
  miniTimerWindow.document.body.className = `mini-timer mode-${mode}`;
  miniTimerTimeEl.textContent = getMiniTimerPayload().time;
}

async function closeMiniTimerWindow(options = {}) {
  const { preserveAutoOpen = true } = options;
  if (!miniTimerWindow || miniTimerWindow.closed) {
    clearMiniTimerWindowState();
    if (!preserveAutoOpen) {
      setMiniTimerAutoOpenEnabled(false);
    }
    return;
  }

  const activeWindow = miniTimerWindow;
  clearMiniTimerWindowState();
  activeWindow.close();
  if (!preserveAutoOpen) {
    setMiniTimerAutoOpenEnabled(false);
  }
}

async function openMiniTimerWindow(options = {}) {
  const { silent = false } = options;
  if (!canUseMiniTimerWindow()) {
    return;
  }

  if (miniTimerWindow && !miniTimerWindow.closed) {
    showMiniTimerWindowVisual();
    miniTimerWindow.focus();
    return;
  }

  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: MINI_TIMER_WINDOW_WIDTH,
      height: MINI_TIMER_WINDOW_HEIGHT,
    });

    miniTimerWindow = pipWindow;
    buildMiniTimerMarkup(pipWindow);
    pipWindow.addEventListener("pagehide", handleMiniTimerWindowClosed, { once: true });
    showMiniTimerWindowVisual();
    updateMiniTimerButtonState();
  } catch (error) {
    if (!silent) {
      showSettingsStatus("No se pudo abrir la mini ventana");
    }
    console.error("No se pudo abrir el mini contador flotante:", error);
  }
}

async function toggleMiniTimerWindow() {
  if (miniTimerAutoOpenEnabled) {
    await closeMiniTimerWindow({ preserveAutoOpen: false });
    return;
  }

  setMiniTimerAutoOpenEnabled(true);
  scheduleMiniTimerVisibilitySync();
}

function syncMiniTimerVisibility() {
  const nativeMiniTimerApi = getNativeMiniTimerApi();
  if (isServerDown) {
    clearMiniTimerVisibilitySyncQueue();
    if (nativeMiniTimerApi) {
      nativeMiniTimerApi.hide_native_mini_timer().catch(() => {});
      return;
    }

    closeMiniTimerWindow({ preserveAutoOpen: true }).catch(() => {});
    return;
  }

  if (nativeMiniTimerApi) {
    if (shouldShowMiniTimer({ includeFocusLoss: true })) {
      nativeMiniTimerApi.show_native_mini_timer(getMiniTimerPayload()).catch(() => {});
      return;
    }

    nativeMiniTimerApi.hide_native_mini_timer().catch(() => {});
    return;
  }

  if (!miniTimerAutoOpenEnabled || !canUseMiniTimerWindow()) return;

  if (!shouldShowMiniTimer()) {
    closeMiniTimerWindow({ preserveAutoOpen: true }).catch(() => {});
    return;
  }

  if (miniTimerWindow && !miniTimerWindow.closed) {
    showMiniTimerWindowVisual();
    return;
  }

  openMiniTimerWindow({ silent: true }).catch(() => {});
}

function getAlarmAudioContext() {
  if (alarmAudioContext) return alarmAudioContext;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  alarmAudioContext = new AudioContextClass();
  return alarmAudioContext;
}

function getToneVolumeMultiplier(options = {}) {
  const { usePendingFormValue = false } = options;
  const fallbackPercent = settings.toneVolumePercent;
  let percent = fallbackPercent;

  if (usePendingFormValue && toneVolumeInput) {
    percent = normalizeNumber(toneVolumeInput.value, fallbackPercent, 50, 300);
  }

  return percent / 100;
}

function playTone(context, { startOffset, duration, frequency, gain, type = "sine" }, options = {}) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startTime = context.currentTime + startOffset;
  const endTime = startTime + duration;
  const volumeMultiplier = getToneVolumeMultiplier(options);
  const targetGain = Math.min(1, Math.max(0.0001, gain * volumeMultiplier));

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
}

function playTonePattern(context, toneId, options = {}) {
  const pattern = TONE_PATTERNS[toneId] || TONE_PATTERNS[APP_CONFIG.defaults.focusEndTone];
  for (const tone of pattern) {
    playTone(context, tone, options);
  }
}

function playTonePreview(toneId) {
  const context = getAlarmAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  stopRepeatedAlarm();
  stopTonePreview();
  const safeTone = sanitizeTone(toneId, APP_CONFIG.defaults.focusEndTone);
  playTonePattern(context, safeTone, { usePendingFormValue: true });

  const previewSeconds = getPendingAlarmRepeatSeconds();
  if (previewSeconds <= 0) return;

  const startedAt = Date.now();
  const tick = () => {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds >= previewSeconds) {
      previewToneTimeoutId = null;
      return;
    }

    playTonePattern(context, safeTone, { usePendingFormValue: true });
    previewToneTimeoutId = setTimeout(tick, 1000);
  };

  previewToneTimeoutId = setTimeout(tick, 1000);
}

function playTransitionAlarm(nextMode) {
  const context = getAlarmAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const selectedTone = nextMode === "work" ? settings.breakEndTone : settings.focusEndTone;
  playTonePattern(context, selectedTone);
}

function stopRepeatedAlarm() {
  if (alarmRepeatTimeoutId === null) return;
  clearTimeout(alarmRepeatTimeoutId);
  alarmRepeatTimeoutId = null;
}

function stopTonePreview() {
  if (previewToneTimeoutId === null) return;
  clearTimeout(previewToneTimeoutId);
  previewToneTimeoutId = null;
}

function playRepeatedTransitionAlarm(nextMode) {
  stopRepeatedAlarm();
  stopTonePreview();
  playTransitionAlarm(nextMode);

  if (settings.alarmRepeatSeconds <= 0) return;

  const startedAt = Date.now();
  const tick = () => {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds >= settings.alarmRepeatSeconds) {
      alarmRepeatTimeoutId = null;
      return;
    }

    playTransitionAlarm(nextMode);
    alarmRepeatTimeoutId = setTimeout(tick, 1000);
  };

  alarmRepeatTimeoutId = setTimeout(tick, 1000);
}

function canRequestWakeLock() {
  return (
    "wakeLock" in navigator &&
    document.visibilityState === "visible" &&
    typeof document.hasFocus === "function" &&
    document.hasFocus()
  );
}

async function requestScreenWakeLock() {
  if (!canRequestWakeLock() || wakeLockSentinel) return;

  const requestId = ++wakeLockRequestId;
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    if (requestId !== wakeLockRequestId) {
      sentinel.release().catch(() => {});
      return;
    }

    wakeLockSentinel = sentinel;
    wakeLockSentinel.addEventListener(
      "release",
      () => {
        wakeLockSentinel = null;
        if (wakeLockRequestId === requestId && canRequestWakeLock()) {
          requestScreenWakeLock().catch(() => {});
        }
      },
      { once: true }
    );
  } catch (error) {
    console.warn("No se pudo activar el bloqueo de pantalla:", error);
  }
}

async function releaseScreenWakeLock() {
  wakeLockRequestId += 1;
  if (!wakeLockSentinel) return;

  const activeSentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  try {
    await activeSentinel.release();
  } catch {}
}

function syncScreenWakeLock() {
  if (canRequestWakeLock()) {
    requestScreenWakeLock().catch(() => {});
    return;
  }

  releaseScreenWakeLock().catch(() => {});
}

function showCompletionSparks() {
  if (!sparkLayerEl) return;

  const rect = timeEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const count = 24;

  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
    const distance = 54 + Math.random() * 96;
    const size = 4 + Math.random() * 6;

    spark.className = "spark";
    spark.style.left = `${originX}px`;
    spark.style.top = `${originY}px`;
    spark.style.width = `${size}px`;
    spark.style.height = `${size}px`;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    spark.style.animationDuration = `${620 + Math.random() * 260}ms`;

    sparkLayerEl.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function stopTimer() {
  clearInterval(intervalId);
  intervalId = null;
  stopRepeatedAlarm();
  stopTonePreview();
  draw();
}

function advanceMode() {
  if (isServerDown) return mode;

  if (intervalId) {
    stopTimer();
  }

  if (mode === "work") {
    completedPomodoros += 1;
    const shouldUseLongBreak = completedPomodoros % settings.pomodorosBeforeLongBreak === 0;
    const nextMode = shouldUseLongBreak ? "longBreak" : "shortBreak";
    transitionToMode(nextMode, { registerCurrent: true });
    return nextMode;
  }

  transitionToMode("work", { registerCurrent: true });
  return "work";
}

function getNextModePreview() {
  if (mode === "work") {
    const shouldUseLongBreak = (completedPomodoros + 1) % settings.pomodorosBeforeLongBreak === 0;
    return shouldUseLongBreak ? "longBreak" : "shortBreak";
  }

  return "work";
}

function startTimer() {
  if (intervalId) return;

  const context = getAlarmAudioContext();
  if (context && context.state === "suspended") {
    context.resume().catch(() => {});
  }

  intervalId = setInterval(() => {
    secondsLeft -= 1;

    if (!thresholdAlertPlayed && secondsLeft <= 0) {
      thresholdAlertPlayed = true;
      playRepeatedTransitionAlarm(getNextModePreview());
      showCompletionSparks();
    }

    draw();
  }, 1000);

  draw();
}

function toggleTimer() {
  if (isServerDown) return;

  if (intervalId) {
    stopTimer();
    return;
  }

  startTimer();
}

function restartCurrentCounter() {
  if (isServerDown) return;

  const wasRunning = Boolean(intervalId);

  stopRepeatedAlarm();
  stopTonePreview();
  secondsLeft = getDurationSeconds(mode);
  segmentInitialSeconds = secondsLeft;
  segmentStartedAt = new Date();
  thresholdAlertPlayed = false;
  draw();

  if (!wasRunning) {
    startTimer();
  }
}

function restartWholeCycle() {
  if (isServerDown) return;

  stopRepeatedAlarm();
  stopTonePreview();
  if (intervalId) {
    stopTimer();
  }

  if (isEditingObjective) {
    finishObjectiveEdit({ save: false, showStatus: false });
  }

  settings = sanitizeSettings({
    ...settings,
    objective: APP_CONFIG.defaults.objective,
  });
  saveSettings(settings);
  completedPomodoros = 0;
  transitionToMode("work");
  fillSettingsForm();
  showSettingsStatus("Ciclo reiniciado");
}

function openSettingsPanel() {
  if (isServerDown) return;

  settingsPanelEl.classList.add("open");
  settingsPanelEl.setAttribute("aria-hidden", "false");
  overlayEl.hidden = false;
}

function closeSettingsPanel() {
  settingsPanelEl.classList.remove("open");
  settingsPanelEl.setAttribute("aria-hidden", "true");
  overlayEl.hidden = true;
}

function setQuickNoteOpenState(isOpen) {
  noteBoxEl.hidden = !isOpen;
  toggleNoteBtn.setAttribute("aria-expanded", String(isOpen));
  toggleNoteBtn.classList.toggle("open", isOpen);

  if (isOpen) {
    noteInputEl.focus();
  }
}

function toggleQuickNote(forceOpen = null) {
  const shouldOpen = forceOpen === null ? noteBoxEl.hidden : Boolean(forceOpen);
  setQuickNoteOpenState(shouldOpen);
}

function setShutdownState(nextIsDown) {
  if (isServerDown === nextIsDown) return;
  isServerDown = nextIsDown;
  shutdownScreenEl.hidden = !nextIsDown;
  bodyEl.classList.toggle("app-shutdown", nextIsDown);

  if (nextIsDown) {
    clearMiniTimerVisibilitySyncQueue();
    closeSettingsPanel();
    stopRepeatedAlarm();
    stopTonePreview();
    closeMiniTimerWindow({ preserveAutoOpen: true }).catch(() => {});
    const nativeMiniTimerApi = getNativeMiniTimerApi();
    if (nativeMiniTimerApi) {
      nativeMiniTimerApi.hide_native_mini_timer().catch(() => {});
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  draw();
}

async function checkServerHealth() {
  const protocol = window.location.protocol;
  const isHttpContext = protocol === "http:" || protocol === "https:";
  if (!isHttpContext || isHealthCheckInFlight) return;

  isHealthCheckInFlight = true;
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Health check no disponible");
    }

    hasSeenHealthyServer = true;
    healthCheckFailures = 0;
    setShutdownState(false);
  } catch {
    if (!hasSeenHealthyServer) return;
    healthCheckFailures += 1;
    if (healthCheckFailures >= 2) {
      setShutdownState(true);
    }
  } finally {
    isHealthCheckInFlight = false;
  }
}

function startHealthMonitor() {
  const protocol = window.location.protocol;
  const isHttpContext = protocol === "http:" || protocol === "https:";
  if (!isHttpContext) return;

  checkServerHealth();
  healthCheckIntervalId = setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL_MS);
}

function beginObjectiveEdit() {
  if (mode !== "work" || isEditingObjective) return;
  isEditingObjective = true;
  objectiveValueEl.setAttribute("contenteditable", "true");
  objectiveValueEl.classList.add("editing");
  objectiveValueEl.focus();

  const range = document.createRange();
  range.selectNodeContents(objectiveValueEl);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function finishObjectiveEdit(options = {}) {
  if (!isEditingObjective) return;

  const { save = true, showStatus = true } = options;
  const nextObjective = sanitizeObjective(objectiveValueEl.textContent, settings.objective);
  objectiveValueEl.setAttribute("contenteditable", "false");
  objectiveValueEl.classList.remove("editing");
  isEditingObjective = false;

  if (!save) {
    objectiveValueEl.textContent = settings.objective;
    return;
  }

  settings = sanitizeSettings({
    ...settings,
    objective: nextObjective,
  });
  saveSettings(settings);

  if (showStatus) {
    showSettingsStatus("Objetivo actualizado");
  }

  objectiveValueEl.textContent = settings.objective;
  draw();
}

timeEl.addEventListener("click", toggleTimer);
objectiveValueEl.addEventListener("click", () => {
  beginObjectiveEdit();
});
objectiveValueEl.addEventListener("blur", () => {
  if (!isEditingObjective) return;
  finishObjectiveEdit({ save: true });
});
objectiveValueEl.addEventListener("keydown", (event) => {
  if (!isEditingObjective) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      beginObjectiveEdit();
    }
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    finishObjectiveEdit({ save: true });
    objectiveValueEl.blur();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    finishObjectiveEdit({ save: false });
    objectiveValueEl.blur();
  }
});

toggleNoteBtn.addEventListener("click", () => {
  toggleQuickNote();
});

noteInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  toggleQuickNote(false);
  toggleNoteBtn.focus();
});

skipStateBtn.addEventListener("click", () => {
  advanceMode();
});

openSettingsBtn.addEventListener("click", openSettingsPanel);
closeSettingsBtn.addEventListener("click", closeSettingsPanel);
overlayEl.addEventListener("click", closeSettingsPanel);

resetCycleMainBtn.addEventListener("click", () => {
  restartCurrentCounter();
});

resetAllTopBtn.addEventListener("click", () => {
  restartWholeCycle();
});
openMiniTimerBtn.addEventListener("click", () => {
  toggleMiniTimerWindow().catch(() => {});
});

toneVolumeRange.addEventListener("input", () => {
  toneVolumeInput.value = toneVolumeRange.value;
});

toneVolumeInput.addEventListener("input", () => {
  const raw = Number(toneVolumeInput.value);
  if (!Number.isFinite(raw)) return;
  const value = normalizeNumber(raw, settings.toneVolumePercent, 50, 300);
  toneVolumeRange.value = String(value);
});

toneVolumeInput.addEventListener("blur", () => {
  syncSliderFromInput(toneVolumeInput, toneVolumeRange, settings.toneVolumePercent, 50, 300);
});

alarmRepeatRange.addEventListener("input", () => {
  alarmRepeatInput.value = alarmRepeatRange.value;
});

alarmRepeatInput.addEventListener("input", () => {
  const raw = Number(alarmRepeatInput.value);
  if (!Number.isFinite(raw)) return;
  const value = normalizeNumber(raw, settings.alarmRepeatSeconds, 0, 20);
  alarmRepeatRange.value = String(value);
});

alarmRepeatInput.addEventListener("blur", () => {
  syncSliderFromInput(alarmRepeatInput, alarmRepeatRange, settings.alarmRepeatSeconds, 0, 20);
});

previewFocusToneBtn.addEventListener("click", () => {
  playTonePreview(focusEndToneSelect.value);
});

previewBreakToneBtn.addEventListener("click", () => {
  playTonePreview(breakEndToneSelect.value);
});

saveSettingsBtn.addEventListener("click", () => {
  if (isEditingObjective) {
    finishObjectiveEdit({ save: true, showStatus: false });
  }

  const nextSettings = sanitizeSettings({
    objective: settings.objective,
    focusMinutes: focusInput.value,
    shortBreakMinutes: shortBreakInput.value,
    longBreakMinutes: longBreakInput.value,
    pomodorosBeforeLongBreak: pomodorosInput.value,
    toneVolumePercent: toneVolumeInput.value,
    focusEndTone: focusEndToneSelect.value,
    breakEndTone: breakEndToneSelect.value,
    alarmRepeatSeconds: alarmRepeatInput.value,
  });

  stopTimer();
  settings = nextSettings;
  saveSettings(settings);
  transitionToMode(mode);
  fillSettingsForm();
  showSettingsStatus("Configuracion guardada");
});

fillSettingsForm();
transitionToMode("work");
setQuickNoteOpenState(false);
startHealthMonitor();
syncScreenWakeLock();
syncMiniTimerAvailability();
scheduleMiniTimerVisibilitySync();

if (SHOULD_RESET_ON_LOAD) {
  restartWholeCycle();
  if (window.history && typeof window.history.replaceState === "function") {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

document.addEventListener("visibilitychange", () => {
  syncScreenWakeLock();
  scheduleMiniTimerVisibilitySync();
});
window.addEventListener("focus", () => {
  syncScreenWakeLock();
  if (hasNativeMiniTimerSupport()) {
    scheduleMiniTimerVisibilitySync();
  }
});
window.addEventListener("blur", () => {
  syncScreenWakeLock();
  if (hasNativeMiniTimerSupport()) {
    scheduleMiniTimerVisibilitySync();
  }
});
window.addEventListener("pywebviewready", () => {
  syncMiniTimerAvailability();
  syncMiniTimerWindow();
  scheduleMiniTimerVisibilitySync();
});
window.addEventListener("beforeunload", () => {
  clearMiniTimerVisibilitySyncQueue();
  closeMiniTimerWindow().catch(() => {});
  const nativeMiniTimerApi = getNativeMiniTimerApi();
  if (nativeMiniTimerApi) {
    nativeMiniTimerApi.hide_native_mini_timer().catch(() => {});
  }
  releaseScreenWakeLock().catch(() => {});
  if (healthCheckIntervalId !== null) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
  }
});
