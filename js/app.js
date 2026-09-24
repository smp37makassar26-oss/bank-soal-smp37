// Logika utama aplikasi Bank Soal SMP.

const MAPEL_LIST = [
  { nama: 'Matematika', ikon: '🔢', warna: '#2f6fed' },
  { nama: 'IPA', ikon: '🔬', warna: '#17c3b2' },
  { nama: 'IPS', ikon: '🌍', warna: '#f2994a' },
  { nama: 'Bahasa Indonesia', ikon: '📖', warna: '#ec4899' },
  { nama: 'Bahasa Inggris', ikon: '🔤', warna: '#8b5cf6' },
  { nama: 'PPKn', ikon: '🇮🇩', warna: '#dc2626' }
];

const KELAS_LIST = ['7', '8', '9'];
const STUDENT_NAME_KEY = 'bankSoal:studentName';
const STUDENT_CLASS_KEY = 'bankSoal:studentClass';
const GURU_UNLOCKED_KEY = 'bankSoal:guruUnlocked';

const state = {
  questions: [],
  role: null, // 'siswa' | 'guru'
  guruMode: null, // 'kunci' | 'statistik' | 'leaderboard' -- menentukan tujuan setelah pilih mapel
  studentName: '',
  studentClass: '', // kelas/rombel bebas, contoh: "7A"
  kelas: null,
  mapel: null,
  babFilter: '', // '' berarti semua bab
  quizList: [],
  currentIndex: 0,
  answers: {},
  nilaiList: [],
  // Nilai default dipakai sementara sebelum loadPengaturanLatihan() selesai / kalau gagal dimuat.
  pengaturanLatihan: { jumlahSoal: 20, persenMudah: 40, persenSedang: 40, persenSulit: 20 }
};

const screens = {};
let elMain;
let selectedImageBase64 = '';
let existingImageUrl = '';
let editingQuestionId = null;

const MAX_IMAGE_DIMENSION = 1000;
const IMAGE_JPEG_QUALITY = 0.72;
const MAX_IMAGE_BASE64_LENGTH = 1500000; // ~1.1 MB file, aman untuk kuota Apps Script & data HP siswa

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Diamkan saja kalau gagal (mis. dibuka lewat file:// tanpa server) -- situs
      // tetap jalan normal, cuma tidak bisa "diinstall" ke homescreen.
    });
  });
}

async function init() {
  elMain = document.getElementById('app-main');
  document.querySelectorAll('.screen').forEach((el) => {
    screens[el.id] = el;
  });

  state.studentName = localStorage.getItem(STUDENT_NAME_KEY) || '';
  state.studentClass = localStorage.getItem(STUDENT_CLASS_KEY) || '';

  populateMapelSelects();
  wireStaticEvents();

  try {
    state.questions = await loadQuestions();
    try {
      // Pengaturan Latihan tidak wajib berhasil dimuat supaya siswa tetap bisa belajar
      // (pakai default di atas) kalau tab "Pengaturan" belum dibuat guru di Sheets.
      state.pengaturanLatihan = await loadPengaturanLatihan();
    } catch (err) {
      console.warn('Gagal memuat Pengaturan Latihan, pakai nilai default:', err.message);
    }
    showScreen('screen-home');
  } catch (err) {
    document.getElementById('error-message').textContent = err.message;
    showScreen('screen-error');
  }
}

function showScreen(id) {
  Object.values(screens).forEach((el) => el.classList.remove('active'));
  screens[id].classList.add('active');
  elMain.scrollTop = 0;
  window.scrollTo(0, 0);
}

function populateMapelSelects() {
  const tsMapel = document.getElementById('ts-mapel');
  const filterMapel = document.getElementById('nilai-filter-mapel');
  MAPEL_LIST.forEach((m) => {
    const opt1 = document.createElement('option');
    opt1.value = m.nama;
    opt1.textContent = m.nama;
    tsMapel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = m.nama;
    opt2.textContent = m.nama;
    filterMapel.appendChild(opt2);
  });
}

