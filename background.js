/**
 * NEXA Tools - Service Worker (Manifest V3)
 * Handles background operations, area screenshot cropping, and automated downloads.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_AREA") {
    handleAreaCapture(message, sender)
      .then(res => sendResponse(res))
      .catch(err => {
        console.error("Area capture error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }
});

async function handleAreaCapture(message, sender) {
  const { area, title } = message;
  const tab = sender.tab;
  if (!tab || tab.windowId === undefined) throw new Error("No active sender tab");

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  if (!dataUrl) throw new Error("captureVisibleTab returned empty data");

  const dpr = area.dpr || 1;
  const cropX = Math.max(0, Math.round(area.x * dpr));
  const cropY = Math.max(0, Math.round(area.y * dpr));
  const cropW = Math.max(1, Math.round(area.width * dpr));
  const cropH = Math.max(1, Math.round(area.height * dpr));

  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });

  const buffer = await croppedBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const croppedDataUrl = "data:image/png;base64," + btoa(binary);

  const safeTitle = (title || "area").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 60) || "area";
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `NEXA/Screenshots/CustomArea_${safeTitle}_${ts}.png`;

  await chrome.downloads.download({
    url: croppedDataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });

  return { success: true, filename };
}
