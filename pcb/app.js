const state = {
  gerberName: "",
  outlineName: "",
  bounds: null,
  imageFile: null,
  image: null,
  imageDataUrl: "",
  fit: "contain",
  preparedDataUrl: "",
  generatedScript: "",
};

const els = {
  themeToggle: document.getElementById("themeToggle"),
  gerberInput: document.getElementById("gerberInput"),
  imageInput: document.getElementById("imageInput"),
  gerberDrop: document.getElementById("gerberDrop"),
  imageDrop: document.getElementById("imageDrop"),
  gerberFileName: document.getElementById("gerberFileName"),
  imageFileName: document.getElementById("imageFileName"),
  gerberStatus: document.getElementById("gerberStatus"),
  imageStatus: document.getElementById("imageStatus"),
  marginInput: document.getElementById("marginInput"),
  dpiInput: document.getElementById("dpiInput"),
  sideInput: document.getElementById("sideInput"),
  mirrorInput: document.getElementById("mirrorInput"),
  prepareButton: document.getElementById("prepareButton"),
  statusDot: document.getElementById("statusDot"),
  resultStatus: document.getElementById("resultStatus"),
  boardSizeMetric: document.getElementById("boardSizeMetric"),
  outlineMetric: document.getElementById("outlineMetric"),
  originMetric: document.getElementById("originMetric"),
  sourceMetric: document.getElementById("sourceMetric"),
  sourceRatioMetric: document.getElementById("sourceRatioMetric"),
  outputMetric: document.getElementById("outputMetric"),
  outputDpiMetric: document.getElementById("outputDpiMetric"),
  fitReadout: document.getElementById("fitReadout"),
  previewCanvas: document.getElementById("previewCanvas"),
  outputState: document.getElementById("outputState"),
  downloadPngButton: document.getElementById("downloadPngButton"),
  copyScriptButton: document.getElementById("copyScriptButton"),
  downloadScriptButton: document.getElementById("downloadScriptButton"),
  scriptLayer: document.getElementById("scriptLayer"),
  scriptPosition: document.getElementById("scriptPosition"),
  scriptSize: document.getElementById("scriptSize"),
};

function setTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  els.themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  els.themeToggle.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  try { localStorage.setItem("pcb-silkscreen-theme", theme); } catch {}
  requestAnimationFrame(drawPreview);
}

els.themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

function setupDropZone(zone, input, handler) {
  for (const eventName of ["dragenter", "dragover"]) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("is-dragging");
    });
  }
  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files?.[0];
    if (file) handler(file);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) handler(file);
  });
}

function formatMm(value, digits = 3) {
  return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function resetOutput() {
  state.preparedDataUrl = "";
  state.generatedScript = "";
  els.outputState.textContent = "Not prepared";
  els.downloadPngButton.disabled = true;
  els.copyScriptButton.disabled = true;
  els.downloadScriptButton.disabled = true;
  els.outputMetric.textContent = "—";
  els.outputDpiMetric.textContent = "Generated on demand";
  els.scriptLayer.textContent = "—";
  els.scriptPosition.textContent = "—";
  els.scriptSize.textContent = "—";
}

function updateReadyState(errorMessage = "") {
  const ready = Boolean(state.bounds && state.image);
  els.prepareButton.disabled = !ready;
  els.statusDot.classList.toggle("is-ready", ready && !errorMessage);
  els.statusDot.classList.toggle("is-error", Boolean(errorMessage));
  if (errorMessage) els.resultStatus.textContent = errorMessage;
  else if (ready) els.resultStatus.textContent = "Ready to prepare output";
  else if (state.bounds) els.resultStatus.textContent = "Board loaded — add artwork";
  else if (state.image) els.resultStatus.textContent = "Artwork loaded — add Gerber ZIP";
  else els.resultStatus.textContent = "Add a Gerber ZIP and image";
  drawPreview();
}

function pickOutlineFile(files) {
  const candidates = files
    .filter((entry) => !entry.dir)
    .map((entry) => {
      const name = entry.name;
      const base = name.split("/").pop();
      const lower = base.toLowerCase();
      let score = -1;
      if (/boardoutline/.test(lower)) score = 100;
      else if (/profile/.test(lower)) score = 90;
      else if (/edge.?cuts?/.test(lower)) score = 85;
      else if (/\.gko$/.test(lower)) score = 80;
      else if (/\.gm1?$/.test(lower)) score = 70;
      else if (/\.gml$/.test(lower)) score = 65;
      else if (/outline/.test(lower)) score = 55;
      return { entry, score, base };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.base.length - b.base.length);
  return candidates[0]?.entry || null;
}

function parseCoordinate(raw, integerDigits, decimalDigits, zeroMode) {
  if (raw == null) return null;
  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^[+-]/, "");
  if (unsigned.includes(".")) return sign * Number(unsigned);
  const total = integerDigits + decimalDigits;
  const padded = zeroMode === "T" ? unsigned.padEnd(total, "0") : unsigned.padStart(total, "0");
  return sign * Number(padded) / (10 ** decimalDigits);
}

function parseGerberBounds(text) {
  const unit = /%MOIN\*%|\bG70\*/i.test(text) ? "in" : "mm";
  const fs = text.match(/%FS([LT])?[AI]?X(\d)(\d)Y(\d)(\d)\*%/i);
  const zeroMode = fs?.[1]?.toUpperCase() || "L";
  const xInteger = Number(fs?.[2] || (unit === "in" ? 2 : 4));
  const xDecimal = Number(fs?.[3] || 5);
  const yInteger = Number(fs?.[4] || xInteger);
  const yDecimal = Number(fs?.[5] || xDecimal);
  const points = [];
  let currentX = null;
  let currentY = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("G04") || line.startsWith("%")) continue;
    const xMatch = line.match(/X([+-]?\d+(?:\.\d+)?)/i);
    const yMatch = line.match(/Y([+-]?\d+(?:\.\d+)?)/i);
    if (!xMatch && !yMatch) continue;
    if (xMatch) currentX = parseCoordinate(xMatch[1], xInteger, xDecimal, zeroMode);
    if (yMatch) currentY = parseCoordinate(yMatch[1], yInteger, yDecimal, zeroMode);
    if (Number.isFinite(currentX) && Number.isFinite(currentY)) points.push([currentX, currentY]);
  }

  if (points.length < 2) throw new Error("The outline file does not contain enough XY coordinates.");
  const unitScale = unit === "in" ? 25.4 : 1;
  const xs = points.map((point) => point[0] * unitScale);
  const ys = points.map((point) => point[1] * unitScale);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    sourceUnit: unit,
    pointCount: points.length,
  };
  bounds.width = bounds.maxX - bounds.minX;
  bounds.height = bounds.maxY - bounds.minY;
  if (!(bounds.width > 0 && bounds.height > 0)) throw new Error("The parsed board extent has zero width or height.");
  return bounds;
}

