# Bank Soal SMPN 37 Makassar

Website latihan soal pilihan ganda untuk siswa SMPN 37 Makassar kelas 7, 8, dan 9. Dibuat dengan HTML, CSS, dan JavaScript murni (tanpa framework, tanpa build step).

## Fitur

**Siswa**
- Alur: isi nama + kelas/rombel (misal "7A") → pilih kelas → pilih mata pelajaran → **pilih bab (atau semua bab)** → latihan soal → skor & pembahasan.
- Soal bisa dilengkapi **foto** (diagram, gambar, dsb), muncul saat mengerjakan dan bisa di-tap untuk diperbesar (lightbox).
- **Urutan soal & urutan opsi A-D diacak** setiap kali latihan, supaya tidak gampang saling contek antar siswa.
- Tidak bisa menekan "Selesai" kalau masih ada soal yang belum dijawab.
- **Riwayat Nilai Saya** — siswa bisa lihat semua percobaan latihannya sendiri dari waktu ke waktu.
- **Papan Peringkat** — lihat ranking nilai terbaik teman sekelas untuk mapel yang baru dikerjakan.
- Skor terakhir juga disimpan di `localStorage` (per kelas & mapel di perangkat itu), muncul sebagai badge saat memilih mapel.
- Bisa **"diinstall" ke homescreen HP** seperti aplikasi (PWA) — tetap bisa dibuka walau sinyal internet putus-putus.

**Guru** (menu dikunci PIN)
- Lihat kunci jawaban & pembahasan, **tambah**, **edit**, atau **hapus** soal (termasuk foto) langsung dari web.
- **Import Soal Massal** — tempel/upload data CSV untuk menambah banyak soal sekaligus (ada template CSV yang bisa diunduh).
- **Statistik Soal** — lihat soal mana yang paling banyak dijawab salah oleh siswa (diurutkan otomatis), untuk tahu materi mana yang perlu diajarkan ulang.
- **Rekap Nilai Siswa** — nama, kelas/rombel, mapel, skor, rincian jawaban per soal; ada **grafik rata-rata nilai per mapel & per kelas**, dan bisa **diunduh sebagai CSV** (buka di Excel/Google Sheets).
- **Papan Peringkat** per kelas & mapel.
- Aman dipakai bersamaan oleh banyak siswa sekaligus — pengiriman nilai/soal ke Google Sheets memakai *lock* di sisi server supaya tidak bentrok saat banyak yang submit di waktu yang sama.

Sumber data bisa dari data lokal (untuk testing tanpa internet) atau Google Sheets + Google Apps Script (untuk dipakai sungguhan, terpusat, bisa diakses semua siswa & guru dari perangkat manapun).

## Struktur File

```
index.html                 Satu halaman berisi semua layar aplikasi
css/style.css                Styling responsif
js/config.js                  Saklar sumber data, URL API, dan PIN guru
js/dataSource.js                Baca/tulis soal & nilai (mode lokal atau Google Sheets)
js/app.js                        Logika aplikasi: navigasi, kuis, form guru, rekap nilai
data/soal.js                      90 soal contoh (5 soal x 6 mapel x 3 kelas)
google-apps-script/Code.gs          Kode backend Google Apps Script (untuk mode 'sheets')
```

## 1. Cara Menjalankan/Test di Komputer (Mode Lokal)

Aplikasi ini memakai data lokal (`data/soal.js`) secara default, jadi kamu bisa langsung buka **`index.html`** dengan dobel-klik di file explorer, tanpa install apa pun.

Di mode lokal:
- Soal contoh datang dari `data/soal.js`.
- Soal yang ditambahkan lewat form guru, dan nilai siswa yang selesai mengerjakan, tersimpan di `localStorage` browser tersebut saja (praktis untuk uji coba, tapi **tidak** dibagikan ke perangkat lain).

Kalau nanti sudah pindah ke Google Sheets (langkah di bawah), jalankan lewat server lokal supaya `fetch()` ke internet berjalan mulus. Contoh dengan Python (biasanya sudah ada di Mac):

