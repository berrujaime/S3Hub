// Play feature graphic, 1024x500.
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

const BG = '#0E1116';
const INK = '#E7ECF3';
const MUTED = '#9AA6B4';
const AMBER = '#E8973A';

const X = 92; // text block left edge, well clear of the 51px crop zone

const [, , shot, out] = process.argv;

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
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="24" fill="none" stroke="#38414D" stroke-width="2"/>

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

  <text x="${X}" y="406" fill="${MUTED}" font-family="JetBrains Mono" font-weight="500" font-size="15" letter-spacing="0.5">Storj · AWS · R2 · B2 · Wasabi · GCS · MinIO</text>
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

fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg.replace(HREF, '<data-uri-elided>'));
fs.writeFileSync(out, result);
const b = result;

console.log(
  `${path.basename(out)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)} ${(b.length / 1024).toFixed(0)}KB`,
);