function wireStaticEvents() {
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.getAttribute('data-back')));
  });

  document.getElementById('btn-siswa').addEventListener('click', () => {
    state.role = 'siswa';
    if (state.studentName && state.studentClass) {
      renderKelasScreen();
      showScreen('screen-kelas');
    } else {
      showScreen('screen-nama');
    }
  });

  document.getElementById('form-nama').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-nama').value.trim();
    const kelasRombel = document.getElementById('input-kelas-rombel').value.trim();
    if (!name || !kelasRombel) return;
    state.studentName = name;
    state.studentClass = kelasRombel;
    localStorage.setItem(STUDENT_NAME_KEY, name);
    localStorage.setItem(STUDENT_CLASS_KEY, kelasRombel);
    renderKelasScreen();
    showScreen('screen-kelas');
  });

  document.getElementById('nama-badge').addEventListener('click', () => {
    if (state.role !== 'siswa') return;
    document.getElementById('input-nama').value = state.studentName;
    document.getElementById('input-kelas-rombel').value = state.studentClass;
    showScreen('screen-nama');
  });

  document.getElementById('btn-guru').addEventListener('click', () => {
    if (!CONFIG.guruPin || sessionStorage.getItem(GURU_UNLOCKED_KEY) === '1') {
      showScreen('screen-guru-menu');
    } else {
      document.getElementById('pin-error').textContent = '';
      document.getElementById('input-pin').value = '';
      showScreen('screen-guru-pin');
    }
  });

  document.getElementById('form-pin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('input-pin').value.trim();
    const errEl = document.getElementById('pin-error');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    errEl.textContent = '';

    let valid = false;
    try {
      valid = await checkGuruPin(pin);
    } catch (err) {
      errEl.textContent = 'Gagal memeriksa PIN: ' + err.message;
      btn.disabled = false;
      return;
    }
    btn.disabled = false;

    if (valid) {
      sessionStorage.setItem(GURU_UNLOCKED_KEY, '1');
      showScreen('screen-guru-menu');
    } else {
      errEl.textContent = 'PIN salah. Coba lagi.';
    }
  });

  document.getElementById('btn-menu-soal').addEventListener('click', () => {
    state.role = 'guru';
    state.guruMode = 'kunci';
    renderKelasScreen();
    showScreen('screen-kelas');
  });

  document.getElementById('btn-menu-nilai').addEventListener('click', openNilaiScreen);

  document.getElementById('btn-menu-import').addEventListener('click', () => {
    resetImportScreen();
    showScreen('screen-import-soal');
  });

  document.getElementById('btn-menu-statistik').addEventListener('click', () => {
    state.role = 'guru';
    state.guruMode = 'statistik';
    renderKelasScreen();
    showScreen('screen-kelas');
  });

  document.getElementById('btn-menu-leaderboard').addEventListener('click', () => {
    state.role = 'guru';
    state.guruMode = 'leaderboard';
    renderKelasScreen();
    showScreen('screen-kelas');
  });

  document.getElementById('btn-menu-pengaturan-latihan').addEventListener('click', () => {
    openPengaturanLatihanScreen();
  });

  document.getElementById('form-pengaturan-latihan').addEventListener('submit', handleSimpanPengaturanLatihan);

  document.getElementById('btn-quiz-prev').addEventListener('click', () => {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderQuizQuestion();
    }
  });

  document.getElementById('btn-quiz-next').addEventListener('click', handleQuizNext);

  document.getElementById('btn-hasil-ulangi').addEventListener('click', () => {
    startQuiz();
  });
  document.getElementById('btn-hasil-ganti-mapel').addEventListener('click', () => {
    renderMapelScreen();
    showScreen('screen-mapel');
  });

  document.getElementById('btn-buka-tambah-soal').addEventListener('click', () => openTambahSoal());
  document.getElementById('form-tambah-soal').addEventListener('submit', handleSimpanSoal);
  document.getElementById('ts-gambar-input').addEventListener('change', handleGambarDipilih);
  document.getElementById('btn-hapus-gambar').addEventListener('click', hapusGambarTerpilih);

  document.addEventListener('click', (e) => {
    const img = e.target.closest('.soal-gambar');
    if (img) openLightbox(img.src);
  });
  document.getElementById('lightbox').addEventListener('click', closeLightbox);

  document.getElementById('btn-back-tambah-soal').addEventListener('click', () => {
    renderKunci();
    showScreen('screen-kunci');
  });

  document.getElementById('btn-back-kunci').addEventListener('click', () => {
    renderMapelScreen();
    showScreen('screen-mapel');
  });

  document.getElementById('kunci-list').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-soal');
    if (editBtn) {
      const q = state.questions.find((qq) => qq.id === editBtn.dataset.id);
      if (q) openTambahSoal(q);
      return;
    }
    const delBtn = e.target.closest('.btn-hapus-soal');
    if (delBtn) {
      handleHapusSoal(delBtn.dataset.id);
    }
  });

  ['nilai-filter-kelas', 'nilai-filter-mapel', 'nilai-filter-nama'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderNilaiTable);
  });

  document.getElementById('btn-unduh-nilai').addEventListener('click', downloadNilaiCsv);

  document.getElementById('btn-unduh-template-csv').addEventListener('click', downloadTemplateCsv);
  document.getElementById('btn-mulai-import').addEventListener('click', handleMulaiImport);

  document.getElementById('btn-riwayat-siswa').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      state.nilaiList = await loadNilai();
      renderRiwayatSiswa();
      showScreen('screen-riwayat-siswa');
    } catch (err) {
      alert('Gagal memuat riwayat nilai: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('btn-lihat-leaderboard').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      state.nilaiList = await loadNilai();
      renderLeaderboard();
      showScreen('screen-leaderboard');
    } catch (err) {
      alert('Gagal memuat papan peringkat: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderKelasScreen() {
  const backBtn = document.querySelector('#screen-kelas .back-button');
  backBtn.setAttribute('data-back', state.role === 'guru' ? 'screen-guru-menu' : 'screen-home');

  const title = document.getElementById('kelas-title');
  title.textContent = state.role === 'siswa' ? 'Pilih Kelas Kamu' : 'Pilih Kelas (Mode Guru)';

  const namaBadge = document.getElementById('nama-badge');
  const riwayatBtn = document.getElementById('btn-riwayat-siswa');
  if (state.role === 'siswa') {
    namaBadge.hidden = false;
    namaBadge.textContent = `👤 ${state.studentName} (${state.studentClass}) · ganti nama`;
    riwayatBtn.hidden = false;
  } else {
    namaBadge.hidden = true;
    riwayatBtn.hidden = true;
  }

  const container = document.getElementById('kelas-list');
  container.innerHTML = '';
  KELAS_LIST.forEach((kelas) => {
    const btn = document.createElement('button');
    btn.className = 'pill-button';
    btn.textContent = `Kelas ${kelas}`;
    btn.addEventListener('click', () => {
      state.kelas = kelas;
      renderMapelScreen();
      showScreen('screen-mapel');
    });
    container.appendChild(btn);
  });
}

function renderMapelScreen() {
  const title = document.getElementById('mapel-title');
  title.textContent = `Kelas ${state.kelas} — Pilih Mata Pelajaran`;

  const container = document.getElementById('mapel-list');
  container.innerHTML = '';

  MAPEL_LIST.forEach((mapel) => {
    const count = state.questions.filter((q) => q.kelas === state.kelas && q.mapel === mapel.nama).length;
    const card = document.createElement('button');
    card.className = 'mapel-card';
    card.disabled = count === 0 && state.role === 'siswa';

    const lastScore = state.role === 'siswa' ? getLastScore(state.kelas, mapel.nama) : null;
    const badge = lastScore
      ? `<span class="mapel-badge">Terakhir: ${lastScore.score}/${lastScore.total}</span>`
      : '';

    card.innerHTML = `
      <span class="mapel-icon" style="background:${mapel.warna}1f; color:${mapel.warna}">${mapel.ikon}</span>
      <span class="mapel-name">${mapel.nama}</span>
      <span class="mapel-count">${count} soal</span>
      ${badge}
    `;

    card.addEventListener('click', async () => {
      state.mapel = mapel.nama;
      if (state.role === 'siswa') {
        renderBabScreen();
        showScreen('screen-bab');
      } else if (state.guruMode === 'statistik' || state.guruMode === 'leaderboard') {
        const target = state.guruMode;
        card.disabled = true;
        try {
          state.nilaiList = await loadNilai();
        } catch (err) {
          alert('Gagal memuat data nilai: ' + err.message);
          card.disabled = false;
          return;
        }
        card.disabled = false;
        if (target === 'statistik') {
          renderStatistik();
          showScreen('screen-statistik');
        } else {
          renderLeaderboard();
          showScreen('screen-leaderboard');
        }
      } else {
        renderKunci();
        showScreen('screen-kunci');
      }
    });

    container.appendChild(card);
  });
}

// ---------- MODE SISWA: PILIH BAB ----------

function renderBabScreen() {
  const soalMapel = state.questions.filter((q) => q.kelas === state.kelas && q.mapel === state.mapel);
  document.getElementById('bab-title').textContent = `${state.mapel} — Kelas ${state.kelas}`;

  const babSet = [];
  soalMapel.forEach((q) => {
    const nama = q.bab && q.bab.trim() ? q.bab.trim() : 'Lainnya';
    if (!babSet.includes(nama)) babSet.push(nama);
  });

  const container = document.getElementById('bab-list');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'bab-button';
  allBtn.innerHTML = `<span class="bab-name">📚 Semua Bab</span><span class="bab-count">${soalMapel.length} soal</span>`;
  allBtn.addEventListener('click', () => {
    state.babFilter = '';
    startQuiz();
  });
  container.appendChild(allBtn);

  babSet.forEach((bab) => {
    const count = soalMapel.filter((q) => (q.bab && q.bab.trim() ? q.bab.trim() : 'Lainnya') === bab).length;
    const btn = document.createElement('button');
    btn.className = 'bab-button';
    btn.innerHTML = `<span class="bab-name">${escapeHtml(bab)}</span><span class="bab-count">${count} soal</span>`;
    btn.addEventListener('click', () => {
      state.babFilter = bab;
      startQuiz();
    });
    container.appendChild(btn);
  });
}

// ---------- MODE SISWA: KUIS ----------

function startQuiz() {
  const poolDasar = state.questions.filter((q) => q.kelas === state.kelas && q.mapel === state.mapel);
  const jumlahSoal = state.pengaturanLatihan.jumlahSoal;
  const komposisi = {
    Mudah: state.pengaturanLatihan.persenMudah,
    Sedang: state.pengaturanLatihan.persenSedang,
    Sulit: state.pengaturanLatihan.persenSulit
  };

  let terpilih;
  if (!state.babFilter) {
    terpilih = pilihSoalSemuaBab(poolDasar, jumlahSoal, komposisi);
  } else {
    const babPool = poolDasar.filter((q) => (q.bab && q.bab.trim() ? q.bab.trim() : 'Lainnya') === state.babFilter);
    terpilih = pilihSoalKomposisi(babPool, jumlahSoal, komposisi);
  }

  // Acak urutan soal hasil seleksi, dan acak urutan opsi A-D per soal (per percobaan)
  // supaya siswa tidak bisa saling contek lewat "nomor sekian jawabannya X". Dipanggil
  // ulang tiap kali (termasuk saat klik "Ulangi Latihan") jadi hasilnya bisa berbeda-beda.
  state.quizList = shuffleArray(terpilih).map(shuffleQuestionOptions);
  state.currentIndex = 0;
  state.answers = {};

  if (state.quizList.length === 0) {
    renderKunciKosong();
    showScreen('screen-kunci');
    return;
  }

  renderQuizQuestion();
  showScreen('screen-quiz');
}

function shuffleArray(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const TINGKAT_LIST = ['Mudah', 'Sedang', 'Sulit'];

// Urutan tingkat lain dari yang paling dekat ke paling jauh -- dipakai untuk menutupi
// kekurangan jatah soal di suatu tingkat (mis. Sulit kurang -> ambil dari Sedang dulu,
// baru Mudah; Sedang kurang -> Mudah/Sulit sama-sama "tingkat terdekat").
function urutanTingkatTerdekat(tingkat) {
  const idx = TINGKAT_LIST.indexOf(tingkat);
  return TINGKAT_LIST
    .map((t, i) => ({ t, jarak: Math.abs(i - idx) }))
    .filter((x) => x.t !== tingkat)
    .sort((a, b) => a.jarak - b.jarak)
    .map((x) => x.t);
}

// Ambil `jumlah` soal dari `pool` mengikuti komposisi persentase tingkat kesulitan
// (komposisi = {Mudah, Sedang, Sulit} dalam %, total 100). Kalau pool tidak cukup,
// pakai semua; kalau suatu tingkat kurang, kekurangannya ditutup dari tingkat terdekat.
function pilihSoalKomposisi(pool, jumlah, komposisi) {
  if (pool.length <= jumlah) return pool.slice();

  // Jatah tiap tingkat dari persentase, dibulatkan; selisih pembulatan dibetulkan
  // di tingkat berpersentase terbesar supaya totalnya tetap pas `jumlah`.
  const jatah = {};
  let totalJatah = 0;
  TINGKAT_LIST.forEach((t) => {
    jatah[t] = Math.round((komposisi[t] / 100) * jumlah);
    totalJatah += jatah[t];
  });
  const selisih = jumlah - totalJatah;
  if (selisih !== 0) {
    const tingkatTerbesar = TINGKAT_LIST.slice().sort((a, b) => komposisi[b] - komposisi[a])[0];
    jatah[tingkatTerbesar] += selisih;
  }

  const poolByTingkat = {};
  TINGKAT_LIST.forEach((t) => {
    poolByTingkat[t] = shuffleArray(pool.filter((q) => q.tingkat === t));
  });

  const terpilih = [];
  const kekurangan = {};
  TINGKAT_LIST.forEach((t) => {
    const ambil = poolByTingkat[t].splice(0, jatah[t]);
    terpilih.push(...ambil);
    kekurangan[t] = jatah[t] - ambil.length;
  });

  TINGKAT_LIST.forEach((t) => {
    let kurang = kekurangan[t];
    if (kurang <= 0) return;
    const kandidat = urutanTingkatTerdekat(t);
    for (let i = 0; i < kandidat.length && kurang > 0; i++) {
      const ambil = poolByTingkat[kandidat[i]].splice(0, kurang);
      terpilih.push(...ambil);
      kurang -= ambil.length;
    }
  });

  return terpilih;
}

// Versi untuk pilihan siswa "Semua Bab": jatah soal dibagi rata ke tiap bab dulu (tiap
// bab tetap ikut komposisi tingkat lewat pilihSoalKomposisi), lalu kekurangan suatu bab
// (soalnya sedikit) ditutup dari sisa soal bab-bab lain.
function pilihSoalSemuaBab(pool, jumlah, komposisi) {
  if (pool.length <= jumlah) return pool.slice();

  const babMap = new Map();
  pool.forEach((q) => {
    const nama = q.bab && q.bab.trim() ? q.bab.trim() : 'Lainnya';
    if (!babMap.has(nama)) babMap.set(nama, []);
    babMap.get(nama).push(q);
  });
  const daftarBab = Array.from(babMap.keys());

  const jatahDasar = Math.floor(jumlah / daftarBab.length);
  let sisaBagi = jumlah % daftarBab.length;

  const terpilih = [];
  let sisaSemuaBab = [];
  let totalKurang = 0;

  daftarBab.forEach((nama) => {
    const jatahBab = jatahDasar + (sisaBagi > 0 ? 1 : 0);
    if (sisaBagi > 0) sisaBagi--;

    const babPool = babMap.get(nama);
    const ambil = pilihSoalKomposisi(babPool, jatahBab, komposisi);
    terpilih.push(...ambil);

    const idTerpakai = new Set(ambil.map((q) => q.id));
    sisaSemuaBab = sisaSemuaBab.concat(babPool.filter((q) => !idTerpakai.has(q.id)));
    totalKurang += jatahBab - ambil.length;
  });

  if (totalKurang > 0 && sisaSemuaBab.length > 0) {
    terpilih.push(...pilihSoalKomposisi(sisaSemuaBab, totalKurang, komposisi));
  }

  return terpilih;
}

// Mengembalikan salinan soal dengan urutan opsi A-D diacak (tanpa mengubah data asli
// di state.questions), sekaligus menyesuaikan huruf jawaban benar ke posisi barunya.
function shuffleQuestionOptions(q) {
  const letters = ['A', 'B', 'C', 'D'];
  const entries = shuffleArray(letters.map((l) => ({ text: q.opsi[l], benar: l === q.jawaban })));
  const opsi = {};
  let jawaban = q.jawaban;
  entries.forEach((entry, i) => {
    const newLetter = letters[i];
    opsi[newLetter] = entry.text;
    if (entry.benar) jawaban = newLetter;
  });
  return Object.assign({}, q, { opsi, jawaban });
}

function renderQuizQuestion() {
  const q = state.quizList[state.currentIndex];
  const total = state.quizList.length;
  const num = state.currentIndex + 1;

  document.getElementById('quiz-subject').textContent = `${state.mapel} — Kelas ${state.kelas}`;
  document.getElementById('quiz-progress-text').textContent = `Soal ${num} dari ${total}`;
  document.getElementById('quiz-progress-bar').style.width = `${(num / total) * 100}%`;
  document.getElementById('quiz-bab').textContent = q.bab ? `Bab: ${q.bab}` : '';
  document.getElementById('quiz-question').textContent = q.pertanyaan;
  document.getElementById('quiz-warning').hidden = true;

  const gambarEl = document.getElementById('quiz-gambar');
  if (q.gambar) {
    gambarEl.src = q.gambar;
    gambarEl.hidden = false;
  } else {
    gambarEl.hidden = true;
    gambarEl.src = '';
  }

  const dotsEl = document.getElementById('quiz-dots');
  dotsEl.innerHTML = '';
  state.quizList.forEach((qq, idx) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'quiz-dot';
    if (state.answers[qq.id]) dot.classList.add('answered');
    if (idx === state.currentIndex) dot.classList.add('current');
    dot.textContent = idx + 1;
    dot.addEventListener('click', () => {
      state.currentIndex = idx;
      renderQuizQuestion();
    });
    dotsEl.appendChild(dot);
  });

  const optionsEl = document.getElementById('quiz-options');
  optionsEl.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((letter) => {
    const chosen = state.answers[q.id] === letter;
    const btn = document.createElement('button');
    btn.className = 'option-button' + (chosen ? ' selected' : '');
    const letterSpan = document.createElement('span');
    letterSpan.className = 'option-letter';
    letterSpan.textContent = letter;
    const textSpan = document.createElement('span');
    textSpan.textContent = q.opsi[letter];
    btn.appendChild(letterSpan);
    btn.appendChild(textSpan);
    btn.addEventListener('click', () => {
      state.answers[q.id] = letter;
      renderQuizQuestion();
    });
    optionsEl.appendChild(btn);
  });

  const btnPrev = document.getElementById('btn-quiz-prev');
  const btnNext = document.getElementById('btn-quiz-next');
  btnPrev.style.visibility = state.currentIndex === 0 ? 'hidden' : 'visible';
  btnNext.textContent = num === total ? 'Selesai' : 'Berikutnya';
  btnNext.disabled = false;
}

function handleQuizNext() {
  const isLast = state.currentIndex === state.quizList.length - 1;
  if (!isLast) {
    state.currentIndex++;
    renderQuizQuestion();
    return;
  }

  const unansweredIndex = state.quizList.findIndex((q) => !state.answers[q.id]);
  if (unansweredIndex !== -1) {
    const sisa = state.quizList.filter((q) => !state.answers[q.id]).length;
    state.currentIndex = unansweredIndex;
    renderQuizQuestion();
    const warning = document.getElementById('quiz-warning');
    warning.textContent = `⚠️ Masih ada ${sisa} soal yang belum dijawab. Yuk dijawab dulu semuanya sebelum selesai.`;
    warning.hidden = false;
    return;
  }

  finishQuiz();
}

async function finishQuiz() {
  let score = 0;
  state.quizList.forEach((q) => {
    if (state.answers[q.id] === q.jawaban) score++;
  });
  const total = state.quizList.length;
  const percentage = Math.round((score / total) * 100);

  saveLastScore(state.kelas, state.mapel, score, total);

  const btnNext = document.getElementById('btn-quiz-next');
  btnNext.disabled = true;
  btnNext.textContent = 'Menyimpan...';

  let saveError = '';
  try {
    await saveNilai({
      nama: state.studentName,
      kelasRombel: state.studentClass,
      kelas: state.kelas,
      mapel: state.mapel,
      skor: score,
      total,
      persentase: percentage,
      detailJawaban: buildDetailJawaban()
    });
  } catch (err) {
    saveError = err.message;
  }

  renderHasil(score, total, saveError);
  showScreen('screen-hasil');
}

// Format: "<id_soal>:<jawaban_siswa>:<1 kalau benar/0 kalau salah>", dipisah ";".
// Pakai id (bukan nomor urut) karena sekarang urutan soal diacak per siswa/percobaan,
// jadi "soal nomor 3" bisa beda-beda soal antar siswa. Dipakai untuk fitur Statistik Soal.
function buildDetailJawaban() {
  return state.quizList
    .map((q) => {
      const jawabanSiswa = state.answers[q.id] || '-';
      const benar = jawabanSiswa === q.jawaban ? 1 : 0;
      return `${q.id}:${jawabanSiswa}:${benar}`;
    })
    .join(';');
}

function parseDetailJawaban(str) {
  if (!str) return [];
  return String(str)
    .split(';')
    .map((entry) => entry.split(':'))
    .filter((parts) => parts.length === 3)
    .map(([id, jawabanSiswa, benar]) => ({ id, jawabanSiswa, benar: benar === '1' }));
}

function renderHasil(score, total, saveError) {
  const percentage = Math.round((score / total) * 100);
  document.getElementById('hasil-subject').textContent = `${state.mapel} — Kelas ${state.kelas} — ${state.studentName}`;
  document.getElementById('hasil-score').textContent = `${score}/${total}`;
  document.getElementById('hasil-percentage').textContent = `${percentage}%`;

  let label = 'Terus semangat belajar! 💪';
  if (percentage === 100) label = 'Sempurna! Kamu hebat! 🎉';
  else if (percentage >= 80) label = 'Bagus sekali! 👏';
  else if (percentage >= 60) label = 'Sudah cukup baik, tingkatkan lagi! 🙂';
  document.getElementById('hasil-label').innerHTML = label + (saveError
    ? `<br><span class="error-text small-error">⚠️ Nilai belum tersimpan ke server: ${saveError}</span>`
    : '');

  const listEl = document.getElementById('hasil-list');
  listEl.innerHTML = '';

  state.quizList.forEach((q, idx) => {
    const userAnswer = state.answers[q.id];
    const isCorrect = userAnswer === q.jawaban;

    const item = document.createElement('div');
    item.className = 'hasil-item ' + (isCorrect ? 'correct' : 'incorrect');

    const userAnswerText = userAnswer ? `${userAnswer}. ${escapeHtml(q.opsi[userAnswer])}` : '(tidak dijawab)';
    const correctAnswerText = `${q.jawaban}. ${escapeHtml(q.opsi[q.jawaban])}`;

    item.innerHTML = `
      <div class="hasil-item-header">
        <span class="hasil-status">${isCorrect ? '✅ Benar' : '❌ Salah'}</span>
        <span class="hasil-number">Soal ${idx + 1}</span>
      </div>
      <p class="hasil-question">${escapeHtml(q.pertanyaan)}</p>
      ${q.gambar ? `<img class="soal-gambar" src="${escapeHtml(q.gambar)}" alt="Foto soal ${idx + 1}">` : ''}
      <p class="hasil-answer-row">Jawabanmu: <strong>${userAnswerText}</strong></p>
      ${!isCorrect ? `<p class="hasil-answer-row">Jawaban benar: <strong>${correctAnswerText}</strong></p>` : ''}
      <p class="hasil-pembahasan"><strong>Pembahasan:</strong> ${escapeHtml(q.pembahasan)}</p>
    `;
    listEl.appendChild(item);
  });
}

// ---------- MODE GURU: KUNCI JAWABAN ----------

function renderKunci() {
  const list = state.questions.filter((q) => q.kelas === state.kelas && q.mapel === state.mapel);
  document.getElementById('kunci-subject').textContent = `${state.mapel} — Kelas ${state.kelas} (${list.length} soal)`;

  const listEl = document.getElementById('kunci-list');
  listEl.innerHTML = '';

  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-message">Belum ada soal untuk kelas dan mapel ini. Klik "+ Tambah Soal" untuk menambahkan.</p>';
    return;
  }

  list.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'kunci-item';
    const optionsHtml = ['A', 'B', 'C', 'D']
      .map((letter) => {
        const isAnswer = letter === q.jawaban;
        return `<p class="kunci-option${isAnswer ? ' correct' : ''}">${letter}. ${escapeHtml(q.opsi[letter])}${isAnswer ? ' ✓' : ''}</p>`;
      })
      .join('');

    item.innerHTML = `
      <div class="hasil-item-header">
        <span class="hasil-number">Soal ${idx + 1}</span>
        ${q.bab ? `<span class="kunci-bab">${escapeHtml(q.bab)}</span>` : ''}
      </div>
      <p class="hasil-question">${escapeHtml(q.pertanyaan)}</p>
      ${q.gambar ? `<img class="soal-gambar" src="${escapeHtml(q.gambar)}" alt="Foto soal ${idx + 1}">` : ''}
      ${optionsHtml}
      <p class="hasil-pembahasan"><strong>Pembahasan:</strong> ${escapeHtml(q.pembahasan)}</p>
      <div class="kunci-item-actions">
        <button type="button" class="secondary-button small-button btn-edit-soal" data-id="${escapeHtml(q.id)}">✏️ Edit Soal</button>
        <button type="button" class="danger-button small-button btn-hapus-soal" data-id="${escapeHtml(q.id)}">🗑️ Hapus</button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

function renderKunciKosong() {
  document.getElementById('kunci-subject').textContent = `${state.mapel} — Kelas ${state.kelas}`;
  document.getElementById('kunci-list').innerHTML = '<p class="empty-message">Belum ada soal untuk kelas dan mapel ini.</p>';
}

async function handleHapusSoal(id) {
  const q = state.questions.find((qq) => qq.id === id);
  if (!q) return;
  const konfirmasi = confirm(`Hapus soal ini?\n\n"${q.pertanyaan.slice(0, 80)}${q.pertanyaan.length > 80 ? '...' : ''}"\n\nTindakan ini tidak bisa dibatalkan.`);
  if (!konfirmasi) return;

  try {
    await deleteQuestion(id);
    state.questions = state.questions.filter((qq) => qq.id !== id);
    renderKunci();
  } catch (err) {
    alert('Gagal menghapus soal: ' + err.message);
  }
}

// ---------- MODE GURU: TAMBAH SOAL ----------

function openTambahSoal(existing) {
  editingQuestionId = existing ? existing.id : null;

  document.getElementById('tambah-soal-title').textContent = existing ? 'Edit Soal' : 'Tambah Soal Baru';
  document.getElementById('btn-simpan-soal').textContent = existing ? 'Simpan Perubahan' : 'Simpan Soal';

  document.getElementById('ts-kelas').value = existing ? existing.kelas : (state.kelas || '7');
  document.getElementById('ts-mapel').value = existing ? existing.mapel : (state.mapel || MAPEL_LIST[0].nama);
  document.getElementById('ts-bab').value = existing ? existing.bab : '';
  document.getElementById('ts-tingkat').value = existing ? existing.tingkat : 'Sedang';
  document.getElementById('ts-pertanyaan').value = existing ? existing.pertanyaan : '';
  document.getElementById('ts-opsiA').value = existing ? existing.opsi.A : '';
  document.getElementById('ts-opsiB').value = existing ? existing.opsi.B : '';
  document.getElementById('ts-opsiC').value = existing ? existing.opsi.C : '';
  document.getElementById('ts-opsiD').value = existing ? existing.opsi.D : '';
  document.getElementById('ts-jawaban').value = existing ? existing.jawaban : 'A';
  document.getElementById('ts-pembahasan').value = existing ? existing.pembahasan : '';

  const msg = document.getElementById('ts-message');
  msg.hidden = true;
  msg.className = 'form-message';

  resetGambarState();
  if (existing && existing.gambar) {
    existingImageUrl = existing.gambar;
    document.getElementById('ts-gambar-preview').src = existing.gambar;
    document.getElementById('ts-gambar-preview-wrap').hidden = false;
  }

  showScreen('screen-tambah-soal');
}

// ---------- FOTO SOAL (upload, kompresi, lightbox) ----------

function handleGambarDipilih(e) {
  const file = e.target.files[0];
  if (!file) return;

  const hint = document.getElementById('ts-gambar-hint');
  hint.textContent = 'Memproses foto...';

  kompresGambar(file)
    .then((base64) => {
      if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
        hint.textContent = '⚠️ Foto masih terlalu besar setelah dikecilkan. Coba foto lain yang lebih sederhana.';
        e.target.value = '';
        return;
      }
      selectedImageBase64 = base64;
      existingImageUrl = ''; // foto baru menggantikan foto lama (kalau sedang mode edit)
      document.getElementById('ts-gambar-preview').src = base64;
      document.getElementById('ts-gambar-preview-wrap').hidden = false;
      hint.textContent = 'Boleh dikosongkan. Foto otomatis dikecilkan sebelum disimpan.';
    })
    .catch(() => {
      hint.textContent = '⚠️ Gagal memproses foto. Coba foto lain.';
      e.target.value = '';
    });
}

function resetGambarState() {
  selectedImageBase64 = '';
  existingImageUrl = '';
  document.getElementById('ts-gambar-input').value = '';
  document.getElementById('ts-gambar-preview').src = '';
  document.getElementById('ts-gambar-preview-wrap').hidden = true;
  document.getElementById('ts-gambar-hint').textContent = 'Boleh dikosongkan. Foto otomatis dikecilkan sebelum disimpan.';
}

function hapusGambarTerpilih() {
  resetGambarState();
}

function generateLocalId() {
  return 'soal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function kompresGambar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').hidden = false;
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.getElementById('lightbox-img').src = '';
}

async function handleSimpanSoal(e) {
  e.preventDefault();
  const isEditing = !!editingQuestionId;
  const payload = {
    id: editingQuestionId || generateLocalId(),
    kelas: document.getElementById('ts-kelas').value,
    mapel: document.getElementById('ts-mapel').value,
    bab: document.getElementById('ts-bab').value.trim(),
    tingkat: document.getElementById('ts-tingkat').value,
    pertanyaan: document.getElementById('ts-pertanyaan').value.trim(),
    opsiA: document.getElementById('ts-opsiA').value.trim(),
    opsiB: document.getElementById('ts-opsiB').value.trim(),
    opsiC: document.getElementById('ts-opsiC').value.trim(),
    opsiD: document.getElementById('ts-opsiD').value.trim(),
    jawaban: document.getElementById('ts-jawaban').value,
    pembahasan: document.getElementById('ts-pembahasan').value.trim(),
    // Foto baru (base64) diprioritaskan; kalau tidak ganti foto saat edit, kirim ulang
    // URL foto lama supaya tidak hilang; kalau memang dihapus, keduanya kosong.
    gambar: selectedImageBase64 || existingImageUrl
  };

  const msg = document.getElementById('ts-message');
  const btn = document.getElementById('btn-simpan-soal');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    if (isEditing) {
      await editQuestion(editingQuestionId, payload);
      const idx = state.questions.findIndex((q) => q.id === editingQuestionId);
      const normalized = normalizeQuestion(payload, idx === -1 ? state.questions.length : idx);
      if (idx !== -1) state.questions[idx] = normalized;
      else state.questions.push(normalized);
    } else {
      await addQuestion(payload);
      state.questions.push(normalizeQuestion(payload, state.questions.length));
    }

    msg.textContent = isEditing ? '✅ Perubahan disimpan!' : '✅ Soal berhasil disimpan!';
    msg.className = 'form-message success';
    msg.hidden = false;

    if (isEditing) {
      editingQuestionId = null;
      renderKunci();
      showScreen('screen-kunci');
    } else {
      ['ts-bab', 'ts-pertanyaan', 'ts-opsiA', 'ts-opsiB', 'ts-opsiC', 'ts-opsiD', 'ts-pembahasan'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      document.getElementById('ts-jawaban').value = 'A';
      document.getElementById('ts-tingkat').value = 'Sedang';
      resetGambarState();
      document.getElementById('ts-pertanyaan').focus();
    }
  } catch (err) {
    msg.textContent = '⚠️ Gagal menyimpan: ' + err.message;
    msg.className = 'form-message error';
    msg.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = isEditing ? 'Simpan Perubahan' : 'Simpan Soal';
  }
}

// ---------- MODE GURU: IMPORT SOAL MASSAL ----------

// Kolom "tingkat" ditaruh di akhir (opsional) supaya file CSV lama tanpa kolom itu tetap
// bisa diimport apa adanya -- baris tanpa kolom ke-11 otomatis dianggap "Sedang".
const IMPORT_COLUMNS = ['kelas', 'mapel', 'bab', 'pertanyaan', 'opsiA', 'opsiB', 'opsiC', 'opsiD', 'jawaban', 'pembahasan', 'tingkat'];

function resetImportScreen() {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-log').innerHTML = '';
  const status = document.getElementById('import-status');
  status.hidden = true;
  status.className = 'form-message';
}

function downloadTemplateCsv() {
  const headerRow = IMPORT_COLUMNS.join(',');
  const contoh = [
    '7', 'Matematika', 'Bilangan Bulat',
    'Hasil dari 5 + 3 adalah ...', '6', '7', '8', '9', 'C',
    'Karena 5 + 3 = 8.', 'Mudah'
  ].map(csvEscape).join(',');

  const csvContent = '﻿' + headerRow + '\r\n' + contoh + '\r\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template-import-soal.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Parser CSV sederhana (mendukung field berisi koma/baris baru kalau dibungkus tanda kutip).
function parseCsvSimple(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\r') { /* dilewati */ }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

async function handleMulaiImport() {
  const fileInput = document.getElementById('import-file-input');
  const textarea = document.getElementById('import-textarea');
  const status = document.getElementById('import-status');
  const log = document.getElementById('import-log');
  const btn = document.getElementById('btn-mulai-import');

  let text = textarea.value.trim();
  if (fileInput.files[0]) {
    text = await fileInput.files[0].text();
  }

  if (!text) {
    status.textContent = '⚠️ Belum ada data CSV yang ditempel/diupload.';
    status.className = 'form-message error';
    status.hidden = false;
    return;
  }

  let rows = parseCsvSimple(text);
  if (rows.length === 0) {
    status.textContent = '⚠️ Data CSV kosong atau tidak terbaca.';
    status.className = 'form-message error';
    status.hidden = false;
    return;
  }

  // Buang baris header kalau baris pertama memang berisi nama kolom (bukan data soal).
  const firstCellLower = String(rows[0][0] || '').trim().toLowerCase();
  if (firstCellLower === 'kelas') rows = rows.slice(1);

  btn.disabled = true;
  log.innerHTML = '';
  status.hidden = true;

  let berhasil = 0;
  const gagal = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const payload = {
      id: generateLocalId(),
      kelas: (r[0] || '').trim(),
      mapel: (r[1] || '').trim(),
      bab: (r[2] || '').trim(),
      pertanyaan: (r[3] || '').trim(),
      opsiA: (r[4] || '').trim(),
      opsiB: (r[5] || '').trim(),
      opsiC: (r[6] || '').trim(),
      opsiD: (r[7] || '').trim(),
      jawaban: (r[8] || '').trim().toUpperCase(),
      pembahasan: (r[9] || '').trim(),
      // Kolom ke-11, opsional: kalau kosong/tidak ada/tidak valid, dianggap "Sedang".
      tingkat: (r[10] || '').trim(),
      gambar: ''
    };

    const error = validateSoalRow(payload);
    btn.textContent = `Mengimpor ${i + 1}/${rows.length}...`;

    if (error) {
      gagal.push(`Baris ${i + 1}: ${error}`);
      continue;
    }

    try {
      await addQuestion(payload);
      state.questions.push(normalizeQuestion(payload, state.questions.length));
      berhasil++;
    } catch (err) {
      gagal.push(`Baris ${i + 1} ("${payload.pertanyaan.slice(0, 40)}..."): ${err.message}`);
    }
  }

  btn.disabled = false;
  btn.textContent = 'Mulai Import';

  status.textContent = `✅ ${berhasil} soal berhasil diimpor` + (gagal.length ? `, ${gagal.length} gagal (lihat detail di bawah).` : '.');
  status.className = 'form-message ' + (gagal.length ? 'error' : 'success');
  status.hidden = false;

  log.innerHTML = gagal.map((g) => `<p class="import-log-row">${escapeHtml(g)}</p>`).join('');
}

function validateSoalRow(payload) {
  if (!['7', '8', '9'].includes(payload.kelas)) return 'kolom kelas harus 7, 8, atau 9';
  if (!MAPEL_LIST.some((m) => m.nama === payload.mapel)) return 'kolom mapel tidak dikenali: "' + payload.mapel + '"';
  if (!payload.pertanyaan) return 'pertanyaan kosong';
  if (!payload.opsiA || !payload.opsiB || !payload.opsiC || !payload.opsiD) return 'ada opsi A-D yang kosong';
  if (!['A', 'B', 'C', 'D'].includes(payload.jawaban)) return 'kolom jawaban harus A, B, C, atau D';
  if (!payload.pembahasan) return 'pembahasan kosong';
  if (payload.tingkat && !['Mudah', 'Sedang', 'Sulit'].includes(payload.tingkat)) {
    return 'kolom tingkat harus Mudah, Sedang, Sulit, atau dikosongkan';
  }
  return null;
}

// ---------- MODE GURU: STATISTIK SOAL ----------

function renderStatistik() {
  const list = state.questions.filter((q) => q.kelas === state.kelas && q.mapel === state.mapel);
  document.getElementById('statistik-subject').textContent = `${state.mapel} — Kelas ${state.kelas}`;
  const listEl = document.getElementById('statistik-list');
  listEl.innerHTML = '';

  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-message">Belum ada soal untuk kelas dan mapel ini.</p>';
    return;
  }

  // Kumpulkan semua detailJawaban dari nilai yang relevan (kelas+mapel sama).
  const tally = {}; // id -> { benar, total }
  state.nilaiList
    .filter((r) => String(r.kelas) === state.kelas && String(r.mapel) === state.mapel)
    .forEach((r) => {
      parseDetailJawaban(r.detailjawaban || r.detailJawaban).forEach((entry) => {
        if (!tally[entry.id]) tally[entry.id] = { benar: 0, total: 0 };
        tally[entry.id].total++;
        if (entry.benar) tally[entry.id].benar++;
      });
    });

  const withStats = list.map((q) => {
    const t = tally[q.id] || { benar: 0, total: 0 };
    const persen = t.total > 0 ? Math.round((t.benar / t.total) * 100) : null;
    return { q, dijawab: t.total, benar: t.benar, persen };
  });

  // Urutkan: yang paling sering salah (persen terendah) di atas; yang belum pernah
  // dijawab siapa pun ditaruh paling bawah.
  withStats.sort((a, b) => {
    if (a.persen === null && b.persen === null) return 0;
    if (a.persen === null) return 1;
    if (b.persen === null) return -1;
    return a.persen - b.persen;
  });

  listEl.innerHTML = withStats.map((s, idx) => {
    const barColor = s.persen === null ? '#c7cadb' : s.persen < 50 ? '#dc2626' : s.persen < 75 ? '#f2994a' : '#17c3b2';
    const persenText = s.persen === null ? 'Belum ada data' : `${s.persen}% benar (${s.benar}/${s.dijawab} siswa)`;
    return `
      <div class="statistik-item">
        <div class="hasil-item-header">
          <span class="hasil-number">Soal ${idx + 1}</span>
          ${s.q.bab ? `<span class="kunci-bab">${escapeHtml(s.q.bab)}</span>` : ''}
        </div>
        <p class="hasil-question">${escapeHtml(s.q.pertanyaan)}</p>
        <div class="statistik-bar-row">
          <div class="statistik-bar-track"><div class="statistik-bar-fill" style="width:${s.persen === null ? 0 : s.persen}%; background:${barColor}"></div></div>
          <span class="statistik-bar-label">${persenText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- MODE GURU: PENGATURAN LATIHAN ----------

function openPengaturanLatihanScreen() {
  const p = state.pengaturanLatihan;
  document.getElementById('pl-jumlah-soal').value = p.jumlahSoal;
  document.getElementById('pl-persen-mudah').value = p.persenMudah;
  document.getElementById('pl-persen-sedang').value = p.persenSedang;
  document.getElementById('pl-persen-sulit').value = p.persenSulit;

  const msg = document.getElementById('pl-message');
  msg.hidden = true;
  msg.className = 'form-message';

  showScreen('screen-pengaturan-latihan');
}

async function handleSimpanPengaturanLatihan(e) {
  e.preventDefault();
  const msg = document.getElementById('pl-message');
  const btn = document.getElementById('btn-simpan-pengaturan');

  const payload = {
    jumlahSoal: Number(document.getElementById('pl-jumlah-soal').value),
    persenMudah: Number(document.getElementById('pl-persen-mudah').value),
    persenSedang: Number(document.getElementById('pl-persen-sedang').value),
    persenSulit: Number(document.getElementById('pl-persen-sulit').value)
  };

  if (!payload.jumlahSoal || payload.jumlahSoal < 1) {
    msg.textContent = '⚠️ Jumlah soal per latihan minimal 1.';
    msg.className = 'form-message error';
    msg.hidden = false;
    return;
  }
  if (payload.persenMudah + payload.persenSedang + payload.persenSulit !== 100) {
    msg.textContent = '⚠️ Total persentase Mudah + Sedang + Sulit harus 100%.';
    msg.className = 'form-message error';
    msg.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    await savePengaturanLatihan(payload);
    state.pengaturanLatihan = payload;
    msg.textContent = '✅ Pengaturan disimpan! Berlaku untuk semua siswa.';
    msg.className = 'form-message success';
    msg.hidden = false;
  } catch (err) {
    msg.textContent = '⚠️ Gagal menyimpan: ' + err.message;
    msg.className = 'form-message error';
    msg.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Pengaturan';
  }
}

// ---------- MODE GURU: REKAP NILAI ----------

async function openNilaiScreen() {
  showScreen('screen-nilai');
  const wrap = document.getElementById('nilai-table-wrap');
  wrap.innerHTML = '<p class="hint-text">Memuat data nilai...</p>';

  try {
    state.nilaiList = await loadNilai();
    renderNilaiTable();
    renderNilaiCharts();
  } catch (err) {
    wrap.innerHTML = `<p class="error-text">Gagal memuat nilai: ${err.message}</p>`;
  }
}

// Rata-rata dihitung dari SEMUA data nilai (tidak ikut filter tabel di bawahnya),
// supaya tetap jadi gambaran umum menyeluruh.
function renderNilaiCharts() {
  renderBarChart('nilai-chart-mapel', groupAverage(state.nilaiList, (r) => String(r.mapel || '')));
  renderBarChart('nilai-chart-kelas', groupAverage(state.nilaiList, (r) => r.kelas ? `Kelas ${r.kelas}` : ''));
}

function groupAverage(rows, keyFn) {
  const totals = {};
  rows.forEach((r) => {
    const key = keyFn(r);
    if (!key) return;
    const persen = Number(r.persentase);
    if (isNaN(persen)) return;
    if (!totals[key]) totals[key] = { sum: 0, count: 0 };
    totals[key].sum += persen;
    totals[key].count++;
  });
  return Object.keys(totals)
    .map((key) => ({ key, avg: Math.round(totals[key].sum / totals[key].count), count: totals[key].count }))
    .sort((a, b) => b.avg - a.avg);
}

function renderBarChart(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (data.length === 0) {
    el.innerHTML = '<p class="empty-message small-hint">Belum ada data.</p>';
    return;
  }
  el.innerHTML = data.map((d) => `
    <div class="bar-chart-row">
      <span class="bar-chart-label">${escapeHtml(d.key)}</span>
      <div class="bar-chart-track"><div class="bar-chart-fill" style="width:${d.avg}%"></div></div>
      <span class="bar-chart-value">${d.avg}%</span>
    </div>
  `).join('');
}

function getFilteredNilaiRows() {
  const kelasFilter = document.getElementById('nilai-filter-kelas').value;
  const mapelFilter = document.getElementById('nilai-filter-mapel').value;
  const namaFilter = document.getElementById('nilai-filter-nama').value.trim().toLowerCase();

  let rows = state.nilaiList.map((r) => ({
    waktu: r.waktu,
    nama: String(r.nama || ''),
    kelasRombel: String(r.kelasrombel || r.kelasRombel || ''),
    kelas: String(r.kelas || ''),
    mapel: String(r.mapel || ''),
    skor: r.skor,
    total: r.total,
    persentase: r.persentase,
    detailJawaban: String(r.detailjawaban || r.detailJawaban || '')
  }));

  if (kelasFilter) rows = rows.filter((r) => r.kelas === kelasFilter);
  if (mapelFilter) rows = rows.filter((r) => r.mapel === mapelFilter);
  if (namaFilter) rows = rows.filter((r) => r.nama.toLowerCase().includes(namaFilter));

  rows.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  return rows;
}

function renderNilaiTable() {
  const wrap = document.getElementById('nilai-table-wrap');
  const rows = getFilteredNilaiRows();

  if (rows.length === 0) {
    wrap.innerHTML = '<p class="empty-message">Belum ada data nilai yang cocok.</p>';
    return;
  }

  const rowsHtml = rows.map((r) => {
    const tanggal = r.waktu ? new Date(r.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    return `
      <tr>
        <td>${tanggal}</td>
        <td>${escapeHtml(r.nama)}</td>
        <td>${escapeHtml(r.kelasRombel)}</td>
        <td>${escapeHtml(r.mapel)}</td>
        <td>${r.skor}/${r.total}</td>
        <td>${r.persentase}%</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="nilai-table">
      <thead>
        <tr><th>Waktu</th><th>Nama</th><th>Kelas/Rombel</th><th>Mapel</th><th>Skor</th><th>%</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function downloadNilaiCsv() {
  const rows = getFilteredNilaiRows();
  if (rows.length === 0) {
    alert('Tidak ada data nilai untuk diunduh.');
    return;
  }

  const headers = ['Waktu', 'Nama', 'Kelas/Rombel', 'Kelas (Tingkat)', 'Mapel', 'Skor', 'Total', 'Persentase', 'Detail Jawaban'];
  const csvRows = [headers.map(csvEscape).join(',')];

  rows.forEach((r) => {
    const tanggal = r.waktu ? new Date(r.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    csvRows.push([
      tanggal, r.nama, r.kelasRombel, r.kelas, r.mapel, r.skor, r.total, r.persentase, humanizeDetailJawaban(r.detailJawaban)
    ].map(csvEscape).join(','));
  });

  const csvContent = '﻿' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap-nilai-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Ubah format mentah "id:jawaban:1;..." jadi teks yang enak dibaca di CSV, dengan
// mencari nama bab/pertanyaan tiap id-nya dari soal yang ada saat ini (kalau soal itu
// sudah dihapus, tetap ditampilkan pakai id-nya).
function humanizeDetailJawaban(detailStr) {
  const entries = parseDetailJawaban(detailStr);
  if (entries.length === 0) return '';
  return entries
    .map((entry, idx) => {
      const q = state.questions.find((qq) => qq.id === entry.id);
      const label = q ? (q.bab || `Soal ${idx + 1}`) : entry.id;
      return `${label}:${entry.jawabanSiswa}(${entry.benar ? 'Benar' : 'Salah'})`;
    })
    .join('; ');
}

function csvEscape(val) {
  const str = String(val === null || val === undefined ? '' : val);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- PAPAN PERINGKAT (leaderboard) ----------

function renderLeaderboard() {
  document.getElementById('leaderboard-subject').textContent = `${state.mapel} — Kelas ${state.kelas}`;
  const listEl = document.getElementById('leaderboard-list');

  const relevan = state.nilaiList.filter((r) => String(r.kelas) === state.kelas && String(r.mapel) === state.mapel);

  // Ambil nilai TERBAIK per siswa (nama + kelas/rombel), supaya siswa yang mengulang
  // latihan tidak dirugikan oleh percobaan pertamanya yang jelek.
  const bestPerSiswa = new Map();
  relevan.forEach((r) => {
    const nama = String(r.nama || '').trim();
    if (!nama) return;
    const rombel = String(r.kelasrombel || r.kelasRombel || '').trim();
    const key = nama.toLowerCase() + '|' + rombel.toLowerCase();
    const persen = Number(r.persentase) || 0;
    const existing = bestPerSiswa.get(key);
    if (!existing || persen > existing.persen) {
      bestPerSiswa.set(key, { nama, rombel, persen, skor: r.skor, total: r.total });
    }
  });

  const ranking = Array.from(bestPerSiswa.values()).sort((a, b) => b.persen - a.persen);

  if (ranking.length === 0) {
    listEl.innerHTML = '<p class="empty-message">Belum ada nilai untuk kelas dan mapel ini.</p>';
    return;
  }

  const medali = ['🥇', '🥈', '🥉'];
  listEl.innerHTML = ranking.map((r, idx) => `
    <div class="leaderboard-row${idx < 3 ? ' top' : ''}">
      <span class="leaderboard-rank">${medali[idx] || (idx + 1)}</span>
      <span class="leaderboard-nama">${escapeHtml(r.nama)}${r.rombel ? ` <span class="leaderboard-rombel">(${escapeHtml(r.rombel)})</span>` : ''}</span>
      <span class="leaderboard-skor">${r.skor}/${r.total} · ${r.persen}%</span>
    </div>
  `).join('');
}

// ---------- RIWAYAT NILAI SISWA ----------

function renderRiwayatSiswa() {
  document.getElementById('riwayat-subject').textContent = `${state.studentName} (${state.studentClass})`;
  const listEl = document.getElementById('riwayat-list');

  const namaLower = state.studentName.trim().toLowerCase();
  const rombelLower = state.studentClass.trim().toLowerCase();
  const milikSiswa = state.nilaiList
    .filter((r) => String(r.nama || '').trim().toLowerCase() === namaLower &&
      String(r.kelasrombel || r.kelasRombel || '').trim().toLowerCase() === rombelLower)
    .sort((a, b) => new Date(b.waktu) - new Date(a.waktu));

  if (milikSiswa.length === 0) {
    listEl.innerHTML = '<p class="empty-message">Belum ada riwayat nilai. Yuk mulai latihan!</p>';
    return;
  }

  listEl.innerHTML = milikSiswa.map((r) => {
    const tanggal = r.waktu ? new Date(r.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    return `
      <div class="riwayat-row">
        <div class="riwayat-row-top">
          <strong>${escapeHtml(String(r.mapel || ''))}</strong>
          <span>${r.skor}/${r.total} (${r.persentase}%)</span>
        </div>
        <span class="riwayat-row-date">Kelas ${escapeHtml(String(r.kelas || ''))} · ${tanggal}</span>
      </div>
    `;
  }).join('');
}

// ---------- LOCAL STORAGE (skor terakhir per perangkat) ----------

function scoreKey(kelas, mapel) {
  return `bankSoal:lastScore:${kelas}:${mapel}`;
}

function saveLastScore(kelas, mapel, score, total) {
  const data = { score, total, date: new Date().toISOString() };
  localStorage.setItem(scoreKey(kelas, mapel), JSON.stringify(data));
}

function getLastScore(kelas, mapel) {
  const raw = localStorage.getItem(scoreKey(kelas, mapel));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
