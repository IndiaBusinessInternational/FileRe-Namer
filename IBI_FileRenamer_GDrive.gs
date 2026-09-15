/**
 * IBI File Re-Namer — Google Drive Upload Endpoint  (v12 — one AI engine for every device)
 * Google Apps Script (GAS) Web App
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ⚠ AFTER PASTING THIS, YOU MUST RE-DEPLOY A NEW VERSION:
 *     Deploy ▸ Manage deployments ▸ (pencil ✏️) ▸ Version: New version ▸ Deploy
 *     Otherwise Google keeps running the OLD code.
 * ══════════════════════════════════════════════════════════════════════
 *
 *  WHAT'S NEW IN v12:
 *   • ONE AI ENGINE FOR EVERY DEVICE. The CEO's choice (Gemini / OpenAI / Claude /
 *     DeepSeek / IBI Local) is stored here and read by every browser, so a switch
 *     made on one PC reaches the staff laptops by itself. Reading is public
 *     (?action=aiConfig); changing needs a genuine CEO Auth token
 *     ({type:'setAiConfig', token, provider, geminiModel, localUrl, keys}).
 *   • API KEYS AND THE LOCAL AI ACCESS CODE LIVE HERE, NOT IN ANY BROWSER. They are
 *     kept in Script Properties (AI_KEY_GEMINI, AI_KEY_OPENAI, AI_KEY_CLAUDE,
 *     AI_KEY_DEEPSEEK, AI_KEY_LOCAL) and never sent out — the website is only told
 *     whether each one is set. Every AI scan runs from this script ({type:'aiScan',
 *     kind, image}), which adds the key itself. Only the Re-Namer's two scans are
 *     accepted, capped at AI_SCANS_PER_HOUR, because this address is public.
 *   • First deploy of v12 asks for one extra permission ("Connect to an external
 *     service") — the calls to IBI CEO Auth and to the AI engines.
 *
 *  WHAT'S NEW IN v10:
 *   • The duplicate check now also catches the same order saved TODAY under a DIFFERENT
 *     PRODUCT NAME. v9 skipped today's folder entirely, trusting scanOrders to cover it
 *     — but scanOrders only ever inspects files matching THIS product's base name. So
 *     correcting a product name (Meesho's SKU is sometimes plain wrong) gave the file a
 *     different base, which nothing then checked, and the order duplicated silently.
 *     Found in the wild: one order sitting in Orders 15 July 2026 twice, once as
 *     "Coconut Coir Brush" and once as "Chappal Stitching Awl".
 *     findElsewhere() now skips only the files scanOrders genuinely owns (same folder
 *     AND same base name) instead of the whole folder.
 *
 *  WHAT'S NEW IN v9:
 *   • CROSS-FOLDER DUPLICATE CHECK. Everything before this only ever looked inside the
 *     ONE day-folder an upload was heading for, so an order filed under
 *     "Orders 14 July 2026" was invisible when the same label was processed on the
 *     15th — and quietly got saved a second time. findElsewhere() now searches the
 *     whole "IBI Daily Orders" tree and reports WHICH date folder already holds it,
 *     both in the review list and as a prompt on upload.
 *
 *     It searches Drive's full-text index on the ORDER NUMBER, which covers a file's
 *     description (where v8+ stamps it) AND the text inside the PDF itself — so it
 *     finds orders saved long before any of this stamping existed.
 *
 *     It searches the FULL order number ("…368_1") and never falls back to the number
 *     without its sub-order suffix: that would match sibling sub-orders, which are
 *     different orders, and a false "already saved" warning is worse than none.
 *     Read-only, and returns [] on any error — a duplicate warning must never be able
 *     to fail an upload.
 *
 *  WHAT'S NEW IN v8 (fixes two v7 bugs):
 *   • RE-UPLOADING THE SAME ORDER NO LONGER BECOMES "2nd Order". v7 could only
 *     recognise an order by the stamp it wrote itself, so every file saved before
 *     v7 looked like a brand-new order and its re-upload got numbered. v8 also
 *     compares the PDF's BYTES (SHA-256, sent by the website and computed here for
 *     unstamped files): an identical PDF is unambiguously the same order. When the
 *     identical file is already there, NOTHING is written — a replace with identical
 *     bytes is a no-op, so there is no second copy and no prompt.
 *     If a pre-v8 file shares the product+day and the bytes DON'T match, its order
 *     number is unknowable — v8 asks (Overwrite / keep both) instead of assuming it
 *     is a different order. Once every file in a day-folder is v8-stamped, different
 *     orders are auto-numbered silently again.
 *
 *   • FIXED an upload crash on re-upload: v7 did `file.ordinal = n` on a DriveApp
 *     File, which is a Java-backed host object and rejects new properties. That threw
 *     on exactly the path a duplicate takes, so the upload failed. Ordinals now ride
 *     in plain {file, ordinal} objects.
 *
 *  WHAT'S NEW IN v7:
 *   • SAME-DAY ORDER NUMBERING. A second, genuinely-different order for the same
 *     product on the same day is saved as "…D 15 Jul 2nd Order.pdf", then
 *     "3rd Order", and so on. The count is taken from the Drive folder itself, so
 *     it is correct no matter which device uploads (phone and PC can't disagree).
 *
 *     Identity = the ORDER NUMBER read off the label. It is stored in each file's
 *     Drive description, which is how this script tells apart:
 *       – a NEW order        → gets the next number, saved without prompting
 *       – the SAME order re-uploaded → conflict prompt (Overwrite / keep both)
 *     Re-processing a PDF therefore keeps its original number instead of climbing
 *     to "3rd Order". Files saved by v6 and earlier have no description; they are
 *     still counted as real orders, they just can't be matched by order number.
 *
 *   • NEW ACTION { type: 'ordinal' } — a read-only lookup the website calls as soon
 *     as a PDF is parsed, so the filename preview and the Download button show the
 *     same "2nd Order" name the Drive copy will get. Writes nothing.
 *
 *  WHAT'S NEW IN v6:
 *   • IDEMPOTENT UPLOADS — fixes the intermittent "same PDF saved twice" bug.
 *     The website sends a unique uploadId per click; doPost saves at most one file
 *     per id (recorded in CacheService for 10 min) and returns the original result
 *     if the browser auto-retries the POST after a CORS read failure.
 *
 *  WHAT'S NEW IN v4:
 *   • DUPLICATE PROMPT instead of silent replace (Overwrite / Rename-keep-both).
 *   • 30-day rolling retention (see purgeOldFolders / dailyCleanup).
 *
 *  DEPLOY (first time):
 *  1. Paste this whole file into your Apps Script project.
 *  2. Deploy ▸ New deployment ▸ type "Web app".
 *  3. Execute as: Me   |   Who has access: Anyone
 *  4. Authorize Drive access when prompted (Advanced ▸ Go to project ▸ Allow).
 *  5. Copy the /exec URL into IBI File Re-Namer ▸ ⚙ Settings (or DEFAULT_GAS_URL).
 *
 *  FOLDER STRUCTURE:
 *    IBI Daily Orders / Orders 1 June 2026 / <renamed file>.pdf
 *
 *  REQUEST BODY (JSON):
 *    save:    { filename, pdfBase64, folderDate, conflict, uploadId,
 *               baseName, orderNo, fileHash, customer }
 *    lookup:  { type:'ordinal', baseName, folderDate, orderNo, fileHash }   ← read-only
 *    conflict: ""          → check first; reply {conflict:true} if this same order is
 *                            already here, or is already filed under another date
 *              "overwrite" → trash the existing copy of this order, then save
 *              "rename"    → keep both: save under the next free order number
 *                            (also means "yes, save it again" for a cross-date duplicate)
 *
 *  LOOKUP REPLY: { ordinal, sameOrder, sameName, identical, unknown, elsewhere[], folder }
 *    elsewhere[] = [{name, folder, url, exact}] — this order is already saved under
 *    ANOTHER date's folder. `exact:false` means it was matched on the order number
 *    printed inside the PDF rather than a stamp, so it is likely but not certain.
 */

