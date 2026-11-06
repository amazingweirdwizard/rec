"use strict";

const ui = Object.fromEntries([
  "video", "placeholder", "liveBadge", "status", "timer", "microphone",
  "start", "pause", "stop", "message", "result", "download", "fileInfo", "captureSource",
  "mode", "pickElement", "elementSelection",
  "tabSources", "tabSource", "refreshTabs",
].map((id) => [id, document.getElementById(id)]));

let recorder = null;
let streams = [];
let chunks = [];
let recordingUrl = null;
let busy = false;
let unsaved = false;
let elapsed = 0;
let activeSince = 0;
let ticker = null;
let recordingError = false;
let stopping = false;
let stopTimeout = null;
let finishRecording = null;
let capturedTrack = null;
let sourceEnded = false;
let targetTabId = null;
let selectedElement = null;
let elementSession = null;

if (typeof browser !== "undefined") {
  const target = new URLSearchParams(location.search).get("target");
  if (target && /^\d+$/.test(target)) targetTabId = Number(target);
  browser.runtime.onMessage.addListener((data) => {
    if (data.type === "screen-target" && !busy && Number.isInteger(data.tabId)) {
      targetTabId = data.tabId;
      selectedElement = null;
      void refreshTabSources();
      ui.elementSelection.textContent = "Page prête. Cliquez sur « Choisir un élément dans la page », puis cliquez sur une div ou un élément. ↑ sélectionne son parent ; Échap annule.";
    }
  });
}

const elementErrors = {
  ELEMENT_NO_TAB: "Choisissez un onglet dans la liste, puis sélectionnez un élément si vous utilisez le mode Élément HTML.",
  PAGE_PERMISSION: "L’accès aux pages a été refusé. Vous pouvez autoriser ce mode ou choisir Écran ou fenêtre.",
  ELEMENT_RESTRICTED: "Cette page ne peut pas être capturée. Choisissez une page web HTTP ou HTTPS classique. Les pages internes et certaines pages protégées de Firefox sont exclues.",
  ELEMENT_GONE: "L’élément n’est plus disponible. Il a été retiré, masqué ou la page a changé. Sélectionnez-le à nouveau.",
  ELEMENT_TOO_LARGE: "La zone est trop grande (maximum 3840 × 2160 pixels CSS). Réduisez la taille de la fenêtre ou choisissez un bloc plus petit.",
};

function setSourceControls(disabled) {
  for (const control of [ui.mode, ui.pickElement, ui.tabSource, ui.refreshTabs]) control.disabled = disabled;
}

async function refreshTabSources() {
  if (busy || typeof TabSources === "undefined") return;
  try {
    const tabs = await TabSources.list(targetTabId);
    if (busy) return;
    ui.tabSource.replaceChildren();
    for (const tab of tabs) {
      const option = document.createElement("option");
      option.value = String(tab.id);
      option.textContent = `${tab.title || "Sans titre"} — ${new URL(tab.url).hostname}`;
      ui.tabSource.append(option);
    }
    const nextId = tabs.some(tab => tab.id === targetTabId) ? targetTabId : tabs[0]?.id ?? null;
    if (nextId !== targetTabId) {
      selectedElement = null;
      ui.elementSelection.textContent = "La page cible a changé. Sélectionnez un élément dans l’onglet choisi avant de démarrer le mode HTML.";
    }
    targetTabId = nextId;
    if (nextId !== null) ui.tabSource.value = String(nextId);
    else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Aucun onglet web disponible — ouvrez une page puis actualisez";
      ui.tabSource.append(option);
    }
  } catch {
    message("Impossible de charger les onglets. Rechargez l’extension pour activer l’accès à leur liste.", true);
  }
}
ui.refreshTabs.addEventListener("click", refreshTabSources);
ui.tabSource.addEventListener("change", () => {
  if (busy) return;
  targetTabId = ui.tabSource.value ? Number(ui.tabSource.value) : null;
  selectedElement = null;
  ui.elementSelection.textContent = "Onglet choisi. Cliquez sur « Choisir un élément dans la page » pour sélectionner un bloc.";
  ui.captureSource.textContent = "Source : onglet Firefox sélectionné.";
});
void refreshTabSources();