```bash
cd "PROKER SEKOLAH WEB"
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000` di browser.

## 2. Menambah/Mengubah Soal Contoh (Mode Lokal)

Buka `data/soal.js`, tambahkan objek baru ke array `LOCAL_SOAL_DATA` dengan format:

```js
{ id: 'unik-1', kelas: '7', mapel: 'Matematika', bab: 'Bilangan Bulat',
  pertanyaan: 'Pertanyaannya apa...',
  opsiA: '...', opsiB: '...', opsiC: '...', opsiD: '...',
  jawaban: 'A', pembahasan: 'Penjelasan kenapa jawabannya A...' }
```

- `kelas` harus persis `"7"`, `"8"`, atau `"9"`.
- `mapel` harus persis salah satu dari: `Matematika`, `IPA`, `IPS`, `Bahasa Indonesia`, `Bahasa Inggris`, `PPKn`.
- `jawaban` diisi salah satu huruf `A`/`B`/`C`/`D`.

## 3. Setup Google Sheets + Apps Script (mode terpusat/sungguhan)

Supaya guru bisa tambah soal dari web dan nilai semua siswa tersimpan di satu tempat yang bisa dilihat guru, sambungkan ke Google Sheets lewat **Google Apps Script** (fitur gratis bawaan Google, tidak perlu server/hosting tambahan).

### a. Buat Google Sheet dengan 2 tab

**Kamu tidak perlu membuat tab ini manual** — cukup jalankan `setupSheets()` di langkah (b) di bawah, otomatis dibuatkan dengan header yang benar. Ini hanya referensi kolom apa saja yang dipakai:

**Tab "Soal"**

| id | kelas | mapel | bab | pertanyaan | opsiA | opsiB | opsiC | opsiD | jawaban | pembahasan | gambarUrl |
|---|---|---|---|---|---|---|---|---|---|---|---|
| soal-xxxx | 7 | Matematika | Bilangan Bulat | Hasil dari -8 + 5 x (-2) adalah ... | -18 | -6 | 6 | 18 | A | Perkalian dikerjakan lebih dulu... | (otomatis) |

**Tab "Nilai"** (otomatis terisi dari web, tidak perlu diisi manual)

| waktu | nama | kelasRombel | kelas | mapel | skor | total | persentase | detailJawaban |
|---|---|---|---|---|---|---|---|---|

Aturan pengisian tab "Soal" (kalau menambah/mengedit langsung di Sheets, di luar form guru):
- **id**: kosongkan saja untuk baris baru — `setupSheets()` otomatis mengisi id unik untuk baris yang id-nya kosong.
- **kelas**: isi `7`, `8`, atau `9` saja (tanpa kata "Kelas").
- **mapel**: isi persis salah satu dari `Matematika`, `IPA`, `IPS`, `Bahasa Indonesia`, `Bahasa Inggris`, `PPKn`.
- **jawaban**: isi satu huruf `A`, `B`, `C`, atau `D`.
- **gambarUrl**: biarkan kosong kalau tidak ada foto, atau isi manual dengan URL gambar publik kalau menambah lewat Sheets langsung (form guru di web mengisi ini otomatis lewat upload foto).
- Jangan ada baris kosong di tengah data.

### b. Pasang Apps Script

1. Di Google Sheets tadi, buka menu **Extensions > Apps Script** (Ekstensi > Apps Script).
2. Hapus kode contoh yang ada, lalu salin-tempel seluruh isi file [`google-apps-script/Code.gs`](google-apps-script/Code.gs) dari folder ini ke editor tersebut.
3. Di dropdown fungsi (dekat tombol ▶ Run), pilih `setupSheets`, lalu klik **Run**. Ini akan otomatis membuat tab "Soal" dan "Nilai" kalau belum ada, **atau menambahkan kolom yang belum ada** (misalnya `id`/`gambarUrl`/`kelasRombel`) kalau tab-nya sudah ada dari setup sebelumnya — aman dijalankan berkali-kali, data lama tidak akan hilang atau tertimpa. Saat diminta izin akses, klik **Allow/Izinkan** — kali ini akan diminta izin **Google Drive** juga (dipakai untuk menyimpan foto soal), ini akun Google-mu sendiri, aman.

   > **Sudah pernah setup sebelumnya (sudah ada data)?** Cukup timpa (replace) isi `Code.gs` lama dengan yang baru ini, jalankan `setupSheets()` sekali lagi, lalu **Deploy ulang** (lihat langkah "Setelah Setup" di bawah). Baris soal lama otomatis dapat `id` baru, dan kolom `gambarUrl` kosong (dianggap tidak ada foto) sampai guru menambahkan foto lewat form edit.

