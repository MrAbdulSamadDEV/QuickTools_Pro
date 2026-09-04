const $ = id => document.getElementById(id);
let detectedImages = [];
let activeMediaFilter = "all";
let isGridView = true;
let noticeTimer = 0;
const DISPLAY_STORAGE_KEY = "NEXA_display_settings";

/* ---------------- Notifications & Helpers ---------------- */
function msg(text, ms = 3200) {
  const n = $("notice");
  if (!n) return;
  n.textContent = text;
  n.style.display = "block";
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { n.style.display = "none"; }, ms);
}

function friendlyError(error, fallback = "This action could not be completed.") {
  const s = String(error?.message || error || "");
  if (/Cannot access|Receiving end does not exist|Extension context invalidated/i.test(s)) return "Chrome blocked access to this page.";
  if (/permission|not allowed|denied/i.test(s)) return "Chrome permission was blocked for this action.";
  return fallback;
}

async function getTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function safeName(s) {
  return (s || "page").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "page";
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    msg("Copied to clipboard");
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = String(value ?? "");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      msg("Copied to clipboard");
    } catch (_) { msg("Clipboard is unavailable on this page"); }
  }
}

async function copyBlobImage(blob) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("ClipboardItem unavailable");
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    msg("Image copied to clipboard!");
  } catch (_) {
    msg("Image copy unavailable in this browser. Use Download instead.");
  }
}

async function pageData() {
  const t = await getTab();
  return { title: t?.title || "", url: t?.url || "", id: t?.id, windowId: t?.windowId };
}

function isCapturableUrl(url) {
  return /^(https?|file):/i.test(url || "");
}

async function inject(fn, args = []) {
  const t = await getTab();
  if (!t?.id) throw new Error("No active tab");
  if (!isCapturableUrl(t.url)) throw new Error("This page cannot be accessed");
  return chrome.scripting.executeScript({ target: { tabId: t.id }, func: fn, args });
}

/* ---------------- Tab Navigation ---------------- */
document.querySelectorAll(".nav").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const page = $(btn.dataset.page);
    if (page) page.classList.add("active");
    if (btn.dataset.page === "media" && !detectedImages.length) scanAllMedia();
  });
});

// Side Panel Button
if ($("openSidePanel")) {
  $("openSidePanel").onclick = async () => {
    try {
      const tab = await getTab();
      if (tab?.windowId && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      } else {
        msg("Side panel is not supported in this Chrome version");
      }
    } catch (e) {
      msg("Could not open side panel");
    }
  };
}

$("copyPage").onclick = async () => { const d = await pageData(); await copyText(`${d.title}\n${d.url}`); };
$("copyUrl").onclick = async () => { const d = await pageData(); await copyText(d.url); };
$("copyTitle").onclick = async () => { const d = await pageData(); await copyText(d.title); };

/* ---------------- Home Page Tools ---------------- */
$("cleanurl").onclick = async () => {
  try {
    const d = await pageData();
    const u = new URL(d.url);
    const names = new Set(["gclid","fbclid","mc_cid","mc_eid","msclkid","dclid","gbraid","wbraid","_ga","igshid","ref_src","ref_url"]);
    [...u.searchParams.keys()].forEach(k => { if (/^utm_/i.test(k) || names.has(k.toLowerCase())) u.searchParams.delete(k); });
    await copyText(u.href);
    msg("Clean URL copied");
  } catch (e) { msg("This page does not have a normal URL."); }
};

$("duplicates").onclick = async () => {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const seen = new Set(), ids = [];
    for (const t of tabs) {
      if (!t.url || /^(chrome|edge|about):/i.test(t.url)) continue;
      if (seen.has(t.url) && t.id) ids.push(t.id); else seen.add(t.url);
    }
    if (ids.length) await chrome.tabs.remove(ids);
    msg(ids.length ? `${ids.length} duplicate tab(s) closed` : "No duplicate tabs found");
  } catch (e) { msg(friendlyError(e, "Could not clean duplicate tabs.")); }
};

$("print").onclick = async () => {
  try { await inject(() => window.print()); msg("Print dialog opened"); }
  catch (e) { msg(friendlyError(e, "Printing is unavailable on this page.")); }
};

$("savehtml").onclick = async () => {
  try {
    const r = await inject(() => ({ html: "<!doctype html>\n" + document.documentElement.outerHTML, title: document.title }));
    const d = r?.[0]?.result;
    if (!d?.html) throw new Error("No HTML");
    const blob = new Blob([d.html], { type: "text/html;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url: u, filename: `NEXA/Pages/${safeName(d.title)}.html`, saveAs: true, conflictAction: "uniquify" });
    } finally { setTimeout(() => URL.revokeObjectURL(u), 15000); }
    msg("Page HTML saved");
  } catch (e) { msg(friendlyError(e, "This page could not be saved as HTML.")); }
};

$("selectionSearch").onclick = async () => {
  try {
    const r = await inject(() => window.getSelection()?.toString().trim() || "");
    const text = r?.[0]?.result || "";
    if (!text) return msg("Select some text first");
    await chrome.tabs.create({ url: "https://www.google.com/search?q=" + encodeURIComponent(text.slice(0, 2000)) });
  } catch (e) { msg(friendlyError(e, "Could not read selected text.")); }
};

// Picture in Picture
if ($("homePip")) {
  $("homePip").onclick = async () => {
    try {
      const res = await inject(() => {
        const video = document.querySelector("video");
        if (!video) return { ok: false, msg: "No video found on this page" };
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
          return { ok: true, msg: "Exited Picture-in-Picture" };
        } else {
          video.requestPictureInPicture();
          return { ok: true, msg: "Floating Picture-in-Picture active!" };
        }
      });
      const data = res?.[0]?.result;
      msg(data?.msg || "Picture-in-Picture toggled");
    } catch (e) { msg(friendlyError(e, "Picture-in-Picture is unavailable on this page.")); }
  };
}

// Smart Dark Mode
if ($("homeDarkMode")) {
  $("homeDarkMode").onclick = async () => {
    try {
      const res = await inject(() => {
        let s = document.getElementById("__nexa_dark_mode");
        if (s) {
          s.remove();
          return { active: false };
        } else {
          s = document.createElement("style");
          s.id = "__nexa_dark_mode";
          s.textContent = `
            html { filter: invert(1) hue-rotate(180deg) !important; background: #121212 !important; }
            img, picture, video, canvas, svg, [style*="background-image"] {
              filter: invert(1) hue-rotate(180deg) !important;
            }
          `;
          (document.head || document.documentElement).appendChild(s);
          return { active: true };
        }
      });
      const active = res?.[0]?.result?.active;
      msg(active ? "Smart Dark Mode turned ON" : "Dark Mode turned OFF");
    } catch (e) { msg(friendlyError(e, "Dark Mode is unavailable on this page.")); }
  };
}

if ($("homeAreaScreenshot")) {
  $("homeAreaScreenshot").onclick = () => startAreaScreenshot();
}

/* ================================================================
   SCREENSHOTS & SCREEN RECORDING (CAPTURE PAGE)
   ================================================================ */
let lastScreenshotBlob = null;
let lastScreenshotUrl = null;

function showScreenshotPreview(dataOrBlobUrl, filename, blob = null) {
  lastScreenshotUrl = dataOrBlobUrl;
  lastScreenshotBlob = blob;
  const wrap = $("screenshotPreviewWrap");
  const img = $("screenshotPreviewImg");
  const dim = $("screenshotDimensions");
  if (!wrap || !img) return;

  img.src = dataOrBlobUrl;
  img.onload = () => {
    if (dim) dim.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
  };
  wrap.style.display = "block";

  $("btnDownloadScreenshot").onclick = async () => {
    try {
      await chrome.downloads.download({ url: dataOrBlobUrl, filename, saveAs: true, conflictAction: "uniquify" });
      msg("Screenshot downloaded");
    } catch (_) { msg("Download failed"); }
  };

  $("btnCopyScreenshot").onclick = async () => {
    try {
      if (lastScreenshotBlob) {
        await copyBlobImage(lastScreenshotBlob);
      } else {
        const resp = await fetch(dataOrBlobUrl);
        const b = await resp.blob();
        await copyBlobImage(b);
      }
    } catch (e) { msg("Could not copy image directly. Use Download."); }
  };
}

