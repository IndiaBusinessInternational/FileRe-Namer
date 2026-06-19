/**
 * IBI File Re-Namer — Google Drive Upload Endpoint  (v3 — dedup + 15-day retention)
 * Google Apps Script (GAS) Web App
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ⚠ AFTER PASTING THIS, YOU MUST RE-DEPLOY A NEW VERSION:
 *     Deploy ▸ Manage deployments ▸ (pencil ✏️) ▸ Version: New version ▸ Deploy
 *     Otherwise Google keeps running the OLD code.
 * ══════════════════════════════════════════════════════════════════════
 *
 *  WHAT'S NEW IN v3:
 *   • 15-day rolling retention — order folders older than KEEP_DAYS are auto-
 *     trashed on each upload (saves Drive space). Optional dailyCleanup trigger
 *     keeps it tidy even on no-upload days.
 *
 *  DEPLOY (first time):
 *  1. Paste this whole file into your Apps Script project.
 *  2. Deploy ▸ New deployment ▸ type "Web app".
 *  3. Execute as: Me   |   Who has access: Anyone
 *  4. Authorize Drive access when prompted (Advanced ▸ Go to project ▸ Allow).
 *  5. Copy the /exec URL into IBI File Re-Namer ▸ ⚙ Settings.
 *
 *  FOLDER STRUCTURE:
 *    IBI Daily Orders / Orders 1 June 2026 / <renamed file>.pdf
 *
 *  DE-DUPLICATION:
 *    Before saving, ALL existing files under "IBI Daily Orders" (every date
 *    subfolder) that match the same ORDER are trashed — both exact-name matches
 *    and "same order, different pickup/ship date" matches. So the same order can
 *    never be stored twice, even if re-uploaded with a corrected ship date.
 */

// ─── CONFIG ────────────────────────────────────────────────────
const ROOT_FOLDER_NAME = 'IBI Daily Orders';
const KEEP_DAYS = 15;   // rolling retention: folders older than this many days are auto-deleted
// ───────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No POST data received');

    const body       = JSON.parse(e.postData.contents);
    const filename    = String(body.filename || '').trim();
    const pdfBase64   = body.pdfBase64;
    const folderDate  = String(body.folderDate || '').trim().replace(/\s+/g, ' ');

    if (!filename)   throw new Error('Missing filename');
    if (!pdfBase64)  throw new Error('Missing PDF data');
    if (!folderDate) throw new Error('Missing folderDate');

    const root       = DriveApp.getRootFolder();
    const parent     = getOrCreateFolder(root, ROOT_FOLDER_NAME);
    const dateFolder = getOrCreateFolder(parent, 'Orders ' + folderDate);

    // ── DE-DUPLICATION across ALL "Orders ..." subfolders ──
    const newKey = stableKey(filename);
    let removed = 0;
    const subs = parent.getFolders();
    while (subs.hasNext()) {
      const sf = subs.next();
      const files = sf.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        const fn = f.getName();
        // Trash if exact same name OR same order (same key, pickup date ignored)
        if (fn === filename || stableKey(fn) === newKey) {
          f.setTrashed(true);
          removed++;
        }
      }
    }

    // ── Save the new file ──
    const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), MimeType.PDF, filename);
    const file = dateFolder.createFile(blob);

    // ── RETENTION: delete order folders older than KEEP_DAYS (rolling window) ──
    const purgedFolders = purgeOldFolders(parent, KEEP_DAYS);

    return json({
      success:    true,
      filename:   filename,
      folder:     'Orders ' + folderDate,
      replaced:   removed,
      purged:     purgedFolders,
      fileId:     file.getId(),
      fileUrl:    'https://drive.google.com/file/d/' + file.getId() + '/view',
      folderUrl:  'https://drive.google.com/drive/folders/' + dateFolder.getId()
    });

  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

function doGet() {
  return json({ status: 'active', rootFolder: ROOT_FOLDER_NAME, keepDays: KEEP_DAYS, version: 3 });
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
 * KEEP_DAYS or more days before today. With KEEP_DAYS = 15: today plus the
 * previous 14 days are kept (15 folders); on the 16th day the 1st day's folder
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

/**
 * Stable order key: filename minus the " D <pickup date>" tail and extension,
 * lower-cased. So these all collapse to the same key:
 *   "Amazon Food Strainer 1 Qty 31 May 2026 D 1 June 2026.pdf"
 *   "Amazon Food Strainer 1 Qty 31 May 2026 D 31 May.pdf"
 *   → "amazon food strainer 1 qty 31 may 2026"
 * The tail is matched specifically as " D <day> <month> [year]" so product names
 * that contain a stand-alone " D " (e.g. "Vitamin D ...") are NOT mis-stripped.
 */
function stableKey(filename) {
  return String(filename)
    .replace(/\.pdf$/i, '')
    .replace(/\s+D\s+\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