// ─── CONFIG ────────────────────────────────────────────────────
const ROOT_FOLDER_NAME = 'IBI Daily Orders';
const KEEP_DAYS = 30;   // rolling retention: folders older than this many days are auto-deleted
// ───────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No POST data received');

    const body = JSON.parse(e.postData.contents);

    // ── CEO sets the AI engine for EVERY device (v12) ──
    if (String(body.type || '').trim().toLowerCase() === 'setaiconfig') {
      return json(setAiConfig(body));
    }
    // ── AI scan with the keys held here (v12) ──
    if (String(body.type || '').trim().toLowerCase() === 'aiscan') {
      return json(aiScan(body));
    }

    // ── Read-only ordinal lookup (writes nothing, so it skips all the save logic) ──
    if (String(body.type || '').trim().toLowerCase() === 'ordinal') {
      return handleOrdinalLookup(body);
    }

    const filename   = String(body.filename || '').trim();
    const pdfBase64  = body.pdfBase64;
    const folderDate = String(body.folderDate || '').trim().replace(/\s+/g, ' ');
    const conflict   = String(body.conflict || '').trim().toLowerCase();  // '', 'overwrite', 'rename'
    const uploadId   = String(body.uploadId || '').trim();                // idempotency key (per click)
    const orderNo    = String(body.orderNo  || '').trim();                // identity of this order
    const fileHash   = String(body.fileHash || '').trim().toLowerCase();  // SHA-256 of the PDF bytes
    const customer   = String(body.customer || '').trim();                // display only
    // Filename minus any "2nd Order" suffix and ".pdf" — the group this order counts within.
    const baseName   = String(body.baseName || '').trim() || stripOrdinal(dropExt(filename));

    if (!filename)   throw new Error('Missing filename');
    if (!pdfBase64)  throw new Error('Missing PDF data');
    if (!folderDate) throw new Error('Missing folderDate');

    // ── IDEMPOTENCY (fixes the intermittent double-save) ──────────────────────
    // A GAS /exec POST is NOT idempotent: every call reaching the save path below
    // calls createFile(). The website follows the /exec → googleusercontent 302
    // redirect; doPost (which saves the file) runs BEFORE that redirect. When the
    // browser can't read the redirected cross-origin response (intermittent CORS),
    // its fetch rejects even though the file WAS saved, and it auto-retries the
    // POST — producing a duplicate. We record each committed uploadId briefly and
    // short-circuit any repeat with the same id, so the retry returns the original
    // result instead of writing a second file.
    const cache    = CacheService.getScriptCache();
    const cacheKey = uploadId ? ('idem_' + uploadId) : '';

    // Serialize so a fast retry — or a second device saving at the same moment —
    // can't race the original request before it commits. This lock is also what
    // makes the order numbering safe: the count+save below is one atomic step.
    const lock = LockService.getScriptLock();
    try { lock.waitLock(20000); } catch (le) { /* proceed unlocked rather than fail the upload */ }

    try {
      if (cacheKey) {
        const prior = cache.get(cacheKey);
        if (prior) {
          return ContentService.createTextOutput(prior).setMimeType(ContentService.MimeType.JSON);
        }
      }

      const root       = DriveApp.getRootFolder();
      const parent     = getOrCreateFolder(root, ROOT_FOLDER_NAME);
      const dateFolder = getOrCreateFolder(parent, 'Orders ' + folderDate);

      let saveName = filename;
      let replaced = 0;
      let ordinal  = 1;

      if (orderNo || fileHash) {
        // ── Order-aware path: count this product's orders already in the folder ──
        const scan = scanOrders(dateFolder, baseName, orderNo, fileHash);
        ordinal = scan.ordinal;

        // The identical PDF is already sitting in the folder. Replacing it with itself
        // would change nothing, so don't write at all — just report where it lives.
        // This is the "same order re-uploaded" case: never a second copy.
        const identical = firstIdentical(scan.matches);
        if (identical && conflict !== 'rename') {
          const out0 = JSON.stringify({
            success:   true,
            identical: true,
            filename:  identical.file.getName(),
            ordinal:   identical.ordinal,
            orderNo:   orderNo,
            folder:    'Orders ' + folderDate,
            fileId:    identical.file.getId(),
            fileUrl:   'https://drive.google.com/file/d/' + identical.file.getId() + '/view',
            folderUrl: 'https://drive.google.com/drive/folders/' + dateFolder.getId()
          });
          if (cacheKey) cache.put(cacheKey, out0, 600);
          return ContentService.createTextOutput(out0).setMimeType(ContentService.MimeType.JSON);
        }

        // Already filed elsewhere — another day, or today under a different product
        // name → stop and say where, rather than quietly filing a second copy.
        // 'rename' means the user saw this and chose to keep both anyway.
        if (conflict !== 'overwrite' && conflict !== 'rename') {
          const away = findElsewhere(orderNo, 'Orders ' + folderDate, baseName);
          if (away.length > 0 && scan.matches.length === 0) {
            return json({
              success:      false,
              conflict:     true,
              elsewhere:    away,
              filename:     away[0].name,
              folder:       away[0].folder,
              existingUrl:  away[0].url,
              orderNo:      orderNo,
              suggestedName: baseName + ordinalSuffix(scan.next) + '.pdf'
            });
          }
        }

        // Same order, different bytes (e.g. the label was re-downloaded) → ask.
        if (scan.matches.length > 0 && conflict !== 'overwrite' && conflict !== 'rename') {
          return json({
            success:       false,
            conflict:      true,
            filename:      scan.matches[0].file.getName(),
            folder:        'Orders ' + folderDate,
            existingCount: scan.matches.length,
            existingUrl:   'https://drive.google.com/file/d/' + scan.matches[0].file.getId() + '/view',
            sameOrder:     true,
            orderNo:       orderNo,
            suggestedName: baseName + ordinalSuffix(scan.next) + '.pdf'
          });
        }

        // Nothing provably matches, but a pre-v8 file shares this product+day and we
        // cannot read its order number. It might BE this order. Numbering blindly is
        // what produced bogus "2nd Order" copies, so ask instead of guessing.
        if (scan.matches.length === 0 && scan.unknowns.length > 0 &&
            conflict !== 'overwrite' && conflict !== 'rename') {
          return json({
            success:       false,
            conflict:      true,
            filename:      scan.unknowns[0].file.getName(),
            folder:        'Orders ' + folderDate,
            existingCount: scan.unknowns.length,
            existingUrl:   'https://drive.google.com/file/d/' + scan.unknowns[0].file.getId() + '/view',
            unidentified:  true,
            orderNo:       orderNo,
            suggestedName: baseName + ordinalSuffix(scan.next) + '.pdf'
          });
        }

        if (conflict === 'overwrite') {
          // Replace the copy we told the user about, keeping its number.
          const targets = scan.matches.length ? scan.matches : scan.unknowns;
          ordinal = targets.length ? targets[0].ordinal : scan.ordinal;
          for (let i = 0; i < targets.length; i++) {
            targets[i].file.setTrashed(true);
            replaced++;
          }
        } else if (conflict === 'rename') {
          ordinal = scan.next;          // keep both → this one takes the next number
        }
        saveName = baseName + ordinalSuffix(ordinal) + '.pdf';

      } else {
        // ── No order number (manifest, or nothing detectable in the PDF) ──
        // Exactly the v6 behaviour: match on the literal filename.
        const existing = [];
        const dup = dateFolder.getFilesByName(filename);
        while (dup.hasNext()) existing.push(dup.next());

        if (existing.length > 0 && conflict !== 'overwrite' && conflict !== 'rename') {
          return json({
            success:       false,
            conflict:      true,
            filename:      filename,
            folder:        'Orders ' + folderDate,
            existingCount: existing.length,
            existingUrl:   'https://drive.google.com/file/d/' + existing[0].getId() + '/view',
            suggestedName: nextAvailableName(dateFolder, filename)
          });
        }
        if (conflict === 'overwrite') {
          for (let i = 0; i < existing.length; i++) { existing[i].setTrashed(true); replaced++; }
        } else if (conflict === 'rename') {
          saveName = nextAvailableName(dateFolder, filename);
        }
      }

      // ── Save the file ──
      const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), MimeType.PDF, saveName);
      const file = dateFolder.createFile(blob);

      // Stamp the order number onto the file so future uploads can recognise it.
      // Drive's description is the only per-file slot that survives independently
      // of the name, which is what lets the name stay clean ("2nd Order", no IDs).
      if (orderNo || fileHash) {
        try {
          file.setDescription(JSON.stringify({
            orderNo:  orderNo,
            hash:     fileHash,
            customer: customer,
            ordinal:  ordinal,
            base:     baseName
          }));
        } catch (dErr) { /* description is an optimisation, never fail the upload for it */ }
      }

      // ── RETENTION: delete order folders older than KEEP_DAYS (rolling window) ──
      const purgedFolders = purgeOldFolders(parent, KEEP_DAYS);

      const out = JSON.stringify({
        success:    true,
        filename:   saveName,
        requested:  filename,
        renamed:    (saveName !== filename),
        replaced:   replaced,
        ordinal:    ordinal,
        orderNo:    orderNo,
        folder:     'Orders ' + folderDate,
        purged:     purgedFolders,
        fileId:     file.getId(),
        fileUrl:    'https://drive.google.com/file/d/' + file.getId() + '/view',
        folderUrl:  'https://drive.google.com/drive/folders/' + dateFolder.getId()
      });

      // Record ONLY after a file was actually created, so a retry dedupes but a
      // conflict-check (which writes nothing) still lets the real save through.
      if (cacheKey) cache.put(cacheKey, out, 600);  // 10-minute retry window

      return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);

    } finally {
      try { lock.releaseLock(); } catch (e2) {}
    }

  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  // ?action=list[&days=3] → files saved in the most recent "Orders <date>" folders,
  // read by IBI Staff Supervision so renaming work shows on the dashboard.
  // Names, folder and Drive created-times only — no contents, no URLs.
  if (p.action === 'list') {
    try { return json({ success: true, items: listRecentFiles(parseInt(p.days || '3', 10)) }); }
    catch (err) { return json({ success: false, error: err.toString() }); }
  }
  // ?action=aiConfig → the AI engine the CEO chose for every device. Only the
  // CHOICE is shared — never a key or access code (this endpoint is public).
  if (p.action === 'aiConfig') {
    try { return json(Object.assign({ success: true }, readAiConfig())); }
    catch (err) { return json({ success: false, error: err.toString() }); }
  }
  return json({
    status: 'active', rootFolder: ROOT_FOLDER_NAME, keepDays: KEEP_DAYS,
    version: 12, conflictPrompt: true, idempotent: true, orderNumbering: true, hashIdentity: true, crossFolderDuplicateCheck: true,
    list: true, aiConfig: true
  });
}

