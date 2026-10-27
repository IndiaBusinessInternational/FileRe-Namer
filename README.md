# IBI File Re-Namer v5.93

v5.93 (27 Oct 2026): WhatsApp link preview now shows the banner (og-banner.jpg, 1200x630 JPEG under 300 KB; the 323 KB PNG was too big) and a round **Share this app** button sits in the top bar. Website-only; the Drive script stays v5.5.

The AI engine the CEO picks in Settings applies to every device, and API keys / the Local AI code live only on the Drive Apps Script, never in a browser. The website and the Drive Apps Script normally carry the same version number; v5.6–v5.93 are website-only changes, so the Drive script stays v5.5 (nothing to paste — Settings shows a grey note only).

v5.92 (13 Oct 2026): sending a batch whose files are ALREADY in Drive now says so as a success ("✓ All done — all 2 files were already saved in Drive earlier") instead of "skipped 2 already-saved", which staff read as a failure. **Download all stays available after sending** (every renamed file except unreadable ones and in-batch copies), so the PDFs can still be printed; before, it greyed out once everything was sent.

v5.91 (11 Oct 2026): long words on phones wrap at word boundaries (overflow-wrap break-word instead of anywhere (anywhere split button/label words mid-word on phones)).

v5.9 (11 Oct 2026): **phones edge to edge** (640 px and narrower) — the card fills the screen width with no outer gutter, no rounded corners or side borders, 10 px inner side padding, and the page can never be wider than the screen. Tablets, laptops and the two-column desktop layout are unchanged. Website-only; the Drive script stays v5.5.

v5.8 (9 Oct 2026): **two columns on laptop and desktop screens (1000 px and wider)** so the work fits one screen without scrolling. Left: pickup date, upload, split option, status. Right: the result — the new filename and Download / Send to GDrive / Clear All on one row at the top, the editable details below; or the review list with its three buttons on one row. A dashed "Your renamed files appear here" box holds the right side until a file is loaded. The top bar and logo band are slimmer on wide screens. Phones and narrow windows keep the single column in the original order.

v5.7 (9 Oct 2026): **the pickup date you pick is the despatch date — always.** Pick a date in Step 1 and every file uses it for the "D" date in its name and for its Drive folder (`Orders <date>`): one page, a multi-order sheet that is split, or many files at once. Changing the date while files are already in the review list re-dates every row on the spot (names you typed yourself keep your text; only their "D" date changes) and re-checks the new day's folder. A date you pick also beats any ship date read from the PDF or by AI. Before: a multi-order sheet (e.g. Meesho `Sub_Order_Labels`) always took today's date, and changing the date after loading did nothing to the list. Clear All (single-file form) returns to today.

v5.6 (7 Oct 2026): the Local AI hint names **Qwen 3.8 27B**, the office laptop's only model since 7 Oct 2026 (the Drive script still sends the old `qwen3.5:9b` name, now an alias of the 27B). It says honestly that a page takes about 4 to 5 minutes, longer than the Drive script and the tunnel wait, so most Local scans will time out — use Gemini.

v5.5 (6 Oct 2026): IBI Local reads pages on `qwen3.5:9b` with a 1280 px page image — the 4B on the laptop's processor took ~2 minutes a page and every Local scan hit the tunnel's 100-second limit (HTTP 524) from 16 Sep 2026.

# FileRe-Namer
FileRe-Namer renames the PDF Files that is uploaded.
