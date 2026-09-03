const $ = id => document.getElementById(id);
let detectedImages = [];
let noticeTimer = 0;
const DISPLAY_STORAGE_KEY = "NEXA_display_settings";

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

function msg(text, ms = 3000) {
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
  return (s || "page").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 90) || "page";
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

document.querySelectorAll(".nav").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const page = $(btn.dataset.page);
    if (page) page.classList.add("active");
    if (btn.dataset.page === "tools" && !detectedImages.length) scanImages();
  });
});


$("copyPage").onclick = async () => { const d = await pageData(); await copyText(`${d.title}\n${d.url}`); };
$("copyPageDev").onclick = $("copyPage").onclick;
$("copyUrl").onclick = async () => { const d = await pageData(); await copyText(d.url); };
$("copyTitle").onclick = async () => { const d = await pageData(); await copyText(d.title); };

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

$("brightness").oninput = async e => {
  const v = Number(e.target.value);
  $("brightValue").textContent = v + "%";
  saveDisplaySettings();
  try {
    await inject(v => {
      let s = document.getElementById("__qt_brightness");
      if (!s) { s = document.createElement("style"); s.id = "__qt_brightness"; (document.head || document.documentElement).appendChild(s); }
      s.textContent = `html{filter:brightness(${v}%) !important}`;
    }, [v]);
  } catch (_) { msg("Brightness control is unavailable on this page."); }
};

document.querySelectorAll("[data-bright]").forEach(b => b.onclick = () => {
  $("brightness").value = b.dataset.bright;
  $("brightness").dispatchEvent(new Event("input"));
});

// Simple monochrome Display controls + real page color picker.
function hexToRgb(hex){
  const h=String(hex||"").trim().replace("#","");
  if(!/^[0-9a-f]{6}$/i.test(h)) return null;
  return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
}
function syncColorInputs(value){
  const rgb=hexToRgb(value);
  if(!rgb)return false;
  const normalized="#"+String(value).replace("#","").toLowerCase();
  $("pageColor").value=normalized;
  $("pageColorHex").value=normalized.toUpperCase();
  return true;
}
async function applyPageColor(){
  const color=$("pageColor")?.value||"#ffffff";
  const opacity=Math.max(0,Math.min(45,Number($("colorOpacity")?.value)||0));
  const rgb=hexToRgb(color);
  if(!rgb)return;
  $("colorOpacityValue").textContent=opacity+"%";
  try{
    await inject(({r,g,b},a)=>{
      let s=document.getElementById("__qt_color_tint");
      if(!s){s=document.createElement("style");s.id="__qt_color_tint";(document.head||document.documentElement).appendChild(s);}
      s.textContent=a>0?`html::after{content:"";position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:rgb(${r},${g},${b}) !important;opacity:${a/100} !important;}`:"";
    },[rgb,opacity]);
  }catch(_){msg("Color picker is unavailable on this page.");}
}
$("pageColor").oninput=()=>{
  $("pageColorHex").value=$("pageColor").value.toUpperCase();
  $("colorPickStatus").textContent="HEX "+$("pageColor").value.toUpperCase();
  saveDisplaySettings();
  applyPageColor();
};
$("pageColorHex").oninput=e=>{
  if(/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())){
    syncColorInputs(e.target.value);
    $("colorPickStatus").textContent="HEX "+$("pageColor").value.toUpperCase();
    saveDisplaySettings();
    applyPageColor();
  }
};
$("pageColorHex").onblur=()=>{syncColorInputs($("pageColorHex").value)||syncColorInputs("#ffffff");$("colorPickStatus").textContent="HEX "+$("pageColor").value.toUpperCase();saveDisplaySettings();applyPageColor();};
$("colorOpacity").oninput=()=>{$("colorStrengthValue").textContent=$("colorOpacity").value+"%";saveDisplaySettings();applyPageColor();};
$("clearColor").onclick=()=>{$("colorOpacity").value=0;saveDisplaySettings();applyPageColor();};
$("pickColor").onclick=async()=>{
  try {
    if(!window.EyeDropper) return msg("EyeDropper is not supported in this Chrome version");
    const result=await new EyeDropper().open();
    if(result?.sRGBHex){
      syncColorInputs(result.sRGBHex);
      $("colorOpacity").value=Math.max(20, Number($("colorOpacity").value)||25);
      $("colorStrengthValue").textContent=$("colorOpacity").value+"%";
      $("colorPickStatus").textContent="Picked "+result.sRGBHex.toUpperCase();
      await saveDisplaySettings();
      await applyPageColor();
      msg("Color picked: "+result.sRGBHex.toUpperCase());
    }
  } catch(e){ if(!/AbortError/i.test(String(e?.name||e))) msg("Color picking was cancelled or unavailable"); }
};

