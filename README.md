# IBI File Re-Namer v5.8

The AI engine the CEO picks in Settings applies to every device, and API keys / the Local AI code live only on the Drive Apps Script, never in a browser. The website and the Drive Apps Script normally carry the same version number; v5.6–v5.8 are website-only changes, so the Drive script stays v5.5 (nothing to paste — Settings shows a grey note only).

v5.8 (9 Oct 2026): **two columns on laptop and desktop screens (1000 px and wider)** so the work fits one screen without scrolling. Left: pickup date, upload, split option, status. Right: the result — the new filename and Download / Send to GDrive / Clear All on one row at the top, the editable details below; or the review list with its three buttons on one row. A dashed "Your renamed files appear here" box holds the right side until a file is loaded. The top bar and logo band are slimmer on wide screens. Phones and narrow windows keep the single column in the original order.

v5.7 (9 Oct 2026): **the pickup date you pick is the despatch date — always.** Pick a date in Step 1 and every file uses it for the "D" date in its name and for its Drive folder (`Orders <date>`): one page, a multi-order sheet that is split, or many files at once. Changing the date while files are already in the review list re-dates every row on the spot (names you typed yourself keep your text; only their "D" date changes) and re-checks the new day's folder. A date you pick also beats any ship date read from the PDF or by AI. Before: a multi-order sheet (e.g. Meesho `Sub_Order_Labels`) always took today's date, and changing the date after loading did nothing to the list. Clear All (single-file form) returns to today.

v5.6 (7 Oct 2026): the Local AI hint names **Qwen 3.8 27B**, the office laptop's only model since 7 Oct 2026 (the Drive script still sends the old `qwen3.5:9b` name, now an alias of the 27B). It says honestly that a page takes about 4 to 5 minutes, longer than the Drive script and the tunnel wait, so most Local scans will time out — use Gemini.

v5.5 (6 Oct 2026): IBI Local reads pages on `qwen3.5:9b` with a 1280 px page image — the 4B on the laptop's processor took ~2 minutes a page and every Local scan hit the tunnel's 100-second limit (HTTP 524) from 16 Sep 2026.

# FileRe-Namer
FileRe-Namer renames the PDF Files that is uploaded.
