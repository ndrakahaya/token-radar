# Token Radar — token-radar-01 (varian A)

[![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar/reward.svg)](https://make.fun/c/token-radar-01)

Entry: [https://make.fun/c/token-radar-01](https://make.fun/c/token-radar-01)

Token Radar adalah dashboard protokol-inteligensi untuk protokol yang belum punya token (pre-token).
Dari snapshot DefiLlama (as_of 2026-11-14), program memfilter protokol di atas floor $50 juta,
menilai 226 protokol ke papan peringkat, memisahkan 24 protokol yang sudah live-token sebagai
perbandingan, dan menampilkan hasil di dashboard statis tanpa framework atau jaringan.

## Model

Nilai tersirat (implied value) dihitung sebagai perkalian tiga komponen:

```
implied value = TVL × multiple kategori × growth multiplier × maturity multiplier
```

- **Multiple kategori** — multiple value-to-TVL yang dikalibrasi per kategori bisnis
  (mis. lending, DEX, restaking, RWA), mencerminkan ekonomi tiap model bisnis.
- **Growth multiplier** — penyesuaian dari perubahan TVL 7 hari; pertumbuhan mendukung
  multiple lebih tinggi, perlambatan atau kontraksi menekan multiple.
- **Maturity multiplier** — penyesuaian umur protokol; protokol yang lebih matang diberi
  treatment yang berbeda dibanding protokol baru.

Hasilnya adalah estimasi komparatif nilai fully-diluted, bukan target harga, bukan
jaminan airdrop, dan bukan nasihat keuangan. Setiap baris di papan menyimpan
`model` (multiple, growth, maturity) dan `farm_steps` (3–12 langkah, 20–600 karakter)
sehingga nilai tersirat itu bisa diaudit per protokol lewat panel detail.

## Struktur

| File | Peran |
| --- | --- |
| `main.ts` | Runner: baca snapshot, verifikasi bentuk, panggil model, tulis `board.json`, `data.js`, `dossier.json`, salin `dashboard/` + `screenshots/`. |
| `lib/model.ts` | Model penilaian (multiple, growth, maturity), pembangun board, live-view, dan farm steps. |
| `vendor/makefun-board.ts` | Library make.fun yang membangun `dossier.json` dari direktori output. |
| `dashboard/` | Halaman statis (HTML/CSS/JS murni) yang membaca `data.js`. |
| `screenshots/` | Tiga screenshot dashboard: papan, detail, terfilter. |
| `tools/shoot.mjs` | Script Playwright untuk mengambil ulang ketiga screenshot. |

## Cara jalan

Butuh Node 22+ (menjalankan TypeScript langsung, tanpa build step):

```sh
# 1. Build output (di luar grader, MAKEFUN_OUTPUT_DIR menggantikan /output)
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

# 2. (Opsional) Ambil screenshot dashboard
npm install playwright
npx playwright install chromium
node tools/shoot.mjs
```

`main.ts` menulis ke direktori output: `board.json` (papan peringkat), `data.js`
(payload `window.RADAR` untuk dashboard), `dashboard/`, `screenshots/`, dan
`dossier.json` (ringkasan yang dibaca juri, dibangun library make.fun dari output
yang sama agar byte-identik). Di container grader, `/input/snapshot.json` dan
`/output` dipakai secara default tanpa flag.

## Screenshot

| Gambar | Isi |
| --- | --- |
| `screenshots/1-board.png` | Papan protokol penuh (viewport 1280×800). |
| `screenshots/2-detail.png` | Panel detail satu protokol (baris pertama, rangkuman model + farm steps). |
| `screenshots/3-filtered.png` | Papan terfilter satu kategori. |
