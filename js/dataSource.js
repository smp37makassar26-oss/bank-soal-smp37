// Menyatukan data dari sumber lokal (localStorage) atau Google Sheets (lewat Apps Script)
// menjadi satu bentuk soal/nilai yang konsisten dipakai oleh app.js.
//
// Mode 'sheets' : baca & tulis lewat Google Apps Script Web App (CONFIG.apiUrl).
// Mode 'local'  : baca dari data/soal.js, tulis (soal baru & nilai) ke localStorage.

const LOCAL_CUSTOM_SOAL_KEY = 'bankSoal:customSoal';
const LOCAL_DELETED_SOAL_KEY = 'bankSoal:deletedSoal';
const LOCAL_NILAI_KEY = 'bankSoal:nilaiLog';

function normalizeQuestion(raw, index) {
  return {
    id: raw.id || `q-${index}-${Date.now()}`,
    kelas: String(raw.kelas || '').trim(),
    mapel: String(raw.mapel || '').trim(),
    bab: String(raw.bab || '').trim(),
    pertanyaan: String(raw.pertanyaan || '').trim(),
    opsi: {
      A: String(raw.opsiA || raw.opsia || '').trim(),
      B: String(raw.opsiB || raw.opsib || '').trim(),
      C: String(raw.opsiC || raw.opsic || '').trim(),
      D: String(raw.opsiD || raw.opsid || '').trim()
    },
    jawaban: String(raw.jawaban || '').trim().toUpperCase().charAt(0),
    pembahasan: String(raw.pembahasan || '').trim(),
    // Bisa berupa data-URI base64 (baru dipilih, belum sempat reload) atau URL Google Drive
    // (sudah tersimpan lewat Apps Script). Header sheet "gambarUrl" jadi "gambarurl" saat dibaca.
    gambar: String(raw.gambar || raw.gambarurl || raw.gambarUrl || '').trim()
  };
}

function readLocalCustomSoal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CUSTOM_SOAL_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function readLocalDeletedSoal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DELETED_SOAL_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

async function loadQuestions() {
  if (CONFIG.dataSource === 'sheets') {
    if (!CONFIG.apiUrl) {
      throw new Error('URL Google Apps Script belum diisi. Buka js/config.js dan isi apiUrl.');
    }
    const rawList = await callApi('GET', 'soal');
    return rawList
      .map(normalizeQuestion)
      .filter((q) => q.kelas && q.mapel && q.pertanyaan && q.jawaban);
  }

  if (typeof LOCAL_SOAL_DATA === 'undefined') {
    throw new Error('Data lokal (data/soal.js) tidak ditemukan.');
  }

  // Soal custom/override (localStorage) ditaruh belakangan supaya kalau id-nya sama
  // dengan soal bawaan (hasil "edit" soal bawaan), versi custom yang menang.
  const combined = LOCAL_SOAL_DATA.concat(readLocalCustomSoal());
  const deletedIds = new Set(readLocalDeletedSoal());
  const byId = new Map();
  combined.forEach((raw) => {
    const q = normalizeQuestion(raw, byId.size);
    byId.set(q.id, q);
  });
  deletedIds.forEach((id) => byId.delete(id));

  return Array.from(byId.values()).filter((q) => q.kelas && q.mapel && q.pertanyaan && q.jawaban);
}

async function addQuestion(payload) {
  if (CONFIG.dataSource === 'sheets') {
    await callApi('POST', 'soal', payload);
    return;
  }
  const list = readLocalCustomSoal();
  list.push(payload);
  localStorage.setItem(LOCAL_CUSTOM_SOAL_KEY, JSON.stringify(list));
}

// Mode 'sheets': PIN sesungguhnya (GURU_PIN) hidup di server (Code.gs), diperiksa lewat
// API supaya tidak pernah dikirim dalam bentuk terbuka ke browser siswa. Mode 'local'
// (testing tanpa server) tetap dibandingkan di browser, jadi bukan keamanan sungguhan.
async function checkGuruPin(pin) {
  if (CONFIG.dataSource === 'sheets') {
    const res = await callApi('POST', 'checkPin', { pin });
    return !!res.ok;
  }
  return pin === CONFIG.guruPin;
}

async function editQuestion(id, payload) {
  if (CONFIG.dataSource === 'sheets') {
    await callApi('POST', 'updateSoal', Object.assign({ id }, payload));
    return;
  }
  const list = readLocalCustomSoal();
  const idx = list.findIndex((q) => q.id === id);
  const updated = Object.assign({}, payload, { id });
  if (idx !== -1) {
    list[idx] = updated;
  } else {
    // Soal bawaan (data/soal.js) yang diedit -> simpan sebagai override baru.
    list.push(updated);
  }
  localStorage.setItem(LOCAL_CUSTOM_SOAL_KEY, JSON.stringify(list));
}

async function deleteQuestion(id) {
  if (CONFIG.dataSource === 'sheets') {
    await callApi('POST', 'deleteSoal', { id });
    return;
  }
  // Buang dari daftar custom kalau ada di situ...
  const list = readLocalCustomSoal().filter((q) => q.id !== id);
  localStorage.setItem(LOCAL_CUSTOM_SOAL_KEY, JSON.stringify(list));
  // ...dan catat id-nya supaya soal bawaan (data/soal.js) dengan id yang sama
  // juga ikut disembunyikan (karena file itu sendiri tidak bisa diubah dari browser).
  const deleted = readLocalDeletedSoal();
  if (!deleted.includes(id)) {
    deleted.push(id);
    localStorage.setItem(LOCAL_DELETED_SOAL_KEY, JSON.stringify(deleted));
  }
}

async function loadNilai() {
  if (CONFIG.dataSource === 'sheets') {
    return callApi('GET', 'nilai');
  }
  try {
    return JSON.parse(localStorage.getItem(LOCAL_NILAI_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

async function saveNilai(entry) {
  if (CONFIG.dataSource === 'sheets') {
    await callApi('POST', 'nilai', entry);
    return;
  }
  const list = JSON.parse(localStorage.getItem(LOCAL_NILAI_KEY) || '[]');
  list.push(Object.assign({ waktu: new Date().toISOString() }, entry));
  localStorage.setItem(LOCAL_NILAI_KEY, JSON.stringify(list));
}

// ---------- Komunikasi dengan Google Apps Script Web App ----------

async function callApi(method, action, payload) {
  if (method === 'GET') {
    const res = await fetch(`${CONFIG.apiUrl}?action=${action}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Gagal memuat data "${action}" dari Google Sheets (status ${res.status}).`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data || [];
  }

  // POST. Dikirim sebagai text/plain agar browser tidak melakukan CORS preflight
  // (Apps Script tidak menangani permintaan OPTIONS/preflight).
  const body = Object.assign({ type: action, secret: CONFIG.apiSecret }, payload);
  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gagal menyimpan data ke Google Sheets (status ${res.status}).`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}
