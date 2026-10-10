# Panduan Instalasi & Deployment

Dokumen ini menjelaskan cara menjalankan **SQLite Studio** di lingkungan lokal dan cara men-deploy aplikasi ke berbagai platform hosting statis.

---

## Prasyarat Sistem

- **Node.js**: versi 18 atau lebih baru (disarankan LTS 20+)
- **npm**: versi 9 atau lebih baru (atau pnpm / yarn)
- **Browser Modern**: Chrome 86+, Edge 86+, Safari 15+, atau Firefox 111+ (Mendukung WebAssembly & ES2022)

---

## Menjalankan Secara Lokal

### 1. Clone repositori & pasang dependensi
```bash
git clone https://github.com/rizalahmaddd/sqlite-studio.git
cd sqlite-studio
npm install
```

### 2. Jalankan server pengembangan
```bash
npm run dev
```
Buka peramban di [http://localhost:5173](http://localhost:5173). Aplikasi langsung siap digunakan dengan sampel database e-commerce bawaan.

### 3. Pemeriksaan kode & linter
```bash
npm run lint     # Menjalankan Oxlint super-cepat
```

---

## Build untuk Produksi

Untuk menghasilkan bundle statis yang telah dioptimasi dan diminifikasi:

```bash
npm run build
```

Hasil build akan berada di direktori `dist/` dengan struktur:
```
dist/
├── assets/
│   ├── index-[hash].js       # Bundle React & application logic
│   └── index-[hash].css      # Design system & tokens
├── favicon.svg
├── icons.svg
├── index.html
└── sql-wasm.wasm             # Binary engine SQLite WebAssembly (658 KB)
```

Untuk menguji hasil build produksi secara lokal:
```bash
npm run preview
```

---

## Panduan Deployment

Karena SQLite Studio adalah **100% Client-Side Static Application**, aplikasi ini tidak membutuhkan server backend (Node.js/PHP/Python) pada saat runtime. Anda dapat men-deploy-nya secara gratis ke platform hosting statis manapun.

### 1. Vercel
Hubungkan repositori GitHub Anda ke Vercel atau deploy via CLI:
```bash
npm install -g vercel
vercel
```
**Pengaturan di Vercel Dashboard:**
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 2. Netlify
Drag and drop folder `dist/` ke [Netlify Drop](https://app.netlify.com/drop), atau gunakan Netlify CLI:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### 3. GitHub Pages
Konfigurasi `base: './'` di `vite.config.ts` memastikan seluruh aset termuat dengan benar pada root domain maupun sub-path GitHub Pages (`https://username.github.io/sqlite-studio/`).

```bash
# Contoh deploy via branch gh-pages
npm run build
npx gh-pages -d dist
```

### 4. Cloudflare Pages
- Hubungkan repository GitHub Anda di Cloudflare Dashboard.
- **Build command**: `npm run build`
- **Build output directory**: `dist`

### 5. Docker & Nginx
Gunakan `Dockerfile` minimal berikut untuk deployment menggunakan container:

```dockerfile
# Tahap 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Tahap 2: Static Nginx Server
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build dan jalankan container:
```bash
docker build -t sqlite-studio .
docker run -p 8080:80 sqlite-studio
```
Akses di `http://localhost:8080`.
