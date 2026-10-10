# Arsitektur & Detail Teknis

Dokumen ini mendokumentasikan arsitektur teknis internal, lifecycle SQLite WASM, penanganan persistensi, serta strategi penyelesaian edge case pada **SQLite Studio**.

---

## 1. Arsitektur Tingkat Tinggi (High-Level Architecture)

SQLite Studio menganut filosofi **Local-First & Privacy-First**. Seluruh kalkulasi, parsing SQL, dan manipulasi byte binary database dilakukan 100% di browser pengguna tanpa lalu lintas ke server backend.

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Client                        │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐  │
│  │   Data Grid UI   │  │  SQL Editor UI   │  │ Visual ERD │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬─────┘  │
│           │                     │                   │        │
│  ┌────────▼─────────────────────▼───────────────────▼─────┐  │
│  │              SQLite Engine Bridge                      │  │
│  │   - Schema Inspector & Introspection                   │  │
│  │   - Safe Mode Guard (Destructive query detector)       │  │
│  │   - SQL Serializer & Parameter Escaper                 │  │
│  └──────────────────────────────┬─────────────────────────┘  │
│                                 │                            │
│  ┌──────────────────────────────▼─────────────────────────┐  │
│  │                 sql.js (WebAssembly)                   │  │
│  │             SQLite Core C-Library Engine               │  │
│  └──────────────────────────────┬─────────────────────────┘  │
│                                 │                            │
│           ┌─────────────────────┴─────────────────────┐      │
│           ▼                                           ▼      │
│  ┌──────────────────┐                       ┌──────────────┐ │
│  │ File System API  │                       │ Memory/Blob  │ │
│  │ Direct Disk Sync │                       │ Sandbox Mode │ │
│  └──────────────────┘                       └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. SQLite WebAssembly Lifecycle

1. **Inisialisasi (`getSqlJs`):**
   - File binary `sql-wasm.wasm` (658 KB) di-fetch menggunakan `locateFile` dengan relative path (`./sql-wasm.wasm`).
   - Promise WASM di-cache secara singleton sehingga inisialisasi hanya terjadi sekali per lifecycle aplikasi.
2. **Validasi Header:**
   - File yang dibuka atau di-drop divalidasi 16 byte pertamanya (`SQLite format 3\0`).
   - Mencegat file korup, teks acak, atau file terenkripsi (SQLCipher) sebelum dialokasikan ke memori.
3. **Deteksi Mode WAL:**
   - Memeriksa byte 18 & 19 pada SQLite header. Jika bernilai 2, database berada dalam status Write-Ahead Logging (WAL).
   - Menampilkan modal peringatan WAL dan menyediakan tombol eksekusi cepat `PRAGMA wal_checkpoint(FULL);`.
4. **Isolasi Multi-Database:**
   - Database aktif disimpan dalam `Map<string, Database>`. Setiap file database memiliki memori terisolasi sendiri.

---

## 3. Dual-Mode Persistence

SQLite Studio mengimplementasikan dua jalur persistensi:

1. **Direct Disk Sync (Chromium: Chrome, Edge, Arc, Brave):**
   - Menggunakan *File System Access API* (`window.showOpenFilePicker`).
   - Menyimpan instance `FileSystemFileHandle`.
   - Saat pengguna menyimpan perubahan (`Cmd/Ctrl + S` atau tombol Simpan), buffer biner SQLite diekspor dan ditulis langsung ke file asli di hard disk pengguna menggunakan `handle.createWritable()`.
2. **Standard Sandbox / Download Fallback (Safari, Firefox, Mobile):**
   - Menggunakan input file standard `<input type="file">`.
   - Perubahan disimpan dalam memori WASM, dan pengguna dapat mengunduh file `.db` yang sudah diperbarui kapan saja dalam 1 klik.

---

## 4. Penanganan Edge Cases Data Grid & Form

- **Composite Primary Keys:**  
  Tabel dengan beberapa kolom primary key (misal: `order_items` dengan `order_id` + `item_id`) diidentifikasi saat inspeksi skema. Operasi `UPDATE` dan `DELETE` secara otomatis menyusun klausa `WHERE col1 = val1 AND col2 = val2`.
- **Tabel Tanpa Primary Key (`rowid`):**  
  Jika tabel tidak memiliki primary key eksplisit dan bukan tabel `WITHOUT ROWID`, query internal menyertakan kolom pseudo `rowid AS __studio_rowid__`. Operasi sel dan penghapusan baris menggunakan `WHERE rowid = X`.
- **Penambahan Baris Kosong:**  
  Jika seluruh input dibiarkan default, query dieksekusi sebagai `INSERT INTO tableName DEFAULT VALUES;` untuk mencegah syntax error SQLite.
- **Relational Foreign Key Engine:**  
  Kolom foreign key secara otomatis melakukan lookup ke tabel referensi untuk menampilkan teks/nama yang informatif (misal: nama customer atau nama produk) dan menyediakan tautan langsung (jump link) ke baris tabel induk.
- **Anti-Zoom Mobile:**  
  Seluruh input pada tampilan mobile menggunakan `font-size: 16px !important` untuk mencegah iOS Safari melakukan auto-zoom saat input disentuh.

---

## 5. Visual ERD Gestures

Visual ERD dibangun murni menggunakan **Pointer Events API** (`onPointerDown`, `onPointerMove`, `onPointerUp`) yang disinkronkan dengan `setPointerCapture`:
- **1 Jari / Mouse Drag:** Menggeser kartu tabel di canvas atau melakukan pan canvas jika disentuh di area kosong.
- **2 Jari Pinch:** Mendeteksi jarak Euclidean antara dua sentuhan untuk melakukan zoom in/out yang mulus pada layar smartphone atau tablet.
- **Auto-Layout:** Menghitung posisi awal kartu secara otomatis (1 kolom pada ponsel, 3 kolom pada desktop) dengan kalkulasi bounding box terpusat.