// ─── SHARED AI ENGINE (v12) ─────────────────────────────────────
// The website used to keep the AI engine choice in each browser, so switching to
// Local AI on the CEO's PC changed nothing on a staff laptop. The choice now lives
// here, in Script Properties, and every device reads it.
//
// Changing it needs the signed token the IBI CEO Auth script hands out when the CEO
// PIN is entered. This script asks CEO Auth whether the token is genuine and
// unexpired (checkToken) — the PIN itself never reaches this project.
const CEO_AUTH_URL = 'https://script.google.com/macros/s/AKfycbxIW4j7m51JjX6yt38-a1X6XrDRyZp3czMYN8eXECfP9H2twjfrgLaozWCCl843AgWo0g/exec';
const AI_PROVIDERS = ['gemini', 'openai', 'claude', 'deepseek', 'local'];

// API keys and the Local AI access code live ONLY here, in Script Properties.
// No browser ever receives them: readAiConfig reports whether each one is set, and
// every AI scan runs from this script (aiScan), which adds the key itself.
const AI_KEY_PROPS = { gemini: 'AI_KEY_GEMINI', openai: 'AI_KEY_OPENAI', claude: 'AI_KEY_CLAUDE', deepseek: 'AI_KEY_DEEPSEEK', local: 'AI_KEY_LOCAL' };
const DEFAULT_LOCAL_URL = 'https://ai-local.indiabusinessinternational.online';
// This endpoint is public (its address is in the website), so it will only run the
// Re-Namer's own two scans, on one image, a limited number of times an hour — nobody
// can use it as a free general-purpose AI on the company's keys or laptop.
const AI_SCANS_PER_HOUR = 300;
const AI_MAX_IMAGE_CHARS = 6000000;   // ~4.5 MB JPEG as base64

