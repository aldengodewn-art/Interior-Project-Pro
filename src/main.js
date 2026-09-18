import './styles.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MODE_META = {
  photography: {
    label: 'Photography',
    icon: '◉',
    subtitle: 'Photography critique',
    headline: 'A quieter way to read an image.',
    description: 'Composition, light, color, depth, technical quality, and visual story, translated into useful edits.',
    criteria: ['Composition', 'Subject placement', 'Light / exposure', 'Color', 'Depth', 'Technical quality', 'Story / mood'],
  },
  interior: {
    label: 'Interior',
    icon: '⌂',
    subtitle: 'Interior critique',
    headline: 'See what the room is already saying.',
    description: 'Layout, circulation, lighting, palette, proportion, materials, styling, and practicality, without the showroom fluff.',
    criteria: ['Layout', 'Space use', 'Lighting', 'Color palette', 'Furniture proportion', 'Materials', 'Styling', 'Practicality'],
  },
};

const state = {
  health: null,
  samples: [],
  mode: 'interior',
  compareMode: false,
  primary: null,
  secondary: null,
  result: null,
  history: [],
  historyFilter: 'all',
  busy: false,
  shareUrl: '',
  abortController: null,
  loadingTimer: null,
};

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <div class="shell">
    <header class="topbar">
      <a class="brand-wrap" href="#top" aria-label="Interior Project Pro home">
        <img class="brand-icon" src="/app-icon.png" alt="Interior Project Pro app icon" />
        <div>
          <div class="eyebrow">Soft Interior Editorial</div>
          <h1>Interior Project Pro</h1>
        </div>
      </a>

      <div class="status-group">
        <div id="networkPill" class="status-pill subtle">Online</div>
        <div id="healthPill" class="status-pill">Checking studio…</div>
      </div>
    </header>

    <main class="main-grid" id="top">
      <section class="hero card editorial-card">
        <div class="hero-copy">
          <div class="section-kicker" id="modeSubtitle"></div>
          <h2 id="modeHeadline"></h2>
          <p id="modeDescription"></p>
          <div class="hero-note">Thoughtful scoring. Specific feedback. No generic “looks good” fog.</div>
        </div>

        <div class="hero-actions">
          <div class="mode-grid" role="tablist" aria-label="Analysis mode">
            <button type="button" class="mode-btn" data-mode="photography">
              <span class="mode-symbol">◉</span>
              <span><strong>Photography</strong><small>Frame, light, story</small></span>
            </button>
            <button type="button" class="mode-btn is-active" data-mode="interior">
              <span class="mode-symbol">⌂</span>
              <span><strong>Interior</strong><small>Space, style, function</small></span>
            </button>
          </div>

          <label class="switch-line">
            <input type="checkbox" id="compareToggle" />
            <span class="switch-ui" aria-hidden="true"></span>
            <span><strong>Comparison mode</strong><small>Before / after or image A / B</small></span>
          </label>
        </div>
      </section>

      <section id="globalNotice" class="notice" aria-live="polite"></section>

      <section class="workspace-grid">
        <div class="card upload-card">
          <div class="upload-head">
            <div>
              <div class="section-kicker">Image A</div>
              <h3>Primary image</h3>
            </div>
            <div class="upload-actions-inline">
              <button class="icon-text-btn" id="removeA" type="button" hidden>Remove</button>
              <label class="file-btn">
                <input type="file" id="fileA" accept="image/jpeg,image/png,image/webp" />
                <span>Choose image</span>
              </label>
            </div>
          </div>
          <div class="drop-preview" id="previewA" tabindex="0" role="button" aria-label="Choose or drop image A">
            <div class="placeholder">
              <span class="upload-mark">＋</span>
              <strong>Choose or drop an image</strong>
              <span>JPG, PNG, or WEBP · up to 10 MB</span>
            </div>
          </div>
          <div class="input-meta" id="metaA">No image selected</div>
        </div>

        <div class="card upload-card" id="cardB" hidden>
          <div class="upload-head">
            <div>
              <div class="section-kicker">Image B</div>
              <h3>Comparison image</h3>
            </div>
            <div class="upload-actions-inline">
              <button class="icon-text-btn" id="removeB" type="button" hidden>Remove</button>
              <label class="file-btn">
                <input type="file" id="fileB" accept="image/jpeg,image/png,image/webp" />
                <span>Choose image</span>
              </label>
            </div>
          </div>
          <div class="drop-preview" id="previewB" tabindex="0" role="button" aria-label="Choose or drop image B">
            <div class="placeholder">
              <span class="upload-mark">＋</span>
              <strong>Add the second image</strong>
              <span>Use the same scene for a cleaner before / after comparison.</span>
            </div>
          </div>
          <div class="input-meta" id="metaB">No image selected</div>
        </div>

        <aside class="card info-card">
          <div class="section-kicker">Editorial checklist</div>
          <h3 id="checklistHeading">What gets reviewed</h3>
          <ul class="criteria-list" id="criteriaList"></ul>
          <button type="button" class="primary-btn" id="analyzeBtn" disabled>
            <span>Analyze image</span><span aria-hidden="true">↗</span>
          </button>
          <p class="tiny-note">Images are sent through your backend for analysis. The app stores result text in SQLite, not the uploaded image itself.</p>
        </aside>
      </section>

      <section class="card samples-card">
        <div class="section-title-row">
          <div>
            <div class="section-kicker">Try it immediately</div>
            <h3>Bundled sample images</h3>
          </div>
          <p class="section-caption">Useful for demos and grading without hunting for photos.</p>
        </div>
        <div id="samplesGrid" class="samples-grid"></div>
      </section>

      <section id="loadingCard" class="card loading-card" hidden>
        <div class="loading-visual">
          <div class="spinner"></div>
          <span class="loading-number">AI</span>
        </div>
        <div class="loading-copy">
          <div class="section-kicker">In review</div>
          <h3 id="loadingTitle">Reading the image…</h3>
          <p id="loadingText">Starting the visual analysis.</p>
          <div class="loading-track"><span></span></div>
        </div>
        <button type="button" class="small-btn ghost-btn" id="cancelBtn">Cancel</button>
      </section>

      <section id="resultsSection" class="results-grid" hidden>
        <div class="card score-card editorial-card">
          <div class="score-circle" id="scoreCircle">
            <div class="score-inner">
              <span id="overallScore">0</span><small>/100</small>
            </div>
          </div>
          <div class="score-copy">
            <div class="section-kicker" id="resultModeLine">Interior result</div>
            <h3 id="resultHeadline">Result headline</h3>
            <p id="resultSummary">Summary</p>
            <div class="score-label" id="scoreLabel">Balanced</div>
          </div>
        </div>

        <div class="card action-toolbar">
          <div class="toolbar-title">
            <div class="section-kicker">Result tools</div>
            <h3>Keep or share the review</h3>
          </div>
          <div class="toolbar-buttons">
            <button class="small-btn accent-btn" id="shareBtn" type="button">Share</button>
            <button class="small-btn" id="exportJsonBtn" type="button">JSON</button>
            <button class="small-btn" id="exportTxtBtn" type="button">TXT</button>
            <button class="small-btn" id="exportHtmlBtn" type="button">HTML</button>
            <button class="small-btn" id="exportCsvBtn" type="button">CSV</button>
          </div>
        </div>

        <div class="summary-two full-width">
          <div class="card summary-card good-summary">
            <div class="summary-icon">✓</div>
            <div><div class="section-kicker">Strongest quality</div><h3 id="bestQuality">-</h3></div>
          </div>
          <div class="card summary-card focus-summary">
            <div class="summary-icon">↗</div>
            <div><div class="section-kicker">Priority improvement</div><h3 id="priorityFix">-</h3></div>
          </div>
        </div>

        <div class="card full-width">
          <div class="section-title-row result-heading-row">
            <div>
              <div class="section-kicker">The numbers, explained</div>
              <h3>Score breakdown</h3>
            </div>
            <span class="section-caption">Open “Why this score?” for the detail behind each number.</span>
          </div>
          <div id="criteriaBreakdown" class="metrics-grid"></div>
        </div>

        <div class="card feedback-card strengths-card">
          <div class="section-title-row"><div><div class="section-kicker">Keep</div><h3>What already works</h3></div></div>
          <ul id="strengthList" class="bullets"></ul>
        </div>

        <div class="card feedback-card actions-card">
          <div class="section-title-row"><div><div class="section-kicker">Refine</div><h3>What to do next</h3></div></div>
          <ul id="actionsList" class="bullets numbered"></ul>
        </div>

        <div class="card full-width" id="comparisonCard" hidden>
          <div class="section-title-row result-heading-row">
            <div><div class="section-kicker">A / B review</div><h3>Comparison result</h3></div>
            <span class="comparison-winner" id="comparisonWinner"></span>
          </div>
          <div class="compare-banner" id="comparisonBanner"></div>
          <div id="comparisonGrid" class="comparison-grid"></div>
        </div>
      </section>

      <section class="card history-card">
        <div class="section-title-row history-title-row">
          <div>
            <div class="section-kicker">Your local archive</div>
            <h3>Recent analyses</h3>
          </div>
          <div class="history-tools">
            <div class="filter-chips" aria-label="History filters">
              <button class="filter-chip is-active" type="button" data-history-filter="all">All</button>
              <button class="filter-chip" type="button" data-history-filter="interior">Interior</button>
              <button class="filter-chip" type="button" data-history-filter="photography">Photography</button>
            </div>
            <button id="clearHistoryBtn" type="button" class="small-btn danger-btn">Clear all</button>
          </div>
        </div>
        <div id="historyGrid" class="history-grid"></div>
      </section>

      <footer class="footer-note">
        <span>Interior Project Pro</span>
        <span>Soft Interior Editorial edition</span>
      </footer>
    </main>
  </div>