async function handleGerber(file) {
  resetOutput();
  state.bounds = null;
  state.gerberName = file.name;
  els.gerberFileName.textContent = file.name;
  els.gerberStatus.className = "inline-status";
  els.gerberStatus.textContent = "Reading ZIP…";
  try {
    if (!window.JSZip) throw new Error("ZIP parser did not load. Check the network connection and reload the page.");
    const zip = await window.JSZip.loadAsync(file);
    const outlineEntry = pickOutlineFile(Object.values(zip.files));
    if (!outlineEntry) throw new Error("No board-outline Gerber was found (.GKO, .GM or .GML).");
    const text = await outlineEntry.async("text");
    const bounds = parseGerberBounds(text);
    state.bounds = bounds;
    state.outlineName = outlineEntry.name.split("/").pop();
    els.gerberStatus.className = "inline-status is-ready";
    els.gerberStatus.textContent = `Using ${state.outlineName}; ${bounds.pointCount} coordinate points parsed.`;
    els.boardSizeMetric.textContent = `${formatMm(bounds.width)} × ${formatMm(bounds.height)} mm`;
    els.outlineMetric.textContent = state.outlineName;
    els.originMetric.textContent = `${formatMm(bounds.minX)}, ${formatMm(bounds.minY)} mm`;
    updateReadyState();
  } catch (error) {
    console.error(error);
    els.gerberStatus.className = "inline-status is-error";
    els.gerberStatus.textContent = error.message;
    els.boardSizeMetric.textContent = "—";
    els.outlineMetric.textContent = "Outline could not be parsed";
    els.originMetric.textContent = "—";
    updateReadyState("Gerber outline could not be parsed");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be decoded."));
    image.src = dataUrl;
  });
}

async function handleImage(file) {
  resetOutput();
  state.image = null;
  state.imageFile = file;
  els.imageFileName.textContent = file.name;
  els.imageStatus.className = "inline-status";
  els.imageStatus.textContent = "Reading image…";
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    state.imageDataUrl = dataUrl;
    state.image = image;
    els.imageStatus.className = "inline-status is-ready";
    els.imageStatus.textContent = `${image.naturalWidth} × ${image.naturalHeight} px, ${file.type || "image"}.`;
    els.sourceMetric.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    els.sourceRatioMetric.textContent = `Aspect ratio ${(image.naturalWidth / image.naturalHeight).toFixed(3)}:1`;
    updateReadyState();
  } catch (error) {
    console.error(error);
    els.imageStatus.className = "inline-status is-error";
    els.imageStatus.textContent = error.message;
    els.sourceMetric.textContent = "—";
    els.sourceRatioMetric.textContent = "Artwork could not be loaded";
    updateReadyState("Artwork could not be loaded");
  }
}