/* 1. Visible View Screenshot */
async function captureVisibleScreenshot() {
  try {
    msg("Capturing visible view…");
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    if (!dataUrl) throw new Error("Visible capture returned empty data");

    const tab = await getTab();
    const title = safeName(tab?.title || "screenshot");
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `NEXA/Screenshots/Visible_${title}_${ts}.png`;

    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    showScreenshotPreview(dataUrl, filename, blob);
    msg("Visible screenshot saved to Downloads!");
  } catch (err) {
    msg(friendlyError(err, "Visible screenshot failed"));
  }
}

/* 2. Custom Area Screenshot (Interactive Crop Overlay) */
async function startAreaScreenshot() {
  try {
    const tab = await getTab();
    if (!tab?.id || !isCapturableUrl(tab.url)) {
      return msg("Custom screenshot is unavailable on this page.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: initAreaSelectionOverlay
    });

    msg("Click & drag on page to crop area");
    window.close();
  } catch (err) {
    msg(friendlyError(err, "Could not start custom area screenshot"));
  }
}

function initAreaSelectionOverlay() {
  if (document.getElementById("__nexa_area_overlay")) {
    document.getElementById("__nexa_area_overlay").remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "__nexa_area_overlay";
  overlay.style.cssText = `
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483647 !important;
    cursor: crosshair !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    background: rgba(0, 0, 0, 0.25) !important;
  `;

  const banner = document.createElement("div");
  banner.style.cssText = `
    position: fixed !important;
    top: 18px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(15, 15, 15, 0.94) !important;
    color: #ffffff !important;
    padding: 9px 20px !important;
    border-radius: 99px !important;
    font: 13px system-ui, -apple-system, sans-serif !important;
    letter-spacing: 0.3px !important;
    box-shadow: 0 8px 25px rgba(0,0,0,0.6) !important;
    border: 1px solid rgba(255,255,255,0.25) !important;
    pointer-events: none !important;
    z-index: 2147483648 !important;
    white-space: nowrap !important;
  `;
  banner.innerHTML = "<b>✂ Click and drag to select area</b> &nbsp;·&nbsp; Press <kbd style='background:#333;padding:2px 6px;border-radius:4px;font-family:monospace;'>ESC</kbd> to cancel";
  overlay.appendChild(banner);

  const box = document.createElement("div");
  box.style.cssText = `
    position: fixed !important;
    border: 2px dashed #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.45) !important;
    display: none !important;
    pointer-events: none !important;
    z-index: 2147483648 !important;
  `;
  overlay.appendChild(box);

  const tip = document.createElement("div");
  tip.style.cssText = `
    position: fixed !important;
    background: #000000 !important;
    color: #ffffff !important;
    font: 11px Consolas, monospace !important;
    padding: 4px 8px !important;
    border-radius: 5px !important;
    display: none !important;
    pointer-events: none !important;
    z-index: 2147483649 !important;
    border: 1px solid rgba(255,255,255,0.3) !important;
  `;
  overlay.appendChild(tip);

  let startX = 0, startY = 0, isDragging = false;

  function cleanup() {
    window.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
    }
  }
  window.addEventListener("keydown", onKeyDown, true);

  overlay.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    box.style.left = startX + "px";
    box.style.top = startY + "px";
    box.style.width = "0px";
    box.style.height = "0px";
    box.style.display = "block";
    tip.style.display = "block";
  });

  overlay.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const curX = e.clientX;
    const curY = e.clientY;
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);

    box.style.left = x + "px";
    box.style.top = y + "px";
    box.style.width = w + "px";
    box.style.height = h + "px";

    tip.textContent = `${w} × ${h} px`;
    tip.style.left = Math.min(window.innerWidth - 90, x + w + 8) + "px";
    tip.style.top = Math.min(window.innerHeight - 32, y + h + 8) + "px";
  });

  overlay.addEventListener("mouseup", async () => {
    if (!isDragging) return;
    isDragging = false;

    const curX = parseInt(box.style.left, 10);
    const curY = parseInt(box.style.top, 10);
    const w = parseInt(box.style.width, 10);
    const h = parseInt(box.style.height, 10);

    if (w < 8 || h < 8) {
      cleanup();
      return;
    }

    overlay.style.display = "none";
    await new Promise(r => setTimeout(r, 60));

    const dpr = window.devicePixelRatio || 1;
    chrome.runtime.sendMessage({
      action: "CAPTURE_AREA",
      area: { x: curX, y: curY, width: w, height: h, dpr },
      title: document.title
    }, () => {
      cleanup();
      const toast = document.createElement("div");
      toast.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        background: #111111 !important;
        color: #ffffff !important;
        border: 1px solid #444444 !important;
        border-radius: 10px !important;
        padding: 12px 18px !important;
        font: 13px system-ui, sans-serif !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.65) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      `;
      toast.innerHTML = "<span style='color:#4caf50;'>✔</span> <b>Custom Area Screenshot saved to Downloads!</b>";
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s";
        setTimeout(() => toast.remove(), 400);
      }, 3200);
    });
  });

  document.documentElement.appendChild(overlay);
}

/* 3. Full Page Screenshot (Safe Rate-Limit & Dimensions) */
async function captureFullPageScreenshot() {
  const tab = await getTab();
  if (!tab?.id || !isCapturableUrl(tab.url)) {
    return msg("Full page screenshot is unavailable on this page.");
  }

  const statusEl = $("screenshotStatus");
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.textContent = "Calculating full page height…";
  }

  try {
    const [metricsRes] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const body = document.body;
        const html = document.documentElement;
        const scrollingEl = document.scrollingElement || html;

        const totalWidth = Math.max(
          body ? body.scrollWidth : 0,
          body ? body.offsetWidth : 0,
          html.clientWidth,
          html.scrollWidth,
          html.offsetWidth,
          scrollingEl.scrollWidth
        );
        const totalHeight = Math.max(
          body ? body.scrollHeight : 0,
          body ? body.offsetHeight : 0,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight,
          scrollingEl.scrollHeight
        );
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        const initialScroll = { x: window.scrollX, y: window.scrollY };

        let style = document.getElementById("__nexa_hide_scrollbar");
        if (!style) {
          style = document.createElement("style");
          style.id = "__nexa_hide_scrollbar";
          style.textContent = `
            html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
            html, body { scrollbar-width: none !important; }
          `;
          (document.head || html).appendChild(style);
        }

        return { totalWidth, totalHeight, viewportWidth, viewportHeight, dpr, initialScroll };
      }
    });

    const m = metricsRes?.result;
    if (!m || !m.totalHeight) throw new Error("Could not calculate page dimensions");

    const { totalWidth, totalHeight, viewportWidth, viewportHeight, dpr, initialScroll } = m;

    const MAX_CANVAS_DIM = 14000;
    let canvasDpr = dpr;
    if (totalHeight * canvasDpr > MAX_CANVAS_DIM) {
      canvasDpr = MAX_CANVAS_DIM / totalHeight;
    }
    if (viewportWidth * canvasDpr > MAX_CANVAS_DIM) {
      canvasDpr = Math.min(canvasDpr, MAX_CANVAS_DIM / viewportWidth);
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewportWidth * canvasDpr);
    canvas.height = Math.round(totalHeight * canvasDpr);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentY = 0;
    let sliceIndex = 0;
    const totalSlices = Math.max(1, Math.ceil(totalHeight / viewportHeight));

    async function captureSliceWithRetry() {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const url = await chrome.tabs.captureVisibleTab(null, { format: "png" });
          if (url) return url;
        } catch (err) {
          if (attempt === 4) throw err;
          await new Promise(r => setTimeout(r, 650 + attempt * 250));
        }
      }
      throw new Error("Slice capture failed");
    }

    while (currentY < totalHeight) {
      sliceIndex++;
      if (statusEl) {
        statusEl.textContent = `Capturing slice ${sliceIndex} of ${totalSlices} (${Math.round((sliceIndex / totalSlices) * 100)}%)…`;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (y, isNotFirstSlice) => {
          window.scrollTo(0, y);
          if (isNotFirstSlice) {
            let fixedStyle = document.getElementById("__nexa_hide_fixed");
            if (!fixedStyle) {
              fixedStyle = document.createElement("style");
              fixedStyle.id = "__nexa_hide_fixed";
              fixedStyle.textContent = `
                header, nav, [class*="header" i], [class*="nav" i], [id*="header" i], [id*="nav" i] {
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
              `;
              (document.head || document.documentElement).appendChild(fixedStyle);
            }
          }
        },
        args: [currentY, sliceIndex > 1]
      });

      await new Promise(r => setTimeout(r, 600));

      const sliceDataUrl = await captureSliceWithRetry();
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = sliceDataUrl;
      });

      const remainingHeight = totalHeight - currentY;
      if (remainingHeight < viewportHeight) {
        const sliceH = remainingHeight * dpr;
        const sourceY = (viewportHeight - remainingHeight) * dpr;
        ctx.drawImage(
          img,
          0, sourceY, img.width, sliceH,
          0, currentY * canvasDpr, canvas.width, remainingHeight * canvasDpr
        );
      } else {
        ctx.drawImage(
          img,
          0, 0, img.width, img.height,
          0, currentY * canvasDpr, canvas.width, viewportHeight * canvasDpr
        );
      }

      currentY += viewportHeight;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pos => {
        window.scrollTo(pos.x, pos.y);
        const s1 = document.getElementById("__nexa_hide_scrollbar");
        if (s1) s1.remove();
        const s2 = document.getElementById("__nexa_hide_fixed");
        if (s2) s2.remove();
      },
      args: [initialScroll]
    });

    if (statusEl) statusEl.textContent = "Merging full-length PNG…";

    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("Could not create full page image blob");

    const blobUrl = URL.createObjectURL(blob);
    const title = safeName(tab.title || "fullpage");
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `NEXA/Screenshots/FullPage_${title}_${ts}.png`;

    await chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    showScreenshotPreview(blobUrl, filename, blob);
    if (statusEl) {
      statusEl.textContent = `Full page captured successfully! (${totalSlices} slices)`;
      setTimeout(() => { statusEl.style.display = "none"; }, 4000);
    }
    msg("Full page screenshot saved to Downloads!");
  } catch (err) {
    if (statusEl) statusEl.style.display = "none";
    msg(friendlyError(err, "Full page capture failed."));
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const s1 = document.getElementById("__nexa_hide_scrollbar");
          if (s1) s1.remove();
          const s2 = document.getElementById("__nexa_hide_fixed");
          if (s2) s2.remove();
        }
      });
    } catch (_) {}
  }
}

if ($("btnVisibleScreenshot")) $("btnVisibleScreenshot").onclick = captureVisibleScreenshot;
if ($("btnAreaScreenshot")) $("btnAreaScreenshot").onclick = startAreaScreenshot;
if ($("btnFullPageScreenshot")) $("btnFullPageScreenshot").onclick = captureFullPageScreenshot;

/* ---------------- Screen Video Recording ---------------- */
let mediaRecorder = null;
let recordingStream = null;
let recordedChunks = [];
let recTimerInterval = null;
let recSeconds = 0;
let recordedVideoUrl = null;

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function startScreenRecording() {
  const wantAudio = $("recAudio")?.checked ?? true;
  const wantMic = $("recMic")?.checked ?? false;

  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always", displaySurface: "browser" },
      audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false
    });

    let finalStream = displayStream;

    if (wantMic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          const dest = actx.createMediaStreamDestination();
          if (displayStream.getAudioTracks().length > 0) {
            actx.createMediaStreamSource(displayStream).connect(dest);
          }
          actx.createMediaStreamSource(micStream).connect(dest);
          finalStream = new MediaStream([...displayStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
      } catch (micE) {
        console.warn("Mic unavailable, continuing without mic", micE);
      }
    }

    recordingStream = finalStream;
    recordedChunks = [];

    let mimeType = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    }

    mediaRecorder = new MediaRecorder(finalStream, { mimeType });

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => finishScreenRecording(mimeType);

    displayStream.getVideoTracks()[0].onended = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") stopScreenRecording();
    };

    mediaRecorder.start(1000);

    recSeconds = 0;
    $("recTimer").textContent = "00:00";
    clearInterval(recTimerInterval);
    recTimerInterval = setInterval(() => {
      recSeconds++;
      if ($("recTimer")) $("recTimer").textContent = formatTime(recSeconds);
    }, 1000);

    $("btnStartRecording").style.display = "none";
    $("activeRecControls").style.display = "block";
    $("recResultWrap").style.display = "none";
    msg("Screen recording started!");
  } catch (err) {
    msg(friendlyError(err, "Recording was cancelled or unavailable"));
  }
}

function stopScreenRecording() {
  clearInterval(recTimerInterval);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (recordingStream) {
    recordingStream.getTracks().forEach(t => t.stop());
    recordingStream = null;
  }
  $("btnStartRecording").style.display = "flex";
  $("activeRecControls").style.display = "none";
}

async function finishScreenRecording(mimeType) {
  const blob = new Blob(recordedChunks, { type: mimeType });
  if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
  recordedVideoUrl = URL.createObjectURL(blob);

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `NEXA/Recordings/Recording_${ts}.webm`;

  const video = $("recVideoPreview");
  if (video) {
    video.src = recordedVideoUrl;
    video.style.display = "block";
  }
  $("recResultWrap").style.display = "block";

  $("btnDownloadRecording").onclick = async () => {
    try {
      await chrome.downloads.download({ url: recordedVideoUrl, filename, saveAs: true, conflictAction: "uniquify" });
      msg("Recording video saved");
    } catch (_) { msg("Download failed"); }
  };

  try {
    await chrome.downloads.download({ url: recordedVideoUrl, filename, saveAs: false, conflictAction: "uniquify" });
    msg("Recording saved to Downloads!");
  } catch (_) {}
}

if ($("btnStartRecording")) $("btnStartRecording").onclick = startScreenRecording;
if ($("btnStopRecording")) $("btnStopRecording").onclick = stopScreenRecording;
if ($("btnPauseRecording")) {
  $("btnPauseRecording").onclick = () => {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      $("btnPauseRecording").textContent = "Resume";
      msg("Recording paused");
    } else if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      $("btnPauseRecording").textContent = "Pause";
      msg("Recording resumed");
    }
  };
}
if ($("btnNewRecording")) {
  $("btnNewRecording").onclick = () => {
    $("recResultWrap").style.display = "none";
    $("btnStartRecording").style.display = "flex";
  };
}

/* ================================================================
   MEDIA & CONVERTER STUDIO (PAGE MEDIA + IMAGE CONVERTER)
   ================================================================ */

// Subtabs for Media
if ($("tabMediaExtract") && $("tabMediaConvert")) {
  $("tabMediaExtract").onclick = () => {
    $("tabMediaExtract").classList.add("active");
    $("tabMediaConvert").classList.remove("active");
    $("mediaExtractView").style.display = "block";
    $("mediaConvertView").style.display = "none";
  };
  $("tabMediaConvert").onclick = () => {
    $("tabMediaConvert").classList.add("active");
    $("tabMediaExtract").classList.remove("active");
    $("mediaConvertView").style.display = "block";
    $("mediaExtractView").style.display = "none";
  };
}

// View toggle (Grid vs List)
if ($("viewGrid") && $("viewList")) {
  $("viewGrid").onclick = () => {
    isGridView = true;
    $("viewGrid").classList.add("active");
    $("viewList").classList.remove("active");
    $("imageList").className = "imagelist grid-mode";
  };
  $("viewList").onclick = () => {
    isGridView = false;
    $("viewList").classList.add("active");
    $("viewGrid").classList.remove("active");
    $("imageList").className = "imagelist list-mode";
  };
}

function imageFileName(url, index, type = "IMG", customPrefix = "") {
  try {
    const prefix = customPrefix ? customPrefix.trim().replace(/[\\/:*?"<>|]/g, "_") : "";
    if (type === "SVG" && url.startsWith("data:image/svg")) {
      return `NEXA/SVGs/${prefix ? prefix + "_" : "icon-svg-"}${index}.svg`;
    }
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_").trim();
    if (!name || name.length < 2) name = `${type.toLowerCase()}-${index}`;
    const extMatch = name.match(/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)$/i);
    const ext = extMatch ? extMatch[0] : (type === "SVG" ? ".svg" : (type === "ICON" ? ".png" : ".jpg"));
    
    const finalName = prefix ? `${prefix}_${index}${ext}` : (extMatch ? name : name + ext);
    const folder = type === "ICON" ? "Icons" : (type === "SVG" ? "SVGs" : "Images");
    return `NEXA/${folder}/${finalName.slice(0, 90)}`;
  } catch (_) {
    const p = customPrefix ? customPrefix.trim() + "_" : "media-";
    return `NEXA/Media/${p}${index}.jpg`;
  }
}

async function scanAllMedia() {
  const list = $("imageList");
  list.innerHTML = '<div class="scan">Scanning all images, icons &amp; SVGs on page…</div>';
  $("imageCount").textContent = "Scanning…";

  try {
    const r = await inject(() => {
      const map = new Map();

      const add = (raw, type, w = 0, h = 0) => {
        if (!raw) return;
        if (/^data:image\/svg\+xml/i.test(raw)) {
          if (!map.has(raw)) map.set(raw, { url: raw, type: "SVG", width: w || 24, height: h || 24, name: "Inline SVG" });
          return;
        }
        if (/^(data|blob):/i.test(raw)) return;
        try {
          const u = new URL(raw, location.href);
          if (!/^https?:$/i.test(u.protocol)) return;
          const key = u.href.split("#")[0];
          if (!map.has(key)) {
            let cat = type;
            if (/\.svg($|\?)/i.test(key)) cat = "SVG";
            else if (/favicon|\bicon\b|apple-touch-icon/i.test(key)) cat = "ICON";
            map.set(key, { url: key, type: cat, width: w, height: h, name: decodeURIComponent(u.pathname.split("/").pop() || "") });
          }
        } catch (_) {}
      };

      document.querySelectorAll("img").forEach(im => {
        const w = im.naturalWidth || im.width || 0;
        const h = im.naturalHeight || im.height || 0;
        add(im.currentSrc || im.src, "IMAGE", w, h);
        ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-fallback-src", "data-image", "data-srcset"].forEach(a => {
          add(im.getAttribute(a), "IMAGE", w, h);
        });
        if (im.srcset) {
          im.srcset.split(",").forEach(p => add(p.trim().split(/\s+/)[0], "IMAGE", w, h));
        }
      });

      document.querySelectorAll("source[srcset]").forEach(s => {
        s.srcset.split(",").forEach(p => add(p.trim().split(/\s+/)[0], "IMAGE"));
      });

      document.querySelectorAll("link[rel*='icon'], link[rel*='apple-touch']").forEach(link => {
        add(link.href, "ICON", 64, 64);
      });
      try {
        add(new URL("/favicon.ico", location.origin).href, "ICON", 32, 32);
      } catch (_) {}

      const serializer = new XMLSerializer();
      document.querySelectorAll("svg").forEach((svg, idx) => {
        if (idx > 100) return;
        try {
          const clone = svg.cloneNode(true);
          if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          const svgStr = serializer.serializeToString(clone);
          const dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
          const rect = svg.getBoundingClientRect();
          add(dataUri, "SVG", Math.round(rect.width || 24), Math.round(rect.height || 24));
        } catch (_) {}
      });

      document.querySelectorAll("video[poster]").forEach(v => add(v.poster, "IMAGE"));
      document.querySelectorAll("meta[property='og:image'], meta[name='twitter:image']").forEach(m => add(m.content, "IMAGE"));

      const re = /url\(\s*(["']?)(.*?)\1\s*\)/g;
      for (const el of document.querySelectorAll("*")) {
        const bg = getComputedStyle(el).backgroundImage || "";
        let m; while ((m = re.exec(bg))) add(m[2], "IMAGE");
      }

      return [...map.values()];
    });

    detectedImages = r?.[0]?.result || [];
    updateMediaCounts();
    renderFilteredMedia();
  } catch (e) {
    detectedImages = [];
    $("imageCount").textContent = "Scan unavailable";
    $("imageHint").textContent = "Protected or internal browser page";
    $("imageList").innerHTML = '<div class="scan">Cannot access this page. Try any normal website (http/https).</div>';
  }
}

function updateMediaCounts() {
  const all = detectedImages.length;
  const imgs = detectedImages.filter(x => x.type === "IMAGE").length;
  const icons = detectedImages.filter(x => x.type === "ICON").length;
  const svgs = detectedImages.filter(x => x.type === "SVG").length;

  if ($("countAll")) $("countAll").textContent = `(${all})`;
  if ($("countImages")) $("countImages").textContent = `(${imgs})`;
  if ($("countIcons")) $("countIcons").textContent = `(${icons})`;
  if ($("countSvgs")) $("countSvgs").textContent = `(${svgs})`;

  $("imageCount").textContent = `${all} item${all === 1 ? "" : "s"} found`;
  $("imageHint").textContent = all ? "Click thumbnail to preview or convert" : "No downloadable media detected";
}

function renderFilteredMedia() {
  const list = $("imageList");
  list.innerHTML = "";

  const hideTiny = $("filterTiny")?.checked ?? true;

  const filtered = detectedImages.filter((x, index) => {
    x._index = index;
    if (hideTiny && x.width > 0 && x.height > 0 && x.width < 30 && x.height < 30 && x.type !== "ICON") {
      return false;
    }
    if (activeMediaFilter === "all") return true;
    return x.type === activeMediaFilter;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="scan" style="grid-column:1/-1;">No media matching current filter.</div>';
    return;
  }

  filtered.forEach(x => {
    const row = document.createElement("div");
    row.className = "imageitem";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.title = "Click to preview full image";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = x.url;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => { img.removeAttribute("src"); thumb.classList.add("broken"); thumb.textContent = "✕"; };
    thumb.appendChild(img);

    // Clicking thumbnail opens Lightbox modal
    thumb.onclick = e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      openImagePreviewModal(x);
    };

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.mediaIndex = x._index;
    cb.style.accentColor = "rgb(240,240,240)";
    cb.style.cursor = "pointer";

    const meta = document.createElement("div");
    meta.className = "meta";

    const badgeClass = x.type === "SVG" ? "badge-svg" : (x.type === "ICON" ? "badge-icon" : "badge-img");
    const dimText = x.width && x.height ? `${x.width}×${x.height}` : x.type;

    const b = document.createElement("b");
    b.innerHTML = `<span class="badge ${badgeClass}">${x.type}</span>${x.name || "Image"}`;

    const s = document.createElement("small");
    s.textContent = dimText;
    meta.append(b, s);

    const cardBottom = document.createElement("div");
    cardBottom.className = "card-bottom";

    const dlBtn = document.createElement("button");
    dlBtn.className = "primary";
    dlBtn.textContent = "↓";
    dlBtn.title = "Download this image";
    dlBtn.onclick = e => {
      e.stopPropagation();
      downloadMediaList([x._index]);
    };

    const convBtn = document.createElement("button");
    convBtn.className = "widebtn";
    convBtn.textContent = "⇄";
    convBtn.title = "Convert this image format";
    convBtn.onclick = e => {
      e.stopPropagation();
      initConverterWithImage(x.url, x.name || "image");
    };

    const previewBtn = document.createElement("button");
    previewBtn.className = "widebtn";
    previewBtn.textContent = "👁";
    previewBtn.title = "Full Preview";
    previewBtn.onclick = e => {
      e.stopPropagation();
      openImagePreviewModal(x);
    };

    cardBottom.append(cb, dlBtn, convBtn, previewBtn);
    row.append(thumb, meta, cardBottom);
    list.appendChild(row);
  });
}

/* --- Image Preview Lightbox Modal --- */
let activeModalItem = null;

function openImagePreviewModal(item) {
  activeModalItem = item;
  const modal = $("imagePreviewModal");
  const img = $("modalPreviewImage");
  const title = $("modalImageTitle");
  const dims = $("modalImageDims");
  if (!modal || !img) return;

  img.src = item.url;
  title.textContent = item.name || "Image Preview";
  dims.textContent = `${item.width || "?"} × ${item.height || "?"} px · ${item.type}`;
  modal.style.display = "flex";

  $("modalBtnDownload").onclick = () => downloadMediaList([item._index]);
  $("modalBtnConvert").onclick = () => {
    closeImageModal();
    initConverterWithImage(item.url, item.name || "image");
  };
  $("modalBtnCopy").onclick = async () => {
    try {
      const resp = await fetch(item.url);
      const blob = await resp.blob();
      await copyBlobImage(blob);
    } catch (_) { msg("Could not copy directly. Use Download."); }
  };
  $("modalBtnOpen").onclick = () => chrome.tabs.create({ url: item.url });
}

function closeImageModal() {
  const modal = $("imagePreviewModal");
  if (modal) modal.style.display = "none";
}

if ($("closeImageModal")) $("closeImageModal").onclick = closeImageModal;
if ($("imagePreviewModal")) {
  $("imagePreviewModal").onclick = e => {
    if (e.target === $("imagePreviewModal")) closeImageModal();
  };
}
window.addEventListener("keydown", e => {
  if (e.key === "Escape") closeImageModal();
});

/* --- Batch / Custom Download --- */
async function downloadMediaList(indices) {
  const unique = [...new Set(indices)].filter(i => detectedImages[i]);
  if (!unique.length) return msg("Select at least one item to download");

  const customPrefix = $("customFileName")?.value.trim() || "";
  let success = 0, failed = 0;

  for (let idx = 0; idx < unique.length; idx++) {
    const item = detectedImages[unique[idx]];
    try {
      const filename = imageFileName(item.url, unique[idx] + 1, item.type, customPrefix);
      await chrome.downloads.download({
        url: item.url,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
      success++;
      if (idx < unique.length - 1 && idx % 3 === 0) {
        await new Promise(r => setTimeout(r, 120));
      }
    } catch (_) { failed++; }
  }
  msg(failed ? `${success} downloaded · ${failed} failed` : `${success} item${success === 1 ? "" : "s"} downloaded`);
}

$("scanImages").onclick = scanAllMedia;
$("downloadAllImages").onclick = () => downloadMediaList(detectedImages.map((_, i) => i));
$("downloadSelectedImages").onclick = () => {
  const checked = [...document.querySelectorAll("#imageList input[data-media-index]:checked")].map(x => Number(x.dataset.mediaIndex));
  downloadMediaList(checked);
};

if ($("selectAllMedia")) {
  $("selectAllMedia").onclick = () => {
    document.querySelectorAll("#imageList input[data-media-index]").forEach(cb => cb.checked = true);
  };
}
if ($("deselectAllMedia")) {
  $("deselectAllMedia").onclick = () => {
    document.querySelectorAll("#imageList input[data-media-index]").forEach(cb => cb.checked = false);
  };
}
if ($("filterTiny")) {
  $("filterTiny").onchange = renderFilteredMedia;
}

document.querySelectorAll(".pill[data-filter]").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    activeMediaFilter = pill.dataset.filter;
    renderFilteredMedia();
  });
});

/* ================================================================
   UNIVERSAL IMAGE CONVERTER (WEBP / JPG / PNG / ICO / SVG)
   ================================================================ */
let converterSourceImage = null;
let converterSourceDataUrl = null;
let converterSourceFileName = "image.png";
let targetFormat = "png";

const convDropZone = $("converterDropZone");
const convFileInput = $("converterFileInput");

if (convDropZone && convFileInput) {
  convDropZone.onclick = () => convFileInput.click();
  convDropZone.ondragover = e => { e.preventDefault(); convDropZone.classList.add("dragover"); };
  convDropZone.ondragleave = () => convDropZone.classList.remove("dragover");
  convDropZone.ondrop = e => {
    e.preventDefault();
    convDropZone.classList.remove("dragover");
    if (e.dataTransfer?.files?.[0]) loadConverterFile(e.dataTransfer.files[0]);
  };
  convFileInput.onchange = e => {
    if (e.target.files?.[0]) loadConverterFile(e.target.files[0]);
  };
}

function loadConverterFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    initConverterWithImage(e.target.result, file.name);
  };
  reader.readAsDataURL(file);
}

function initConverterWithImage(dataUrlOrHttpUrl, filename = "image.png") {
  // Switch to converter subtab
  if ($("tabMediaConvert")) $("tabMediaConvert").click();

  converterSourceFileName = filename.replace(/\.[^/.]+$/, "");
  converterSourceDataUrl = dataUrlOrHttpUrl;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    converterSourceImage = img;
    $("converterPreviewImg").src = dataUrlOrHttpUrl;
    $("converterFileName").textContent = filename;
    $("converterOrigStats").textContent = `Original: ${img.naturalWidth} × ${img.naturalHeight} px`;
    $("converterControls").style.display = "block";
    updateConverterResultInfo();
    msg("Image loaded into Converter!");
  };
  img.onerror = () => msg("Could not load image for conversion");
  img.src = dataUrlOrHttpUrl;
}

// Target Format Selector Buttons
document.querySelectorAll(".format-btn[data-target-format]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    targetFormat = btn.dataset.targetFormat;
    // Toggle quality slider visibility for lossy formats
    if (targetFormat === "jpeg" || targetFormat === "webp") {
      $("convQualityWrap").style.display = "block";
    } else {
      $("convQualityWrap").style.display = "none";
    }
    updateConverterResultInfo();
  };
});

if ($("convQuality")) {
  $("convQuality").oninput = e => {
    $("convQualityValue").textContent = e.target.value + "%";
    updateConverterResultInfo();
  };
}
if ($("convResize")) {
  $("convResize").onchange = () => updateConverterResultInfo();
}

function updateConverterResultInfo() {
  if (!converterSourceImage) return;
  const resizeVal = $("convResize")?.value || "original";
  let w = converterSourceImage.naturalWidth;
  let h = converterSourceImage.naturalHeight;
  if (resizeVal !== "original") {
    const s = parseInt(resizeVal, 10);
    w = s; h = s;
  }
  const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;
  $("convResultInfo").textContent = `Convert to: .${ext.toUpperCase()} (${w} × ${h} px)`;
}

// Universal Image Converter Engine
async function convertAndDownloadImage() {
  if (!converterSourceImage) return msg("Upload or select an image first");

  try {
    const resizeVal = $("convResize")?.value || "original";
    let targetW = converterSourceImage.naturalWidth;
    let targetH = converterSourceImage.naturalHeight;

    if (resizeVal !== "original") {
      const s = parseInt(resizeVal, 10);
      targetW = s; targetH = s;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    // For JPEG, fill white background to prevent black transparent areas
    if (targetFormat === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(converterSourceImage, 0, 0, targetW, targetH);

    const quality = (Number($("convQuality")?.value || 92)) / 100;
    let finalBlob = null;
    let finalExt = targetFormat === "jpeg" ? "jpg" : targetFormat;

    if (targetFormat === "png") {
      finalBlob = await new Promise(res => canvas.toBlob(res, "image/png"));
    } else if (targetFormat === "jpeg") {
      finalBlob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    } else if (targetFormat === "webp") {
      finalBlob = await new Promise(res => canvas.toBlob(res, "image/webp", quality));
    } else if (targetFormat === "ico") {
      // Create valid Windows ICO file from PNG buffer
      const pngBlob = await new Promise(res => canvas.toBlob(res, "image/png"));
      finalBlob = await createIcoFromPngBlob(pngBlob, targetW, targetH);
    } else if (targetFormat === "svg") {
      // Vector SVG wrapper with embedded high-res image
      const dataUrl = canvas.toDataURL("image/png");
      const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}"><image width="${targetW}" height="${targetH}" href="${dataUrl}"/></svg>`;
      finalBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    }

    if (!finalBlob) throw new Error("Conversion failed");

    const dlUrl = URL.createObjectURL(finalBlob);
    const outName = `${safeName(converterSourceFileName)}_${targetW}x${targetH}.${finalExt}`;
    const filename = `NEXA/Converted/${outName}`;

    await chrome.downloads.download({
      url: dlUrl,
      filename,
      saveAs: true,
      conflictAction: "uniquify"
    });

    const kb = (finalBlob.size / 1024).toFixed(1);
    msg(`Converted & downloaded: ${outName} (${kb} KB)!`);
  } catch (err) {
    msg(friendlyError(err, "Image conversion failed"));
  }
}

// Windows ICO format builder
async function createIcoFromPngBlob(pngBlob, width, height) {
  const buffer = await pngBlob.arrayBuffer();
  const pngBytes = new Uint8Array(buffer);

  const header = new Uint8Array(6);
  header[0] = 0; header[1] = 0; // Reserved
  header[2] = 1; header[3] = 0; // 1 = ICO
  header[4] = 1; header[5] = 0; // 1 image

  const entry = new Uint8Array(16);
  entry[0] = width >= 256 ? 0 : width;
  entry[1] = height >= 256 ? 0 : height;
  entry[2] = 0; // color count
  entry[3] = 0; // reserved
  entry[4] = 1; entry[5] = 0; // color planes
  entry[6] = 32; entry[7] = 0; // 32 bits per pixel

  const len = pngBytes.length;
  entry[8] = len & 0xFF;
  entry[9] = (len >> 8) & 0xFF;
  entry[10] = (len >> 16) & 0xFF;
  entry[11] = (len >> 24) & 0xFF;

  // Offset = 6 + 16 = 22
  entry[12] = 22; entry[13] = 0; entry[14] = 0; entry[15] = 0;

  const combined = new Uint8Array(6 + 16 + len);
  combined.set(header, 0);
  combined.set(entry, 6);
  combined.set(pngBytes, 22);

  return new Blob([combined], { type: "image/x-icon" });
}

if ($("btnDownloadConverted")) $("btnDownloadConverted").onclick = convertAndDownloadImage;

/* ================================================================
   DISPLAY CONTROLS & AUDIO BOOST
   ================================================================ */
async function saveDisplaySettings() {
  try {
    await chrome.storage.local.set({
      [DISPLAY_STORAGE_KEY]: {
        brightness: Number($("brightness")?.value || 100),
        color: $("pageColor")?.value || "#ffffff",
        colorOpacity: Number($("colorOpacity")?.value || 0),
        volume: Number($("volume")?.value || 100)
      }
    });
  } catch (_) {}
}

async function restoreDisplaySettings() {
  try {
    const data = await chrome.storage.local.get(DISPLAY_STORAGE_KEY);
    const s = data?.[DISPLAY_STORAGE_KEY];
    if (!s) return;
    if ($("brightness")) $("brightness").value = Math.max(40, Math.min(160, Number(s.brightness) || 100));
    if ($("volume")) $("volume").value = Math.max(0, Math.min(2000, Number(s.volume) || 100));
    if ($("colorOpacity")) $("colorOpacity").value = Math.max(0, Math.min(45, Number(s.colorOpacity) || 0));
    syncColorInputs(s.color || "#ffffff");
    $("brightness")?.dispatchEvent(new Event("input"));
    await applyPageColor();
    $("volume")?.dispatchEvent(new Event("input"));
  } catch (_) {}
}

$("brightness").oninput = async e => {
  const v = Number(e.target.value);
  $("brightValue").textContent = v + "%";
  saveDisplaySettings();
  try {
    await inject(val => {
      let s = document.getElementById("__qt_brightness");
      if (!s) { s = document.createElement("style"); s.id = "__qt_brightness"; (document.head || document.documentElement).appendChild(s); }
      s.textContent = `html{filter:brightness(${val}%) !important}`;
    }, [v]);
  } catch (_) { msg("Brightness control is unavailable on this page."); }
};

document.querySelectorAll("[data-bright]").forEach(b => b.onclick = () => {
  $("brightness").value = b.dataset.bright;
  $("brightness").dispatchEvent(new Event("input"));
});

function hexToRgb(hex) {
  const h = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function syncColorInputs(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return false;
  const normalized = "#" + String(value).replace("#", "").toLowerCase();
  $("pageColor").value = normalized;
  $("pageColorHex").value = normalized.toUpperCase();
  return true;
}

async function applyPageColor() {
  const color = $("pageColor")?.value || "#ffffff";
  const opacity = Math.max(0, Math.min(45, Number($("colorOpacity")?.value) || 0));
  const rgb = hexToRgb(color);
  if (!rgb) return;
  $("colorOpacityValue").textContent = opacity + "%";
  try {
    await inject(({ r, g, b }, a) => {
      let s = document.getElementById("__qt_color_tint");
      if (!s) { s = document.createElement("style"); s.id = "__qt_color_tint"; (document.head || document.documentElement).appendChild(s); }
      s.textContent = a > 0 ? `html::after{content:"";position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:rgb(${r},${g},${b}) !important;opacity:${a / 100} !important;}` : "";
    }, [rgb, opacity]);
  } catch (_) { msg("Color picker is unavailable on this page."); }
}

$("pageColor").oninput = () => {
  $("pageColorHex").value = $("pageColor").value.toUpperCase();
  $("colorPickStatus").textContent = "HEX " + $("pageColor").value.toUpperCase();
  saveDisplaySettings();
  applyPageColor();
};
$("pageColorHex").oninput = e => {
  if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) {
    syncColorInputs(e.target.value);
    $("colorPickStatus").textContent = "HEX " + $("pageColor").value.toUpperCase();
    saveDisplaySettings();
    applyPageColor();
  }
};
$("pageColorHex").onblur = () => {
  syncColorInputs($("pageColorHex").value) || syncColorInputs("#ffffff");
  $("colorPickStatus").textContent = "HEX " + $("pageColor").value.toUpperCase();
  saveDisplaySettings();
  applyPageColor();
};
$("colorOpacity").oninput = () => { $("colorStrengthValue").textContent = $("colorOpacity").value + "%"; saveDisplaySettings(); applyPageColor(); };
$("clearColor").onclick = () => { $("colorOpacity").value = 0; saveDisplaySettings(); applyPageColor(); };
$("pickColor").onclick = async () => {
  try {
    if (!window.EyeDropper) return msg("EyeDropper is not supported in this Chrome version");
    const result = await new EyeDropper().open();
    if (result?.sRGBHex) {
      syncColorInputs(result.sRGBHex);
      $("colorOpacity").value = Math.max(20, Number($("colorOpacity").value) || 25);
      $("colorStrengthValue").textContent = $("colorOpacity").value + "%";
      $("colorPickStatus").textContent = "Picked " + result.sRGBHex.toUpperCase();
      await saveDisplaySettings();
      await applyPageColor();
      msg("Color picked: " + result.sRGBHex.toUpperCase());
    }
  } catch (e) { if (!/AbortError/i.test(String(e?.name || e))) msg("Color picking was cancelled or unavailable"); }
};

$("resetDisplay").onclick = async () => {
  $("brightness").value = 100;
  syncColorInputs("#ffffff");
  $("colorOpacity").value = 0;
  $("volume").value = 100;
  await saveDisplaySettings();
  $("brightness").dispatchEvent(new Event("input"));
  await applyPageColor();
  $("volume").dispatchEvent(new Event("input"));
  msg("Display controls reset");
};
$("applyAllDisplay").onclick = async () => {
  await applyPageColor();
  $("brightness").dispatchEvent(new Event("input"));
  $("volume").dispatchEvent(new Event("input"));
  msg("Current display settings applied");
};

$("volume").oninput = async e => {
  const v = Math.max(0, Math.min(2000, Number(e.target.value)));
  $("volumeValue").textContent = v + "%";
  saveDisplaySettings();
  if ($("boostFill")) $("boostFill").style.width = Math.max(0, Math.min(100, v / 20)) + "%";
  if ($("boostStatus")) $("boostStatus").textContent =
    v >= 2000 ? "2000% Extreme · Peak-safe limiter" :
    v >= 1000 ? `${v}% Extreme · Dynamic protection` :
    v > 100 ? `${v}% Ultra · Dynamic protection` :
    "Protected mode · Peak-safe";
  try {
    const result = await inject(async percent => {
      const media = [...document.querySelectorAll("audio,video")];
      if (!media.length) return { count: 0, boosted: 0, fallback: 0 };
      let boosted = 0, fallback = 0;
      const p = Math.max(0, Math.min(2000, Number(percent) || 0));
      for (const el of media) {
        try {
          let q = el.__qtUltraAudio;
          if (!q) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) throw new Error("Web Audio unavailable");
            const ctx = new AudioCtx(), source = ctx.createMediaElementSource(el);
            const pre = ctx.createGain();
            const fast = ctx.createDynamicsCompressor();
            const slow = ctx.createDynamicsCompressor();
            const makeup = ctx.createGain();
            const limiter = ctx.createDynamicsCompressor();
            const output = ctx.createGain();
            fast.threshold.value = -24; fast.knee.value = 18; fast.ratio.value = 8; fast.attack.value = .002; fast.release.value = .10;
            slow.threshold.value = -30; slow.knee.value = 24; slow.ratio.value = 6; slow.attack.value = .012; slow.release.value = .32;
            limiter.threshold.value = -1.2; limiter.knee.value = 1.5; limiter.ratio.value = 30; limiter.attack.value = .001; limiter.release.value = .065;
            source.connect(pre).connect(fast).connect(slow).connect(makeup).connect(limiter).connect(output).connect(ctx.destination);
            q = el.__qtUltraAudio = { ctx, pre, fast, slow, makeup, limiter, output };
          }
          if (q.ctx.state === "suspended") await q.ctx.resume();
          if (p === 0) {
            q.pre.gain.value = 0; q.makeup.gain.value = 0; q.output.gain.value = 1; el.volume = 0;
          } else {
            const x = p / 100;
            q.pre.gain.value = Math.min(24, Math.pow(x, .72));
            q.makeup.gain.value = Math.min(8, .72 + Math.log10(Math.max(1, x)) * 2.4);
            q.output.gain.value = .98;
            el.volume = 1;
          }
          boosted++;
        } catch (_) { try { el.volume = p === 0 ? 0 : 1; fallback++; } catch (_) {} }
      }
      return { count: media.length, boosted, fallback };
    }, [v]);
    const data = result?.[0]?.result;
    if (!data?.count) msg("No audio or video found on this page");
    else if (v >= 1000 && data.boosted > 0) msg(`${v}% Ultra Audio Boost active — compressor + peak limiter on`);
    else if (v > 100 && data.boosted > 0) msg(`${v}% Ultra Audio Boost active — peak protection on`);
    else if (v <= 100) msg(v === 0 ? "Audio muted" : `Audio set to ${v}%`);
    else msg("This site player does not allow clean Web Audio boosting");
  } catch (e) { msg(friendlyError(e, "Audio control is unavailable on this page.")); }
};
document.querySelectorAll("[data-vol]").forEach(b => b.onclick = () => { $("volume").value = b.dataset.vol; $("volume").dispatchEvent(new Event("input")); });

