# Google Play — release 1.3.0

Everything needed to ship this release. Copy blocks are ready to paste; every
one has been checked against Play's character limits.

- **Version name:** 1.3.0
- **Version code:** 24 (incremented by EAS, `appVersionSource: remote`)
- **Artifact:** AAB, `production` profile
- **Package:** `com.BerruApps.S3Hub`

---

## 1. Before you touch the console

| Check | Why |
|---|---|
| The AAB build finished on EAS | An `ERRORED` build produces no artifact |
| You are uploading an **AAB**, not the preview APK | The APK on your Desktop is `preview`/internal, Play needs the bundle |
| Version code 24 is higher than what is live | Play rejects a bundle whose code is not strictly greater |

Two ways to get the bundle to Play:

**Option A — let EAS submit it.** `eas.json` already has a `submit.production`
profile. From `S3Hub/`:

```bash
eas submit -p android --latest
```

The first run asks for a Google Play service-account JSON key. If you do not
have one set up, use Option B; wiring the service account is a one-off job in
Google Cloud plus Play Console → Users and permissions.

**Option B — upload by hand.** Download the `.aab` from the build page and
upload it in the console. Slower, no setup.

---

## 2. Ship the bundle

Play Console → **S3Hub** → Release → **Testing → Internal testing** first, not
Production. Install from the internal track on a real device and confirm the
launcher icon, the splash in both system themes, and that file sizes read
`4 KB` rather than `0.00 MB`. Promote to Production only after that.

1. **Create new release**
2. Upload the AAB (or pick the EAS-submitted one)
3. **Release name:** `1.3.0 (24)` — internal only, users never see it
4. **Release notes:** paste the block from section 5
5. Save → Review release → Start rollout

For Production, consider a **staged rollout** (20%) for a day. This release
changes the icon and the identity, which is the kind of thing that produces
"where did my app go" reviews.

---

## 3. Store listing

Play Console → **Grow → Store presence → Main store listing**.

### Graphics

| Slot | File | Spec |
|---|---|---|
| App icon | `assets/store/play-icon-512.png` | 512×512, 32-bit PNG, no rounded corners or shadow — Play adds them |
| Feature graphic | `assets/store/feature-graphic.png` | 1024×500. The light variant is `feature-graphic-light.png`; pick one |
| Phone screenshots | `assets/store/play/` | 8 files, 1200×2400 |

**Delete the old screenshots first.** Play keeps whatever is already there, and
mixing the old purple UI with the new one is worse than either alone.

Recommended order — the first 2–3 are what shows in search results, so the
most self-explanatory go first:

1. `ficheros-oscuro-cuadricula-miniaturas.png` — real thumbnails, reads instantly
2. `ficheros-oscuro-lista-carpetas.png` — a full listing, says "file manager"
3. `visor-imagen-oscuro.png` — viewing a file in place
4. `ficheros-claro-lista-carpetas.png` — proves the light theme
5. `ficheros-claro-cuadricula-miniaturas.png`
6. `ficheros-oscuro-cuadricula-carpetas.png`
7. `ficheros-claro-cuadricula-documentos.png`
8. `login-oscuro-aws-vacio.png` — a form; least informative, so last

> **Known weakness:** these eight were captured *before* the file-size fix, so
> every file reads `0.00 MB`. Version 1.3.0 renders `4 KB`, `812 B`, `2.6 MB`.
> Recapturing from the 1.3.0 build and regenerating is one command — see
> section 7. Worth doing before Production if you can spare the time.

### Text

Both fields live in the same screen, per language. English (United States) is
the default listing; add Spanish (Spain) as a second locale if it is not
already there, since the app itself ships EN and ES.

---

## 4. Listing copy — English

**App name** (30 max):

```
S3Hub
```

**Short description** (80 max — 74 used):

```
Manage S3-compatible storage from your phone. Storj, AWS, R2, B2 and more.
```

**Full description** (4000 max — 1396 used):