function readAiConfig() {
  const props = PropertiesService.getScriptProperties();
  const provider = props.getProperty('AI_PROVIDER') || '';
  const keys = {};
  AI_PROVIDERS.forEach(function (p) { keys[p] = !!props.getProperty(AI_KEY_PROPS[p]); });
  return {
    provider: AI_PROVIDERS.indexOf(provider) > -1 ? provider : '',
    geminiModel: props.getProperty('AI_GEMINI_MODEL') || '',
    localUrl: props.getProperty('AI_LOCAL_URL') || '',
    keys: keys,          // true/false only — never the key
    proxy: true,         // AI scans run here (type:'aiScan')
    updatedAt: props.getProperty('AI_UPDATED_AT') || ''
  };
}

function ceoTokenIsValid(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return false;
  const res = UrlFetchApp.fetch(CEO_AUTH_URL + '?action=checkToken&token=' + encodeURIComponent(token),
                                { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('CEO verification service answered ' + res.getResponseCode());
  const out = JSON.parse(res.getContentText());
  return out && out.ok === true;
}

// body: { token, provider?, geminiModel?, localUrl?, keys?: {gemini:'…', …}, clearKeys?: ['openai', …] }
// A key left blank is left as it is; only clearKeys removes one.
function setAiConfig(body) {
  const provider = String(body.provider || '').trim().toLowerCase();
  const geminiModel = String(body.geminiModel || '').trim();
  const localUrl = String(body.localUrl || '').trim().replace(/\/+$/, '');
  if (provider && AI_PROVIDERS.indexOf(provider) < 0) return { success: false, code: 'bad_provider', error: 'Unknown AI engine: ' + provider };
  if (geminiModel && !/^[\w.\-]{1,60}$/.test(geminiModel)) return { success: false, code: 'bad_model', error: 'Invalid Gemini model name.' };
  if (localUrl && !/^https:\/\/[\w.\-]+(:\d+)?$/.test(localUrl)) return { success: false, code: 'bad_url', error: 'The laptop address must be an https:// address (this script cannot reach localhost).' };

  let valid;
  try { valid = ceoTokenIsValid(body.token); }
  catch (err) { return { success: false, code: 'auth_unreachable', error: 'Could not reach CEO verification: ' + err.message }; }
  if (!valid) return { success: false, code: 'unauthorized', error: 'CEO unlock has expired — unlock again with the PIN.' };

  const props = PropertiesService.getScriptProperties();
  const now = new Date().toISOString();
  const update = { AI_UPDATED_AT: now };
  if (provider) { update.AI_PROVIDER = provider; update.AI_GEMINI_MODEL = geminiModel; }
  if ('localUrl' in body) {
    if (localUrl && localUrl !== DEFAULT_LOCAL_URL) update.AI_LOCAL_URL = localUrl;
    else props.deleteProperty('AI_LOCAL_URL');
  }
  const keys = body.keys || {};
  AI_PROVIDERS.forEach(function (p) {
    const k = String(keys[p] || '').trim();
    if (k && k.length <= 400) update[AI_KEY_PROPS[p]] = k;
  });
  props.setProperties(update);
  (body.clearKeys || []).forEach(function (p) { if (AI_KEY_PROPS[p]) props.deleteProperty(AI_KEY_PROPS[p]); });
  return Object.assign({ success: true }, readAiConfig());
}

// ─── AI SCAN (runs here so no key ever reaches a browser) ────────
// body: { type:'aiScan', kind:'manifest'|'document', image:<base64 JPEG> }
// reply: { success, text, provider } — text is the engine's raw answer (JSON as text).
function aiScan(body) {
  const kind = String(body.kind || '');
  const prompt = AI_PROMPTS[kind];
  if (!prompt) return { success: false, code: 'bad_kind', error: 'Unknown scan type.' };
  const image = String(body.image || '');
  if (!image || image.length > AI_MAX_IMAGE_CHARS || !/^[A-Za-z0-9+\/=]+$/.test(image.slice(0, 200))) {
    return { success: false, code: 'bad_image', error: 'The page image is missing or too large.' };
  }

  const cache = CacheService.getScriptCache();
  const hourKey = 'ai_scans_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHH');
  const used = parseInt(cache.get(hourKey) || '0', 10);
  if (used >= AI_SCANS_PER_HOUR) {
    return { success: false, code: 'rate_limited', error: 'AI scan limit reached for this hour (' + AI_SCANS_PER_HOUR + '). Fill the fields by hand or try again next hour.' };
  }
  cache.put(hourKey, String(used + 1), 3700);

  const props = PropertiesService.getScriptProperties();
  const provider = props.getProperty('AI_PROVIDER') || 'gemini';
  const key = props.getProperty(AI_KEY_PROPS[provider]) || '';
  if (!key) {
    return { success: false, code: 'no_key', provider: provider, error: 'No ' + AI_ENGINE_NAMES[provider] + ' ' + (provider === 'local' ? 'access code' : 'API key') + ' is saved on the server yet — the CEO needs to add it once in ⚙ Settings.' };
  }
  try {
    let text;
    if (provider === 'openai')        text = aiOpenAiCompatible_('OpenAI', 'https://api.openai.com/v1/chat/completions', key, ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], prompt, image, {});
    else if (provider === 'deepseek') text = aiOpenAiCompatible_('DeepSeek', 'https://api.deepseek.com/chat/completions', key, ['deepseek-flash', 'deepseek-v4-pro'], prompt, image, { thinking: { type: 'disabled' } });
    else if (provider === 'claude')   text = aiClaude_(key, prompt, image);
    else if (provider === 'local')    text = aiLocal_(key, props.getProperty('AI_LOCAL_URL') || DEFAULT_LOCAL_URL, prompt, image);
    else                              text = aiGemini_(key, props.getProperty('AI_GEMINI_MODEL') || '', prompt, image);
    return { success: true, provider: provider, text: text };
  } catch (err) {
    return { success: false, code: 'engine_error', provider: provider, error: String(err && err.message ? err.message : err) };
  }
}