/* ---------------- Developer Tools & Text Stats ---------------- */
$("pageInfo").onclick = async () => {
  try {
    const d = await pageData();
    const r = await inject(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
      links: document.links.length,
      images: document.images.length,
      media: document.querySelectorAll("audio,video").length
    }));
    const x = r?.[0]?.result || {};
    alert(`Title: ${d.title}\nURL: ${d.url}\nPage size: ${x.width || 0} × ${x.height || 0}\nLinks: ${x.links || 0}\nImages: ${x.images || 0}\nMedia: ${x.media || 0}`);
  } catch (e) {
    try { const d = await pageData(); alert(`Title: ${d.title}\nURL: ${d.url}`); }
    catch (_) { msg("Page information is unavailable."); }
  }
};

$("source").onclick = async () => {
  try {
    const d = await pageData();
    if (!d.url || !/^https?:/i.test(d.url)) throw new Error("Source unavailable");
    await chrome.tabs.create({ url: "view-source:" + d.url });
  } catch (e) { msg("Source is unavailable for this page."); }
};

if ($("pageStats")) {
  $("pageStats").onclick = async () => {
    try {
      const res = await inject(() => {
        const text = document.body ? document.body.innerText : "";
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        const chars = text.length;
        const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
        const paragraphs = document.querySelectorAll("p").length;
        const readingTime = Math.max(1, Math.round(words / 200));
        return { words, chars, headings, paragraphs, readingTime };
      });
      const s = res?.[0]?.result;
      if (!s) throw new Error("Could not analyze page");
      alert(`📄 Page Content & Reading Stats:\n\n• Total Words: ${s.words.toLocaleString()}\n• Characters: ${s.chars.toLocaleString()}\n• Reading Time: ~${s.readingTime} min (at 200 wpm)\n• Paragraphs: ${s.paragraphs}\n• Headings: ${s.headings}`);
    } catch (e) { msg(friendlyError(e, "Could not analyze text on this page.")); }
  };
}

