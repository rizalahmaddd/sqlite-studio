# Kebijakan Keamanan (Security Policy)

## Arsitektur Privasi & Client-Side

**SQLite Studio** didesain dengan prinsip **Zero-Server & Privacy-First**:
- Seluruh file database, struktur skema, data baris, dan query SQL diproses secara lokal di browser Anda via WebAssembly (`sql.js`).
- Tidak ada data yang dikirim, disimpan, atau di-relay ke server eksternal apapun.
- Akses ke file lokal menggunakan Chromium *File System Access API* yang membutuhkan persetujuan pengguna eksplisit dari browser.

## Melaporkan Masalah Keamanan

Jika Anda menemukan celah keamanan (security vulnerability), mohon **jangan** membuka public issue di GitHub.

Silakan laporkan secara privat melalui:
- **Email**: rizal@solusikoding.com
- **WhatsApp**: [+62 857-7777-5477](https://wa.me/6285777775477)

Kami akan merespons laporan Anda secepatnya dan merilis perbaikan segera.