```
S3Hub is a file manager for S3-compatible object storage. Connect your buckets
and browse, preview, upload and organise their contents from your phone.

SUPPORTED PROVIDERS

• Storj
• Amazon S3
• Cloudflare R2
• Backblaze B2
• Wasabi
• DigitalOcean Spaces
• Google Cloud Storage (S3 interoperability)
• Any S3-compatible endpoint, including MinIO, via the Custom option

WHAT YOU CAN DO

• Browse buckets and folders, in a list or a thumbnail grid
• Preview images and video without leaving the app, and read text files in place
• Open documents, audio and any other object with the right app on your device
• Upload files, create folders, delete files and whole folder trees
• Search within a folder, and sort by name, size, date or type
• Download files to your device and share them
• Switch between several connections and providers
• Light and dark themes that follow your system setting
• Available in English and Spanish

YOUR CREDENTIALS STAY ON YOUR DEVICE

Access keys and secrets are stored in the Android Keystore through encrypted
system storage, never on any server of ours. S3Hub talks directly to the
provider you configure. There is no S3Hub account, no telemetry and no ads.

Device backups are disabled for the app's data, so a restore on another phone
cannot carry your connection details with it.

OPEN SOURCE

S3Hub is open source. The code is at github.com/berrujaime/S3Hub
```

---

## 5. Release notes — English

Play allows 500 characters per language. This uses 387.

```
What's new in 1.3.0

• A new look. The app has a redesigned colour palette, new typography and a new
icon, all built for legibility in both light and dark themes.

• File sizes are readable again. Small files used to show as "0.00 MB"; they now
scale properly, so you see 812 B, 4 KB or 2.6 MB.

• The startup screen follows your system theme instead of flashing dark before
a light app.
```

### Release notes — Spanish (optional, 428 characters)

```
Novedades de la versión 1.3.0

• Nueva imagen. La aplicación estrena paleta de colores, tipografía e icono,
pensados para leerse bien tanto en tema claro como oscuro.

• Los tamaños de archivo vuelven a ser legibles. Antes los archivos pequeños
aparecían como "0.00 MB"; ahora se muestran como 812 B, 4 KB o 2,6 MB.

• La pantalla de inicio sigue el tema del sistema en lugar de aparecer en
oscuro antes de una aplicación clara.
```

---

## 6. Things that Play will reject or flag

Learned the hard way while building these assets:

- **No Play badge, QR code or "Install now" button** in any listing graphic.
  The previous feature graphic had two of the three.
- **No superlatives** in the graphics or the text: "Best", "#1", "Top", "New",
  "Free", "Discount", "Million downloads". The old banner led with "Best Way To
  Handle S3 Buckets"; the new one says "The Simple Way".
- **Do not repeat the app icon** as the hero of the feature graphic. Play shows
  both together and prominent duplicate branding is called out explicitly. The
  new graphic uses the wordmark only.
- **Screenshot aspect ratio**: the longest side may not be more than twice the
  shortest. Raw 1080×2400 captures are 2.22 and get rejected, which is why the
  files in `assets/store/play/` are padded to 1200×2400.

**Data safety and content rating do not change with this release.** No new data
is collected and no permissions were added. If Play asks you to re-confirm the
Data safety form, the answers are the same as 1.2.0. The privacy policy URL
stays `https://berrujaime.github.io/S3Hub/privacy.html`.

---

## 7. Regenerating the assets

The generators live next to the artwork and need `@resvg/resvg-js`, which is
deliberately not a dependency of this project:

```bash
npm i --no-save --prefix /tmp/gfx @resvg/resvg-js
export NODE_PATH=/tmp/gfx/node_modules
cd S3Hub/assets/store
```

Feature graphic, either scheme:

```bash
node feature-graphic.build.js screenshots/<hero>.png feature-graphic.png dark
node feature-graphic.build.js screenshots/<hero>.png feature-graphic-light.png light
```

New screenshots, padded for Play:

```bash
node pad-for-play.js screenshots/<name>.png play/<name>.png '#0E1116'   # dark captures
node pad-for-play.js screenshots/<name>.png play/<name>.png '#F5F7FA'   # light captures
```

The logo itself, including every icon size, comes from
`assets/logos/source/geometry.py`. Change `R`, `SW` or a palette there and
regenerate rather than editing any PNG by hand.