const AI_ENGINE_NAMES = { gemini: 'Google Gemini', openai: 'OpenAI', claude: 'Anthropic Claude', deepseek: 'DeepSeek', local: 'IBI Local AI' };

function aiFetch_(url, headers, payload) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', headers: headers,
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  let data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  return { status: res.getResponseCode(), data: data, raw: res.getContentText() };
}

function aiErrMsg_(r) {
  return (r.data && r.data.error && (r.data.error.message || r.data.error)) || ('HTTP ' + r.status);
}

// Gemini, with the same model fallback the website used.
function aiGemini_(key, preferred, prompt, image) {
  const chain = [preferred, 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash']
    .filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  let last = '', quota = false;
  for (let i = 0; i < chain.length; i++) {
    const r = aiFetch_('https://generativelanguage.googleapis.com/v1beta/models/' + chain[i] + ':generateContent',
      { 'x-goog-api-key': key },
      { contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 600 } });
    if (r.status === 200) {
      const c = r.data.candidates && r.data.candidates[0];
      return String((c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text) || '').trim();
    }
    const msg = String(aiErrMsg_(r));
    if (r.status === 429 || r.status === 404 || /limit:\s*0|quota|not\s+found|not\s+supported/i.test(msg)) {
      quota = quota || r.status === 429; last = chain[i] + ': ' + msg; continue;
    }
    throw new Error('Gemini ' + r.status + ': ' + msg);
  }
  if (quota) throw new Error('Gemini free-tier quota exhausted on all models. Wait ~1 min and retry, or the CEO can switch engine.');
  throw new Error(last || 'All Gemini models failed.');
}

// OpenAI and DeepSeek share the OpenAI request shape.
function aiOpenAiCompatible_(name, url, key, chain, prompt, image, extra) {
  let last = '';
  for (let i = 0; i < chain.length; i++) {
    const r = aiFetch_(url, { Authorization: 'Bearer ' + key }, Object.assign({
      model: chain[i], temperature: 0, max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + image } }
      ] }]
    }, extra));
    if (r.status === 200) {
      const ch = r.data.choices && r.data.choices[0];
      return String((ch && ch.message && ch.message.content) || '').trim();
    }
    const msg = String(aiErrMsg_(r));
    if (r.status === 404 || r.status === 429 || /model|does not exist|not found|quota|rate/i.test(msg)) { last = chain[i] + ': ' + msg; continue; }
    throw new Error(name + ' ' + r.status + ': ' + msg);
  }
  throw new Error(name + ' — ' + (last || 'all models failed.'));
}

function aiClaude_(key, prompt, image) {
  const chain = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'];
  let last = '';
  for (let i = 0; i < chain.length; i++) {
    const r = aiFetch_('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
      model: chain[i], max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: prompt }
      ] }]
    });
    if (r.status === 200) {
      const c = r.data.content && r.data.content[0];
      return String((c && c.text) || '').trim();
    }
    const msg = String(aiErrMsg_(r));
    if (r.status === 404 || r.status === 429 || r.status === 529 || /model|not_found|not found|overloaded|rate/i.test(msg)) { last = chain[i] + ': ' + msg; continue; }
    throw new Error('Claude ' + r.status + ': ' + msg);
  }
  throw new Error('Claude — ' + (last || 'all models failed.'));
}