4. Klik **Deploy > New deployment**.
5. Pilih tipe **Web app**.
6. Isi:
   - **Execute as**: Me (akun Googlemu)
   - **Who has access**: Anyone (Siapa saja)
7. Klik **Deploy**, izinkan akses jika diminta, lalu salin **Web app URL** yang muncul — bentuknya seperti:
   `https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxx/exec`

> Karena "Who has access" diset **Anyone**, siapa pun yang tahu URL ini secara teknis bisa mencoba mengirim data langsung (bukan lewat website). Untuk itu `Code.gs` sudah dilengkapi kode rahasia (`SHARED_SECRET`) bawaan yang **wajib dicocokkan** dengan `apiSecret` di `js/config.js` (langkah berikutnya) — kalau tidak cocok, permintaan ditolak. **Sangat disarankan ganti kode rahasia bawaan itu** dengan kode buatanmu sendiri (baris paling atas `Code.gs`), supaya tidak sama dengan yang ada di contoh/README ini. Setelah mengubah `Code.gs`, ulangi **Deploy > Manage deployments > Edit (ikon pensil) > Version: New version > Deploy** supaya perubahan aktif.
>
> `Code.gs` juga punya `GURU_PIN` (PIN Mode Guru yang **sesungguhnya**, terpisah dari `guruPin` di `js/config.js`) — ganti juga ke PIN pilihanmu. PIN ini diperiksa di server, jadi tidak pernah dikirim ke browser siswa dalam bentuk terbuka (beda dengan `guruPin` di `js/config.js` yang hanya dipakai untuk mode `local`/testing dan bisa dilihat siapa saja lewat "View Page Source").

### c. Sambungkan ke Website

Buka `js/config.js`, ubah jadi:

```js
const CONFIG = {
  dataSource: 'sheets',
  apiUrl: 'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxx/exec',
  apiSecret: 'ISI_SAMA_PERSIS_DENGAN_SHARED_SECRET_DI_CODE_GS',
  guruPin: '2468' // hanya dipakai untuk mode 'local'/testing, boleh dibiarkan
};
```

Simpan, lalu buka ulang `index.html` (disarankan lewat server lokal seperti langkah 1, atau langsung hosting online). Soal akan otomatis dimuat dari Google Sheets, soal baru dari form guru akan otomatis masuk ke tab "Soal", dan setiap siswa selesai mengerjakan otomatis tercatat di tab "Nilai".

### d. Setelah Setup

- Guru bisa menambah soal lewat menu **Mode Guru > Kelola Soal & Kunci Jawaban > pilih kelas/mapel > "+ Tambah Soal"**, tidak perlu buka Sheets sama sekali (walau tetap bisa juga langsung edit di Sheets kalau mau).
- Guru bisa **mengedit** atau **menghapus** soal yang sudah ada (termasuk mengganti/menghapus foto) lewat tombol "✏️ Edit Soal" / "🗑️ Hapus" di setiap soal pada layar Kunci Jawaban.
- Foto soal otomatis disimpan ke folder Google Drive **"Bank Soal - Gambar Soal"** di akun Google pemilik Sheet ini (dibuat otomatis saat foto pertama diupload).
- Guru bisa import banyak soal sekaligus lewat **Mode Guru > Import Soal Massal** (tempel CSV atau upload file .csv, format kolom sama seperti tabel di atas tanpa kolom `id`/`gambarUrl`).
- Guru bisa melihat soal mana yang paling banyak dijawab salah lewat **Mode Guru > Statistik Soal**.
- Guru bisa melihat rekap nilai semua siswa (plus grafik rata-rata) lewat **Mode Guru > Rekap Nilai Siswa**, bisa difilter per kelas/mapel/nama, dan bisa diunduh sebagai file CSV lewat tombol **"⬇️ Unduh CSV"**.
- Kolom `detailJawaban` di tab "Nilai" formatnya `id_soal:jawaban_siswa:1_atau_0` dipisah `;` (dipakai untuk fitur Statistik Soal) — beda dari sebelumnya yang berbasis nomor urut, karena sekarang urutan soal diacak per siswa.
- Setiap ada perubahan di Apps Script (`Code.gs`), harus **Deploy ulang** (Manage deployments > Edit > New version) supaya perubahan aktif di web — termasuk update ini (menambahkan kemampuan hapus soal).

