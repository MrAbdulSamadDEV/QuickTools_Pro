# NEXA Tools v7.2.2

**Monochrome production build for Chrome Manifest V3.**

## Highlights

* Clean black-and-white popup UI.
* No blue/purple theme colors.
* Simple display controls:

  * Brightness
  * Page color picker
  * Color strength
  * Reset / Apply
* Real page color picker with HEX input.
* Live color-strength control.
* Audio Boost processing target up to **2000%**.
* Audio processing includes:

  * Compression
  * Makeup gain
  * Peak limiting
* Offline QR generator.
* No QRServer.
* No external API.
* QR text is never uploaded.
* QR supports:

  * URLs
  * Plain text
  * Live preview
  * Configurable size
  * PNG download
  * Clipboard copy where Chrome permits it
* Existing developer and image tools remain included.

## QR Generator Notes

The QR encoder is bundled inside:

```text
qrcode-local.js
```

QR generation does **not require an internet connection**.

The encoder uses **UTF-8 bytes** for normal Unicode text.

> **Note:** Very large text can exceed QR capacity. For best results, use shorter content or a URL.

## Display Notes

The extension UI itself is strictly **grayscale / monochrome**.

The page color picker changes the **target webpage only**. It does **not** change the NEXA Tools extension theme.

## Audio Notes

The **2000%** setting is a controlled audio-processing target.

It is **not a literal guarantee of 20× physical speaker loudness**.

Actual loudness is still affected by:

* Browser limitations
* Media source
* Audio hardware
* Device volume
* Operating-system limits

## Version History

### v7.1.0

* Monochrome production build.
* Clean black-and-white popup UI.
* Simplified display controls.
* Real page color picker.
* HEX color input.
* Live color-strength control.
* Audio Boost processing up to 2000% target.
* Offline QR generator.
* QR generation without external APIs.
* Existing screenshot, recorder, developer and image tools included.

### v7.2.1

* Removed the **Power Tools / More** section completely.
* Removed all non-working tools from that section.

### v7.2.2

* Removed **Screenshot Capture**.
* Removed **Screen Recorder**.

## Installation

1. Extract the ZIP file.
2. Open Chrome.
3. Go to:

```text
chrome://extensions
```

4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the:

```text
NEXA_Tools_Chrome_Extensions
```

folder.

## Clean Reload After Upgrade

For a clean reload after upgrading:

1. Remove the old unpacked NEXA Tools extension.
2. Load the new `NEXA_Tools_Chrome_Extensions` folder.
3. Refresh the extension if required.

## Current Build

**NEXA Tools v7.2.2**

Chrome Manifest V3
Monochrome UI
Offline QR Generation
Advanced Audio Processing
