/**
 * Backend Bank Soal SMP — tempel kode ini di Extensions > Apps Script pada
 * Google Sheets yang menyimpan soal & nilai. Panduan lengkap ada di README.md.
 *
 * Sheet ini butuh 2 tab:
 *   - "Soal"  : id | kelas | mapel | bab | pertanyaan | opsiA | opsiB | opsiC | opsiD |
 *               jawaban | pembahasan | gambarUrl
 *   - "Nilai" : waktu | nama | kelasRombel | kelas | mapel | skor | total | persentase |
 *               detailJawaban
 *
 * Jalankan fungsi setupSheets() sekali (lewat menu Run di editor Apps Script) untuk
 * membuat kedua tab otomatis kalau belum ada. AMAN dijalankan ulang kapan saja —
 * kalau tab sudah ada tapi kolomnya belum lengkap (misalnya setelah update kode ini),
 * setupSheets() akan menambahkan kolom yang belum ada tanpa menghapus data lama.
 *
 * Foto soal dikirim dari browser sebagai base64, lalu disimpan sebagai file di
 * folder Google Drive "Bank Soal - Gambar Soal" (dibuat otomatis), dan yang disimpan
 * di sheet hanya URL-nya. Saat pertama kali deploy/redeploy, Google akan minta izin
 * tambahan untuk mengakses Drive — ini normal, harus di-Allow.
 */

var SHEET_SOAL = 'Soal';
var SHEET_NILAI = 'Nilai';
var SHEET_PENGATURAN = 'Pengaturan';
var IMAGE_FOLDER_NAME = 'Bank Soal - Gambar Soal';

// Kolom "tingkat" ditaruh di akhir (bukan disisipkan di tengah) supaya kolom yang
// sudah ada di sheet lama tidak bergeser posisinya.
var SOAL_HEADERS = ['id', 'kelas', 'mapel', 'bab', 'pertanyaan', 'opsiA', 'opsiB', 'opsiC', 'opsiD', 'jawaban', 'pembahasan', 'gambarUrl', 'tingkat'];
var NILAI_HEADERS = ['waktu', 'nama', 'kelasRombel', 'kelas', 'mapel', 'skor', 'total', 'persentase', 'detailJawaban'];
// Sheet "Pengaturan" berbentuk key-value (bukan satu baris per soal/nilai), dipakai untuk
// menyimpan Pengaturan Latihan supaya berlaku sama untuk semua siswa dari perangkat manapun.
var PENGATURAN_HEADERS = ['key', 'value'];

var VALID_KELAS = ['7', '8', '9'];
var VALID_MAPEL = ['Matematika', 'IPA', 'IPS', 'Bahasa Indonesia', 'Bahasa Inggris', 'PPKn'];
var VALID_JAWABAN = ['A', 'B', 'C', 'D'];
var VALID_TINGKAT = ['Mudah', 'Sedang', 'Sulit'];

// HARUS sama persis dengan CONFIG.apiSecret di js/config.js — tanpa ini siapa pun yang
// tahu URL Web App bisa langsung kirim data (nambah soal palsu, kirim nilai palsu) tanpa
// lewat website ini sama sekali. Kosongkan '' hanya kalau benar-benar paham risikonya.
var SHARED_SECRET = 'smp37makassar';

// PIN Mode Guru yang SESUNGGUHNYA — beda dari guruPin di js/config.js (yang hanya dipakai
// untuk mode 'local'/testing). Diverifikasi di sini (server), jadi tidak pernah dikirim ke
// browser siswa dalam bentuk terbuka. Ganti ke PIN pilihanmu sendiri, lalu Deploy ulang.
var GURU_PIN = '2468';

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var soal = ss.getSheetByName(SHEET_SOAL);
  if (!soal) {
    soal = ss.insertSheet(SHEET_SOAL);
    soal.appendRow(SOAL_HEADERS);
  } else {
    ensureColumns_(soal, SOAL_HEADERS);
  }
  backfillSoalIds_(soal);

  var nilai = ss.getSheetByName(SHEET_NILAI);
  if (!nilai) {
    nilai = ss.insertSheet(SHEET_NILAI);
    nilai.appendRow(NILAI_HEADERS);
  } else {
    ensureColumns_(nilai, NILAI_HEADERS);
  }

  var pengaturan = ss.getSheetByName(SHEET_PENGATURAN);
  if (!pengaturan) {
    pengaturan = ss.insertSheet(SHEET_PENGATURAN);
    pengaturan.appendRow(PENGATURAN_HEADERS);
  } else {
    ensureColumns_(pengaturan, PENGATURAN_HEADERS);
  }
  seedPengaturanDefault_(pengaturan);
}

