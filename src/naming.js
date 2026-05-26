const PLATFORMS = ["Amazon", "Flipkart", "Meesho", "Etsy"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const FIELD_LABELS = {
  platform: "eCommerce Platform",
  product: "Product Name",
  quantity: "Quantity",
  invoiceDate: "Invoice Date",
  pickupDate: "Pickup Date",
  orderCount: "Qty Orders"
};

function normalizeSpace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function monthIndex(value) {
  const candidate = value.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((month) => month.toLowerCase().startsWith(candidate));
}

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseHumanDate(value = "", fallbackYear = "") {
  const input = normalizeSpace(value);
  let match = input.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s./-]+([A-Za-z]{3,9})[\s,./-]+(20\d{2})\b/i);
  if (match) {
    const month = monthIndex(match[2]);
    return month >= 0 ? validIsoDate(match[3], month + 1, match[1]) : "";
  }

  match = input.match(/\b([A-Za-z]{3,9})[\s./-]+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/i);
  if (match) {
    const month = monthIndex(match[1]);
    return month >= 0 ? validIsoDate(match[3], month + 1, match[2]) : "";
  }

  match = input.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (match) {
    return validIsoDate(match[3], match[2], match[1]);
  }

  if (fallbackYear) {
    match = input.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s./-]+([A-Za-z]{3,9})\b/i);
    if (match) {
      const month = monthIndex(match[2]);
      return month >= 0 ? validIsoDate(fallbackYear, month + 1, match[1]) : "";
    }
  }

  return "";
}

export function formatDate(isoDate, includeYear = true) {
  if (!isoDate) {
    return "";
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || !MONTHS[month - 1]) {
    return "";
  }
  const parts = [day, MONTHS[month - 1].slice(0, 3)];
  if (includeYear) {
    parts.push(year);
  }
  return parts.join(" ");
}

function canonicalPlatform(text) {
  const platform = PLATFORMS.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(text));
  return platform || "";
}

function productFromText(text) {
  if (/\b(?:coconut\s+)?coir\s+brush(?:es)?\b/i.test(text)) {
    return "Coir Brush";
  }
  if (/\b(?:AL-URULI|aluminium\s+uruli)\b/i.test(text)) {
    return "Al Uruli BIS";
  }
  return "";
}

function cleanProduct(value) {
  return normalizeSpace(value)
    .replace(/\s+\d+\s+Qty\.?$/i, "")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim();
}

function dateAfterLabel(text, labels) {
  for (const label of labels) {
    const matcher = new RegExp(`${label}\\s*:?\\s*([\\s\\S]{0,70})`, "i");
    const context = text.match(matcher)?.[1];
    const date = context ? parseHumanDate(context) : "";
    if (date) {
      return date;
    }
  }
  return "";
}

function quantityFromText(text, product) {
  const patterns = product === "Coir Brush"
    ? [/\bCoir\s+Brush(?:es)?\s*[-|]?\s*(\d+)\s+Qty\b/i, /\b(\d+)\s+Qty\b/i]
    : [/TOTAL\s+QTY\s*:?\s*(\d+)/i, /\bQTY\s*:?\s*(\d+)\b/i];
  for (const pattern of patterns) {
    const quantity = text.match(pattern)?.[1];
    if (quantity) {
      return quantity;
    }
  }
  return "";
}

function ordersFromText(text) {
  const patterns = [
    /Total\s+Packages\s*:?\s*(\d+)/i,
    /Total\s+Shipments\s+to\s+Dispatch\s*:?\s*(\d+)/i,
    /Total\s+Shipments\s+to\s+Check\s*:?\s*(\d+)/i,
    /Total\s+items\s+picked\s*:?\s*(\d+)/i
  ];
  for (const pattern of patterns) {
    const count = text.match(pattern)?.[1];
    if (count) {
      return count;
    }
  }
  return "";
}

function fromExistingFilename(filename) {
  const base = filename.replace(/\.pdf$/i, "").trim();
  const platform = canonicalPlatform(base);
  const manifest = base.match(/\bManifest\s+(\d+)\s+Orders(?:\s+D)?\s+(.+)$/i);
  if (manifest) {
    return {
      type: "manifest",
      platform,
      orderCount: manifest[1],
      pickupDate: parseHumanDate(manifest[2])
    };
  }

  const invoice = base.match(/^(?:Amazon|Flipkart|Meesho|Etsy)\s+(.+?)\s+(\d+)\s+Qty\s+(.+?)\s+D\s+(.+)$/i);
  if (invoice) {
    const invoiceDate = parseHumanDate(invoice[3]);
    return {
      type: "invoice",
      platform,
      product: cleanProduct(invoice[1]),
      quantity: invoice[2],
      invoiceDate,
      pickupDate: parseHumanDate(invoice[4], invoiceDate.slice(0, 4))
    };
  }

  return { platform };
}

export function analyseDocument(text = "", filename = "") {
  const content = normalizeSpace(text);
  const existing = fromExistingFilename(filename);
  const combined = `${filename} ${content}`;
  const type = /\bmanifest\b/i.test(combined) ? "manifest" : (existing.type || "invoice");
  const platform = canonicalPlatform(combined) || existing.platform || "";

  if (type === "manifest") {
    return {
      type,
      platform,
      orderCount: ordersFromText(content) || existing.orderCount || "",
      pickupDate:
        dateAfterLabel(content, ["Pickup Date", "Manifest", "Dispatch Date"]) ||
        parseHumanDate(content) ||
        existing.pickupDate ||
        ""
    };
  }

  const product = productFromText(content) || existing.product || "";
  const invoiceDate =
    dateAfterLabel(content, ["Invoice Date", "Order Date"]) ||
    existing.invoiceDate ||
    "";
  return {
    type,
    platform,
    product,
    quantity: quantityFromText(content, product) || existing.quantity || "",
    invoiceDate,
    pickupDate:
      dateAfterLabel(content, ["Pickup Date", "Pickup On", "Ship By", "Dispatch Date"]) ||
      existing.pickupDate ||
      ""
  };
}

function safePart(value) {
  return normalizeSpace(String(value || ""))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/g, "");
}

export function missingFields(data) {
  const fields = data.type === "manifest"
    ? ["platform", "orderCount", "pickupDate"]
    : ["platform", "product", "quantity", "invoiceDate", "pickupDate"];
  return fields.filter((field) => !String(data[field] || "").trim()).map((field) => FIELD_LABELS[field]);
}

export function buildFilename(data) {
  if (missingFields(data).length > 0) {
    return "";
  }

  const platform = safePart(data.platform);
  let filename;
  if (data.type === "manifest") {
    filename = `${platform} Manifest ${safePart(data.orderCount)} Orders ${formatDate(data.pickupDate, true)}`;
  } else {
    const product = cleanProduct(safePart(data.product));
    filename = `${platform} ${product} ${safePart(data.quantity)} Qty ${formatDate(data.invoiceDate, true)} D ${formatDate(data.pickupDate, false)}`;
  }
  return `${safePart(filename)}.pdf`;
}