$("resetDisplay").onclick=async()=>{
  $("brightness").value=100;
  syncColorInputs("#ffffff");
  $("colorOpacity").value=0;
  $("volume").value=100;
  await saveDisplaySettings();
  $("brightness").dispatchEvent(new Event("input"));
  await applyPageColor();
  $("volume").dispatchEvent(new Event("input"));
  msg("Display controls reset");
};
$("applyAllDisplay").onclick=async()=>{await applyPageColor();$("brightness").dispatchEvent(new Event("input"));$("volume").dispatchEvent(new Event("input"));msg("Current display settings applied");};

// v7 Ultra Audio Boost: 0–2000% processing target.
// Uses compression, pre-gain, makeup and a final limiter. >1000% is supported,
// while acknowledging that browser/device output may still impose physical limits.
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
      if (!media.length) return {count:0, boosted:0, fallback:0};
      let boosted=0, fallback=0;
      const p=Math.max(0,Math.min(2000,Number(percent)||0));
      for (const el of media) {
        try {
          let q=el.__qtUltraAudio;
          if (!q) {
            const AudioCtx=window.AudioContext||window.webkitAudioContext;
            if (!AudioCtx) throw new Error("Web Audio unavailable");
            const ctx=new AudioCtx(), source=ctx.createMediaElementSource(el);
            const pre=ctx.createGain();
            const fast=ctx.createDynamicsCompressor();
            const slow=ctx.createDynamicsCompressor();
            const makeup=ctx.createGain();
            const limiter=ctx.createDynamicsCompressor();
            const output=ctx.createGain();
            fast.threshold.value=-24; fast.knee.value=18; fast.ratio.value=8; fast.attack.value=.002; fast.release.value=.10;
            slow.threshold.value=-30; slow.knee.value=24; slow.ratio.value=6; slow.attack.value=.012; slow.release.value=.32;
            limiter.threshold.value=-1.2; limiter.knee.value=1.5; limiter.ratio.value=30; limiter.attack.value=.001; limiter.release.value=.065;
            source.connect(pre).connect(fast).connect(slow).connect(makeup).connect(limiter).connect(output).connect(ctx.destination);
            q=el.__qtUltraAudio={ctx,pre,fast,slow,makeup,limiter,output};
          }
          if(q.ctx.state==="suspended") await q.ctx.resume();
          if(p===0){
            q.pre.gain.value=0; q.makeup.gain.value=0; q.output.gain.value=1; el.volume=0;
          } else {
            const x=p/100;
            // Large target values are intentionally fed into the compressor/limiter
            // chain; final digital peaks remain bounded by the limiter.
            q.pre.gain.value=Math.min(24, Math.pow(x,.72));
            q.makeup.gain.value=Math.min(8, .72 + Math.log10(Math.max(1,x))*2.4);
            q.output.gain.value=.98;
            el.volume=1;
          }
          boosted++;
        } catch(_){try{el.volume=p===0?0:1;fallback++;}catch(_){}}
      }
      return {count:media.length,boosted,fallback};
    },[v]);
    const data=result?.[0]?.result;
    if(!data?.count) msg("No audio or video found on this page");
    else if(v>=1000&&data.boosted>0) msg(`${v}% Ultra Audio Boost active — compressor + peak limiter on`);
    else if(v>100&&data.boosted>0) msg(`${v}% Ultra Audio Boost active — peak protection on`);
    else if(v<=100) msg(v===0?"Audio muted":`Audio set to ${v}%`);
    else msg("This site's player does not allow clean Web Audio boosting");
  } catch(e){msg(friendlyError(e,"Audio control is unavailable on this page."));}
};
document.querySelectorAll("[data-vol]").forEach(b=>b.onclick=()=>{$("volume").value=b.dataset.vol;$("volume").dispatchEvent(new Event("input"));});


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