function formatJson(s) { return JSON.stringify(JSON.parse(s), null, 2); }
function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64dec(s) { return decodeURIComponent(escape(atob(s.replace(/\s+/g, "")))); }

$("jsonFormat").onclick = () => { try { $("devBox").value = formatJson($("devBox").value); msg("JSON formatted"); } catch (_) { msg("Invalid JSON"); } };
$("formatJson").onclick = $("jsonFormat").onclick;
$("urlDecode").onclick = () => { try { $("devBox").value = decodeURIComponent($("devBox").value); msg("URL decoded"); } catch (_) { msg("Invalid URL encoding"); } };
$("decodeUrl").onclick = $("urlDecode").onclick;
$("encode64").onclick = () => { try { $("devBox").value = b64enc($("devBox").value); msg("Base64 encoded"); } catch (_) { msg("Could not encode text"); } };
$("decode64").onclick = () => { try { $("devBox").value = b64dec($("devBox").value); msg("Base64 decoded"); } catch (_) { msg("Invalid Base64 text"); } };
$("base64").onclick = () => { $("devBox").focus(); };
$("clearDev").onclick = () => { $("devBox").value = ""; msg("Developer box cleared"); };

/* ================================================================
   QR STUDIO: GENERATOR & SCANNER
   ================================================================ */

