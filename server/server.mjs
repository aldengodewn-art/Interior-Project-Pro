import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import { initDb, insertAnalysis, listAnalyses, getAnalysis, clearAnalyses, deleteAnalysis, setShareToken, getAnalysisByShareToken } from './db.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      const error = new Error('Only JPG, PNG, and WEBP images are supported.');
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',').map(v => v.trim()) || true }));
app.use(express.json({ limit: '2mb' }));
app.use('/samples', express.static(path.resolve(process.cwd(), 'public/samples')));

await initDb();

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    database: 'sqlite',
  });
});

app.get('/api/samples', (_req, res) => {
  res.json({
    items: [
      { id: 'photo-1', modeHint: 'photography', title: 'Golden hour road portrait', filename: 'photography-sample.jpg', url: '/samples/photography-sample.jpg' },
      { id: 'room-1', modeHint: 'interior', title: 'Warm neutral living room', filename: 'living-room-sample.jpg', url: '/samples/living-room-sample.jpg' },
      { id: 'room-2', modeHint: 'interior', title: 'Soft modern bedroom', filename: 'bedroom-sample.jpg', url: '/samples/bedroom-sample.jpg' },
    ],
  });
});

app.get('/api/results', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 12), 50);
  const rows = await listAnalyses(limit);
  res.json({ items: rows });
});

app.get('/api/results/:id', async (req, res) => {
  const row = await getAnalysis(req.params.id);
  if (!row) return res.status(404).json({ error: 'Result not found.' });
  res.json(row);
});

app.delete('/api/results', async (_req, res) => {
  await clearAnalyses();
  res.json({ ok: true });
});

app.delete('/api/results/:id', async (req, res) => {
  const deleted = await deleteAnalysis(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Result not found.' });
  res.json({ ok: true });
});

app.post('/api/analyze', upload.fields([{ name: 'imageA', maxCount: 1 }, { name: 'imageB', maxCount: 1 }]), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Gemini API key is not configured in the backend. Copy .env.example to .env and add GEMINI_API_KEY.' });
    }

    const mode = req.body.mode === 'interior' ? 'interior' : 'photography';
    const compareMode = String(req.body.compareMode) === 'true';
    const imageA = req.files?.imageA?.[0];
    const imageB = req.files?.imageB?.[0];

    if (!imageA) return res.status(400).json({ error: 'Please upload Image A.' });
    if (compareMode && !imageB) return res.status(400).json({ error: 'Comparison mode requires Image B.' });

    const analysis = await analyzeWithGemini({ mode, compareMode, imageA, imageB });
    const record = {
      id: nanoid(10),
      createdAt: new Date().toISOString(),
      mode,
      compareMode,
      title: analysis.headline || analysis.oneLine || `${capitalize(mode)} rating`,
      overallScore: analysis.overallScore ?? 0,
      imageAName: imageA.originalname,
      imageBName: imageB?.originalname || null,
      data: analysis,
      shareToken: null,
    };

    await insertAnalysis(record);
    res.json({
      saved: true,
      record: {
        id: record.id,
        createdAt: record.createdAt,
        mode: record.mode,
        compareMode: record.compareMode,
        title: record.title,
        overallScore: record.overallScore,
        imageAName: record.imageAName,
        imageBName: record.imageBName,
        data: record.data,
      },
    });
  } catch (error) {
    console.error('[API] analyze failed', error?.message || error, error?.stack || '');
    const statusCode = error?.statusCode || error?.status || 500;
    res.status(statusCode).json({ error: friendlyError(error) });
  }
});

app.get('/api/results/:id/export', async (req, res) => {
  const item = await getAnalysis(req.params.id);
  if (!item) return res.status(404).json({ error: 'Result not found.' });

  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="result-${item.id}.json"`);
    return res.end(JSON.stringify(item, null, 2));
  }

  if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="result-${item.id}.txt"`);
    return res.end(buildTextReport(item));
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="result-${item.id}.csv"`);
    return res.end(buildCsvReport(item));
  }

  if (format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="result-${item.id}.html"`);
    return res.end(buildHtmlReport(item));
  }

  return res.status(400).json({ error: 'Unsupported export format.' });
});