## 4. PIN Mode Guru

Untuk masuk ke menu guru (tambah soal, kunci jawaban, rekap nilai), siswa/guru harus memasukkan PIN.

- **Mode `sheets`**: PIN yang benar-benar dipakai adalah `GURU_PIN` di `google-apps-script/Code.gs` — diperiksa di server, tidak pernah dikirim ke browser dalam bentuk terbuka. **Ganti nilai bawaannya** ke PIN pilihanmu sendiri, lalu Deploy ulang.
- **Mode `local`** (testing tanpa server): dibandingkan langsung di browser dengan `guruPin` di `js/config.js` — ini **bukan** keamanan sungguhan (siapa saja bisa lihat lewat "View Page Source"), cuma penghalang ringan untuk testing.

Kosongkan `guruPin: ''` di `js/config.js` untuk menonaktifkan layar PIN sama sekali (tombol Mode Guru langsung terbuka) — tidak disarankan untuk situs yang sudah publik.

## 5. Keamanan — Ringkasan

- **Kode rahasia API** (`SHARED_SECRET` di `Code.gs` = `apiSecret` di `js/config.js`) — menahan orang yang mencoba kirim data langsung ke Apps Script tanpa lewat website. **Ganti dari nilai bawaan.**
- **PIN Guru** (`GURU_PIN` di `Code.gs`) — diverifikasi di server untuk mode `sheets`. **Ganti dari nilai bawaan.**
- **Validasi dasar di server** — `Code.gs` menolak data soal/nilai yang kelas/mapel/jawabannya tidak sesuai daftar yang valid, atau field wajib kosong, meski dikirim langsung ke API (bukan lewat form).
- **Teks soal di-escape** sebelum ditampilkan, jadi tidak bisa disalahgunakan untuk menyisipkan kode/script berbahaya lewat isi pertanyaan/opsi/pembahasan.
- **Keterbatasan yang masih ada** (bawaan dari situs statis tanpa login sungguhan): kunci jawaban tetap ikut termuat ke perangkat siswa saat soal dibuka (siswa yang paham teknis bisa melihatnya lewat DevTools browser sebelum menjawab), dan PIN guru adalah kode bersama (bukan akun per-guru). Kalau butuh tingkat keamanan lebih tinggi dari ini, perlu arsitektur backend yang lebih besar.

## 6. Deploy Online

Karena tidak ada build step, file-file di folder ini (kecuali `google-apps-script/`, yang jalan di server Google, dan `README.md`, yang cuma dokumentasi) bisa langsung di-hosting di layanan statis apa pun — GitHub Pages, Netlify, Vercel, atau cPanel-style hosting seperti di bawah ini.

### Deploy ke Cloud Hosting FreeDDNS (cPanel-style)

Kalau kamu pakai **Cloud Hosting 2.0** dari FreeDDNS (dashboard `tunnel.hostdns.us`), begini alurnya:

