/**
 * IBI File Re-Namer — Google Drive Upload Endpoint  (v7 — same-day order numbering)
 * Google Apps Script (GAS) Web App
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ⚠ AFTER PASTING THIS, YOU MUST RE-DEPLOY A NEW VERSION:
 *     Deploy ▸ Manage deployments ▸ (pencil ✏️) ▸ Version: New version ▸ Deploy
 *     Otherwise Google keeps running the OLD code.
 * ══════════════════════════════════════════════════════════════════════
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
 *    save:    { filename, pdfBase64, folderDate, conflict, uploadId, baseName, orderNo, customer }
 *    lookup:  { type:'ordinal', baseName, folderDate, orderNo }
 *    conflict: ""          → check first; if this same order is already there, reply {conflict:true}
 *              "overwrite" → trash the existing copy of this order, then save
 *              "rename"    → keep both: save under the next free order number
 */

// ─── CONFIG ────────────────────────────────────────────────────
const ROOT_FOLDER_NAME = 'IBI Daily Orders';
const KEEP_DAYS = 30;   // rolling retention: folders older than this many days are auto-deleted
// ───────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No POST data received');

    const body = JSON.parse(e.postData.contents);

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

      if (orderNo) {
        // ── Order-aware path: count this product's orders already in the folder ──
        const scan = scanOrders(dateFolder, baseName, orderNo);
        ordinal = scan.ordinal;

        if (scan.sameOrderFiles.length > 0 && conflict !== 'overwrite' && conflict !== 'rename') {
          // THIS order (same order number) is already saved → ask before touching it.
          // A DIFFERENT order never reaches here: it just gets the next number below.
          return json({
            success:       false,
            conflict:      true,
            filename:      scan.sameOrderFiles[0].getName(),
            folder:        'Orders ' + folderDate,
            existingCount: scan.sameOrderFiles.length,
            existingUrl:   'https://drive.google.com/file/d/' + scan.sameOrderFiles[0].getId() + '/view',
            sameOrder:     true,
            orderNo:       orderNo,
            suggestedName: baseName + ordinalSuffix(scan.ordinal) + '.pdf'
          });
        }

        if (conflict === 'overwrite') {
          // Replace this order's existing copy in place, keeping its number.
          ordinal = scan.sameOrderFiles.length ? scan.sameOrderFiles[0].ordinal : scan.ordinal;
          for (let i = 0; i < scan.sameOrderFiles.length; i++) {
            scan.sameOrderFiles[i].setTrashed(true);
            replaced++;
          }
        }
        // 'rename' and the plain new-order path both take the next free number.
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
      if (orderNo) {
        try {
          file.setDescription(JSON.stringify({
            orderNo:  orderNo,
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

function doGet() {
  return json({
    status: 'active', rootFolder: ROOT_FOLDER_NAME, keepDays: KEEP_DAYS,
    version: 7, conflictPrompt: true, idempotent: true, orderNumbering: true
  });
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

  if (!folderDate || !baseName) throw new Error('Missing folderDate or baseName');
  if (!orderNo) return json({ success: true, ordinal: 1, reason: 'no order number' });

  const root   = DriveApp.getRootFolder();
  const parent = getFolderOrNull(root, ROOT_FOLDER_NAME);
  if (!parent) return json({ success: true, ordinal: 1, reason: 'no root folder yet' });

  const dateFolder = getFolderOrNull(parent, 'Orders ' + folderDate);
  if (!dateFolder) return json({ success: true, ordinal: 1, reason: 'no folder for that day yet' });

  const scan = scanOrders(dateFolder, baseName, orderNo);
  return json({
    success:   true,
    ordinal:   scan.ordinal,
    existing:  scan.total,
    sameOrder: scan.sameOrderFiles.length > 0,
    folder:    'Orders ' + folderDate
  });
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
function scanOrders(folder, baseName, orderNo) {
  // "<base>.pdf" = 1st order; "<base> 2nd Order.pdf" = 2nd; the optional " (2)" tail
  // matches legacy copies made by v4-v6's Rename choice so they're counted too.
  const re = new RegExp(
    '^' + escapeRegex(baseName) + '(?:\\s+(\\d+)(?:st|nd|rd|th)\\s+Order)?(?:\\s+\\(\\d+\\))?\\.pdf$', 'i'
  );

  let maxOrdinal = 0;
  let total = 0;
  const sameOrderFiles = [];

  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(re);
    if (!m) continue;                       // different product / different day-group

    const ord = m[1] ? parseInt(m[1], 10) : 1;
    total++;
    if (ord > maxOrdinal) maxOrdinal = ord;

    if (readOrderNo(f) === orderNo) {
      f.ordinal = ord;                      // remember which slot this order already owns
      sameOrderFiles.push(f);
    }
  }

  if (sameOrderFiles.length > 0) {
    return { ordinal: sameOrderFiles[0].ordinal, total: total, sameOrderFiles: sameOrderFiles };
  }
  return { ordinal: maxOrdinal + 1, total: total, sameOrderFiles: [] };
}

/** The order number stamped on a file by v7+, or '' for files saved by older versions. */
function readOrderNo(file) {
  try {
    const d = file.getDescription();
    if (!d) return '';
    const j = JSON.parse(d);
    return String(j.orderNo || '');
  } catch (e) {
    return '';   // not our JSON (hand-edited description) → treat as unknown
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