function getPlacement(boardPixelWidth, boardPixelHeight) {
  const marginMm = Math.max(0, Number(els.marginInput.value) || 0);
  const maxMargin = state.bounds ? Math.min(state.bounds.width, state.bounds.height) / 2 : 0;
  const safeMarginMm = Math.min(marginMm, Math.max(0, maxMargin - 0.001));
  const pxPerMmX = boardPixelWidth / state.bounds.width;
  const pxPerMmY = boardPixelHeight / state.bounds.height;
  const marginX = safeMarginMm * pxPerMmX;
  const marginY = safeMarginMm * pxPerMmY;
  const inner = {
    x: marginX,
    y: marginY,
    width: Math.max(1, boardPixelWidth - 2 * marginX),
    height: Math.max(1, boardPixelHeight - 2 * marginY),
  };
  const imageRatio = state.image.naturalWidth / state.image.naturalHeight;
  const innerRatio = inner.width / inner.height;
  let width = inner.width;
  let height = inner.height;

  if (state.fit === "contain") {
    if (imageRatio > innerRatio) height = width / imageRatio;
    else width = height * imageRatio;
  } else if (state.fit === "cover") {
    if (imageRatio > innerRatio) width = height * imageRatio;
    else height = width / imageRatio;
  }
  return {
    inner,
    drawX: inner.x + (inner.width - width) / 2,
    drawY: inner.y + (inner.height - height) / 2,
    drawWidth: width,
    drawHeight: height,
    marginMm: safeMarginMm,
  };
}