ui.mode.addEventListener("change", () => {
  const html = ui.mode.value === "element";
  const tab = ui.mode.value === "tab";
  ui.tabSources.hidden = !html && !tab;
  ui.pickElement.hidden = !html;
  ui.elementSelection.hidden = !html;
  ui.captureSource.textContent = html ? "Source : élément HTML à sélectionner dans l’onglet choisi." : tab ? "Source : choisissez un onglet Firefox dans la liste." : "Pour continuer en réduisant Firefox, choisissez « Écran entier » au démarrage.";
  if (html || tab) void refreshTabSources();
});
ui.pickElement.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  ui.start.disabled = true;
  setSourceControls(true);
  try {
    if (!Number.isInteger(targetTabId)) throw new Error("ELEMENT_NO_TAB");
    // captureTab requires this host permission, requested only for HTML mode.
    const allowed = await browser.permissions.request({ origins: ["<all_urls>"] });
    if (!allowed) { message("L’autorisation a été refusée. Le mode écran reste disponible.", true); return; }
    const selection = await ElementCapture.pick(targetTabId);
    if (selection) {
      selectedElement = selection;
      ui.elementSelection.textContent = `Sélection : ${selection.label} · ${Math.round(selection.width)} × ${Math.round(selection.height)}. Cadence cible : 5 images/s. Les contenus superposés dans cette zone peuvent apparaître dans la vidéo.`;
      ui.captureSource.textContent = `Source : élément HTML ${selection.label}`;
      message("Élément sélectionné. Cliquez sur Démarrer pour enregistrer sa zone dans la page.");
    } else message("Sélection annulée.");
  } catch (error) {
    message(elementErrors[error.message] || "Impossible d’accéder à cette page. Les pages internes, protégées ou certains cadres intégrés ne sont pas accessibles.", true);
  } finally {
    busy = false;
    ui.start.disabled = false;
    setSourceControls(false);
  }
});

function updateCaptureStatus() {
  if (!recorder || stopping || recorder.state === "inactive") return;
  if (recorder.state === "paused") {
    ui.status.textContent = "En pause";
    ui.liveBadge.textContent = "Ⅱ EN PAUSE";
  } else if (capturedTrack?.muted) {
    ui.status.textContent = "Source temporairement indisponible";
    ui.liveBadge.textContent = "! IMAGE INDISPONIBLE";
    message("La source ne fournit plus d’image. Restaurez la fenêtre capturée. Pour pouvoir réduire Firefox, recommencez en choisissant « Écran entier ». L’enregistrement n’a pas été arrêté par Screen.", true);
  } else {
    ui.status.textContent = "Enregistrement en cours";
    ui.liveBadge.textContent = "● EN DIRECT";
    message(elementSession ? "Capture de la page en cours, jusqu’à 5 images/s. La cadence et les animations peuvent ralentir en arrière-plan. Gardez les deux onglets ouverts." : "La capture reste active en arrière-plan. Vous pouvez réduire Firefox si vous avez choisi « Écran entier ». Gardez l’onglet Screen ouvert.");
  }
}

function message(text, error = false) {
  ui.message.textContent = text;
  ui.message.classList.toggle("error", error);
}

function duration() {
  return elapsed + (activeSince ? performance.now() - activeSince : 0);
}

function renderTime() {
  const seconds = Math.floor(duration() / 1000);
  ui.timer.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .slice(seconds >= 3600 ? 0 : 1).map((part) => String(part).padStart(2, "0")).join(":");
}

function freezeTime() {
  elapsed = duration();
  activeSince = 0;
  renderTime();
}

function releaseStreams() {
  capturedTrack = null;
  elementSession?.close();
  elementSession = null;
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  streams = [];
  ui.video.srcObject = null;
}

function idleControls() {
  busy = false;
  ui.start.disabled = false;
  ui.start.hidden = false;
  ui.microphone.disabled = false;
  setSourceControls(false);
  ui.pause.hidden = true;
  ui.stop.hidden = true;
  ui.liveBadge.hidden = true;
  clearInterval(ticker);
}

function stop() {
  if (recorder && !stopping) {
    stopping = true;
    freezeTime();
    clearInterval(ticker);
    ui.pause.disabled = true;
    ui.stop.disabled = true;
    ui.status.textContent = "Préparation de la vidéo…";
    message("Finalisation du fichier local…");
    // Do not leave the UI blocked forever if Firefox never sends its stop event.
    stopTimeout = setTimeout(() => finishRecording?.(true), 8000);
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch (error) {
      console.error("Impossible de terminer l’enregistrement", error);
      finishRecording?.(true);
    } finally {
      // stop() queues the final encoder flush; the input devices can now close.
      releaseStreams();
    }
  }
}

