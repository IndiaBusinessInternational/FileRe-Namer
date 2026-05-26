import * as pdfjs from "../vendor/pdfjs/build/pdf.min.mjs";
import { analyseDocument, buildFilename, missingFields } from "./naming.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/build/pdf.worker.min.mjs", import.meta.url).href;

const elements = {
  body: document.body,
  chooseButton: document.querySelector("#chooseButton"),
  clearAfterDownload: document.querySelector("#clearAfterDownload"),
  clearButton: document.querySelector("#clearButton"),
  customPlatform: document.querySelector("#customPlatform"),
  customPlatformField: document.querySelector("#customPlatformField"),
  downloadButton: document.querySelector("#downloadButton"),
  dropzone: document.querySelector("#dropzone"),
  fileCard: document.querySelector("#fileCard"),
  fileInput: document.querySelector("#fileInput"),
  invoiceDate: document.querySelector("#invoiceDate"),
  invoiceFields: document.querySelector("#invoiceFields"),
  manifestFields: document.querySelector("#manifestFields"),
  manifestToggle: document.querySelector("#manifestToggle"),
  orderCount: document.querySelector("#orderCount"),
  outputName: document.querySelector("#outputName"),
  pickupDate: document.querySelector("#pickupDate"),
  platform: document.querySelector("#platform"),
  product: document.querySelector("#product"),
  quantity: document.querySelector("#quantity"),
  renameForm: document.querySelector("#renameForm"),
  selectedFileMeta: document.querySelector("#selectedFileMeta"),
  selectedFileName: document.querySelector("#selectedFileName"),
  status: document.querySelector("#status"),
  statusText: document.querySelector("#statusText"),
  themeToggle: document.querySelector("#themeToggle"),
  typeDescription: document.querySelector("#typeDescription"),
  validationMessage: document.querySelector("#validationMessage")
};

let selectedFile = null;

function setStatus(level, message) {
  elements.status.className = `status ${level}`;
  elements.statusText.textContent = message;
}

function documentType() {
  return elements.manifestToggle.checked ? "manifest" : "invoice";
}

function platformValue() {
  return elements.platform.value === "Other" ? elements.customPlatform.value.trim() : elements.platform.value;
}

function formValues() {
  return {
    type: documentType(),
    platform: platformValue(),
    product: elements.product.value.trim(),
    quantity: elements.quantity.value,
    invoiceDate: elements.invoiceDate.value,
    pickupDate: elements.pickupDate.value,
    orderCount: elements.orderCount.value
  };
}

function syncTypeDisplay() {
  const manifest = documentType() === "manifest";
  elements.typeDescription.textContent = manifest ? "Manifest" : "Invoice & Shipping Label";
  elements.invoiceFields.classList.toggle("hidden", manifest);
  elements.manifestFields.classList.toggle("hidden", !manifest);
  refreshFilename();
}

function syncPlatformDisplay() {
  elements.customPlatformField.classList.toggle("hidden", elements.platform.value !== "Other");
  refreshFilename();
}

function refreshFilename() {
  const data = formValues();
  const filename = buildFilename(data);
  const missing = missingFields(data);
  if (filename) {
    elements.outputName.textContent = filename;
    elements.validationMessage.textContent = selectedFile ? "" : "Upload a PDF to enable download.";
  } else {
    elements.outputName.textContent = "Complete the required details to create a filename.";
    elements.validationMessage.textContent = missing.length ? `Still needed: ${missing.join(", ")}.` : "";
  }
  elements.downloadButton.disabled = !filename || !selectedFile;
}

function setSuggestion(suggestion) {
  elements.manifestToggle.checked = suggestion.type === "manifest";
  if (suggestion.platform && [...elements.platform.options].some((option) => option.value === suggestion.platform)) {
    elements.platform.value = suggestion.platform;
  } else if (suggestion.platform) {
    elements.platform.value = "Other";
    elements.customPlatform.value = suggestion.platform;
  }
  elements.product.value = suggestion.product || "";
  elements.quantity.value = suggestion.quantity || "";
  elements.invoiceDate.value = suggestion.invoiceDate || "";
  elements.pickupDate.value = suggestion.pickupDate || "";
  elements.orderCount.value = suggestion.orderCount || "";
  syncPlatformDisplay();
  syncTypeDisplay();
}

function readableSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  return `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB`;
}

async function extractPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("The selected file does not appear to be a valid PDF.");
  }
  const loadingTask = pdfjs.getDocument({
    data: bytes
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join(""));
  }
  await pdf.destroy();
  return pages.join("\n");
}

async function loadFile(file) {
  if (!file || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
    setStatus("error", "Please choose a PDF file.");
    return;
  }

  selectedFile = file;
  elements.selectedFileName.textContent = file.name;
  elements.selectedFileMeta.textContent = readableSize(file.size);
  elements.fileCard.classList.remove("hidden");
  setStatus("idle", "Reading document details locally...");
  elements.downloadButton.disabled = true;

  try {
    const text = await extractPdfText(file);
    const suggestion = analyseDocument(text, file.name);
    setSuggestion(suggestion);
    const missing = missingFields(formValues());
    if (missing.length) {
      setStatus("warning", `Some details need review: ${missing.join(", ")}.`);
    } else {
      setStatus("success", "Filename prepared. Review it and download the renamed PDF.");
    }
  } catch (error) {
    selectedFile = null;
    elements.downloadButton.disabled = true;
    setStatus("error", error.message || "This PDF could not be read.");
  }
}

function clearAll(showStatus = true) {
  selectedFile = null;
  elements.fileInput.value = "";
  elements.renameForm.reset();
  elements.manifestToggle.checked = false;
  elements.fileCard.classList.add("hidden");
  syncPlatformDisplay();
  syncTypeDisplay();
  if (showStatus) {
    setStatus("idle", "Cleared. Ready for another PDF file.");
  }
}

function downloadRenamedFile() {
  const filename = buildFilename(formValues());
  if (!selectedFile || !filename) {
    refreshFilename();
    return;
  }
  const objectUrl = URL.createObjectURL(selectedFile);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = filename;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  if (elements.clearAfterDownload.checked) {
    clearAll(false);
    setStatus("success", `Downloaded ${filename}. Fields have been cleared.`);
  } else {
    setStatus("success", `Downloaded ${filename}.`);
  }
}

function setTheme(useLightTheme) {
  elements.body.dataset.theme = useLightTheme ? "light" : "dark";
  elements.themeToggle.checked = useLightTheme;
  try {
    window.localStorage.setItem("ibi-theme", useLightTheme ? "light" : "dark");
  } catch {
    // Storage can be unavailable in private browser sessions.
  }
}

elements.chooseButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
elements.downloadButton.addEventListener("click", downloadRenamedFile);
elements.clearButton.addEventListener("click", () => clearAll());
elements.manifestToggle.addEventListener("change", syncTypeDisplay);
elements.platform.addEventListener("change", syncPlatformDisplay);
elements.renameForm.addEventListener("input", refreshFilename);
elements.themeToggle.addEventListener("change", () => setTheme(elements.themeToggle.checked));

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.add("drag-over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove("drag-over");
  });
}
elements.dropzone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

let savedTheme = "dark";
try {
  savedTheme = window.localStorage.getItem("ibi-theme") || "dark";
} catch {
  savedTheme = "dark";
}
setTheme(savedTheme === "light");
syncTypeDisplay();