app.post('/api/results/:id/share', async (req, res) => {
  const item = await getAnalysis(req.params.id);
  if (!item) return res.status(404).json({ error: 'Result not found.' });
  const token = item.shareToken || nanoid(14);
  if (!item.shareToken) await setShareToken(item.id, token);
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, token, url: `${base}/share/${token}` });
});

app.get('/share/:token', async (req, res) => {
  const item = await getAnalysisByShareToken(req.params.token);
  if (!item) return res.status(404).send('<h1>Shared result not found.</h1>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(buildHtmlReport(item, true));
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'The image is too large. Keep each upload under 10 MB.' });
    return res.status(400).json({ error: error.message || 'Upload failed.' });
  }
  if (error?.statusCode) return res.status(error.statusCode).json({ error: friendlyError(error) });
  next(error);
});

app.listen(port, () => {
  console.log(`Interior Project API running at http://localhost:${port}`);
});

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function friendlyError(error) {
  const raw = error?.message || 'Unknown error.';
  if (raw.includes('503')) return 'Gemini is temporarily unavailable (503). Please try again in a moment.';
  if (raw.includes('429')) return 'Gemini rate limit hit (429). Wait a bit and try again.';
  if (raw.includes('403') || raw.includes('API key not valid')) return 'Gemini API key is invalid or not allowed for this model.';
  if (raw.includes('400')) return 'Gemini rejected the request. Check the model name or image format.';
  if (raw.includes('Only JPG, PNG, and WEBP')) return raw;
  if (raw.includes('File too large')) return 'The image is too large. Keep each upload under 10 MB.';
  return raw;
}

async function analyzeWithGemini({ mode, compareMode, imageA, imageB }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const prompt = buildPrompt(mode, compareMode);

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: imageA.mimetype, data: imageA.buffer.toString('base64') } },
  ];
  if (compareMode && imageB) {
    parts.push({ inline_data: { mime_type: imageB.mimetype, data: imageB.buffer.toString('base64') } });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { temperature: 0.25, responseMimeType: 'application/json' },
      contents: [{ role: 'user', parts }],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || `Gemini request failed with ${response.status}`;
    const err = new Error(message);
    err.statusCode = response.status;
    throw err;
  }

  const text = json?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  const parsed = parseJson(text);
  return normalizeAnalysis(parsed, mode, compareMode);
}