1. **⚠️ Selesaikan setup Google Sheets dulu (bagian 3 di atas)** sebelum upload. Ini penting: kalau situs sudah publik tapi `js/config.js` masih `dataSource: 'local'`, setiap siswa yang buka link akan punya data soal/nilai sendiri-sendiri di HP masing-masing (tidak nyambung ke guru) — bukan "database siswa" terpusat seperti yang kamu mau. Pastikan `dataSource: 'sheets'` dan `apiUrl` sudah terisi Web App URL Apps Script-mu.
2. Buka **Cloud Hosting 2.0 > List User Hosting**, klik hosting aktif kamu (`CLOUD HOSTING SGX - L`).
3. **Subdomain Manager** — buat subdomain untuk situs ini (misalnya `banksoal.miktool.my.id`), arahkan document root-nya ke folder tempat kamu akan upload file (biasanya otomatis dibuatkan folder baru, atau tunjuk ke `public_html`).
4. **(FTP) File Manager** — buka folder document root subdomain tadi, lalu upload isi folder project ini: `index.html`, `css/`, `js/`, `data/` (folder `google-apps-script/` dan `README.md` tidak perlu diupload, itu cuma referensi lokal). Pastikan `index.html` ada tepat di root folder tersebut, bukan di dalam subfolder tambahan.
5. **SSL Certificate** — aktifkan supaya situsnya bisa diakses lewat `https://` (aman, dan browser tidak menampilkan peringatan "Not Secure").
6. Buka subdomain yang tadi dibuat di browser untuk memastikan situs tampil dan soal termuat (kalau muncul layar loading terus / "Gagal Memuat Soal", cek lagi `apiUrl` di `js/config.js` yang ter-upload).

Fitur **MySQL Database**, **Setup NodeJS App**, dan **Setup Python App** di hosting itu tidak perlu dipakai — situs ini murni file statis dan sudah pakai Google Sheets sebagai "database"-nya.

## Troubleshooting

- **"Belum ada soal untuk kelas dan mapel ini"** — cek penulisan kolom `kelas` dan `mapel` di sheet, harus sama persis dengan daftar di atas.
- **"Gagal Memuat Soal" / error dari Google Sheets** — pastikan Apps Script sudah di-Deploy sebagai Web app dengan akses "Anyone", dan URL di `config.js` diakhiri `/exec`.
- **Soal/nilai tidak muncul setelah tambah data** — refresh halaman (hard refresh), atau cek tab "Soal"/"Nilai" di Sheets untuk memastikan baris baru benar-benar masuk.
- **Perubahan di `Code.gs` tidak berpengaruh** — Apps Script Web App butuh **Deploy ulang** (versi baru) setiap kali kode diubah, bukan cukup disimpan saja.
- **"Kode rahasia salah"** — pastikan `apiSecret` di `js/config.js` sama persis dengan `SHARED_SECRET` di `Code.gs`.
- **Foto soal tidak muncul saat siswa mengerjakan** — pastikan `Code.gs` yang terpasang sudah versi terbaru (yang punya fungsi `uploadImageToDrive_`) dan sudah **Deploy ulang** setelah ditempel; foto lama yang ditambahkan sebelum update ini perlu diupload ulang lewat tombol Edit Soal.
- **Diminta izin akses Google Drive saat Deploy/Run** — ini normal, foto soal disimpan di Drive akun pemilik Sheet. Klik **Allow/Izinkan**, kalau muncul peringatan "Google hasn't verified this app" klik **Advanced > Go to (nama project) (unsafe)** — wajar untuk skrip milik sendiri yang belum didaftarkan publik ke Google.
- **"Soal dengan id tersebut tidak ditemukan" saat edit** — biasanya karena baris itu belum punya `id` (ditambahkan manual di Sheets sebelum update ini). Jalankan `setupSheets()` sekali lagi di Apps Script editor untuk mengisi id yang kosong.
- **"Server sedang sibuk..." saat banyak siswa submit bersamaan** — jarang terjadi (ada antrean otomatis), tapi kalau muncul, siswa tinggal coba tekan "Selesai" lagi setelah beberapa detik; nilai belum tersimpan sampai muncul pesan berhasil.
- **Mau tahu isi kolom "Detail Jawaban" di CSV** — formatnya `No<nomor soal>:<jawaban siswa>(Benar)` atau `No<nomor soal>:<jawaban siswa>(Salah,Kunci:<jawaban benar>)`, dipisah `; ` antar soal.
