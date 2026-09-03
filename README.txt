NEXA Tools v7.1.0

Monochrome production build for Chrome Manifest V3.

Highlights
- Clean black-and-white popup UI. No blue/purple theme colors.
- Display controls kept simple: brightness, page color picker, color strength, and reset/apply.
- Real page color picker with HEX input and live strength control.
- Audio Boost up to 2000% target with compression, makeup gain and peak limiting.
- Offline QR generator: no QRServer, no external API, and no text is uploaded.
- QR supports URLs and text, live preview, configurable size, PNG download and clipboard copy where Chrome permits it.
- Existing screenshot, recorder, developer, image tools remain included.

QR notes
The QR encoder is bundled inside qrcode-local.js, so QR generation does not require internet access. The encoder uses UTF-8 bytes for normal Unicode text. Very large text can exceed QR capacity; shorter content or a URL is recommended.

Display notes
The extension UI itself is strictly grayscale. The page color picker changes the target webpage only; it does not change the extension theme.

Audio notes
2000% is a controlled processing target, not a literal guarantee of 20x physical speaker loudness. Browser, media source, device and operating-system limits still apply.

Install
1. Extract the ZIP.
2. Open chrome://extensions
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the NEXA-Pro-v7 folder.

For a clean reload after upgrading, remove the old unpacked copy first, then load this folder.


Version 7.2.1: Removed the Power Tools / More section and its non-working tools completely.


Version 7.2.2 removes screenshot capture and screen recorder tools as requested.