if ($("tabQrGen") && $("tabQrScan")) {
  $("tabQrGen").onclick = () => {
    $("tabQrGen").classList.add("active");
    $("tabQrScan").classList.remove("active");
    $("qrGenView").style.display = "block";
    $("qrScanView").style.display = "none";
    stopCameraStream();
  };
  $("tabQrScan").onclick = () => {
    $("tabQrScan").classList.add("active");
    $("tabQrGen").classList.remove("active");
    $("qrScanView").style.display = "block";
    $("qrGenView").style.display = "none";
  };
}

/* --- QR Generator --- */
let qrCanvas = null;

function buildQRCanvas(text, requestedSize) {
  const QRClass = window.NEXAQRCode || window.QuickToolsQRCode;
  if (!QRClass) throw new Error("QR engine not loaded");
  const size = Math.max(120, Math.min(1024, Number(requestedSize) || 256));
  const qr = new QRClass(0, 0);
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 4;
  const cells = modules + quiet * 2;
  const cell = Math.max(2, Math.floor(size / cells));
  const actual = cell * cells;
  const canvas = document.createElement("canvas");
  canvas.width = actual;
  canvas.height = actual;
  canvas.setAttribute("aria-label", "Generated QR code");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "rgb(255,255,255)";
  ctx.fillRect(0, 0, actual, actual);
  ctx.fillStyle = "rgb(0,0,0)";
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
    }
  }
  return canvas;
}

