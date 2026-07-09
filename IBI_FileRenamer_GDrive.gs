/**
 * IBI File Re-Namer — Google Drive Upload Endpoint  (v6 — idempotent uploads)
 * Google Apps Script (GAS) Web App
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ⚠ AFTER PASTING THIS, YOU MUST RE-DEPLOY A NEW VERSION:
 *     Deploy ▸ Manage deployments ▸ (pencil ✏️) ▸ Version: New version ▸ Deploy
 *     Otherwise Google keeps running the OLD code.
 * ══════════════════════════════════════════════════════════════════════
 *
 *  WHAT'S NEW IN v6:
 *   • IDEMPOTENT UPLOADS — fixes the intermittent "same PDF saved twice" bug.
 *     The website now sends a unique uploadId per click; doPost saves at most one
 *     file per id (recorded in CacheService for 10 min) and returns the original
 *     result if the browser auto-retries the POST after a CORS read failure.
 *     A LockService lock serializes the check+save so a retry can't race it.
 *
 *  WHAT'S NEW IN v4:
 *   • DUPLICATE PROMPT instead of silent replace. If a file with the EXACT same
 *     name already exists in the target "Orders <date>" folder, the upload pauses
 *     and the website asks: Overwrite, or Rename (keep both)?
 *       – Overwrite → the existing same-name file is trashed and replaced.
 *       – Rename    → saved as "name (2).pdf", "name (3).pdf", … (next free number),
 *                     so two genuinely-different orders that share a filename are
 *                     BOTH kept (no data loss).
 *     (v3 used to auto-trash same-order files silently — that could lose a real
 *      second order. v4 never deletes anything without an explicit Overwrite.)
 *   • 30-day rolling retention (see purgeOldFolders / dailyCleanup). v4 kept 15 days.
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
 *    { filename, pdfBase64, folderDate, conflict }
 *    conflict: ""          → check first; if the name exists, reply {conflict:true}
 *              "overwrite" → trash the existing same-name file, then save
 *              "rename"    → save as the next free "name (n).pdf"
 */

// ─── CONFIG ────────────────────────────────────────────────────
const ROOT_FOLDER_NAME = 'IBI Daily Orders';
const KEEP_DAYS = 30;   // rolling retention: folders older than this many days are auto-deleted
// ───────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No POST data received');

    const body       = JSON.parse(e.postData.contents);
    const filename   = String(body.filename || '').trim();
    const pdfBase64  = body.pdfBase64;
    const folderDate = String(body.folderDate || '').trim().replace(/\s+/g, ' ');
    const conflict   = String(body.conflict || '').trim().toLowerCase();  // '', 'overwrite', 'rename'
    const uploadId   = String(body.uploadId || '').trim();                // idempotency key (per click)

    if (!filename)   throw new Error('Missing filename');
    if (!pdfBase64)  throw new Error('Missing PDF data');
    if (!folderDate) throw new Error('Missing folderDate');

    // ── IDEMPOTENCY (fixes the intermittent double-save) ──────────────────────
    // A GAS /exec POST is NOT idempotent: every call reaching the save path below
    // calls createFile(). The website follows the /exec → googleusercontent 302
    // redirect; doPost (which saves the file) runs BEFORE that redirect. When the
    // browser can't read the redirected cross-origin response (intermittent CORS),
    // its fetch rejects even though the file WAS saved, and it auto-retries the
    // POST — producing a duplicate "name (2).pdf". We record each committed
    // uploadId briefly and short-circuit any repeat with the same id, so the retry
    // returns the original result instead of writing a second file.
    const cache    = CacheService.getScriptCache();
    const cacheKey = uploadId ? ('idem_' + uploadId) : '';

    // Serialize so a fast retry can't race the original request before it commits.
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

      // Existing files with the EXACT same name in this date folder.
      const existing = [];
      const dup = dateFolder.getFilesByName(filename);
      while (dup.hasNext()) existing.push(dup.next());

      // ── CHECK MODE: a same-name file exists and the caller hasn't chosen yet ──
      // No file is written here, so the uploadId is NOT recorded — the real save
      // that follows the user's Overwrite/Rename choice must still go through.
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

      // ── Decide the name to save under ──
      let saveName = filename;
      let replaced = 0;
      if (conflict === 'overwrite') {
        for (let i = 0; i < existing.length; i++) { existing[i].setTrashed(true); replaced++; }
      } else if (conflict === 'rename') {
        saveName = nextAvailableName(dateFolder, filename);
      }
      // (no existing file, or conflict already resolved → just save as saveName)

      // ── Save the file ──
      const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), MimeType.PDF, saveName);
      const file = dateFolder.createFile(blob);

      // ── RETENTION: delete order folders older than KEEP_DAYS (rolling window) ──
      const purgedFolders = purgeOldFolders(parent, KEEP_DAYS);

      const out = JSON.stringify({
        success:    true,
        filename:   saveName,
        requested:  filename,
        renamed:    (saveName !== filename),
        replaced:   replaced,
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
  return json({ status: 'active', rootFolder: ROOT_FOLDER_NAME, keepDays: KEEP_DAYS, version: 6, conflictPrompt: true, idempotent: true });
}

/**
 * Next free "name (n).pdf" in the folder, starting at (2). Used for the "Rename — keep
 * both" choice so two genuinely-different orders that share a filename are both preserved.
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

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