function doGet(e) {
  var action = (e.parameter.action || 'soal').toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (action === 'pengaturan') {
      var pengaturanSheet = ss.getSheetByName(SHEET_PENGATURAN);
      if (!pengaturanSheet) return jsonResponse({ error: 'Tab "Pengaturan" tidak ditemukan. Jalankan setupSheets() dulu.' });
      return jsonResponse({ data: readPengaturan_(pengaturanSheet) });
    }

    var sheetName = action === 'nilai' ? SHEET_NILAI : SHEET_SOAL;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonResponse({ error: 'Tab "' + sheetName + '" tidak ditemukan. Jalankan setupSheets() dulu.' });
    return jsonResponse({ data: sheetToObjects(sheet) });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse({ error: 'Server sedang sibuk (banyak yang mengirim bersamaan), coba lagi beberapa detik lagi.' });
  }

  try {
    var body = JSON.parse(e.postData.contents);

    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return jsonResponse({ error: 'Kode rahasia salah atau tidak dikirim.' });
    }

    if (body.type === 'checkPin') {
      return jsonResponse({ ok: String(body.pin || '') === GURU_PIN });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.type === 'updatePengaturan') {
      var pengaturanValidationError = validatePengaturanPayload_(body);
      if (pengaturanValidationError) return jsonResponse({ error: pengaturanValidationError });

      var pengaturanSheet2 = ss.getSheetByName(SHEET_PENGATURAN);
      if (!pengaturanSheet2) return jsonResponse({ error: 'Tab "Pengaturan" tidak ditemukan. Jalankan setupSheets() dulu.' });
      writePengaturanValue_(pengaturanSheet2, 'jumlahSoal', body.jumlahSoal);
      writePengaturanValue_(pengaturanSheet2, 'persenMudah', body.persenMudah);
      writePengaturanValue_(pengaturanSheet2, 'persenSedang', body.persenSedang);
      writePengaturanValue_(pengaturanSheet2, 'persenSulit', body.persenSulit);
      return jsonResponse({ ok: true });
    }

    if (body.type === 'soal' || body.type === 'updateSoal') {
      var validationError = validateSoalPayload_(body);
      if (validationError) return jsonResponse({ error: validationError });
    }

    if (body.type === 'soal') {
      var soalSheet = ss.getSheetByName(SHEET_SOAL);
      if (!soalSheet) return jsonResponse({ error: 'Tab "Soal" tidak ditemukan. Jalankan setupSheets() dulu.' });
      var newId = body.id || generateId_();
      appendRowByHeaders_(soalSheet, {
        id: newId,
        kelas: body.kelas,
        mapel: body.mapel,
        bab: body.bab,
        pertanyaan: body.pertanyaan,
        opsiA: body.opsiA,
        opsiB: body.opsiB,
        opsiC: body.opsiC,
        opsiD: body.opsiD,
        jawaban: body.jawaban,
        pembahasan: body.pembahasan,
        gambarUrl: resolveGambar_(body.gambar, newId),
        tingkat: resolveTingkat_(body.tingkat)
      });
      return jsonResponse({ ok: true, id: newId });
    }

    if (body.type === 'updateSoal') {
      var soalSheet2 = ss.getSheetByName(SHEET_SOAL);
      if (!soalSheet2) return jsonResponse({ error: 'Tab "Soal" tidak ditemukan. Jalankan setupSheets() dulu.' });
      if (!body.id) return jsonResponse({ error: 'id soal tidak dikirim, tidak bisa update.' });

      var rowIndex = findRowById_(soalSheet2, body.id);
      if (rowIndex === -1) return jsonResponse({ error: 'Soal dengan id tersebut tidak ditemukan (mungkin sudah dihapus).' });

      updateRowByHeaders_(soalSheet2, rowIndex, {
        kelas: body.kelas,
        mapel: body.mapel,
        bab: body.bab,
        pertanyaan: body.pertanyaan,
        opsiA: body.opsiA,
        opsiB: body.opsiB,
        opsiC: body.opsiC,
        opsiD: body.opsiD,
        jawaban: body.jawaban,
        pembahasan: body.pembahasan,
        gambarUrl: resolveGambar_(body.gambar, body.id),
        tingkat: resolveTingkat_(body.tingkat)
      });
      return jsonResponse({ ok: true });
    }

    if (body.type === 'deleteSoal') {
      var soalSheet3 = ss.getSheetByName(SHEET_SOAL);
      if (!soalSheet3) return jsonResponse({ error: 'Tab "Soal" tidak ditemukan. Jalankan setupSheets() dulu.' });
      if (!body.id) return jsonResponse({ error: 'id soal tidak dikirim, tidak bisa hapus.' });

      var deleteRowIndex = findRowById_(soalSheet3, body.id);
      if (deleteRowIndex === -1) return jsonResponse({ error: 'Soal dengan id tersebut tidak ditemukan (mungkin sudah dihapus sebelumnya).' });

      soalSheet3.deleteRow(deleteRowIndex);
      return jsonResponse({ ok: true });
    }

    if (body.type === 'nilai') {
      var nilaiValidationError = validateNilaiPayload_(body);
      if (nilaiValidationError) return jsonResponse({ error: nilaiValidationError });

      var nilaiSheet = ss.getSheetByName(SHEET_NILAI);
      if (!nilaiSheet) return jsonResponse({ error: 'Tab "Nilai" tidak ditemukan. Jalankan setupSheets() dulu.' });
      appendRowByHeaders_(nilaiSheet, {
        waktu: new Date(),
        nama: body.nama,
        kelasRombel: body.kelasRombel,
        kelas: body.kelas,
        mapel: body.mapel,
        skor: body.skor,
        total: body.total,
        persentase: body.persentase,
        detailJawaban: body.detailJawaban
      });
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'type tidak dikenali: ' + body.type });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Validasi input (jaga-jaga kalau ada yang kirim data langsung ke API,
// bukan lewat form di website) ----------

function validateSoalPayload_(body) {
  if (VALID_KELAS.indexOf(String(body.kelas)) === -1) return 'kelas harus salah satu dari: ' + VALID_KELAS.join(', ');
  if (VALID_MAPEL.indexOf(String(body.mapel)) === -1) return 'mapel harus salah satu dari: ' + VALID_MAPEL.join(', ');
  if (VALID_JAWABAN.indexOf(String(body.jawaban)) === -1) return 'jawaban harus salah satu dari: ' + VALID_JAWABAN.join(', ');
  if (!String(body.pertanyaan || '').trim()) return 'pertanyaan tidak boleh kosong.';
  if (!String(body.opsiA || '').trim() || !String(body.opsiB || '').trim() ||
      !String(body.opsiC || '').trim() || !String(body.opsiD || '').trim()) {
    return 'opsi A-D tidak boleh kosong.';
  }
  if (!String(body.pembahasan || '').trim()) return 'pembahasan tidak boleh kosong.';
  if (body.gambar && String(body.gambar).length > 3000000) return 'Ukuran foto terlalu besar.';
  // tingkat boleh kosong (soal lama/tanpa tingkat otomatis dianggap "Sedang" oleh
  // resolveTingkat_), tapi kalau diisi harus salah satu nilai yang valid.
  if (body.tingkat && VALID_TINGKAT.indexOf(String(body.tingkat)) === -1) {
    return 'tingkat harus salah satu dari: ' + VALID_TINGKAT.join(', ');
  }
  return null;
}

function validatePengaturanPayload_(body) {
  var jumlah = Number(body.jumlahSoal);
  if (isNaN(jumlah) || jumlah < 1) return 'jumlah soal per latihan harus angka minimal 1.';

  var mudah = Number(body.persenMudah);
  var sedang = Number(body.persenSedang);
  var sulit = Number(body.persenSulit);
  if (isNaN(mudah) || isNaN(sedang) || isNaN(sulit) || mudah < 0 || sedang < 0 || sulit < 0) {
    return 'persentase tingkat kesulitan harus angka 0 atau lebih.';
  }
  if (mudah + sedang + sulit !== 100) return 'total persentase Mudah + Sedang + Sulit harus 100%.';
  return null;
}

function validateNilaiPayload_(body) {
  if (!String(body.nama || '').trim()) return 'nama tidak boleh kosong.';
  if (VALID_KELAS.indexOf(String(body.kelas)) === -1) return 'kelas harus salah satu dari: ' + VALID_KELAS.join(', ');
  if (VALID_MAPEL.indexOf(String(body.mapel)) === -1) return 'mapel harus salah satu dari: ' + VALID_MAPEL.join(', ');
  if (isNaN(Number(body.skor)) || isNaN(Number(body.total))) return 'skor/total harus berupa angka.';
  return null;
}

// ---------- Foto soal -> Google Drive ----------

// gambar boleh berupa: '' (tidak ada foto), data-URI base64 (foto baru, perlu diupload),
// atau URL yang sudah ada (tidak berubah saat edit tanpa ganti foto).
function resolveGambar_(gambar, idForFilename) {
  if (!gambar) return '';
  if (String(gambar).indexOf('data:image') === 0) {
    return uploadImageToDrive_(gambar, idForFilename);
  }
  return gambar;
}

function uploadImageToDrive_(dataUri, idForFilename) {
  var match = String(dataUri).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (!match) throw new Error('Format foto tidak valid.');
  var mimeType = match[1];
  var base64 = match[2];
  var bytes = Utilities.base64Decode(base64);
  var ext = mimeType.split('/')[1] || 'jpg';
  var blob = Utilities.newBlob(bytes, mimeType, 'soal-' + idForFilename + '.' + ext);

  var folder = getOrCreateImageFolder_();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getOrCreateImageFolder_() {
  var folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

// Soal tanpa tingkat (data lama) atau tingkat yang tidak dikenali dianggap "Sedang".
function resolveTingkat_(tingkat) {
  var t = String(tingkat || '').trim();
  return VALID_TINGKAT.indexOf(t) === -1 ? 'Sedang' : t;
}

// ---------- Pengaturan Latihan (sheet key-value, terpusat untuk semua siswa) ----------

function readPengaturan_(sheet) {
  var rows = sheetToObjects(sheet); // tiap baris: {key, value}
  var map = {};
  rows.forEach(function (r) { map[r.key] = r.value; });
  return {
    jumlahSoal: map.jumlahSoal !== undefined && map.jumlahSoal !== '' ? Number(map.jumlahSoal) : 20,
    persenMudah: map.persenMudah !== undefined && map.persenMudah !== '' ? Number(map.persenMudah) : 40,
    persenSedang: map.persenSedang !== undefined && map.persenSedang !== '' ? Number(map.persenSedang) : 40,
    persenSulit: map.persenSulit !== undefined && map.persenSulit !== '' ? Number(map.persenSulit) : 20
  };
}

function writePengaturanValue_(sheet, key, value) {
  var headers = getHeaders_(sheet);
  var keyCol = headers.indexOf('key');
  var valueCol = headers.indexOf('value');
  var lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    var keys = sheet.getRange(2, keyCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) {
        sheet.getRange(i + 2, valueCol + 1).setValue(value);
        return;
      }
    }
  }
  // Key belum ada di sheet -> tambah baris baru.
  var row = headers.map(function (h) {
    if (h === 'key') return key;
    if (h === 'value') return value;
    return '';
  });
  sheet.appendRow(row);
}

function seedPengaturanDefault_(sheet) {
  if (sheet.getLastRow() >= 2) return; // sudah ada data (mis. sudah pernah disimpan guru), jangan ditimpa
  writePengaturanValue_(sheet, 'jumlahSoal', 20);
  writePengaturanValue_(sheet, 'persenMudah', 40);
  writePengaturanValue_(sheet, 'persenSedang', 40);
  writePengaturanValue_(sheet, 'persenSulit', 20);
}

// ---------- Helper baca/tulis sheet berdasarkan nama kolom (bukan posisi tetap) ----------

function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return [];

  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var rows = values.slice(1).filter(function (r) {
    return r.some(function (cell) { return cell !== '' && cell !== null; });
  });

  return rows.map(function (r) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
}

function appendRowByHeaders_(sheet, valuesObj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return valuesObj.hasOwnProperty(h) ? valuesObj[h] : '';
  });
  sheet.appendRow(row);
}

function updateRowByHeaders_(sheet, rowIndex, valuesObj) {
  var headers = getHeaders_(sheet);
  var existingRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (h, i) {
    if (valuesObj.hasOwnProperty(h)) existingRow[i] = valuesObj[h];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([existingRow]);
}

function findRowById_(sheet, id) {
  var headers = getHeaders_(sheet);
  var idCol = headers.indexOf('id');
  if (idCol === -1) return -1;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // +2: offset header row + index 0-based
  }
  return -1;
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

function ensureColumns_(sheet, requiredHeaders) {
  var existing = sheet.getLastColumn() > 0 ? getHeaders_(sheet) : [];
  requiredHeaders.forEach(function (h) {
    if (existing.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      existing.push(h);
    }
  });
}

function backfillSoalIds_(sheet) {
  var headers = getHeaders_(sheet);
  var idCol = headers.indexOf('id');
  if (idCol === -1) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  var changed = false;
  for (var i = 0; i < ids.length; i++) {
    if (!ids[i][0]) {
      ids[i][0] = generateId_();
      changed = true;
    }
  }
  if (changed) sheet.getRange(2, idCol + 1, ids.length, 1).setValues(ids);
}

function generateId_() {
  return 'soal-' + Utilities.getUuid();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
