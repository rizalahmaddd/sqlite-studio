# Panduan Kontribusi (Contributing Guide)

Terima kasih atas minat Anda untuk berkontribusi pada **SQLite Studio**! Proyek ini bersifat sumber terbuka (open source) di bawah lisensi MIT.

---

## Cara Berkontribusi

### 1. Melaporkan Bug
- Sebelum membuat issue baru, periksa tab [Issues](https://github.com/rizalahmaddd/sqlite-studio/issues) untuk memastikan masalah serupa belum dilaporkan.
- Gunakan template Bug Report dan sertakan:
  - Deskripsi singkat masalah
  - Langkah-langkah untuk mereproduksi (Steps to reproduce)
  - Perilaku yang diharapkan vs yang terjadi
  - Informasi browser dan sistem operasi

### 2. Mengajukan Fitur Baru
- Buka issue dengan label `enhancement` untuk mendiskusikan ide sebelum membuat Pull Request besar.
- Jelaskan nilai tambah fitur tersebut bagi pengguna SQLite Studio.

### 3. Mengirimkan Pull Request (PR)
1. **Fork** repositori ini ke akun GitHub Anda.
2. Buat branch baru dari `main`:
   ```bash
   git checkout -b feat/nama-fitur-anda
   ```
3. Pasang dependensi dan lakukan perubahan:
   ```bash
   npm install
   npm run dev
   ```
4. Pastikan build dan linter lolos tanpa error:
   ```bash
   npm run lint
   npm run build
   ```
5. Commit perubahan Anda dengan pesan commit yang jelas:
   ```bash
   git commit -m "feat: tambahkan fitur export ke TSV"
   ```
6. Push ke fork Anda dan buat Pull Request ke branch `main`.

---

## Standar Kode & Desain

- **TypeScript**: Hindari penggunaan `any` tanpa alasan yang kuat.
- **Styling**: Gunakan variabel dan token yang sudah didefinisikan pada `src/index.css` (Vanilla CSS). Jangan menambahkan framework CSS eksternal seperti Tailwind atau Bootstrap tanpa persetujuan.
- **Local-First**: Semua fitur WAJIB berjalan di sisi klien (100% client-side). Dilarang keras mengirim data atau kueri database pengguna ke server luar.
- **Responsif**: Pastikan perubahan UI tetap nyaman dan dapat digunakan pada tampilan mobile (touch targets minimal 40px).

---

## Lisensi
Dengan berkontribusi pada repositori ini, Anda setuju bahwa kontribusi Anda dilisensikan di bawah [MIT License](./LICENSE).
