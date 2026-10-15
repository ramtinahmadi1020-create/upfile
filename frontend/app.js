// Frontend application logic.

const CHUNK_SIZE = 40 * 1024 * 1024;
const WARN_SIZE = 5 * 1024 * 1024 * 1024;
const MAX_PARALLEL_FILES = 3;

// ---------- i18n ----------
let lang = localStorage.getItem('lang') || 'fa';
let dict = {};
async function loadLang(l) {
  const res = await fetch(`/i18n/${l}.json`);
  dict = await res.json();
  lang = l;
  localStorage.setItem('lang', l);
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
  applyI18n();
}
function t(key) { return dict[key] || key; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

// ---------- SHA-256 incremental ----------
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function rotr(x,n){ return (x>>>n) | (x<<(32-n)); }
class Sha256 {
  constructor(){ this.h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]; this.buf=[]; this.len=0; }
  update(data){
    for(let i=0;i<data.length;i++){ this.buf.push(data[i]); this.len++; if(this.buf.length===64){ this.process(this.buf); this.buf=[]; } }
  }
  process(c){
    const w=new Array(64);
    for(let i=0;i<16;i++) w[i]=(c[i*4]<<24|c[i*4+1]<<16|c[i*4+2]<<8|c[i*4+3])>>>0;
    for(let i=16;i<64;i++){ const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3); const s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0; }
    let a=this.h[0],b=this.h[1],cc=this.h[2],d=this.h[3],e=this.h[4],f=this.h[5],g=this.h[6],h=this.h[7];
    for(let i=0;i<64;i++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^((~e)>>>0&g);
      const t1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&cc)^(b&cc);
      const t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=cc;cc=b;b=a;a=(t1+t2)>>>0;
    }
    this.h[0]=(this.h[0]+a)>>>0; this.h[1]=(this.h[1]+b)>>>0; this.h[2]=(this.h[2]+cc)>>>0; this.h[3]=(this.h[3]+d)>>>0;
    this.h[4]=(this.h[4]+e)>>>0; this.h[5]=(this.h[5]+f)>>>0; this.h[6]=(this.h[6]+g)>>>0; this.h[7]=(this.h[7]+h)>>>0;
  }
  finalize(){
    const bitLen=this.len*8;
    this.update(new Uint8Array([0x80]));
    while(this.buf.length % 64 !== 56) this.update(new Uint8Array([0]));
    const lenBytes=new Uint8Array(8);
    let high=Math.floor(bitLen/0x100000000);
    let low=bitLen>>>0;
    for(let i=3;i>=0;i--){ lenBytes[i]=high&0xff; high>>>=8; }
    for(let i=7;i>=4;i--){ lenBytes[i]=low&0xff; low>>>=8; }
    this.update(lenBytes);
    return this.h.map(x=>x.toString(16).padStart(8,'0')).join('');
  }
}
async function sha256File(file, onProgress) {
  const sha = new Sha256();
  const sliceSize = 2 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + sliceSize, file.size);
    const buf = await file.slice(offset, end).arrayBuffer();
    sha.update(new Uint8Array(buf));
    offset = end;
    if (onProgress) onProgress(offset / file.size);
    // yield
    await new Promise((r) => setTimeout(r, 0));
  }
  return sha.finalize();
}

// ---------- Toast ----------
function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------- API helpers ----------
async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', ...opts });
  let data = null;
  try { data = await res.json(); } catch {}
  return { res, data };
}

// ---------- Auth state ----------
let currentUser = null;
async function refreshUser() {
  const { res, data } = await api('/api/auth/me');
  if (res.ok && data?.success) {
    currentUser = data.data;
  } else {
    currentUser = null;
  }
  updateAuthUI();
}
function updateAuthUI() {
  const profileSection = document.getElementById('profile-content');
  if (!profileSection) return;
  if (currentUser) {
    profileSection.innerHTML = `
      <div class="profile-info">
        <div><strong>${t('username')}:</strong> ${escapeHtml(currentUser.username)}</div>
        <div><strong>ID:</strong> ${currentUser.user_id}</div>
      </div>
      <div style="margin-top:16px;">
        <h4>${t('api_section')}</h4>
        <p class="small muted">${t('api_docs')}</p>
        <code style="display:block;padding:8px;background:var(--bg2);border-radius:6px;margin-top:8px;">${location.origin}/api</code>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-ghost" id="logout-btn">${t('logout')}</button>
      </div>
    `;
    document.getElementById('logout-btn').onclick = doLogout;
  } else {
    profileSection.innerHTML = `
      <div class="form">
        <input class="input" id="auth-username" placeholder="${t('username')}" />
        <input class="input" id="auth-password" type="password" placeholder="${t('password')}" />
        <div class="form-row">
          <button class="btn" id="login-btn">${t('login')}</button>
          <button class="btn btn-ghost" id="register-btn">${t('register')}</button>
        </div>
        <div id="auth-extra" class="hidden">
          <input class="input" id="auth-password2" type="password" placeholder="${t('password2')}" />
        </div>
      </div>
    `;
    let registerMode = false;
    document.getElementById('register-btn').onclick = () => {
      registerMode = true;
      document.getElementById('auth-extra').classList.remove('hidden');
      document.getElementById('login-btn').textContent = t('register');
    };
    document.getElementById('login-btn').onclick = async () => {
      const username = document.getElementById('auth-username').value;
      const password = document.getElementById('auth-password').value;
      if (registerMode) {
        const password2 = document.getElementById('auth-password2').value;
        const { res, data } = await api('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, password2 }),
        });
        if (res.ok && data?.success) { toast(t('success')); await refreshUser(); }
        else toast(data?.error?.message || t('error'), 'error');
      } else {
        const { res, data } = await api('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (res.ok && data?.success) { toast(t('success')); await refreshUser(); }
        else toast(data?.error?.message || t('error'), 'error');
      }
    };
  }
}
async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  updateAuthUI();
  toast(t('toast_ok'));
}