function renderQR() {
  const text = $("qrText")?.value.trim() || "";
  const box = $("qrPreview");
  if (!box) return;
  box.innerHTML = "";
  qrCanvas = null;
  if (!text) { box.innerHTML = "<span>Enter text to generate</span>"; return; }
  try {
    qrCanvas = buildQRCanvas(text, $("qrSize")?.value);
    box.appendChild(qrCanvas);
  } catch (e) {
    box.innerHTML = "<span>Could not generate QR. Text may be too long.</span>";
  }
}

$("generateQR").onclick = renderQR;
$("qrText").oninput = () => {
  clearTimeout(window.__qrTimer);
  window.__qrTimer = setTimeout(renderQR, 180);
};
$("qrSize").onchange = renderQR;
$("qrFromPage").onclick = async () => {
  try {
    const d = await pageData();
    $("qrText").value = d.url || "";
    renderQR();
  } catch (_) { msg("Could not read current page URL"); }
};

$("downloadQR").onclick = async () => {
  const text = $("qrText")?.value.trim() || "";
  if (!text) return msg("Enter text first");
  if (!qrCanvas) renderQR();
  if (!qrCanvas) return msg("Generate the QR code first");
  try {
    const blob = await new Promise(resolve => qrCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG conversion failed");
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: "NEXA/QR/NEXA-QR-" + Date.now() + ".png", saveAs: true, conflictAction: "uniquify" });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 15000); }
    msg("QR PNG downloaded");
  } catch (_) { msg("QR download failed"); }
};