function buildPrompt(mode, compareMode) {
  const criteria = mode === 'interior'
    ? ['layout', 'space utilization', 'lighting', 'color palette', 'furniture proportion', 'materials', 'styling', 'practicality']
    : ['composition', 'subject placement', 'lighting/exposure', 'color', 'depth', 'technical quality', 'story/mood'];

  return `You are a tough but useful ${mode === 'interior' ? 'interior design' : 'photography'} critic.
Analyze the provided image${compareMode ? 's' : ''}.
${compareMode ? 'Image 1 is A. Image 2 is B.' : 'There is one image only.'}
Return valid JSON only, with no markdown fences.
Use a direct, helpful tone.
Scores must be integers from 0 to 100.
Focus criteria: ${criteria.join(', ')}.

Required JSON shape:
{
  "overallScore": 0,
  "headline": "short headline",
  "summary": "2-4 sentence summary",
  "bestQuality": "short phrase",
  "priorityFix": "short phrase",
  "criteria": [
    {"name": "criterion name", "score": 0, "comment": "1-2 sentence explanation of the score", "positive": "one concrete thing working well", "improve": "one concrete next improvement"}
  ],
  "strengths": ["bullet", "bullet", "bullet"],
  "actions": ["bullet", "bullet", "bullet"]${compareMode ? `,
  "comparison": {
    "winner": "A or B or Tie",
    "summary": "1-3 sentence comparison summary",
    "recommendation": "Which image should be kept or what should be improved next",
    "dimensions": [
      {"name": "criterion", "scoreA": 0, "scoreB": 0, "verdict": "A or B or Tie", "reason": "short reason"}
    ]
  }` : ''}
}

Important:
- Include at least 5 criteria for photography and at least 6 for interior.
- If comparison mode is on, still provide one overallScore as the stronger overall rating between the two images, plus a full comparison object.
- Avoid mentioning being an AI model.
- Each criterion must explain why it received that score.
- Each criterion should include one concrete positive and one concrete improvement.
- Actions should be short, practical changes the user could actually try.
- Be specific, not vague praise.`;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

function normalizeAnalysis(data, mode, compareMode) {
  const criteria = Array.isArray(data.criteria) ? data.criteria.map(item => ({
    name: String(item.name || 'Criterion'),
    score: clampScore(item.score),
    comment: String(item.comment || ''),
    positive: String(item.positive || ''),
    improve: String(item.improve || ''),
  })) : [];

  const comparison = compareMode && data.comparison ? {
    winner: ['A', 'B', 'Tie'].includes(data.comparison.winner) ? data.comparison.winner : 'Tie',
    summary: String(data.comparison.summary || ''),
    recommendation: String(data.comparison.recommendation || ''),
    dimensions: Array.isArray(data.comparison.dimensions) ? data.comparison.dimensions.map(d => ({
      name: String(d.name || 'Criterion'),
      scoreA: clampScore(d.scoreA),
      scoreB: clampScore(d.scoreB),
      verdict: ['A', 'B', 'Tie'].includes(d.verdict) ? d.verdict : 'Tie',
      reason: String(d.reason || ''),
    })) : [],
  } : null;

  return {
    mode,
    compareMode,
    overallScore: clampScore(data.overallScore),
    headline: String(data.headline || `${capitalize(mode)} analysis`),
    summary: String(data.summary || ''),
    bestQuality: String(data.bestQuality || ''),
    priorityFix: String(data.priorityFix || ''),
    criteria,
    strengths: Array.isArray(data.strengths) ? data.strengths.map(String).slice(0, 6) : [],
    actions: Array.isArray(data.actions) ? data.actions.map(String).slice(0, 6) : [],
    comparison,
  };
}

function clampScore(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildTextReport(item) {
  const d = item.data;
  const lines = [
    `Interior Project Pro result ${item.id}`,
    `Created: ${item.createdAt}`,
    `Mode: ${item.mode}`,
    `Comparison: ${item.compareMode ? 'Yes' : 'No'}`,
    `Overall score: ${d.overallScore}/100`,
    `Headline: ${d.headline}`,
    '',
    d.summary,
    '',
    `Best quality: ${d.bestQuality}`,
    `Priority fix: ${d.priorityFix}`,
    '',
    'Criteria:',
    ...d.criteria.map(c => `- ${c.name}: ${c.score}/100 — ${c.comment}${c.positive ? ` | Working well: ${c.positive}` : ''}${c.improve ? ` | Try next: ${c.improve}` : ''}`),
    '',
    'Strengths:',
    ...d.strengths.map(s => `- ${s}`),
    '',
    'Actions:',
    ...d.actions.map(a => `- ${a}`),
  ];
  if (d.comparison) {
    lines.push('', 'Comparison:', `Winner: ${d.comparison.winner}`, d.comparison.summary, `Recommendation: ${d.comparison.recommendation}`);
    lines.push(...d.comparison.dimensions.map(x => `- ${x.name}: A ${x.scoreA} vs B ${x.scoreB} (${x.verdict}) — ${x.reason}`));
  }
  return lines.join('\n');
}

function buildCsvReport(item) {
  const rows = [['type', 'name', 'score', 'scoreA', 'scoreB', 'verdict', 'text']];
  const d = item.data;
  rows.push(['summary', 'headline', d.overallScore, '', '', '', d.headline]);
  rows.push(['summary', 'bestQuality', '', '', '', '', d.bestQuality]);
  rows.push(['summary', 'priorityFix', '', '', '', '', d.priorityFix]);
  d.criteria.forEach(c => rows.push(['criterion', c.name, c.score, '', '', '', [c.comment, c.positive ? `Working well: ${c.positive}` : '', c.improve ? `Try next: ${c.improve}` : ''].filter(Boolean).join(' | ')]));
  d.strengths.forEach(s => rows.push(['strength', '', '', '', '', '', s]));
  d.actions.forEach(a => rows.push(['action', '', '', '', '', '', a]));
  if (d.comparison) d.comparison.dimensions.forEach(x => rows.push(['comparison', x.name, '', x.scoreA, x.scoreB, x.verdict, x.reason]));
  return rows.map(row => row.map(escapeCsv).join(',')).join('\n');
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replaceAll('"', '""') + '"';
  }
  return str;
}

function buildHtmlReport(item, shared = false) {
  const d = item.data;
  const criteriaHtml = d.criteria.map(c => `<div class="metric"><div><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.comment)}</p>${c.positive ? `<small><b>Working well:</b> ${escapeHtml(c.positive)}</small>` : ''}${c.improve ? `<small><b>Try next:</b> ${escapeHtml(c.improve)}</small>` : ''}</div><span>${c.score}</span></div>`).join('');
  const list = (items) => items.map(v => `<li>${escapeHtml(v)}</li>`).join('');
  const comparisonHtml = d.comparison ? `
    <section class="card">
      <h2>Comparison</h2>
      <p><strong>Winner:</strong> ${escapeHtml(d.comparison.winner)}</p>
      <p>${escapeHtml(d.comparison.summary)}</p>
      <p><strong>Recommendation:</strong> ${escapeHtml(d.comparison.recommendation)}</p>
      ${d.comparison.dimensions.map(x => `<div class="metric"><div><strong>${escapeHtml(x.name)}</strong><p>${escapeHtml(x.reason)}</p></div><span>A ${x.scoreA} · B ${x.scoreB}</span></div>`).join('')}
    </section>` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Interior Project Pro Report</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;600;700&display=swap');
body{font-family:'DM Sans',Arial,sans-serif;background:#f4efe8;color:#29241f;margin:0;padding:28px}.wrap{max-width:980px;margin:0 auto}
h1,h2{font-family:'Cormorant Garamond',Georgia,serif}.header{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:24px}
.card{background:#fffdf9;border:1px solid #e3d8ca;border-radius:24px;padding:22px;box-shadow:0 18px 46px rgba(66,49,33,.08);margin-bottom:18px}
.score{font-family:'Cormorant Garamond',Georgia,serif;font-size:58px;font-weight:600;color:#75553f}.muted{color:#756c63}.metric{display:flex;justify-content:space-between;gap:16px;padding:15px 0;border-bottom:1px solid #ece3d9}.metric:last-child{border-bottom:none}.metric p{color:#756c63}.metric small{display:block;color:#756c63;margin-top:5px}.metric>span{background:#eee1d5;color:#75553f;border-radius:999px;padding:7px 10px;height:max-content;font-weight:700}ul{padding-left:18px}.pill{display:inline-block;background:#eee1d5;color:#75553f;padding:7px 11px;border-radius:999px;font-size:12px;font-weight:700}
</style></head><body><div class="wrap">
  <div class="header">
    <div>
      <div class="pill">Interior Project Pro${shared ? ' · Shared Result' : ''}</div>
      <h1>${escapeHtml(d.headline)}</h1>
      <p class="muted">Mode: ${escapeHtml(item.mode)} · ${item.compareMode ? 'Comparison' : 'Single image'} · Created ${escapeHtml(item.createdAt)}</p>
    </div>
    <div class="score">${d.overallScore}<span class="muted" style="font-size:18px">/100</span></div>
  </div>
  <section class="card">
    <p>${escapeHtml(d.summary)}</p>
    <p><strong>Best quality:</strong> ${escapeHtml(d.bestQuality)}</p>
    <p><strong>Priority fix:</strong> ${escapeHtml(d.priorityFix)}</p>
  </section>
  <section class="card"><h2>Criteria</h2>${criteriaHtml}</section>
  <section class="card"><h2>Strengths</h2><ul>${list(d.strengths)}</ul></section>
  <section class="card"><h2>Actions</h2><ul>${list(d.actions)}</ul></section>
  ${comparisonHtml}
</div></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
