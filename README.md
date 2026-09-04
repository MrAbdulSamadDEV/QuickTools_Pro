# NEXA Tools 🚀

<div align="center">

![Version](https://img.shields.io/badge/version-8.0.0-black?style=for-the-badge)
![Manifest](https://img.shields.io/badge/manifest-v3-black?style=for-the-badge)
![Chrome](https://img.shields.io/badge/Chrome-Extension-black?style=for-the-badge&logo=googlechrome)
![Offline](https://img.shields.io/badge/100%25-Offline_Ready-black?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-black?style=for-the-badge)

**A high-performance, monochrome all-in-one browser toolkit for Google Chrome.**  
Equipped with Full Page & Custom Area screenshots, screen video recording with audio, universal offline image format converter, webpage media & icon extractors with full lightbox preview, offline QR code studio, 2000% audio boost, and developer utilities.

[Installation](#-installation-guide) • [Features](#-features-breakdown) • [Architecture](#-project-structure) • [Privacy](#-privacy--security)

---

</div>

## ✨ Highlights at a Glance

- 📸 **Advanced Screenshot Suite**: Full Page scrolling capture (rate-limit safe & memory protected), interactive Custom Area selection crop, and instant visible view snapshots.
- 🎥 **HD Screen Video Recording**: Record tab, window, or entire desktop screen with system audio and microphone mixing.
- 🖼️ **Media & Icon Extractor with Full Preview**: Large grid/list visual cards, transparent checkerboard background, full-screen image preview lightbox, and custom filename downloads.
- 🔄 **Universal Image Converter (Offline)**: Convert between `WEBP`, `PNG`, `JPG`, `ICO` (Windows Icon), and `SVG` formats with quality and resolution resizing presets.
- 📱 **QR Code Studio (Scanner & Generator)**: Offline QR generator plus multi-mode scanner (Active Webpage scan, Camera viewfinder, Drag & Drop file, and `Ctrl+V` clipboard paste).
- 🔊 **2000% Ultra Audio Boost**: Multi-stage Web Audio compressor and peak limiter for loud, distortion-free sound.
- 🌓 **Display & Accessibility**: Brightness controls, EyeDropper color tinting, and 1-click Smart Dark Mode.
- 🛠️ **Developer & Text Tools**: JSON formatter, Base64 encoder/decoder, URL decoder, Picture-in-Picture video, URL tracking cleaner, and page reading stats.
- 🗂️ **Side Panel & Popup Support**: Seamlessly switch between compact popup and persistent Chrome Side Panel.

---

## 🔍 Features Breakdown

### 1. 📸 Advanced Screenshot Suite
- **Full Page Scrolling Screenshot**:
  - Automatically calculates scrollable height across `document.documentElement`, `body`, and scrolling elements.
  - Systematically scrolls through the page, capturing high-resolution slices with device pixel ratio scaling.
  - Automatically suppresses sticky/fixed headers after the first slice to prevent duplicated navigation bars.
  - Built-in rate-limit throttling (minimum 600ms per capture) and exponential backoff retry to avoid Chrome's `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` API quota.
  - Canvas dimension overflow protection (capped safely at 14,000px) to prevent browser out-of-memory errors on infinite-scrolling pages.
  - Seamlessly restores initial scroll position and scrollbars upon completion.
  - Automatic download into `NEXA/Screenshots/FullPage_[title]_[timestamp].png`.
- **Custom Area Screenshot (Interactive Crop)**:
  - Injects an interactive selection overlay with crosshair cursor and dimensions tooltip.
  - Click and drag to crop any area of the page.
  - Press `ESC` at any time to cancel.
  - Background service worker crops the selection using `OffscreenCanvas` and saves it to Downloads.
- **Visible View Screenshot**:
  - Instant 1-click capture of the currently visible viewport.
  - Interactive preview card with **Download PNG** and **Copy Image** (direct clipboard paste).

### 2. 🎥 Screen Video Recording (with Audio)
- **Multi-Source Video**: Record an individual tab, an application window, or your entire desktop screen.
- **Audio Mixing**: Record system/tab audio and optionally mix with microphone input using `AudioContext`.
- **Live Recording Controls**: Pulsing red `● RECORDING` badge, live duration counter (`MM:SS`), **Pause / Resume**, and **Stop & Save**.
- **Auto-Save & Preview**: Automatically downloads high-definition `.webm` video into `NEXA/Recordings/` and displays an embedded video player to review your recording instantly.
- **Side Panel Compatibility**: Open NEXA in the Chrome Side Panel to record across multiple tabs without closing the popup!

### 3. 🖼️ Web Page Media & Icon Extractor with Full Preview
- **Comprehensive Asset Extraction**:
  - Extracts standard `<img>` tags, `srcset` responsive images, and lazy-loaded attributes (`data-src`, `data-original`, etc.).
  - Extracts website favicons, touch icons, and shortcut icons (`<link rel="icon">`, `/favicon.ico`).
  - Serializes inline `<svg>` elements into downloadable `.svg` vector files.
  - Extracts CSS `background-image` properties, video poster thumbnails, and OpenGraph / Twitter cards.
- **Grid & List Display with Lightbox Preview**:
  - Toggle between **Grid View** (large thumbnail cards) and **List View**.
  - Checkerboard background behind thumbnails so transparent PNGs and white SVGs are clearly visible.
  - Click any image to open the **Full-Screen Lightbox Modal**: inspect full dimensions, copy image, copy URL, or send directly to the converter.
- **Custom Download**:
  - Optional custom filename prefix (e.g. `site_logo` saves as `site_logo_01.png`, `site_logo_02.jpg`).
  - Batch **Download All** and **Download Selected** with staggered downloads to prevent browser download freezing.

### 4. 🔄 Universal Offline Image Converter
- **Supported Format Conversions**:
  - `WEBP` ↔ `PNG` ↔ `JPG` ↔ `ICO` ↔ `SVG`
- **Windows Icon (.ICO) Generator**:
  - Built-in pure JavaScript ICO encoder creating standard 22-byte header + PNG payload files.
  - Select preset icon dimensions (16×16, 32×32, 48×48, 64×64, 128×128, 256×256) for perfect favicons and desktop icons.
- **Vector SVG Generation**:
  - Convert raster images to clean SVG vector wrappers.
- **Compression & Quality Slider**:
  - Fine-tune JPEG and WEBP compression ratio (10% to 100%).
- **Multi-Source Loading**:
  - Drag & drop images, browse files, paste directly from clipboard (`Ctrl+V`), or load directly from the Media Extractor!

### 5. 📱 QR Code Studio (Generator & Scanner)
- **Offline QR Code Generator**:
  - 100% offline generation with error correction level M.
  - Configurable resolutions (192px, 256px, 320px, 512px).
  - 1-click **Current URL** pre-fill, PNG download, and direct image copying.
- **Multi-Mode QR Scanner**:
  - **Scan Webpage**: 1-click instant scan of the active webpage for QR codes (WhatsApp Web, tickets, Wi-Fi, logins).
  - **Live Camera**: Real-time webcam viewfinder with automated scanning animation.
  - **File Upload & Drag & Drop**: Drop any QR image file or browse from disk.
  - **Clipboard Paste (`Ctrl+V`)**: Press `Ctrl+V` anywhere in the extension to decode copied images.
  - **Detection Engine**: Chromium's native `BarcodeDetector` (with normal, inverted dark-mode, and high-contrast passes) + Pure JS offline fallback (`qrcode-local.js`).
  - Decoded results include **Copy Text**, **Open URL ↗** (for web links), and **Generate QR** transfer.

### 6. 🔊 2000% Ultra Audio Boost & Display
- **2000% Audio Booster**:
  - Multi-stage Web Audio pipeline featuring dual `DynamicsCompressor` stages, makeup gain, and a dedicated peak limiter.
  - Eliminates harsh audio clipping and distortion even at extreme volumes.
- **Display Brightness & Tinting**:
  - Custom page brightness slider (40% to 160%).
  - Color tinting with native browser `EyeDropper` color picking.
- **Smart Dark Mode**:
  - Inverts page brightness while preserving the natural colors of images, videos, and canvas elements.

### 7. 🛠️ Developer & Productivity Tools
- **JSON Formatter**: Pretty-print, indent, and validate JSON payloads.
- **Base64 & URL Tools**: Base64 encode/decode and URL decode in 1 click.
- **Float Video (Picture-in-Picture)**: Pop any HTML5 video on the active tab into a floating, always-on-top window.
- **Page Reading & Text Statistics**: Inspects page content to report word count, character count, headings, paragraphs, and estimated reading time (at 200 wpm).
- **Clean URL**: Strips tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_eid`, etc.) and copies a clean URL.
- **Duplicate Tab Cleaner**: Finds and closes duplicate tabs open in the current window.

---

## 📂 Project Structure

```
nexa_extension/
├── manifest.json       # Chrome Manifest V3 configuration
├── background.js       # Manifest V3 service worker (Area screenshot cropping & downloads)
├── popup.html          # Main user interface (Home, Capture, Media & Converter, Display, Dev, QR)
├── popup.css           # Monochrome dark responsive design & animations
├── popup.js            # Frontend logic (Screenshots, Recorder, Converter, Media, Display, QR)
├── qrcode-local.js     # Standalone offline QR generator & pure JS decoder fallback
├── icons/              # Premium extension icons (16px, 32px, 48px, 128px)
└── README.md           # GitHub documentation
```

---

## 📥 Installation Guide

1. Download or clone this repository:
   ```bash
   git clone https://github.com/your-username/nexa-tools.git
   ```
   *(Or download and extract the release ZIP file).*
2. Open Google Chrome (or Edge / Brave / Opera).
3. Navigate to `chrome://extensions/` in your address bar.
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click the **Load unpacked** button in the top-left.
6. Select the extracted `nexa_extension` folder.
7. Click the Puzzle icon in Chrome's toolbar and pin **NEXA Tools** for quick access.

---

## 🔒 Privacy & Security

- **100% Local Execution**: All processing (format conversion, QR encoding/decoding, screenshot stitching, video recording, media parsing) happens locally in your browser.
- **No External Servers**: Zero network requests to third-party servers.
- **No Analytics / No Tracking**: NEXA Tools does not collect, log, or transmit any user data or browsing history.

---

## 📄 License

Distributed under the MIT License.