$("copyQR").onclick = async () => {
  if (!qrCanvas) renderQR();
  if (!qrCanvas) return msg("Generate the QR code first");
  try {
    const blob = await new Promise(resolve => qrCanvas.toBlob(resolve, "image/png"));
    await copyBlobImage(blob);
  } catch (_) { msg("Image copy unavailable — use Download PNG"); }
};

/* --- QR Code Scanner Engine --- */
async function decodeQRFromImageSource(source) {
  if (typeof BarcodeDetector !== "undefined") {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      let results = await detector.detect(source);
      if (results && results.length > 0 && results[0].rawValue) {
        return results[0].rawValue;
      }

      if (source instanceof HTMLCanvasElement) {
        const w = source.width, h = source.height;
        const ctx = source.getContext("2d");
        const origData = ctx.getImageData(0, 0, w, h);

        const invCanvas = document.createElement("canvas");
        invCanvas.width = w; invCanvas.height = h;
        const ictx = invCanvas.getContext("2d");
        const invData = ictx.createImageData(w, h);
        for (let i = 0; i < origData.data.length; i += 4) {
          invData.data[i] = 255 - origData.data[i];
          invData.data[i + 1] = 255 - origData.data[i + 1];
          invData.data[i + 2] = 255 - origData.data[i + 2];
          invData.data[i + 3] = 255;
        }
        ictx.putImageData(invData, 0, 0);
        results = await detector.detect(invCanvas);
        if (results && results.length > 0 && results[0].rawValue) {
          return results[0].rawValue;
        }

        const binCanvas = document.createElement("canvas");
        binCanvas.width = w; binCanvas.height = h;
        const bctx = binCanvas.getContext("2d");
        const binData = bctx.createImageData(w, h);
        for (let i = 0; i < origData.data.length; i += 4) {
          const lum = 0.299 * origData.data[i] + 0.587 * origData.data[i + 1] + 0.114 * origData.data[i + 2];
          const val = lum < 128 ? 0 : 255;
          binData.data[i] = val;
          binData.data[i + 1] = val;
          binData.data[i + 2] = val;
          binData.data[i + 3] = 255;
        }
        bctx.putImageData(binData, 0, 0);
        results = await detector.detect(binCanvas);
        if (results && results.length > 0 && results[0].rawValue) {
          return results[0].rawValue;
        }
      }
    } catch (e) {
      console.warn("BarcodeDetector attempt:", e);
    }
  }

  if (typeof window.NEXAQRDecode === "function") {
    try {
      const res = window.NEXAQRDecode(source);
      if (res) return res;
    } catch (_) {}
  }

  return null;
}

