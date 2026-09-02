// Pengaturan sumber data soal & nilai.
// - 'local'  : pakai data/soal.js + localStorage -> untuk testing tanpa internet.
//              Soal tambahan guru & nilai siswa hanya tersimpan di perangkat ini.
// - 'sheets' : pakai Google Apps Script Web App yang tersambung ke Google Sheets.
//              Soal tambahan guru & nilai siswa tersimpan terpusat, bisa dilihat
//              dari perangkat manapun. Lihat README.md bagian "Setup Google Sheets".
const CONFIG = {
  dataSource: 'sheets',

  // URL Web App hasil deploy Google Apps Script (lihat README.md).
  apiUrl: 'https://script.google.com/macros/s/AKfycbxyGuno7-y_PvQJFKfrKzzueY3ANLl8hhdkFTwriQivvvztth-sc5IiCLM3Kdqk5OU5/exec',

  // Kode rahasia — HARUS sama persis dengan SHARED_SECRET di google-apps-script/Code.gs.
  // Tanpa ini, siapa pun yang tahu apiUrl bisa langsung kirim data ke Sheets tanpa lewat
  // website ini sama sekali.
  apiSecret: 'smp37makassar',

  // PIN sederhana untuk masuk ke Mode Guru (tambah soal, kunci jawaban, rekap nilai).
  // Di mode 'sheets' (yang aktif sekarang), PIN sungguhan diverifikasi di server lewat
  // GURU_PIN di Code.gs — nilai di bawah ini cuma dipakai untuk mode 'local'/testing,
  // boleh dibiarkan apa saja asal tidak kosong (kosong = layar PIN tidak muncul sama sekali).
  guruPin: '2468'
};