function formatJson(s) { return JSON.stringify(JSON.parse(s), null, 2); }
function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64dec(s) { return decodeURIComponent(escape(atob(s.replace(/\s+/g, "")))); }

$("jsonFormat").onclick = () => { try { $("devBox").value = formatJson($("devBox").value); msg("JSON formatted"); } catch (_) { msg("Invalid JSON"); } };
$("formatJson").onclick = $("jsonFormat").onclick;
$("urlDecode").onclick = () => { try { $("devBox").value = decodeURIComponent($("devBox").value); msg("URL decoded"); } catch (_) { msg("Invalid URL encoding"); } };
$("decodeUrl").onclick = $("urlDecode").onclick;
$("encode64").onclick = () => { try { $("devBox").value = b64enc($("devBox").value); msg("Base64 encoded"); } catch (_) { msg("Could not encode text"); } };
$("decode64").onclick = $("decode64").onclick = () => { try { $("devBox").value = b64dec($("devBox").value); msg("Base64 decoded"); } catch (_) { msg("Invalid Base64 text"); } };
$("base64").onclick = () => { $("devBox").focus(); };
$("clearDev").onclick = () => { $("devBox").value = ""; msg("Developer input cleared"); };

function imageFileName(url, index) {
  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split("/").pop() || "").replace(/[\\/:*?"<>|]/g, "_").trim();
    if (!name || name.length < 2) name = `image-${index}`;
    if (!/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)$/i.test(name)) name += ".jpg";
    return `NEXA/Images/${name.slice(0, 100)}`;
  } catch (_) { return `NEXA/Images/image-${index}.jpg`; }
}

