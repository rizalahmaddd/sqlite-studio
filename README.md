# SQLite Studio

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![SQLite](https://img.shields.io/badge/SQLite-WASM-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Demo](https://img.shields.io/badge/Demo-sqlite.solusikoding.com-0b6e4f?logo=googlechrome&logoColor=white)](https://sqlite.solusikoding.com)

**Stack:** React 19 · TypeScript 5.8 · Vite 6 · [sql.js](https://sql.js.org/) (SQLite WebAssembly) · Vanilla CSS Design System · Lucide Icons · File System Access API · Oxlint

Manajer database SQLite 100% client-side yang berjalan langsung di peramban menggunakan WebAssembly (WASM). Buka file database fisik dari komputer, buat kueri, ubah data secara instan dengan sinkronisasi disk langsung tanpa perantara server backend dan tanpa instalasi software native tambahan. Semua data tetap privat di komputer Anda.

🌐 **Coba demo:** [sqlite.solusikoding.com](https://sqlite.solusikoding.com)

## Fitur

- **100% Client-Side & Privat**: SQLite binary diproses langsung di browser via WebAssembly (`sql.js`). Nol byte data atau kueri dikirim ke internet
- **Direct Disk Sync**: Simpan perubahan langsung ke file `.db` fisik di komputer Anda tanpa perlu mengunduh ulang (menggunakan File System Access API)
- **Multi-Database Workspace**: Buka banyak file database sekaligus (`.db`, `.sqlite`, `.sqlite3`) dan beralih antar database dalam 1 klik
- **Spreadsheet Data Grid**: Edit sel langsung (*inline editing*), duplikasi baris, seleksi banyak baris, filter pencarian per kolom, dan pengurutan dinamis
- **Form Cerdas**: Pemilih tanggal & jam visual (`date` & `datetime-local`) dengan pintasan cepat `[Sekarang]` dan `[Hari Ini]`, switch boolean visual, input angka dengan proteksi ketat anti-huruf, dan pemilih foreign key berbasis pencarian nama relasi
- **Visual ERD Interaktif**: Kanvas diagram relasi grafis dengan deteksi kurva relasi foreign key, dukungan penuh layar sentuh (geser 1-jari & cubit zoom 2-jari), serta tombol *Fit to View*
- **SQL Editor Lengkap**: Eksekusi kueri multi-statement dengan benchmark durasi (ms), visualisasi *Explain Query Plan*, riwayat kueri otomatis di browser, dan pustaka snippet kueri
- **Safe Mode Guard**: Mendeteksi dan mencegat kueri berbahaya seperti `UPDATE` atau `DELETE` tanpa klausa `WHERE` sebelum dieksekusi ke database
- **Impor CSV & JSON**: Impor data dengan inferensi tipe kolom otomatis (`INTEGER`, `REAL`, `TEXT`) ke tabel baru atau tabel yang sudah ada dalam transaksi atomik
- **Ekspor Fleksibel**: Unduh data atau hasil kueri ke format CSV, JSON, atau ekspor database binary `.db`
- **Database Diff Tool**: Bandingkan skema dan perbedaan struktur tabel antar dua database SQLite secara berdampingan
- **Diagnostik PRAGMA**: Cek integritas database (`PRAGMA integrity_check`), pembersihan ruang kosong (`VACUUM`), dan deteksi/checkpoint mode WAL (`PRAGMA wal_checkpoint(FULL)`)
- **Responsif Ponsel & Tablet**: Dirancang optimal untuk desktop maupun layar sentuh mobile dengan navigasi drawer geser dan bottom sheet

## Cara kerja

1. Buka file database SQLite (`.db`, `.sqlite`) dari komputer atau muat database sampel bawaan.
2. Jelajahi dan edit data lewat Data Grid, buat skrip di SQL Editor, atau amati relasi skema di Visual ERD.
3. Simpan perubahan langsung ke file lokal asli (Chromium) atau unduh sebagai file `.db` terbaru.

## Mulai cepat

```bash
npm install
npm run dev     # buka http://localhost:5173
```

## Dokumentasi

- [Instalasi & Deployment](docs/instalasi.md): kebutuhan sistem, cara menjalankan lokal, build produksi, dan panduan deploy (Vercel, Netlify, GitHub Pages, Docker)
- [Arsitektur & Teknis](docs/arsitektur.md): lifecycle SQLite WASM, dual persistence, ERD pointer capture, dan penanganan edge case
- [Pintasan Keyboard](docs/shortcuts.md): daftar hotkeys untuk navigasi & editing cepat

## Dukung & Donasi

Jika proyek ini bermanfaat bagi Anda, dukung pengembangannya melalui **QRIS**:

<p align="center">
  <img src="docs/qris.png" width="240" alt="QRIS Donasi - RZ Printing" />
  <br>
  <em>Scan QRIS menggunakan BCA, Mandiri, BRI, GoPay, OVO, DANA, ShopeePay, atau mobile banking lainnya.</em>
</p>

## Kontak

Dikembangkan oleh **rizalahmaddd**:
- **WhatsApp**: [+62 857-7777-5477](https://wa.me/6285777775477)
- **GitHub**: [@rizalahmaddd](https://github.com/rizalahmaddd)
- **Lokasi**: Kota Malang, Jawa Timur, Indonesia