function handleQRScanSuccess(text) {
  const box = $("qrScanResult");
  const ta = $("qrResultText");
  const openBtn = $("openScannedUrl");
  if (!box || !ta) return;

  ta.value = text;
  box.style.display = "block";

  if (/^https?:\/\//i.test(text.trim())) {
    openBtn.style.display = "inline-block";
    openBtn.onclick = () => chrome.tabs.create({ url: text.trim() });
  } else {
    openBtn.style.display = "none";
  }

  $("copyScannedQR").onclick = () => copyText(text);

  $("sendToQrGen").onclick = () => {
    $("qrText").value = text;
    $("tabQrGen").click();
    renderQR();
  };

  msg("QR code detected & decoded!");
}

if ($("clearScanResult")) {
  $("clearScanResult").onclick = () => {
    $("qrResultText").value = "";
    $("qrScanResult").style.display = "none";
  };
}

// 1. Scan Screen / Active Tab
$("scanScreenQR").onclick = async () => {
  try {
    msg("Capturing screen to scan QR…");
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    if (!dataUrl) throw new Error("Could not capture tab");

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const decoded = await decodeQRFromImageSource(canvas);
      if (decoded) {
        handleQRScanSuccess(decoded);
      } else {
        msg("No QR code found on the visible screen. Ensure it is clearly visible.");
      }
    };
    img.onerror = () => msg("Failed to process screen image");
    img.src = dataUrl;
  } catch (err) {
    msg(friendlyError(err, "Could not scan screen for QR code."));
  }
};

// 2. Dropzone & File Input & Clipboard Paste
const dropZone = $("qrDropZone");
const fileInput = $("qrFileInput");

if (dropZone && fileInput) {
  dropZone.onclick = () => fileInput.click();

  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add("dragover"); };
  dropZone.ondragleave = () => dropZone.classList.remove("dragover");
  dropZone.ondrop = e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer?.files?.[0]) scanQRFile(e.dataTransfer.files[0]);
  };

  fileInput.onchange = e => {
    if (e.target.files?.[0]) scanQRFile(e.target.files[0]);
  };
}

window.addEventListener("paste", e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      const file = items[i].getAsFile();
      if (file) {
        // If in media convert tab, load to converter; else scan QR
        if ($("mediaConvertView") && $("mediaConvertView").style.display !== "none") {
          loadConverterFile(file);
        } else {
          msg("Pasted image received, scanning QR…");
          scanQRFile(file);
        }
        break;
      }
    }
  }
});

function scanQRFile(file) {
  msg("Scanning uploaded image…");
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const text = await decodeQRFromImageSource(canvas);
      if (text) {
        handleQRScanSuccess(text);
      } else {
        msg("No QR code detected in this image.");
      }
    };
    img.onerror = () => msg("Could not load image");
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 3. Camera / Webcam Scanner
let cameraStream = null;
let cameraScanning = false;

function stopCameraStream() {
  cameraScanning = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const wrap = $("cameraWrap");
  if (wrap) wrap.style.display = "none";
}

if ($("stopCamera")) $("stopCamera").onclick = stopCameraStream;

if ($("scanCameraQR")) {
  $("scanCameraQR").onclick = async () => {
    try {
      if (cameraStream) {
        stopCameraStream();
        return;
      }
      msg("Opening camera…");
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      const video = $("cameraVideo");
      const wrap = $("cameraWrap");
      if (!video || !wrap) return;

      video.srcObject = cameraStream;
      await video.play();
      wrap.style.display = "block";
      cameraScanning = true;

      scanCameraFrame();
    } catch (err) {
      msg(friendlyError(err, "Camera could not be accessed. Ensure camera permission is allowed."));
    }
  };
}

async function scanCameraFrame() {
  if (!cameraScanning || !cameraStream) return;
  const video = $("cameraVideo");
  if (video && video.readyState >= 2) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const text = await decodeQRFromImageSource(canvas);
    if (text) {
      stopCameraStream();
      handleQRScanSuccess(text);
      return;
    }
  }
  if (cameraScanning) {
    setTimeout(scanCameraFrame, 200);
  }
}

restoreDisplaySettings();