// The laptop engine through its gateway. The access code goes in x-ibi-access,
// added here — the gateway accepts server calls that carry no Origin header.
// ⚠ Apps Script gives an outside call about a minute; a cold laptop can exceed it.
function aiLocal_(code, baseUrl, prompt, image) {
  let r;
  try {
    r = aiFetch_(baseUrl + '/v1/chat/completions', { 'x-ibi-access': code }, {
      model: 'qwen3.5:4b', max_tokens: 2048, temperature: 0,
      reasoning_effort: 'none',   // without this the model thinks and the answer comes back EMPTY
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + image } }
      ] }]
    });
  } catch (err) {
    const m = String(err && err.message ? err.message : err);
    if (/timeout|timed out/i.test(m)) throw new Error('IBI Local took too long to answer (the laptop may be busy or just waking). Try again, or the CEO can switch engine.');
    throw new Error('IBI Local — could not reach the laptop. It must be switched on and awake. (' + m + ')');
  }
  if (r.status === 401) throw new Error('IBI Local — the access code saved on the server was refused. The CEO needs to re-enter it in ⚙ Settings.');
  if (r.status === 403) throw new Error('IBI Local — the laptop gateway refused this request.');
  if (r.status !== 200) throw new Error('IBI Local ' + r.status + ': ' + String(r.raw || '').slice(0, 200));
  const ch = r.data.choices && r.data.choices[0];
  const text = String((ch && ch.message && ch.message.content) || '').trim();
  if (!text) throw new Error('IBI Local returned an empty answer — try Gemini for this page.');
  return text;
}

// The only two instructions this endpoint will run. Kept word-for-word with the
// website's versions.
const AI_PROMPTS = {
  manifest: `This is a shipping manifest PDF page from India Business International, an Indian eCommerce seller.

Analyse the page carefully and return ONLY a valid JSON object with these fields:

{
  "orderCount": <integer — count data rows in the shipment table, NOT the header row. Look for S.No. column: 1, 2, 3... The highest S.No. number = orderCount>,
  "date": "<string — date in DD-MM-YYYY format from the 'Date :' label, e.g. 29-05-2026. Return null if not found>",
  "platform": "<string — one of: Meesho, Amazon, Flipkart, Shopsy, ShopClues. Infer from the manifest format. Meesho manifests have 'Pickup Executive Signature', 'Free Size', and 14-digit AWB numbers. Return null if unknown>",
  "courier": "<string — courier name from 'Courier :' label, e.g. Delhivery. Return null if not found>"
}

Return ONLY the JSON object. No markdown, no explanation, no code blocks.`,
  document: `You are reading an eCommerce shipping document for the seller "India Business International" (brand iINTELLIGENCEi / IBI). It may be a Tax Invoice, a Shipping Label, or both combined (Amazon often prints the shipping label on the LEFT and the tax invoice on the RIGHT). Platform is one of: Amazon, Flipkart, Shopsy, Meesho, ShopClues.

Extract the details and return ONLY a valid JSON object (no markdown, no code fences):

{
  "docType": "invoice" or "manifest" — "manifest" if it is a multi-row pickup/handover list (Courier, S.No table); otherwise "invoice",
  "platform": "Amazon" | "Flipkart" | "Shopsy" | "Meesho" | "ShopClues" | null,
  "product": "<core product name ONLY — keep material + type + head noun, REMOVE every marketing adjective (e.g. drop 'Anti-Slip', 'Natural', 'Premium', 'Coconut Fiber', 'Entrance', 'Welcome', 'Heavy Duty'). APPEND the size (Small/Medium/Large/XL) or dimensions (e.g. '60x40 cm', '11.5 L') whenever shown — prefer the size in the SKU. Example: 'Coir Door Mat Small'. No quantity words. null for manifests>",
  "quantity": <integer total quantity of the product, null if unknown>,
  "orderCount": <integer number of orders/shipment rows, only for manifests, else null>,
  "invoiceDate": "<the INVOICE DATE in DD-MM-YYYY format. This is labelled 'Invoice Date' (on Amazon it is on the RIGHT side, just below 'Invoice Details'). NEVER use 'Order Date'. null if not found>",
  "shipDate": "<the SHIP DATE / pickup date in DD-MM-YYYY format. On Amazon it is in the shipping label (LEFT side) labelled 'Ship Date:' just under the Order Id. On Flipkart/Shopsy it is the HBD date. null if there is no shipping label / not found>",
  "colorVariant": "<color name if the product has a colour variant mentioned in the description, e.g. 'Navy Blue', 'Red', 'Dark Green'. null if not mentioned>"
}

Hints: Amazon invoice shows 'Amazon.in', ASIN like B0XXXXXXXX. Meesho shows 'Pickup Executive Signature', 'Free Size', 14-digit AWB. Flipkart/Shopsy show 'E-Kart Logistics', 'OD...' order ids and 'HBD'. ShopClues shows 'Powered by ShopClues.com', 'Ref:'. Count manifest rows by the S.No column. Return ONLY the JSON.`
};

function listRecentFiles(days) {
  const root = getFolderOrNull(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  if (!root) return [];
  const cutoff = Date.now() - Math.max(1, days || 3) * 86400000;
  const out = [];
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const fo = folders.next();
    if (fo.isTrashed()) continue;
    // Cheap pre-filter on the folder itself — a day folder last touched before the
    // cutoff cannot hold a file created after it.
    if (fo.getLastUpdated().getTime() < cutoff) continue;
    const files = fo.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const created = f.getDateCreated();
      if (created.getTime() < cutoff) continue;
      out.push({ id: f.getId(), name: f.getName(), folder: fo.getName(),
                 created: created.toISOString(), size: f.getSize() });
    }
  }
  out.sort((a, b) => (a.created < b.created ? 1 : -1));
  return out;
}

/**
 * Read-only: "what number would this order get?" Called when a PDF is parsed so the
 * website can show the final name before anything is uploaded. Never creates the
 * date folder — a lookup must not leave traces for an order that is never saved.
 */
