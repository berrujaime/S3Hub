// Play feature graphic, 1024x500.
//
// Usage:
//   npm i --no-save --prefix /tmp/gfx @resvg/resvg-js
//   NODE_PATH=/tmp/gfx/node_modules node feature-graphic.build.js \
//     screenshots/<hero>.png feature-graphic.png [dark|light]
//
// @resvg/resvg-js is deliberately NOT a dependency of this project: it is a
// native binary needed only to regenerate store artwork, it would show up in
// every CI install and in expo-doctor, and nothing the app ships imports it.
//
// Constraints baked in here, from Play's own guidance:
//  - nothing meaningful inside the outer 5% (~51px) because Play crops it
//    differently per surface;
//  - no Play badge, no QR, no install CTA;
//  - no banned superlatives in the copy ("Best", "Top", "New", "Free");
//  - the mark is NOT the hero: prominent branding that repeats the app icon
//    duplicates it when Play shows both together, so the cube is absent and
//    only the small wordmark carries the brand.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Resvg } = require('@resvg/resvg-js');

const W = 1024;
const H = 500;
const FONTS = '/home/jaime/Documents/Git/S3Hub/S3Hub/node_modules/@expo-google-fonts';

// Both schemes come straight from theme.js, including the amber: #E8973A fails
// the 3:1 contrast WCAG asks of a graphic element against the light background
// (it measures 2.24:1), which is exactly why lightTheme uses the deepened
// #AD610E. The device outline follows `outline` in each scheme.
const THEMES = {
  dark: { bg: '#0E1116', ink: '#E7ECF3', muted: '#9AA6B4', amber: '#E8973A', edge: '#38414D' },
  light: { bg: '#F5F7FA', ink: '#10151C', muted: '#55606E', amber: '#AD610E', edge: '#C2CAD4' },
};

const X = 92; // text block left edge, well clear of the 51px crop zone

const [, , shot, out, themeName = 'dark'] = process.argv;
const theme = THEMES[themeName];
if (!theme) throw new Error(`unknown theme "${themeName}" — expected dark or light`);
const { bg: BG, ink: INK, muted: MUTED, amber: AMBER, edge: EDGE } = theme;

// Embedded as a data URI, not a relative href: resvg resolves <image href> against
// the process working directory rather than resourcesDir, so a relative path
// renders nothing at all when node runs from elsewhere — silently, because the
// output is still a valid PNG of the right size. See the guard at the bottom.
const HREF = `data:image/png;base64,${fs.readFileSync(shot).toString('base64')}`;

// One phone rather than two: at 9:20 a phone is only ~270px wide here, and two
// of them either overlap (cutting each other's title) or shrink the content to
// unreadable. It bleeds off the bottom so the crop reads as deliberate.
const PH = 600;
const PW = Math.round((1080 / 2400) * PH);
const PX = 690;
const PY = 46;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <clipPath id="ph"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="24"/></clipPath>
  <image href="${HREF}" x="${PX}" y="${PY}" width="${PW}" height="${PH}" clip-path="url(#ph)"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="24" fill="none" stroke="${EDGE}" stroke-width="2"/>

  <text x="${X}" y="146" font-size="24">
    <tspan fill="${MUTED}" font-family="JetBrains Mono" font-weight="500">S3</tspan><tspan fill="${INK}" font-family="Space Grotesk" font-weight="700">Hub</tspan>
  </text>

  <!-- the provider spine, the app's own signature element -->
  <rect x="${X - 28}" y="186" width="5" height="190" rx="2.5" fill="${AMBER}"/>

  <text x="${X}" y="232" fill="${INK}" font-family="Space Grotesk" font-weight="700" font-size="56">
    <tspan font-size="34" fill="${MUTED}">The </tspan><tspan>Simple Way</tspan>
  </text>
  <text x="${X}" y="296" fill="${INK}" font-family="Space Grotesk" font-weight="700" font-size="56">To Handle</text>
  <text x="${X}" y="360" fill="${INK}" font-family="Space Grotesk" font-weight="700" font-size="56">S3 Buckets.</text>

  <text x="${X}" y="406" fill="${MUTED}" font-family="JetBrains Mono" font-weight="500" font-size="15" letter-spacing="0.5">Storj · AWS · R2 · B2 · Wasabi · Google · Custom</text>
</svg>`;

const opts = {
  fitTo: { mode: 'width', value: W },
  font: { fontDirs: [FONTS], defaultFontFamily: 'Space Grotesk', loadSystemFonts: true },
};
const result = new Resvg(svg, opts).render().asPng();

// Guard against the silent failure: an <image> that does not load still yields a
// valid 1024x500 PNG. Rendering the same markup with the phone stripped out gives
// something to compare against, so "screenshot missing" cannot pass as success.
const blank = new Resvg(svg.replace(/<image[^>]*\/>/, ''), opts).render().asPng();
const hash = (b) => crypto.createHash('md5').update(b).digest('hex');
if (hash(result) === hash(blank))
  throw new Error('the screenshot did not embed — the phone is missing');

fs.writeFileSync(out, result);
const b = result;

console.log(
  `${path.basename(out)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)} ${(b.length / 1024).toFixed(0)}KB`,
);