function drawArtwork(ctx, boardWidth, boardHeight, preview = false) {
  const placement = getPlacement(boardWidth, boardHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(placement.inner.x, placement.inner.y, placement.inner.width, placement.inner.height);
  ctx.clip();
  if (els.mirrorInput.checked) {
    ctx.translate(boardWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(state.image, boardWidth - placement.drawX - placement.drawWidth, placement.drawY, placement.drawWidth, placement.drawHeight);
  } else {
    ctx.drawImage(state.image, placement.drawX, placement.drawY, placement.drawWidth, placement.drawHeight);
  }
  ctx.restore();

  if (preview && placement.marginMm > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(19,120,101,.9)";
    ctx.lineWidth = Math.max(1.5, Math.min(boardWidth, boardHeight) / 250);
    ctx.setLineDash([8, 7]);
    ctx.strokeRect(placement.inner.x, placement.inner.y, placement.inner.width, placement.inner.height);
    ctx.restore();
  }
}

function drawPreview() {
  const canvas = els.previewCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--panel-2").trim() || "#f8fafb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!state.bounds) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#5e6d73";
    ctx.font = "600 24px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Load a Gerber ZIP to detect the board", canvas.width / 2, canvas.height / 2);
    return;
  }

  const padding = 62;
  const scale = Math.min((canvas.width - 2 * padding) / state.bounds.width, (canvas.height - 2 * padding) / state.bounds.height);
  const boardWidth = state.bounds.width * scale;
  const boardHeight = state.bounds.height * scale;
  const boardX = (canvas.width - boardWidth) / 2;
  const boardY = (canvas.height - boardHeight) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.22)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.restore();

  if (state.image) {
    ctx.save();
    ctx.translate(boardX, boardY);
    ctx.beginPath();
    ctx.rect(0, 0, boardWidth, boardHeight);
    ctx.clip();
    drawArtwork(ctx, boardWidth, boardHeight, true);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(29,41,46,.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, boardY, boardWidth, boardHeight);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#1d292e";
  ctx.font = "600 18px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${formatMm(state.bounds.width)} mm`, boardX + boardWidth / 2, boardY + boardHeight + 33);
  ctx.save();
  ctx.translate(boardX - 33, boardY + boardHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${formatMm(state.bounds.height)} mm`, 0, 0);
  ctx.restore();
}

async function prepareOutput() {
  if (!state.bounds || !state.image) return;
  resetOutput();
  els.prepareButton.disabled = true;
  els.prepareButton.textContent = "Preparing…";
  try {
    const dpi = Number(els.dpiInput.value);
    const widthPx = Math.max(1, Math.round(state.bounds.width / 25.4 * dpi));
    const heightPx = Math.max(1, Math.round(state.bounds.height / 25.4 * dpi));
    const pixelCount = widthPx * heightPx;
    if (pixelCount > 60_000_000) throw new Error("The selected DPI would create more than 60 megapixels. Reduce the DPI.");

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawArtwork(ctx, widthPx, heightPx, false);
    state.preparedDataUrl = canvas.toDataURL("image/png");
    state.generatedScript = buildEasyEdaScript(state.preparedDataUrl);

    const side = els.sideInput.value;
    els.outputMetric.textContent = `${widthPx} × ${heightPx} px`;
    els.outputDpiMetric.textContent = `${dpi} DPI over ${formatMm(state.bounds.width)} × ${formatMm(state.bounds.height)} mm`;
    els.outputState.textContent = "Ready";
    els.downloadPngButton.disabled = false;
    els.copyScriptButton.disabled = false;
    els.downloadScriptButton.disabled = false;
    els.scriptLayer.textContent = side === "top" ? "Top silkscreen (3)" : "Bottom silkscreen (4)";
    els.scriptPosition.textContent = `${formatMm(state.bounds.minX)}, ${formatMm(state.bounds.minY)} mm`;
    els.scriptSize.textContent = `${formatMm(state.bounds.width)} × ${formatMm(state.bounds.height)} mm`;
    els.resultStatus.textContent = "Silkscreen output prepared";
    els.statusDot.classList.add("is-ready");
  } catch (error) {
    console.error(error);
    els.outputState.textContent = "Failed";
    els.resultStatus.textContent = error.message;
    els.statusDot.classList.remove("is-ready");
    els.statusDot.classList.add("is-error");
  } finally {
    els.prepareButton.disabled = false;
    els.prepareButton.textContent = "Prepare silkscreen output";
  }
}

function mmToMil(value) {
  return value / 25.4 * 1000;
}

function buildEasyEdaScript(dataUrl) {
  const side = els.sideInput.value;
  const layer = side === "top" ? 3 : 4;
  const mirror = els.mirrorInput.checked;
  const x = mmToMil(state.bounds.minX);
  const y = mmToMil(state.bounds.minY);
  const width = mmToMil(state.bounds.width);
  const height = mmToMil(state.bounds.height);
  const sourceName = "color-silkscreen-board.png";
  return `// Generated by m0bx.github.io/pcb\n// Open the PCB matching ${JSON.stringify(state.gerberName)} before running.\n(async () => {\n  const imageData = ${JSON.stringify(dataUrl)};\n  const placed = await eda.pcb_PrimitiveObject.create(\n    ${layer},\n    ${x.toFixed(6)},\n    ${y.toFixed(6)},\n    imageData,\n    ${width.toFixed(6)},\n    ${height.toFixed(6)},\n    0,\n    ${mirror},\n    ${JSON.stringify(sourceName)},\n    false\n  );\n\n  if (!placed) {\n    throw new Error('EasyEDA did not create the colour silkscreen object.');\n  }\n\n  const gerberZip = await eda.pcb_ManufactureData.getGerberFile(\n    'ColorSilkscreen_Gerber',\n    true\n  );\n\n  if (!gerberZip) {\n    throw new Error('EasyEDA did not generate the colour Gerber archive.');\n  }\n\n  await eda.sys_FileSystem.saveFile(gerberZip, 'ColorSilkscreen_Gerber.zip');\n  console.log('Colour silkscreen placed and Gerber ZIP exported.');\n})();\n`;
}

function downloadDataUrl(dataUrl, fileName) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

setupDropZone(els.gerberDrop, els.gerberInput, handleGerber);
setupDropZone(els.imageDrop, els.imageInput, handleImage);

document.querySelectorAll("[data-fit]").forEach((button) => {
  button.addEventListener("click", () => {
    state.fit = button.dataset.fit;
    document.querySelectorAll("[data-fit]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    els.fitReadout.textContent = button.textContent;
    resetOutput();
    updateReadyState();
  });
});

for (const input of [els.marginInput, els.dpiInput, els.sideInput, els.mirrorInput]) {
  input.addEventListener("input", () => {
    resetOutput();
    updateReadyState();
  });
  input.addEventListener("change", () => {
    resetOutput();
    updateReadyState();
  });
}

els.sideInput.addEventListener("change", () => {
  if (els.sideInput.value === "bottom" && !els.mirrorInput.dataset.userChanged) {
    els.mirrorInput.checked = true;
  } else if (els.sideInput.value === "top" && !els.mirrorInput.dataset.userChanged) {
    els.mirrorInput.checked = false;
  }
  drawPreview();
});
els.mirrorInput.addEventListener("change", () => { els.mirrorInput.dataset.userChanged = "true"; });

els.prepareButton.addEventListener("click", prepareOutput);
els.downloadPngButton.addEventListener("click", () => downloadDataUrl(state.preparedDataUrl, "color-silkscreen-board.png"));
els.downloadScriptButton.addEventListener("click", () => downloadText(state.generatedScript, "place-color-silkscreen.js"));
els.copyScriptButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.generatedScript);
    const original = els.copyScriptButton.textContent;
    els.copyScriptButton.textContent = "Copied";
    setTimeout(() => { els.copyScriptButton.textContent = original; }, 1400);
  } catch {
    downloadText(state.generatedScript, "place-color-silkscreen.js");
  }
});

window.addEventListener("resize", drawPreview);
drawPreview();