async function scanImages() {
  $("imageList").innerHTML = '<div class="scan">Scanning current page…</div>';
  $("imageCount").textContent = "Scanning…";
  try {
    const r = await inject(() => {
      const map = new Map();
      const add = (raw, type) => {
        if (!raw || /^(data|blob):/i.test(raw)) return;
        try {
          const u = new URL(raw, location.href);
          if (!/^https?:$/i.test(u.protocol)) return;
          const key = u.href.split("#")[0];
          if (!map.has(key)) map.set(key, { url: key, type });
        } catch (_) {}
      };
      document.querySelectorAll("img").forEach(im => {
        add(im.currentSrc || im.src, "IMG");
        ["data-src","data-lazy-src","data-original","data-lazy","data-url","data-fallback-src","data-image","data-srcset"].forEach(a => add(im.getAttribute(a), "LAZY"));
        if (im.srcset) im.srcset.split(",").forEach(p => add(p.trim().split(/\s+/)[0], "SRCSET"));
      });
      document.querySelectorAll("source[srcset]").forEach(s => s.srcset.split(",").forEach(p => add(p.trim().split(/\s+/)[0], "PICTURE")));
      const re = /url\(\s*(["']?)(.*?)\1\s*\)/g;
      for (const el of document.querySelectorAll("*")) {
        const bg = getComputedStyle(el).backgroundImage || "";
        let m; while ((m = re.exec(bg))) add(m[2], "BACKGROUND");
      }
      return [...map.values()];
    });
    detectedImages = r?.[0]?.result || [];
    $("imageCount").textContent = `${detectedImages.length} image${detectedImages.length === 1 ? "" : "s"} found`;
    $("imageHint").textContent = detectedImages.length ? "All detected URLs are ready to download" : "No public HTTP/HTTPS images found";
    renderImages();
  } catch (e) {
    detectedImages = [];
    $("imageCount").textContent = "Scan unavailable";
    $("imageHint").textContent = "Chrome blocked access to this page";
    $("imageList").innerHTML = '<div class="scan">Try a normal website (http/https). Browser-internal and protected pages cannot be scanned.</div>';
  }
}

function renderImages() {
  const list = $("imageList"); list.innerHTML = "";
  if (!detectedImages.length) { list.innerHTML = '<div class="scan">No downloadable images detected.</div>'; return; }
  detectedImages.forEach((x, i) => {
    const row = document.createElement("div"); row.className = "imageitem";
    const label = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.dataset.imgIndex = i;
    const thumb = document.createElement("span"); thumb.className = "thumb";
    const img = document.createElement("img"); img.loading = "lazy"; img.src = x.url; img.alt = ""; img.referrerPolicy = "no-referrer";
    img.onerror = () => { img.removeAttribute("src"); thumb.classList.add("broken"); };
    thumb.appendChild(img);
    const meta = document.createElement("span"); meta.className = "imeta";
    const b = document.createElement("b"); b.textContent = `Image ${i + 1}`;
    const s = document.createElement("small");
    try { s.textContent = `${x.type} · ${new URL(x.url).hostname}`; } catch (_) { s.textContent = x.type; }
    meta.append(b, s);
    const dl = document.createElement("button"); dl.className = "dlone"; dl.textContent = "↓"; dl.title = "Download image";
    dl.onclick = () => downloadImages([i]);
    label.append(cb, thumb, meta, dl); row.appendChild(label); list.appendChild(row);
  });
}

async function downloadImages(indices) {
  const unique = [...new Set(indices)].filter(i => detectedImages[i]);
  if (!unique.length) return msg("Select at least one image");
  let success = 0, failed = 0;
  for (const i of unique) {
    try {
      await chrome.downloads.download({ url: detectedImages[i].url, filename: imageFileName(detectedImages[i].url, i + 1), saveAs: false, conflictAction: "uniquify" });
      success++;
    } catch (_) { failed++; }
  }
  msg(failed ? `${success} downloaded · ${failed} unavailable` : `${success} image${success === 1 ? "" : "s"} downloaded`);
}

$("scanImages").onclick = scanImages;
$("downloadAllImages").onclick = () => downloadImages(detectedImages.map((_, i) => i));
$("downloadSelectedImages").onclick = () => downloadImages([...document.querySelectorAll("#imageList input[data-img-index]:checked")].map(x => Number(x.dataset.imgIndex)));


/* ---------------- Offline QR generator ---------------- */
let qrCanvas = null;

function buildQRCanvas(text, requestedSize) {
  if (!window.NEXAQRCode) throw new Error("QR engine not loaded");
  const size = Math.max(120, Math.min(1024, Number(requestedSize) || 256));
  const qr = new NEXAQRCode(0, 0); // error correction M
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
    box.innerHTML = "<span>Could not generate this QR code. Try shorter text.</span>";
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
    if (!blob || !navigator.clipboard || !window.ClipboardItem) throw new Error("Clipboard unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    msg("QR image copied");
  } catch (_) { msg("Image copy is unavailable — use Download PNG"); }
};

// Restore the last Display values whenever the popup is opened.
restoreDisplaySettings();

const QT_CLIP_KEY="NEXA_clipboard_history", QT_NOTES_KEY="NEXA_notes", QT_TIMER_KEY="NEXA_timer";
async function storageGet(key, fallback){try{const x=await chrome.storage.local.get(key);return x[key]??fallback}catch(_){return fallback}}
async function storageSet(key,val){try{await chrome.storage.local.set({[key]:val})}catch(_){} }
async function rememberClip(value){value=String(value||"").trim();if(!value)return;let a=await storageGet(QT_CLIP_KEY,[]);a=[value,...a.filter(x=>x!==value)].slice(0,50);await storageSet(QT_CLIP_KEY,a);renderClipboard()}
async function renderClipboard(){const box=$("clipboardList");if(!box)return;const a=await storageGet(QT_CLIP_KEY,[]);box.innerHTML="";if(!a.length){box.innerHTML='<div class="scan">Nothing copied yet.</div>';return}a.forEach((v,i)=>{const row=document.createElement("div");row.className="clip";const s=document.createElement("span");s.textContent=v;const b=document.createElement("button");b.textContent="Copy";b.onclick=()=>copyText(v);row.append(s,b);box.append(row)})}

async function pickPageElement(mode){
  try{const r=await inject((mode)=>new Promise(resolve=>{let old=document.getElementById("__qt_picker");if(old)old.remove();const st=document.createElement("style");st.id="__qt_picker";st.textContent="*{cursor:crosshair!important}.__qt_pick{outline:2px solid rgb(0,0,0)!important;outline-offset:-2px!important}";(document.head||document.documentElement).append(st);let last=null;const over=e=>{if(last)last.classList.remove("__qt_pick");last=e.target;last.classList.add("__qt_pick")};const click=e=>{e.preventDefault();e.stopPropagation();document.removeEventListener("mouseover",over,true);document.removeEventListener("click",click,true);st.remove();if(!last)return resolve(null);const c=getComputedStyle(last);resolve({tag:last.tagName.toLowerCase(),font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,line:c.lineHeight,color:c.color,bg:c.backgroundColor,width:Math.round(last.getBoundingClientRect().width),height:Math.round(last.getBoundingClientRect().height),display:c.display,position:c.position,margin:c.margin,padding:c.padding,selector:last.id?"#"+last.id:last.className?"."+String(last.className).split(/\s+/).filter(Boolean).slice(0,2).join("."):last.tagName.toLowerCase()})};document.addEventListener("mouseover",over,true);document.addEventListener("click",click,true);setTimeout(()=>{document.removeEventListener("mouseover",over,true);document.removeEventListener("click",click,true);st.remove();resolve(null)},15000)}),[mode]);const x=r?.[0]?.result;if(!x)return msg("Picker cancelled");if(mode==="font")alert(`Element: ${x.selector}\nFont: ${x.font}\nSize: ${x.size}\nWeight: ${x.weight}\nLine height: ${x.line}`);else if(mode==="inspect")alert(`Element: ${x.selector}\nSize: ${x.width} × ${x.height}\nDisplay: ${x.display}\nPosition: ${x.position}\nMargin: ${x.margin}\nPadding: ${x.padding}\nColor: ${x.color}\nBackground: ${x.bg}`);else msg(`${x.width} × ${x.height}px`)}catch(e){msg(friendlyError(e,"Element picker is unavailable."))}
}
function rulerOverlay(){return inject(()=>{let o=document.getElementById("__qt_ruler");if(o){o.remove();return "removed"}o=document.createElement("div");o.id="__qt_ruler";o.style="position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:12px Arial;color:#000";o.innerHTML='<div style="position:absolute;left:0;top:0;width:100%;height:1px;background:#000"></div><div id="__qt_cross" style="position:absolute;width:1px;height:100%;background:#000;left:0;top:0"></div><div id="__qt_read" style="position:absolute;left:8px;top:8px;background:#fff;border:1px solid #000;padding:5px 7px;border-radius:4px">0 × 0</div>';document.documentElement.appendChild(o);const c=o.querySelector("#\__qt_cross"),r=o.querySelector("#\__qt_read");const mv=e=>{c.style.left=e.clientX+"px";c.style.top="0";c.style.height="100%";r.textContent=`X ${e.clientX}px · Y ${e.clientY}px`;};document.addEventListener("mousemove",mv);o._qtCleanup=()=>document.removeEventListener("mousemove",mv);return "added"})}

async function scanQRScreen(){try{const t=await getTab();const data=await chrome.tabs.captureVisibleTab(t.windowId,{format:"png"});if(!window.BarcodeDetector)return msg("QR scanner needs a Chrome build with BarcodeDetector support.");const img=new Image();img.onload=async()=>{try{const c=document.createElement("canvas");c.width=img.width;c.height=img.height;c.getContext("2d").drawImage(img,0,0);const detector=new BarcodeDetector({formats:["qr_code"]});const codes=await detector.detect(c);if(codes.length){const text=codes[0].rawValue;await copyText(text);alert("QR detected:\n\n"+text)}else msg("No QR code found on the visible page.")}catch(_){msg("QR scan failed.")}};img.src=data}catch(e){msg(friendlyError(e,"QR scanner is unavailable."))}}
async function setVideoSpeed(){const r=await inject(()=>{const v=Number(prompt("Video speed (0.25–4)","1"));if(!v||v<.25||v>4)return false;document.querySelectorAll("video,audio").forEach(x=>x.playbackRate=v);return v});if(r?.[0]?.result)msg(`Playback speed ${r[0].result}×`);else msg("Speed change cancelled")}
function password(){const n=Math.max(8,Math.min(64,Number($("passwordLength")?.value)||20));let chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";if($("passwordSymbols")?.checked)chars+="!@#$%^&*_-+=?";const a=new Uint32Array(n);crypto.getRandomValues(a);return [...a].map(x=>chars[x%chars.length]).join("")}
function generatePassword(){const v=password();$("passwordOut").value=v;rememberClip(v)}
let timerInt=null, stopwatchStart=0, stopwatchBase=0;
function fmt(ms){let s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")}
function tickTimer(){const x=JSON.parse(localStorage.getItem(QT_TIMER_KEY)||"null");if(!x){$("timerDisplay").textContent="00:00:00";return}let left=x.type==="timer"?x.end-Date.now():Date.now()-x.start+x.base;if(left<=0&&x.type==="timer"){localStorage.removeItem(QT_TIMER_KEY);clearInterval(timerInt);$("timerDisplay").textContent="00:00:00";msg("Timer finished");return}$("timerDisplay").textContent=fmt(left)}
function startTimer(){const mins=Math.max(1,Number($("timerMinutes").value)||5);localStorage.setItem(QT_TIMER_KEY,JSON.stringify({type:"timer",end:Date.now()+mins*60000}));clearInterval(timerInt);timerInt=setInterval(tickTimer,250);tickTimer()}
function startStopwatch(){const old=JSON.parse(localStorage.getItem(QT_TIMER_KEY)||"null");if(old?.type==="stopwatch"){localStorage.removeItem(QT_TIMER_KEY);clearInterval(timerInt);return}localStorage.setItem(QT_TIMER_KEY,JSON.stringify({type:"stopwatch",start:Date.now(),base:0}));clearInterval(timerInt);timerInt=setInterval(tickTimer,250);tickTimer()}
async function convertImage(){const f=$("imageFile")?.files?.[0];if(!f)return msg("Choose an image first");const im=new Image();im.onload=async()=>{const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);const type=$("imageFormat").value,q=Number($("imageQuality").value)/100;c.toBlob(async b=>{if(!b)return msg("Conversion failed");const u=URL.createObjectURL(b);try{await chrome.downloads.download({url:u,filename:`NEXA/Images/converted-${Date.now()}.${type.split("/")[1].replace("jpeg","jpg")}`,saveAs:true}) ;msg("Image converted and saved")}finally{setTimeout(()=>URL.revokeObjectURL(u),10000)}},type,q)};im.onerror=()=>msg("Invalid image");im.src=URL.createObjectURL(f)}
function initPowerTools(){
  if($("copyUrl")) $("copyUrl").addEventListener("click",async()=>rememberClip((await pageData()).url));
  if($("copyTitle")) $("copyTitle").addEventListener("click",async()=>rememberClip((await pageData()).title));
  if($("clipboardTool")) $("clipboardTool").onclick=()=>{$("clipboardBox").scrollIntoView({behavior:"smooth"});renderClipboard()};
  if($("clearClipboard")) $("clearClipboard").onclick=()=>storageSet(QT_CLIP_KEY,[]).then(renderClipboard);
  renderClipboard();
  if($("rulerTool")) $("rulerTool").onclick=()=>rulerOverlay();
  if($("fontTool")) $("fontTool").onclick=()=>pickPageElement("font");
  if($("inspectorTool")) $("inspectorTool").onclick=()=>pickPageElement("inspect");
  if($("qrScanTool")) $("qrScanTool").onclick=scanQRScreen;
  if($("videoTool")) $("videoTool").onclick=setVideoSpeed;
  if($("notesTool")) $("notesTool").onclick=()=>{$("notesBox").scrollIntoView({behavior:"smooth"});$("quickNotes").focus()};
  storageGet(QT_NOTES_KEY,"").then(v=>{if($("quickNotes")) $("quickNotes").value=v});
  if($("quickNotes")) $("quickNotes").addEventListener("input",()=>storageSet(QT_NOTES_KEY,$("quickNotes").value));
  if($("passwordTool")) $("passwordTool").onclick=()=>{$("passwordBox").scrollIntoView({behavior:"smooth"});generatePassword()};
  if($("newPassword")) $("newPassword").onclick=generatePassword;
  if($("copyPassword")) $("copyPassword").onclick=()=>copyText($("passwordOut").value);
  if($("passwordLength")) $("passwordLength").addEventListener("input",()=>$("passwordLengthValue").textContent=$("passwordLength").value);
  generatePassword();
  if($("imageTool")) $("imageTool").onclick=()=>$("imageBox").scrollIntoView({behavior:"smooth"});
  if($("convertImage")) $("convertImage").onclick=convertImage;
  if($("imageQuality")) $("imageQuality").addEventListener("input",()=>$("imageQualityValue").textContent=$("imageQuality").value+"%");
  if($("timerTool")) $("timerTool").onclick=()=>$("timerBox").scrollIntoView({behavior:"smooth"});
  if($("startTimer")) $("startTimer").onclick=startTimer;
  if($("stopwatchBtn")) $("stopwatchBtn").onclick=startStopwatch;
  if($("resetTimer")) $("resetTimer").onclick=()=>{localStorage.removeItem(QT_TIMER_KEY);clearInterval(timerInt);tickTimer()};
  tickTimer(); timerInt=setInterval(tickTimer,250);
  if($("responsiveTool")) $("responsiveTool").onclick=async()=>{const r=await inject(()=>{let x=document.getElementById("__qt_responsive");if(x){x.remove();return false}x=document.createElement("div");x.id="__qt_responsive";x.style="position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#000;border:2px solid #000;border-radius:8px;padding:8px;font:12px Arial";x.innerHTML='<b>Responsive overlay</b><div style="margin-top:5px"><button data-w="375">375</button> <button data-w="768">768</button> <button data-w="1024">1024</button> <button data-w="0">Clear</button></div>';document.documentElement.appendChild(x);x.querySelectorAll("button").forEach(b=>b.onclick=()=>{const w=Number(b.dataset.w);document.documentElement.style.outline=w?`3px solid #000`:"";document.documentElement.style.outlineOffset=w?`${(innerWidth-w)/2}px`:""});return true});msg(r?.[0]?.result?"Responsive overlay added":"Responsive overlay cleared")};
}