function handleOrdinalLookup(body) {
  const folderDate = String(body.folderDate || '').trim().replace(/\s+/g, ' ');
  const baseName   = String(body.baseName || '').trim();
  const orderNo    = String(body.orderNo || '').trim();
  const fileHash   = String(body.fileHash || '').trim().toLowerCase();

  if (!folderDate || !baseName) throw new Error('Missing folderDate or baseName');
  if (!orderNo && !fileHash) return json({ success: true, ordinal: 1, reason: 'no identity' });

  const root   = DriveApp.getRootFolder();
  const parent = getFolderOrNull(root, ROOT_FOLDER_NAME);
  if (!parent) return json({ success: true, ordinal: 1, reason: 'no root folder yet' });

  // Was this order already filed under a DIFFERENT day? Checked even when today's
  // folder doesn't exist yet — that is exactly the case where a duplicate slips in.
  const elsewhere = findElsewhere(orderNo, 'Orders ' + folderDate, baseName);

  const dateFolder = getFolderOrNull(parent, 'Orders ' + folderDate);
  if (!dateFolder) {
    return json({ success: true, ordinal: 1, elsewhere: elsewhere, reason: 'no folder for that day yet' });
  }

  const scan = scanOrders(dateFolder, baseName, orderNo, fileHash);
  const same = scan.matches.length > 0;
  return json({
    success:   true,
    ordinal:   scan.ordinal,
    existing:  scan.total,
    sameOrder: same,
    sameName:  same ? scan.matches[0].file.getName() : '',
    identical: !!firstIdentical(scan.matches),
    unknown:   scan.unknowns.length,
    elsewhere: elsewhere,
    folder:    'Orders ' + folderDate
  });
}

/**
 * Has this order already been saved on ANOTHER day?
 *
 * The per-day scan only ever looks in the folder this upload is heading for, so an
 * order saved under "Orders 14 July 2026" is invisible when the same label is
 * processed on the 15th — and gets saved a second time. This searches the whole
 * "IBI Daily Orders" tree instead, so the same order can be spotted whatever day it
 * was filed under.
 *
 * It searches on the ORDER NUMBER because Drive's full-text index covers both a file's
 * description (where v8 stamps the order number) AND the text inside the PDF itself.
 * That second part matters: it finds orders saved before stamping existed, which no
 * amount of reading our own metadata could.
 *
 * Read-only. Returns [] rather than throwing — a duplicate warning is a help, and must
 * never be able to fail an upload.
 */
function findElsewhere(orderNo, targetFolder, baseName) {
  const out = [];
  if (!orderNo) return out;
  try {
    const root = getFolderOrNull(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    if (!root) return out;

    // scanOrders() already covers today's folder — but ONLY files whose name matches
    // this product's base name. So today's folder is not skipped wholesale here; only
    // the files scanOrders owns are. That difference matters: correct a product name
    // (Meesho's SKU is sometimes wrong) and the same order saved under the corrected
    // name has a different base, so nothing was checking it and it duplicated silently.
    const owned = baseName ? new RegExp(
      '^' + escapeRegex(baseName) + '(?:\\s+\\d+(?:st|nd|rd|th)\\s+Order)?(?:\\s+\\(\\d+\\))?\\.pdf$', 'i'
    ) : null;

    // Quote the whole order number so it's matched as one phrase. Deliberately NOT
    // falling back to the number without its "_1" sub-order suffix: that would match
    // sibling sub-orders, which are different orders, and a false "already saved"
    // warning is worse than none.
    const safe = String(orderNo).replace(/["\\]/g, '');
    const it = DriveApp.searchFiles('fullText contains "' + safe + '" and trashed = false');

    let guard = 0;
    while (it.hasNext() && guard++ < 40) {
      const f = it.next();
      const folderName = locateInOrders(f, root);
      if (!folderName) continue;                                        // outside IBI Daily Orders — not ours
      if (folderName === targetFolder && owned && owned.test(f.getName())) continue;  // scanOrders' territory

      // Prefer a stamped order number: it's exact. An unstamped hit is reported too
      // (Drive found this order number inside the PDF), just flagged as less certain.
      const info = readFileInfo(f);
      if (info && info.orderNo && info.orderNo !== orderNo) continue;   // stamped as a DIFFERENT order
      out.push({
        name:   f.getName(),
        folder: folderName,
        url:    'https://drive.google.com/file/d/' + f.getId() + '/view',
        exact:  !!(info && info.orderNo === orderNo)
      });
    }
  } catch (err) {
    // Search is unavailable or the query was rejected — degrade to "no warning".
    return out;
  }
  return out;
}

/**
 * If `file` sits directly in an "Orders <date>" folder inside the root, return that
 * folder's name; otherwise null. Keeps the search from reporting unrelated copies of
 * a label that happen to live elsewhere in the user's Drive.
 */
function locateInOrders(file, root) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    if (!/^Orders\s+/.test(p.getName())) continue;
    const grands = p.getParents();
    while (grands.hasNext()) {
      if (grands.next().getId() === root.getId()) return p.getName();
    }
  }
  return null;
}

/** The first provably byte-identical match, or null. */
function firstIdentical(matches) {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].identical) return matches[i];
  }
  return null;
}

/**
 * Look through a day-folder for files belonging to the same product group (baseName)
 * and work out what number a given order should carry.
 *
 * Returns { ordinal, total, sameOrderFiles }:
 *   • sameOrderFiles — files stamped with THIS order number. If any exist, `ordinal`
 *     is that file's existing number, so re-uploading an order reuses its name
 *     rather than inventing a new one.
 *   • otherwise `ordinal` is (highest number present + 1), i.e. the next free slot.
 */
