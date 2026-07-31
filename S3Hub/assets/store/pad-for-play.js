// Pads a 1080x2400 phone screenshot to 1200x2400 so it satisfies Play's rule
// that the longest side may not exceed twice the shortest (2400/1080 = 2.22
// is rejected; 2400/1200 = 2.00 passes). Padding rather than cropping keeps
// every pixel of UI; the bars take the screenshot's own background colour so
// they are invisible.
//
// The screenshot is embedded as a data URI on purpose: resvg resolves a plain
// <image href="file.png"> against the PROCESS WORKING DIRECTORY, not against
// resourcesDir, so a relative href silently renders nothing when node is run
// from anywhere else. A data URI has no path to resolve.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Resvg } = require('@resvg/resvg-js');

const [, , src, out, bg = '#0E1116'] = process.argv;
const W = 1200;
const H = 2400;

const png = fs.readFileSync(src);
const sw = png.readUInt32BE(16);
const sh = png.readUInt32BE(20);
if (sh !== H) throw new Error(`expected a ${H}px tall screenshot, got ${sh}`);

const x = (W - sw) / 2;
const href = `data:image/png;base64,${png.toString('base64')}`;
const frame = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
const render = (body) =>
  new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`,
    {
      fitTo: { mode: 'width', value: W },
    },
  )
    .render()
    .asPng();

const result = render(
  `${frame}<image href="${href}" x="${x}" y="0" width="${sw}" height="${sh}"/>`,
);

// The failure this guards against is silent: a screenshot that fails to embed
// renders as a flat rectangle that is still the right size and still a valid
// PNG. Comparing against a deliberately empty render is the only cheap way to
// tell "padded screenshot" from "blank canvas".
const blank = render(frame);
const hash = (b) => crypto.createHash('md5').update(b).digest('hex');
if (hash(result) === hash(blank)) {
  throw new Error(
    `${path.basename(src)}: the screenshot did not embed — output is a blank ${bg} canvas`,
  );
}

fs.writeFileSync(out, result);
const w = result.readUInt32BE(16);
const h = result.readUInt32BE(20);
console.log(
  `${path.basename(out)} ${w}x${h} ratio ${(h / w).toFixed(2)} ${(result.length / 1024).toFixed(0)}KB OK`,
);