`;

const els = {
  healthPill: document.querySelector('#healthPill'),
  networkPill: document.querySelector('#networkPill'),
  modeSubtitle: document.querySelector('#modeSubtitle'),
  modeHeadline: document.querySelector('#modeHeadline'),
  modeDescription: document.querySelector('#modeDescription'),
  compareToggle: document.querySelector('#compareToggle'),
  cardB: document.querySelector('#cardB'),
  fileA: document.querySelector('#fileA'),
  fileB: document.querySelector('#fileB'),
  previewA: document.querySelector('#previewA'),
  previewB: document.querySelector('#previewB'),
  metaA: document.querySelector('#metaA'),
  metaB: document.querySelector('#metaB'),
  removeA: document.querySelector('#removeA'),
  removeB: document.querySelector('#removeB'),
  criteriaList: document.querySelector('#criteriaList'),
  analyzeBtn: document.querySelector('#analyzeBtn'),
  samplesGrid: document.querySelector('#samplesGrid'),
  loadingCard: document.querySelector('#loadingCard'),
  loadingTitle: document.querySelector('#loadingTitle'),
  loadingText: document.querySelector('#loadingText'),
  cancelBtn: document.querySelector('#cancelBtn'),
  globalNotice: document.querySelector('#globalNotice'),
  resultsSection: document.querySelector('#resultsSection'),
  scoreCircle: document.querySelector('#scoreCircle'),
  overallScore: document.querySelector('#overallScore'),
  scoreLabel: document.querySelector('#scoreLabel'),
  resultModeLine: document.querySelector('#resultModeLine'),
  resultHeadline: document.querySelector('#resultHeadline'),
  resultSummary: document.querySelector('#resultSummary'),
  bestQuality: document.querySelector('#bestQuality'),
  priorityFix: document.querySelector('#priorityFix'),
  criteriaBreakdown: document.querySelector('#criteriaBreakdown'),
  strengthList: document.querySelector('#strengthList'),
  actionsList: document.querySelector('#actionsList'),
  comparisonCard: document.querySelector('#comparisonCard'),
  comparisonWinner: document.querySelector('#comparisonWinner'),
  comparisonBanner: document.querySelector('#comparisonBanner'),
  comparisonGrid: document.querySelector('#comparisonGrid'),
  historyGrid: document.querySelector('#historyGrid'),
  shareBtn: document.querySelector('#shareBtn'),
  exportJsonBtn: document.querySelector('#exportJsonBtn'),
  exportTxtBtn: document.querySelector('#exportTxtBtn'),
  exportHtmlBtn: document.querySelector('#exportHtmlBtn'),
  exportCsvBtn: document.querySelector('#exportCsvBtn'),
  clearHistoryBtn: document.querySelector('#clearHistoryBtn'),
};

bindEvents();
renderMode();
updateNetworkState();
init();

async function init() {
  await Promise.all([loadHealth(), loadSamples(), loadHistory()]);
}

function bindEvents() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderMode();
      clearNotice();
    });
  });

  document.querySelectorAll('[data-history-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.historyFilter = btn.dataset.historyFilter;
      document.querySelectorAll('[data-history-filter]').forEach((chip) => chip.classList.toggle('is-active', chip === btn));
      renderHistory();
    });
  });

  els.compareToggle.addEventListener('change', () => {
    state.compareMode = els.compareToggle.checked;
    els.cardB.hidden = !state.compareMode;
    if (!state.compareMode) clearSlot('B', false);
    renderSlot('B');
    updateAnalyzeButton();
    clearNotice();
  });

  els.fileA.addEventListener('change', (event) => handleFileSelect(event.target.files?.[0], 'A'));
  els.fileB.addEventListener('change', (event) => handleFileSelect(event.target.files?.[0], 'B'));
  els.removeA.addEventListener('click', () => clearSlot('A'));
  els.removeB.addEventListener('click', () => clearSlot('B'));

  setupDropZone(els.previewA, els.fileA, 'A');
  setupDropZone(els.previewB, els.fileB, 'B');

  els.analyzeBtn.addEventListener('click', analyzeCurrentSelection);
  els.cancelBtn.addEventListener('click', cancelAnalysis);
  els.shareBtn.addEventListener('click', shareCurrentResult);
  els.exportJsonBtn.addEventListener('click', () => exportCurrent('json'));
  els.exportTxtBtn.addEventListener('click', () => exportCurrent('txt'));
  els.exportHtmlBtn.addEventListener('click', () => exportCurrent('html'));
  els.exportCsvBtn.addEventListener('click', () => exportCurrent('csv'));
  els.clearHistoryBtn.addEventListener('click', clearHistory);

  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);
}

function setupDropZone(zone, input, slotName) {
  zone.addEventListener('click', (event) => {
    if (event.target.closest('img')) return;
    input.click();
  });
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  ['dragenter', 'dragover'].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('is-dragging');
    });
  });
  zone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file, slotName);
  });
}

function renderMode() {
  const meta = MODE_META[state.mode];
  els.modeSubtitle.textContent = meta.subtitle;
  els.modeHeadline.textContent = meta.headline;
  els.modeDescription.textContent = meta.description;
  els.criteriaList.innerHTML = meta.criteria.map((item, index) => `
    <li><span class="criteria-index">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(item)}</span></li>
  `).join('');
}

function validateFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) return 'Use a JPG, PNG, or WEBP image.';
  if (file.size > MAX_FILE_BYTES) return 'That image is over 10 MB. Choose a smaller file.';
  if (file.size === 0) return 'That file is empty.';
  return '';
}

function handleFileSelect(file, slotName) {
  if (!file) return;
  const validationError = validateFile(file);
  if (validationError) {
    showNotice(validationError, 'error');
    return;
  }

  const previous = slotName === 'A' ? state.primary : state.secondary;
  if (previous?.kind === 'file' && previous.url) URL.revokeObjectURL(previous.url);

  const objectUrl = URL.createObjectURL(file);
  const payload = { kind: 'file', file, name: file.name, url: objectUrl, size: file.size, type: file.type };
  if (slotName === 'A') state.primary = payload;
  else state.secondary = payload;
  renderSlot(slotName);
  updateAnalyzeButton();
  clearNotice();
}

function clearSlot(slotName, update = true) {
  const current = slotName === 'A' ? state.primary : state.secondary;
  if (current?.kind === 'file' && current.url) URL.revokeObjectURL(current.url);
  if (slotName === 'A') {
    state.primary = null;
    els.fileA.value = '';
  } else {
    state.secondary = null;
    els.fileB.value = '';
  }
  renderSlot(slotName);
  if (update) updateAnalyzeButton();
}

function renderSlot(slotName) {
  const slot = slotName === 'A' ? state.primary : state.secondary;
  const preview = slotName === 'A' ? els.previewA : els.previewB;
  const meta = slotName === 'A' ? els.metaA : els.metaB;
  const removeBtn = slotName === 'A' ? els.removeA : els.removeB;

  if (!slot) {
    preview.classList.remove('has-image');
    preview.innerHTML = `<div class="placeholder">
      <span class="upload-mark">＋</span>
      <strong>${slotName === 'A' ? 'Choose or drop an image' : 'Add the second image'}</strong>
      <span>${slotName === 'A' ? 'JPG, PNG, or WEBP · up to 10 MB' : 'Use the same scene for a cleaner before / after comparison.'}</span>
    </div>`;
    meta.textContent = 'No image selected';
    removeBtn.hidden = true;
    return;
  }

  preview.classList.add('has-image');
  preview.innerHTML = `<img src="${slot.url}" alt="Selected image ${slotName}" />`;
  const details = slot.kind === 'sample'
    ? 'Bundled sample'
    : `${formatBytes(slot.size)} · ${slot.type.replace('image/', '').toUpperCase()}`;
  meta.innerHTML = `<strong>${escapeHtml(slot.name)}</strong><span>${escapeHtml(details)}</span>`;
  removeBtn.hidden = false;
}

async function loadHealth() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    state.health = data;
    els.healthPill.textContent = data.aiConfigured ? `Studio ready · ${data.model}` : 'Backend ready · AI key needed';
    els.healthPill.className = `status-pill ${data.aiConfigured ? 'ok' : 'warn'}`;
    if (!data.aiConfigured) showNotice('The app is ready, but Gemini is not configured. Put your key in .env, not .env.example, then restart.', 'warn');
  } catch {
    els.healthPill.textContent = 'Backend offline';
    els.healthPill.className = 'status-pill error';
    showNotice('Cannot reach the backend. Keep “npm run dev” running in the project folder.', 'error');
  }
}

function updateNetworkState() {
  const online = navigator.onLine;
  els.networkPill.textContent = online ? 'Online' : 'Offline';
  els.networkPill.className = `status-pill subtle ${online ? '' : 'error'}`;
  if (!online) showNotice('You are offline. Existing history still works, but AI analysis needs a connection.', 'warn');
}

async function loadSamples() {
  try {
    const response = await fetch('/api/samples');
    const data = await response.json();
    state.samples = data.items || [];
    renderSamples();
  } catch {
    els.samplesGrid.innerHTML = '<div class="empty-state">Sample images could not be loaded.</div>';
  }
}

function renderSamples() {
  if (!state.samples.length) {
    els.samplesGrid.innerHTML = '<div class="empty-state">No sample images found.</div>';
    return;
  }

  els.samplesGrid.innerHTML = state.samples.map(sample => `
    <article class="sample-card">
      <div class="sample-image-wrap"><img src="${sample.url}" alt="${escapeHtml(sample.title)}" loading="lazy" /></div>
      <div class="sample-body">
        <div class="sample-topline">${sample.modeHint === 'interior' ? 'Interior study' : 'Photography study'}</div>
        <h4>${escapeHtml(sample.title)}</h4>
        <div class="sample-actions">
          <button class="small-btn" data-sample-action="primary" data-sample-id="${sample.id}">Use as A</button>
          <button class="small-btn ghost-btn" data-sample-action="secondary" data-sample-id="${sample.id}">Use as B</button>
        </div>
      </div>
    </article>
  `).join('');

  els.samplesGrid.querySelectorAll('[data-sample-id]').forEach((button) => {
    button.addEventListener('click', () => useSample(button.dataset.sampleId, button.dataset.sampleAction));
  });
}

function useSample(sampleId, action) {
  const sample = state.samples.find(item => item.id === sampleId);
  if (!sample) return;
  const payload = { kind: 'sample', name: sample.title, url: sample.url, filename: sample.filename };
  if (action === 'secondary') {
    state.compareMode = true;
    els.compareToggle.checked = true;
    els.cardB.hidden = false;
    state.secondary = payload;
    renderSlot('B');
  } else {
    state.primary = payload;
    renderSlot('A');
  }
  updateAnalyzeButton();
  clearNotice();
}

function updateAnalyzeButton() {
  const ready = Boolean(state.primary) && (!state.compareMode || Boolean(state.secondary)) && !state.busy;
  els.analyzeBtn.disabled = !ready;
}

function startLoadingSequence() {
  const singleSteps = [
    ['Reading the image…', 'Checking structure, balance, lighting, and visual hierarchy.'],
    ['Looking closer…', 'Separating strengths from the details that need refinement.'],
    ['Turning critique into edits…', 'Writing specific, practical recommendations instead of vague praise.'],
  ];
  const compareSteps = [
    ['Reading both images…', 'Matching the same criteria across A and B.'],
    ['Measuring the difference…', 'Checking where the score moved and why.'],
    ['Building the verdict…', 'Summarizing what improved, what slipped, and the next useful edit.'],
  ];
  const steps = state.compareMode ? compareSteps : singleSteps;
  let index = 0;
  const show = () => {
    els.loadingTitle.textContent = steps[index][0];
    els.loadingText.textContent = steps[index][1];
    index = (index + 1) % steps.length;
  };
  show();
  state.loadingTimer = window.setInterval(show, 2400);
}

function stopLoadingSequence() {
  if (state.loadingTimer) window.clearInterval(state.loadingTimer);
  state.loadingTimer = null;
}

async function analyzeCurrentSelection() {
  if (!state.primary) {
    showNotice('Choose image A first.', 'error');
    return;
  }
  if (state.compareMode && !state.secondary) {
    showNotice('Comparison mode needs image B as well.', 'error');
    return;
  }
  if (!navigator.onLine) {
    showNotice('You are offline. Reconnect before starting an AI analysis.', 'warn');
    return;
  }

  state.busy = true;
  state.abortController = new AbortController();
  updateAnalyzeButton();
  els.loadingCard.hidden = false;
  els.loadingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  startLoadingSequence();
  clearNotice();

  try {
    const formData = new FormData();
    formData.append('mode', state.mode);
    formData.append('compareMode', String(state.compareMode));
    formData.append('imageA', await slotToFile(state.primary));
    if (state.compareMode && state.secondary) formData.append('imageB', await slotToFile(state.secondary));

    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
      signal: state.abortController.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed.');

    state.result = data.record;
    renderResult(state.result);
    await loadHistory();
    showNotice('Analysis complete. It has been saved to your local database.', 'success');
  } catch (error) {
    if (error.name === 'AbortError') showNotice('Analysis cancelled. Nothing was saved.', 'warn');
    else showNotice(error.message || 'Analysis failed.', 'error');
  } finally {
    state.busy = false;
    state.abortController = null;
    stopLoadingSequence();
    updateAnalyzeButton();
    els.loadingCard.hidden = true;
  }
}

function cancelAnalysis() {
  if (state.abortController) state.abortController.abort();
}

async function slotToFile(slot) {
  if (slot.kind === 'file') return slot.file;
  const response = await fetch(slot.url);
  const blob = await response.blob();
  return new File([blob], slot.filename || `${slot.name}.jpg`, { type: blob.type || 'image/jpeg' });
}

function renderResult(record) {
  const result = record.data;
  els.resultsSection.hidden = false;
  els.overallScore.textContent = result.overallScore;
  els.scoreCircle.style.setProperty('--score-angle', `${Math.max(0, Math.min(100, result.overallScore)) * 3.6}deg`);
  els.scoreLabel.textContent = scoreLabel(result.overallScore);
  els.resultModeLine.textContent = `${MODE_META[record.mode].label} review${record.compareMode ? ' · comparison' : ''}`;
  els.resultHeadline.textContent = result.headline;
  els.resultSummary.textContent = result.summary;
  els.bestQuality.textContent = result.bestQuality || '-';
  els.priorityFix.textContent = result.priorityFix || '-';

  els.criteriaBreakdown.innerHTML = result.criteria.map(item => `
    <article class="metric-card">
      <div class="metric-head">
        <h4>${escapeHtml(item.name)}</h4>
        <span>${item.score}</span>
      </div>
      <div class="score-bar" aria-label="${escapeHtml(item.name)} score ${item.score} out of 100">
        <span style="width:${item.score}%"></span>
      </div>
      <details class="why-panel">
        <summary>Why this score?</summary>
        <p>${escapeHtml(item.comment)}</p>
        ${item.positive ? `<div class="detail-callout"><strong>Working well</strong><span>${escapeHtml(item.positive)}</span></div>` : ''}
        ${item.improve ? `<div class="detail-callout improve"><strong>Try next</strong><span>${escapeHtml(item.improve)}</span></div>` : ''}
      </details>
    </article>
  `).join('');

  els.strengthList.innerHTML = result.strengths.map(item => `<li><span>${escapeHtml(item)}</span></li>`).join('') || '<li><span>No strengths returned.</span></li>';
  els.actionsList.innerHTML = result.actions.map(item => `<li><span>${escapeHtml(item)}</span></li>`).join('') || '<li><span>No actions returned.</span></li>';

  if (record.compareMode && result.comparison) {
    els.comparisonCard.hidden = false;
    els.comparisonWinner.textContent = result.comparison.winner === 'Tie' ? 'Balanced result' : `Image ${result.comparison.winner} leads`;
    els.comparisonBanner.innerHTML = `
      <p>${escapeHtml(result.comparison.summary)}</p>
      <div><strong>Recommendation</strong><span>${escapeHtml(result.comparison.recommendation)}</span></div>
    `;
    els.comparisonGrid.innerHTML = result.comparison.dimensions.map(item => {
      const delta = item.scoreB - item.scoreA;
      const deltaText = delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${delta} for B`;
      return `
        <article class="compare-metric">
          <div class="metric-head"><h4>${escapeHtml(item.name)}</h4><span class="verdict-pill">${escapeHtml(item.verdict)}</span></div>
          <div class="ab-scores">
            <div><span>A</span><strong>${item.scoreA}</strong><div class="score-bar"><span style="width:${item.scoreA}%"></span></div></div>
            <div><span>B</span><strong>${item.scoreB}</strong><div class="score-bar alt"><span style="width:${item.scoreB}%"></span></div></div>
          </div>
          <div class="delta-line ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}">${deltaText}</div>
          <p>${escapeHtml(item.reason)}</p>
        </article>
      `;
    }).join('');
  } else {
    els.comparisonCard.hidden = true;
    els.comparisonGrid.innerHTML = '';
  }

  requestAnimationFrame(() => els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function loadHistory() {
  try {
    const response = await fetch('/api/results?limit=24');
    const data = await response.json();
    state.history = data.items || [];
    renderHistory();
  } catch {
    els.historyGrid.innerHTML = '<div class="empty-state">Could not load history.</div>';
  }
}

function renderHistory() {
  const filtered = state.historyFilter === 'all'
    ? state.history
    : state.history.filter(item => item.mode === state.historyFilter);

  if (!filtered.length) {
    els.historyGrid.innerHTML = `<div class="empty-state">${state.history.length ? 'No results in this filter yet.' : 'No saved results yet. Your first analysis will appear here.'}</div>`;
    return;
  }

  els.historyGrid.innerHTML = filtered.map(item => `
    <article class="history-item">
      <button class="history-open" data-history-id="${item.id}" type="button">
        <div class="history-top">
          <span class="history-badge">${escapeHtml(item.mode)}</span>
          ${item.compareMode ? '<span class="history-badge alt">A / B</span>' : ''}
        </div>
        <div class="history-score">${item.overallScore ?? 0}<small>/100</small></div>
        <h4>${escapeHtml(item.title || 'Saved result')}</h4>
        <p>${new Date(item.createdAt).toLocaleString()}</p>
      </button>
      <button class="history-delete" data-delete-history="${item.id}" type="button" aria-label="Delete this saved result">Delete</button>
    </article>
  `).join('');

  els.historyGrid.querySelectorAll('[data-history-id]').forEach((button) => {
    button.addEventListener('click', () => loadSingleResult(button.dataset.historyId));
  });
  els.historyGrid.querySelectorAll('[data-delete-history]').forEach((button) => {
    button.addEventListener('click', () => deleteHistoryItem(button.dataset.deleteHistory));
  });
}

async function loadSingleResult(id) {
  try {
    const response = await fetch(`/api/results/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not open the result.');
    state.result = data;
    renderResult(data);
  } catch (error) {
    showNotice(error.message || 'Could not open that saved result.', 'error');
  }
}

async function deleteHistoryItem(id) {
  if (!confirm('Delete this saved analysis?')) return;
  try {
    const response = await fetch(`/api/results/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not delete the result.');
    if (state.result?.id === id) {
      state.result = null;
      els.resultsSection.hidden = true;
    }
    await loadHistory();
    showNotice('Saved analysis deleted.', 'success');
  } catch (error) {
    showNotice(error.message || 'Could not delete the result.', 'error');
  }
}

async function shareCurrentResult() {
  if (!state.result?.id) {
    showNotice('There is no result to share yet.', 'warn');
    return;
  }
  try {
    const response = await fetch(`/api/results/${state.result.id}/share`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Share failed.');
    state.shareUrl = data.url;
    const text = `${state.result.data.headline} · ${state.result.data.overallScore}/100`;
    if (navigator.share) {
      await navigator.share({ title: 'Interior Project Pro result', text, url: data.url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${data.url}`);
      showNotice('Share link copied to clipboard.', 'success');
    } else {
      window.prompt('Copy this share link:', data.url);
    }
  } catch (error) {
    if (error.name !== 'AbortError') showNotice(error.message || 'Could not share the result.', 'error');
  }
}

function exportCurrent(format) {
  if (!state.result?.id) {
    showNotice('There is no result to export yet.', 'warn');
    return;
  }
  window.open(`/api/results/${state.result.id}/export?format=${format}`, '_blank');
}

async function clearHistory() {
  if (!confirm('Delete every saved result from the local SQLite database?')) return;
  try {
    const response = await fetch('/api/results', { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not clear history.');
    state.history = [];
    state.result = null;
    els.resultsSection.hidden = true;
    renderHistory();
    showNotice('Local history cleared.', 'success');
  } catch (error) {
    showNotice(error.message || 'Could not clear history.', 'error');
  }
}

function scoreLabel(score) {
  if (score >= 90) return 'Editorial standout';
  if (score >= 82) return 'Strong and refined';
  if (score >= 72) return 'Good foundation';
  if (score >= 60) return 'Promising, needs polish';
  return 'Needs a stronger pass';
}

function showNotice(message, kind = 'error') {
  els.globalNotice.textContent = message;
  els.globalNotice.className = `notice is-visible ${kind}`;
}

function clearNotice() {
  els.globalNotice.textContent = '';
  els.globalNotice.className = 'notice';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