function scanOrders(folder, baseName, orderNo, fileHash) {
  // "<base>.pdf" = 1st order; "<base> 2nd Order.pdf" = 2nd; the optional " (2)" tail
  // matches legacy copies made by v4-v6's Rename choice so they're counted too.
  const re = new RegExp(
    '^' + escapeRegex(baseName) + '(?:\\s+(\\d+)(?:st|nd|rd|th)\\s+Order)?(?:\\s+\\(\\d+\\))?\\.pdf$', 'i'
  );

  let maxOrdinal = 0;
  let total = 0;
  const matches  = [];   // {file, ordinal, identical} — provably THIS order
  const unknowns = [];   // {file, ordinal} — same product/day, identity unreadable

  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(re);
    if (!m) continue;                       // different product / different day-group

    // NOTE: never attach properties to a DriveApp File — it is a Java-backed host
    // object and rejects them. Carry the ordinal in a plain object alongside it.
    const ord = m[1] ? parseInt(m[1], 10) : 1;
    total++;
    if (ord > maxOrdinal) maxOrdinal = ord;

    const info = readFileInfo(f);
    if (info) {
      // Stamped by v7+: the order number is authoritative. A stamped file with a
      // different order number is a genuinely different order — no prompt needed.
      if ((orderNo  && info.orderNo === orderNo) ||
          (fileHash && info.hash    === fileHash)) {
        matches.push({ file: f, ordinal: ord, identical: (!!fileHash && info.hash === fileHash) });
      }
    } else {
      // No stamp (saved before v8). The name alone can't say which order this is, so
      // fall back to the bytes: an identical PDF is unambiguously the same order.
      // This is what stops a re-upload of a pre-v8 file becoming a bogus "2nd Order".
      if (fileHash && sha256OfFile(f) === fileHash) {
        matches.push({ file: f, ordinal: ord, identical: true });
      } else {
        unknowns.push({ file: f, ordinal: ord });
      }
    }
  }

  return {
    ordinal:  matches.length ? matches[0].ordinal : maxOrdinal + 1,
    next:     maxOrdinal + 1,
    total:    total,
    matches:  matches,
    unknowns: unknowns
  };
}

/** What v8 stamps on each saved file, or null for files saved by older versions. */
function readFileInfo(file) {
  try {
    const d = file.getDescription();
    if (!d) return null;
    const j = JSON.parse(d);
    if (!j || (!j.orderNo && !j.hash)) return null;
    return { orderNo: String(j.orderNo || ''), hash: String(j.hash || '') };
  } catch (e) {
    return null;   // not our JSON (hand-edited description) → treat as unidentified
  }
}

/** SHA-256 of a Drive file's bytes, hex — same encoding the website computes. */
function sha256OfFile(file) {
  try {
    const bytes  = file.getBlob().getBytes();
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    // computeDigest returns SIGNED bytes; mask before hex-encoding.
    let hex = '';
    for (let i = 0; i < digest.length; i++) {
      hex += ('0' + (digest[i] & 0xFF).toString(16)).slice(-2);
    }
    return hex;
  } catch (e) {
    return '';
  }
}

/** 1 → "" (the first order keeps the plain name), 2 → " 2nd Order", 3 → " 3rd Order". */
function ordinalSuffix(n) {
  const num = parseInt(n, 10) || 1;
  if (num < 2) return '';
  return ' ' + ordinalWord(num) + ' Order';
}

/** 1→"1st", 2→"2nd", 3→"3rd", 4→"4th", 11-13→"11th/12th/13th", 21→"21st". */
function ordinalWord(n) {
  const num = parseInt(n, 10) || 1;
  const rem100 = num % 100;
  if (rem100 >= 11 && rem100 <= 13) return num + 'th';
  switch (num % 10) {
    case 1:  return num + 'st';
    case 2:  return num + 'nd';
    case 3:  return num + 'rd';
    default: return num + 'th';
  }
}

/** "Meesho Coir Brush 1 Qty 15 Jul 2026 D 15 Jul 2nd Order" → "…D 15 Jul" */
function stripOrdinal(base) {
  return String(base).replace(/\s+\d+(?:st|nd|rd|th)\s+Order$/i, '').trim();
}

function dropExt(filename) {
  return String(filename).replace(/\.pdf$/i, '');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Next free "name (n).pdf" in the folder, starting at (2). Used for the "Rename — keep
 * both" choice on documents with no order number (e.g. manifests), so two genuinely
 * different files that share a filename are both preserved.
 */
function nextAvailableName(folder, filename) {
  const ext  = /\.pdf$/i.test(filename) ? filename.slice(filename.lastIndexOf('.')) : '';
  const base = ext ? filename.slice(0, filename.length - ext.length) : filename;
  let n = 2;
  while (folder.getFilesByName(base + ' (' + n + ')' + ext).hasNext()) n++;
  return base + ' (' + n + ')' + ext;
}

/**
 * Parse a date from an "Orders <day> <Month> <year>" folder name.
 * e.g. "Orders 1 June 2026" → Date(2026, 5, 1). Returns null if the name
 * isn't in that exact format (so unrelated folders are never touched).
 */
function parseFolderDate(folderName) {
  const m = String(folderName).match(/^Orders\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day  = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  const months = { january:0, february:1, march:2, april:3, may:4, june:5,
                   july:6, august:7, september:8, october:9, november:10, december:11 };
  const mon = months[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const d = new Date(year, mon, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Rolling retention. Deletes (trashes) any "Orders <date>" folder whose date is
 * KEEP_DAYS or more days before today. With KEEP_DAYS = 30: today plus the
 * previous 29 days are kept (30 folders); on the 31st day the 1st day's folder
 * is removed, and so on. Folders whose names don't parse as a date are ignored.
 */
function purgeOldFolders(parent, keepDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let purged = 0;
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    const d = parseFolderDate(f.getName());
    if (!d) continue;
    const ageDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (ageDays >= keepDays) {
      f.setTrashed(true);
      purged++;
    }
  }
  return purged;
}

/**
 * OPTIONAL: run this on a daily time-driven trigger so old folders are purged
 * even on days with no uploads.
 * Setup: Apps Script ▸ Triggers (clock icon) ▸ Add Trigger ▸ choose
 * dailyCleanup ▸ Time-driven ▸ Day timer ▸ (e.g. 1am–2am) ▸ Save.
 */
function dailyCleanup() {
  const parent = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const n = purgeOldFolders(parent, KEEP_DAYS);
  Logger.log('dailyCleanup: trashed ' + n + ' folder(s) older than ' + KEEP_DAYS + ' days.');
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Like getOrCreateFolder but never creates — for read-only lookups. */
function getFolderOrNull(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