// ---------- Upload management ----------
const uploadQueue = [];
let activeUploads = 0;

function enqueueUpload(file) {
  uploadQueue.push(file);
  pumpQueue();
}

function pumpQueue() {
  while (activeUploads < MAX_PARALLEL_FILES && uploadQueue.length > 0) {
    const f = uploadQueue.shift();
    activeUploads++;
    runUpload(f).finally(() => { activeUploads--; pumpQueue(); });
  }
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}
function formatTime(s) {
  if (!isFinite(s) || s < 0) return '--';
  if (s < 60) return Math.ceil(s) + 's';
  const m = Math.floor(s/60); const sec = Math.ceil(s%60);
  return m + 'm ' + sec + 's';
}

async function runUpload(file) {
  const card = createProgressCard(file);
  const container = document.getElementById('progress-container');
  container.appendChild(card.el);

  // checksum
  card.status.textContent = t('checksum_calc');
  let fileHash = '';
  try {
    fileHash = await sha256File(file, (p) => {
      card.checksumBar.style.width = (p*100).toFixed(1) + '%';
    });
  } catch (e) {
    toast(t('error'), 'error');
    card.el.remove();
    return;
  }
  card.checksumWrap.classList.add('hidden');

  // check resume in localStorage
  const stored = JSON.parse(localStorage.getItem('upload:' + fileHash) || 'null');
  let sessionId = stored?.sessionId;
  let fileId = stored?.fileId;
  let existingChunks = [];

  // init
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
  if (file.size > WARN_SIZE) card.warn.classList.remove('hidden');

  const initRes = await api('/api/upload/init', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, mime_type: file.type || 'application/octet-stream', file_hash: fileHash, total_chunks: totalChunks, is_public: 0 }),
  });
  if (!initRes.res.ok || !initRes.data?.success) {
    toast(initRes.data?.error?.message || t('error'), 'error');
    card.el.remove();
    return;
  }
  sessionId = initRes.data.data.session_id;
  fileId = initRes.data.data.file_id;
  existingChunks = initRes.data.data.existing_chunks || [];
  localStorage.setItem('upload:' + fileHash, JSON.stringify({ sessionId, fileId, name: file.name, size: file.size }));

  // resume prompt if stored had progress
  if (stored && existingChunks.length > 0 && existingChunks.length < totalChunks) {
    // already resuming silently using existing_chunks
  }

  card.status.textContent = '';

  // upload chunks
  const chunkStatus = new Array(totalChunks).fill(false);
  existingChunks.forEach((i) => { chunkStatus[i] = true; });
  let uploadedBytes = existingChunks.length * CHUNK_SIZE;
  if (uploadedBytes > file.size) uploadedBytes = file.size;
  const startTime = Date.now();
  let lastBytes = uploadedBytes;
  let lastTime = startTime;

  function updateProgress(doneChunks) {
    const pct = Math.min(100, (uploadedBytes / file.size) * 100);
    card.bar.style.width = pct.toFixed(1) + '%';
    card.pct.textContent = pct.toFixed(1) + '%';
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    if (dt >= 0.5) {
      const speed = (uploadedBytes - lastBytes) / dt / 1024 / 1024;
      card.speed.textContent = speed.toFixed(2) + ' MB/s';
      const remaining = (file.size - uploadedBytes) / (Math.max(speed,0.001)*1024*1024);
      card.eta.textContent = formatTime(remaining);
      lastBytes = uploadedBytes;
      lastTime = now;
    }
    card.uploaded.textContent = formatBytes(uploadedBytes) + ' / ' + formatBytes(file.size);
    card.chunks.textContent = doneChunks + ' / ' + totalChunks;
  }
  updateProgress(existingChunks.length);

  for (let i = 0; i < totalChunks; i++) {
    if (chunkStatus[i]) continue;
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const chunkHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

    let attempts = 0;
    let success = false;
    while (attempts < 3 && !success) {
      attempts++;
      try {
        const form = new FormData();
        form.append('session_id', sessionId);
        form.append('chunk_index', String(i));
        form.append('chunk_hash', chunkHash);
        form.append('data', new Blob([buf]), `chunk_${i}`);
        const { res, data } = await api('/api/upload/chunk', { method: 'POST', body: form });
        if (res.ok && data?.success) {
          success = true;
          chunkStatus[i] = true;
          uploadedBytes += (end - start);
          const doneChunks = chunkStatus.filter(Boolean).length;
          updateProgress(doneChunks);
        } else {
          if (data?.error?.code === 'CHUNK_CORRUPTED') throw new Error('corrupt');
          throw new Error(data?.error?.message || 'fail');
        }
      } catch (e) {
        if (attempts >= 3) {
          toast(t('error') + ': chunk ' + i, 'error');
          // allow resume later
          card.el.querySelector('.status').textContent = 'Paused';
          return;
        }
        const delay = [1000, 3000, 5000][attempts - 1] + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // complete
  const doneChunks = chunkStatus.filter(Boolean).length;
  if (doneChunks < totalChunks) return;
  const compRes = await api('/api/upload/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, final_checksum: fileHash }),
  });
  if (compRes.res.ok && compRes.data?.success) {
    localStorage.removeItem('upload:' + fileHash);
    const url = location.origin + compRes.data.data.url;
    addLinkRow(file.name, file.size, url);
    toast(t('success'));
    card.status.textContent = 'Done';
  } else {
    toast(compRes.data?.error?.message || t('error'), 'error');
  }
}

function createProgressCard(file) {
  const el = document.createElement('div');
  el.className = 'progress-card';
  el.innerHTML = `
    <div class="progress-name">${escapeHtml(file.name)}</div>
    <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
    <div class="warn-text hidden">${t('upload_large_warn')}</div>
    <div class="progress-meta">
      <span class="pct">0%</span>
      <span class="speed">--</span>
      <span class="uploaded">--</span>
      <span class="eta">--</span>
      <span class="chunks">0 / 0</span>
    </div>
    <div class="checksum-wrap" style="margin-top:8px;">
      <div class="small muted">${t('checksum_calc')}</div>
      <div class="progress-bar" style="margin-top:4px;"><div class="progress-fill checksum-fill" style="width:0%"></div></div>
    </div>
    <div class="status small muted"></div>
  `;
  const bar = el.querySelector('.progress-fill');
  const checksumBar = el.querySelector('.checksum-fill');
  const checksumWrap = el.querySelector('.checksum-wrap');
  const warn = el.querySelector('.warn-text');
  const pct = el.querySelector('.pct');
  const speed = el.querySelector('.speed');
  const uploaded = el.querySelector('.uploaded');
  const eta = el.querySelector('.eta');
  const chunks = el.querySelector('.chunks');
  const status = el.querySelector('.status');
  // label prefixes
  pct.previousSibling && (pct.previousSibling.textContent = '');
  return { el, bar, checksumBar, checksumWrap, warn, pct, speed, uploaded, eta, chunks, status };
}

// ---------- Links ----------
function addLinkRow(name, size, url) {
  const tbody = document.getElementById('links-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="name">${escapeHtml(name)}</td>
    <td>${formatBytes(size)}</td>
    <td><a href="${url}" target="_blank">${url}</a></td>
    <td><button class="copy-btn">${t('copy')}</button></td>
  `;
  tr.querySelector('.copy-btn').onclick = () => copyText(url);
  tbody.prepend(tr);
}

async function loadUserFiles() {
  const { res, data } = await api('/api/files');
  if (!res.ok || !data?.success) return;
  const tbody = document.getElementById('links-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const f of data.data) {
    const url = location.origin + '/f/' + f.id;
    addLinkRow(f.name, f.size, url);
  }
  if (data.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">${t('no_files')}</td></tr>`;
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('copied'))).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(t('copied'));
  });
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await loadLang(lang);

  // header lang switch
  const langBtn = document.getElementById('lang-switch');
  if (langBtn) {
    langBtn.textContent = t('lang_switch');
    langBtn.onclick = async () => { await loadLang(lang === 'fa' ? 'en' : 'fa'); langBtn.textContent = t('lang_switch'); };
  }

  // dropzone
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault(); dropzone.classList.remove('drag');
      [...e.dataTransfer.files].forEach(enqueueUpload);
    });
    fileInput.addEventListener('change', (e) => {
      [...e.target.files].forEach(enqueueUpload);
      e.target.value = '';
    });
  }

  await refreshUser();
  if (currentUser) loadUserFiles();
});