async function start() {
  if (busy) return;
  if (unsaved && !window.confirm("La vidéo précédente n’a pas encore été téléchargée. La remplacer ?")) return;
  busy = true;
  ui.start.disabled = true;
  ui.microphone.disabled = true;
  setSourceControls(true);
  message(["tab", "element"].includes(ui.mode.value) ? "Préparation de la capture de la page. Autorisez l’accès aux pages si Firefox le demande." : "Choisissez « Écran entier » pour continuer à enregistrer lorsque Firefox est réduit.");
  try {
    const htmlMode = ui.mode.value === "element";
    const tabMode = ui.mode.value === "tab";
    const pageMode = htmlMode || tabMode;
    if ((!pageMode && !navigator.mediaDevices?.getDisplayMedia) || !window.MediaRecorder) {
      throw new Error("UNSUPPORTED");
    }
    // Call before any await: screen sharing requires the user's click activation.
    let display;
    if (pageMode) {
      if ((htmlMode && !selectedElement) || (tabMode && !Number.isInteger(targetTabId))) throw new Error("ELEMENT_NO_TAB");
      const allowed = await browser.permissions.request({ origins: ["<all_urls>"] });
      if (!allowed) throw new Error("PAGE_PERMISSION");
      const selection = htmlMode ? selectedElement : { tabId: targetTabId, fullTab: true };
      elementSession = await ElementCapture.createStream(selection, () => {
        recordingError = true;
        message("La capture de la page a été interrompue : page fermée, modifiée ou inaccessible. La vidéo reçue va être récupérée.", true);
        stop();
      });
      display = elementSession.stream;
    } else display = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor", frameRate: { ideal: 30, max: 30 } }, audio: false,
    });
    streams.push(display);
    const videoTrack = display.getVideoTracks()[0];
    capturedTrack = videoTrack;
    sourceEnded = false;
    const surface = videoTrack.getSettings?.().displaySurface;
    const surfaceNames = { monitor: "Écran entier", window: "Fenêtre", browser: "Onglet" };
    ui.captureSource.textContent = htmlMode ? `Source : élément HTML ${selectedElement.label} · jusqu’à 5 images/s` : tabMode ? `Source : onglet Firefox · ${ui.tabSource.selectedOptions?.[0]?.textContent || targetTabId} · jusqu’à 5 images/s` : `Source : ${surfaceNames[surface] || "écran ou fenêtre (type non précisé par Firefox)"}. ${surface === "monitor" ? "Vous pouvez réduire Firefox pendant la capture du bureau." : "Pour réduire Firefox, préférez une capture « Écran entier »."}`;
    videoTrack.addEventListener("ended", () => {
      if (capturedTrack !== videoTrack) return;
      sourceEnded = true;
      stop();
    }, { once: true });
    for (const event of ["mute", "unmute"]) {
      videoTrack.addEventListener(event, () => {
        if (capturedTrack === videoTrack) updateCaptureStatus();
      });
    }
    let audioTracks = [];
    if (ui.microphone.checked) {
      message("Autorisez le microphone pour ajouter votre voix.");
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.push(microphone);
      audioTracks = microphone.getAudioTracks();
      audioTracks.forEach((track) => track.addEventListener("ended", () => {
        message("Le microphone a été déconnecté. La capture vidéo continue.", true);
      }, { once: true }));
    }
    if (videoTrack.readyState === "ended") throw new Error("CAPTURE_ENDED");
    const stream = new MediaStream([...display.getVideoTracks(), ...audioTracks]);
    const mimeType = [audioTracks.length ? "video/webm;codecs=vp8,opus" : "video/webm;codecs=vp8", "video/webm"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("UNSUPPORTED");
    const nextRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
    const previousUrl = recordingUrl;
    chunks = [];
    recordingError = false;
    stopping = false;
    let finalized = false;
    nextRecorder.addEventListener("dataavailable", (event) => {
      if (!finalized && event.data.size > 0) chunks.push(event.data);
    });
    nextRecorder.addEventListener("error", () => {
      if (finalized) return;
      recordingError = true;
      message("L’enregistrement a été interrompu. Téléchargez la partie récupérée si elle est disponible.", true);
      stop();
    });
    const finish = async (incomplete = false) => {
      if (finalized) return;
      finalized = true;
      clearTimeout(stopTimeout);
      stopTimeout = null;
      finishRecording = null;
      freezeTime();
      let blob = new Blob(chunks, { type: nextRecorder.mimeType });
      chunks = [];
      releaseStreams();
      recorder = null;
      let durationWarning = false;
      if (blob.size && !incomplete && !recordingError) {
        try {
          blob = await finalizeWebmDuration(blob, elapsed);
        } catch (error) {
          console.warn("Durée WebM non corrigée", error);
          durationWarning = true;
        }
      }
      idleControls();
      if (!blob.size) {
        ui.status.textContent = "Aucune vidéo récupérée";
        ui.video.hidden = true;
        ui.placeholder.hidden = false;
        message("La capture ne contient pas de données. Réessayez en enregistrant quelques secondes.", true);
        return;
      }
      recordingUrl = URL.createObjectURL(blob);
      ui.video.src = recordingUrl;
      ui.video.preload = "metadata";
      ui.video.controls = true;
      ui.video.muted = false;
      ui.download.href = recordingUrl;
      ui.download.download = `screen-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      ui.fileInfo.textContent = `${ui.timer.textContent} · ${(blob.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo · WebM`;
      ui.result.hidden = false;
      unsaved = true;
      ui.status.textContent = incomplete ? "Récupération partielle" : recordingError ? "Capture interrompue" : "Enregistrement terminé";
      ui.start.textContent = "● Nouvel enregistrement";
      ui.download.textContent = incomplete ? "Télécharger la partie récupérée" : "Télécharger la vidéo";
      if (incomplete) {
        message("Firefox n’a pas terminé la vidéo après 8 secondes. Les données déjà reçues sont récupérées ; la fin peut manquer et le fichier peut être incomplet.", true);
      } else if (recordingError) {
        message("La capture a été interrompue par une erreur ou une source devenue inaccessible. Téléchargez la vidéo reçue ; la fin peut manquer.", true);
      } else if (sourceEnded && !recordingError) {
        message(`Firefox a terminé le partage de la source. La vidéo reçue peut être téléchargée. Pour réduire Firefox pendant une prochaine capture, choisissez « Écran entier ».${durationWarning ? " La durée du fichier n’a pas pu être corrigée." : ""}`, true);
      } else if (durationWarning) {
        message("La vidéo est disponible, mais sa durée n’a pas pu être inscrite dans le fichier. Certains lecteurs peuvent afficher une durée inconnue.", true);
      } else if (!recordingError) {
        message("Votre fichier est disponible. Vous pouvez le télécharger sans attendre le chargement de l’aperçu.");
      }
    };
    finishRecording = finish;
    nextRecorder.addEventListener("stop", () => finish(), { once: true });
    nextRecorder.start(1000);
    recorder = nextRecorder;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    recordingUrl = null;
    unsaved = false;
    ui.result.hidden = true;
    ui.video.removeAttribute("src");
    ui.video.srcObject = display;
    ui.video.controls = false;
    ui.video.muted = true;
    ui.video.hidden = false;
    ui.placeholder.hidden = true;
    ui.video.play().catch(() => {});
    elapsed = 0;
    activeSince = performance.now();
    renderTime();
    ticker = setInterval(renderTime, 250);
    ui.start.hidden = true;
    ui.pause.hidden = false;
    ui.pause.disabled = false;
    ui.pause.textContent = "Mettre en pause";
    ui.stop.hidden = false;
    ui.stop.disabled = false;
    ui.liveBadge.hidden = false;
    ui.liveBadge.textContent = "● EN DIRECT";
    updateCaptureStatus();
  } catch (error) {
    releaseStreams();
    idleControls();
    const errors = {
      NotAllowedError: "Partage ou microphone refusé. Réessayez et autorisez les accès demandés.",
      NotFoundError: "Aucun écran ou microphone disponible. Vérifiez vos périphériques.",
      NotReadableError: "La source est inaccessible. Vérifiez les autorisations de votre système.",
      AbortError: "La sélection a été annulée. Vous pouvez réessayer.",
      UNSUPPORTED: "Ce navigateur ne prend pas en charge la capture WebM. Utilisez une version récente de Firefox sur ordinateur.",
      CAPTURE_ENDED: "Le partage a été arrêté avant le début de la capture. Réessayez.",
    };
    message(elementErrors[error.message] || errors[error.name] || errors[error.message] || "Impossible de démarrer la capture. Vérifiez les autorisations et réessayez.", true);
  }
}

ui.start.addEventListener("click", start);
ui.stop.addEventListener("click", stop);
ui.pause.addEventListener("click", () => {
  if (!recorder || recorder.state === "inactive") return;
  if (recorder.state === "recording") {
    recorder.pause();
    freezeTime();
    ui.pause.textContent = "Reprendre";
    ui.status.textContent = "En pause";
    ui.liveBadge.textContent = "Ⅱ EN PAUSE";
    message("La capture est en pause. Le partage reste actif jusqu’à la fin de la session.");
  } else {
    recorder.resume();
    activeSince = performance.now();
    ui.pause.textContent = "Mettre en pause";
    updateCaptureStatus();
  }
});
// Visibility changes only refresh the UI. Neither recording nor its clock
// depends on preview playback, animation frames or background timer frequency.
document.addEventListener("visibilitychange", () => {
  if (!recorder || stopping) return;
  renderTime();
  updateCaptureStatus();
});
ui.download.addEventListener("click", () => { unsaved = false; });
window.addEventListener("beforeunload", (event) => {
  if (busy || unsaved) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  releaseStreams();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});
