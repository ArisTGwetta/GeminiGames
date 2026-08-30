const TILE = 16;

const els = {
    mapUpload: document.getElementById("mapUpload"),
    jsonUpload: document.getElementById("jsonUpload"),
    sourceCanvas: document.getElementById("sourceCanvas"),
    workspace: document.getElementById("workspace"),
    cropBox: document.getElementById("cropBox"),
    preview: document.getElementById("preview"),
    fontName: document.getElementById("fontName"),
    glyphName: document.getElementById("glyphName"),
    nameQueue: document.getElementById("nameQueue"),
    zoom: document.getElementById("zoom"),
    threshold: document.getElementById("threshold"),
    autoDetectBtn: document.getElementById("autoDetectBtn"),
    autoDetectCropBtn: document.getElementById("autoDetectCropBtn"),
    trimBtn: document.getElementById("trimBtn"),
    invertBtn: document.getElementById("invertBtn"),
    addBtn: document.getElementById("addBtn"),
    nextNameBtn: document.getElementById("nextNameBtn"),
    candidates: document.getElementById("candidates"),
    glyphList: document.getElementById("glyphList"),
    showJsonBtn: document.getElementById("showJsonBtn"),
    copyJsonBtn: document.getElementById("copyJsonBtn"),
    downloadJsonBtn: document.getElementById("downloadJsonBtn"),
    clearFontBtn: document.getElementById("clearFontBtn"),
    output: document.getElementById("output"),
    status: document.getElementById("status")
};

let sourceImage = null;
let sourceBitmap = null;
let sourceCtx = els.sourceCanvas.getContext("2d", { willReadFrequently: true });
let crop = { x: 0, y: 0, w: 96, h: 96 };
let zoom = 1;
let invert = false;
let candidates = [];
let glyphs = JSON.parse(localStorage.getItem("glyphImporter.glyphs") || "{}");

els.mapUpload.addEventListener("change", handleMapUpload);
els.jsonUpload.addEventListener("change", handleJsonUpload);
els.zoom.addEventListener("input", () => {
    zoom = Number(els.zoom.value) / 100;
    renderSource();
});
els.threshold.addEventListener("input", updatePreview);
els.autoDetectBtn.addEventListener("click", () => autoProposeGlyphs());
els.autoDetectCropBtn.addEventListener("click", () => autoProposeGlyphs(crop));
els.trimBtn.addEventListener("click", trimCropToInk);
els.invertBtn.addEventListener("click", () => {
    invert = !invert;
    els.invertBtn.textContent = invert ? "Invert On" : "Invert";
    updatePreview();
});
els.addBtn.addEventListener("click", addGlyph);
els.nextNameBtn.addEventListener("click", fillNextName);
els.showJsonBtn.addEventListener("click", showJson);
els.copyJsonBtn.addEventListener("click", copyJson);
els.downloadJsonBtn.addEventListener("click", downloadJson);
els.clearFontBtn.addEventListener("click", clearCurrentFont);

initCropInteractions();
renderGlyphList();

async function handleMapUpload() {
    const file = els.mapUpload.files[0];
    if (!file) return;

    sourceImage = await loadImage(file);
    sourceBitmap = await makeBitmap(sourceImage);

    els.sourceCanvas.width = sourceBitmap.width;
    els.sourceCanvas.height = sourceBitmap.height;

    crop = {
        x: Math.round(sourceBitmap.width * 0.08),
        y: Math.round(sourceBitmap.height * 0.12),
        w: Math.round(sourceBitmap.width * 0.12),
        h: Math.round(sourceBitmap.height * 0.12)
    };

    renderSource();
    updatePreview();
    setStatus("Map loaded. Move the capture box over a glyph.");
}

async function handleJsonUpload() {
    const file = els.jsonUpload.files[0];
    if (!file) return;

    try {
        const imported = JSON.parse(await file.text());
        glyphs = mergeGlyphSets(glyphs, imported);
        saveGlyphs();
        renderGlyphList();
        showJson();
        setStatus("Existing JSON merged.");
    } catch (e) {
        console.error(e);
        setStatus("Could not read that JSON file.");
    }
}

function mergeGlyphSets(base, incoming) {
    const merged = { ...base };

    Object.keys(incoming || {}).forEach(fontName => {
        if (!merged[fontName]) merged[fontName] = {};
        Object.keys(incoming[fontName] || {}).forEach(glyphName => {
            merged[fontName][glyphName] = incoming[fontName][glyphName];
        });
    });

    return merged;
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };
        img.src = url;
    });
}

async function makeBitmap(img) {
    if ("createImageBitmap" in window) {
        try {
            return await createImageBitmap(img, { imageOrientation: "from-image" });
        } catch (e) {}
    }
    return img;
}

function renderSource() {
    if (!sourceBitmap) return;

    els.sourceCanvas.style.width = `${sourceBitmap.width * zoom}px`;
    els.sourceCanvas.style.height = `${sourceBitmap.height * zoom}px`;
    sourceCtx.clearRect(0, 0, els.sourceCanvas.width, els.sourceCanvas.height);
    sourceCtx.drawImage(sourceBitmap, 0, 0);
    positionCropBox();
}

function positionCropBox() {
    if (!sourceBitmap) return;

    els.cropBox.style.display = "block";
    els.cropBox.style.left = `${crop.x * zoom}px`;
    els.cropBox.style.top = `${crop.y * zoom}px`;
    els.cropBox.style.width = `${crop.w * zoom}px`;
    els.cropBox.style.height = `${crop.h * zoom}px`;
}

function initCropInteractions() {
    let drag = null;

    els.cropBox.addEventListener("pointerdown", e => {
        if (!sourceBitmap) return;
        e.preventDefault();
        els.cropBox.setPointerCapture(e.pointerId);
        const isResize = e.target.classList.contains("handle");
        drag = {
            mode: isResize ? "resize" : "move",
            startX: e.clientX,
            startY: e.clientY,
            crop: { ...crop }
        };
    });

    els.cropBox.addEventListener("pointermove", e => {
        if (!drag || !sourceBitmap) return;

        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;

        if (drag.mode === "move") {
            crop.x = clamp(Math.round(drag.crop.x + dx), 0, sourceBitmap.width - crop.w);
            crop.y = clamp(Math.round(drag.crop.y + dy), 0, sourceBitmap.height - crop.h);
        } else {
            crop.w = clamp(Math.round(drag.crop.w + dx), 12, sourceBitmap.width - crop.x);
            crop.h = clamp(Math.round(drag.crop.h + dy), 12, sourceBitmap.height - crop.y);
        }

        positionCropBox();
        updatePreview();
    });

    els.cropBox.addEventListener("pointerup", () => {
        drag = null;
        updatePreview();
    });
}

function updatePreview() {
    if (!sourceBitmap) return null;

    const matrix = captureMatrix(crop);
    drawMatrixPreview(matrix, els.preview, 16);
    return matrix;
}

function captureMatrix(box) {
    const temp = document.createElement("canvas");
    temp.width = TILE;
    temp.height = TILE;
    const ctx = temp.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.drawImage(
        els.sourceCanvas,
        box.x, box.y, box.w, box.h,
        0, 0, TILE, TILE
    );

    const imgData = ctx.getImageData(0, 0, TILE, TILE);
    const data = imgData.data;
    const threshold = Number(els.threshold.value);
    const matrix = [];

    for (let y = 0; y < TILE; y++) {
        const row = [];
        for (let x = 0; x < TILE; x++) {
            const i = (y * TILE + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const dark = invert ? lum > threshold : lum < threshold;
            row.push(dark ? 1 : 0);
        }
        matrix.push(row);
    }

    return matrix;
}

function drawMatrixPreview(matrix, canvas, scale) {
    canvas.width = TILE * scale;
    canvas.height = TILE * scale;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";

    for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
            if (matrix[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
}

function addGlyph() {
    if (!sourceBitmap) {
        setStatus("Load a glyph map first.");
        return;
    }

    const fontName = (els.fontName.value || "NewFont").trim();
    const glyphName = (els.glyphName.value || "").trim();

    if (!glyphName) {
        setStatus("Give this glyph a name first.");
        return;
    }

    if (!glyphs[fontName]) glyphs[fontName] = {};
    glyphs[fontName][glyphName] = updatePreview();
    saveGlyphs();
    renderGlyphList();
    showJson();
    setStatus(`Added ${glyphName} to ${fontName}.`);
    fillNextName();
}

function fillNextName() {
    const names = parseNameQueue();
    if (!names.length) {
        els.glyphName.value = "";
        return;
    }

    els.glyphName.value = names.shift();
    els.nameQueue.value = names.join(" ");
}

function parseNameQueue() {
    return els.nameQueue.value
        .split(/[\s,]+/)
        .map(name => name.trim())
        .filter(Boolean);
}

function saveGlyphs() {
    localStorage.setItem("glyphImporter.glyphs", JSON.stringify(glyphs));
}

function showJson() {
    els.output.textContent = JSON.stringify(glyphs, null, 2);
}

async function copyJson() {
    const json = JSON.stringify(glyphs, null, 2);
    await navigator.clipboard.writeText(json);
    setStatus("JSON copied.");
}

function downloadJson() {
    const json = JSON.stringify(glyphs, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(els.fontName.value || "glyphs").trim() || "glyphs"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("JSON downloaded.");
}

function clearCurrentFont() {
    const fontName = (els.fontName.value || "NewFont").trim();
    if (!glyphs[fontName]) return;
    if (!confirm(`Clear all captured glyphs for ${fontName}?`)) return;
    delete glyphs[fontName];
    saveGlyphs();
    renderGlyphList();
    showJson();
}

function renderGlyphList() {
    els.glyphList.innerHTML = "";
    const fontName = (els.fontName.value || "NewFont").trim();
    const fontGlyphs = glyphs[fontName] || {};

    Object.keys(fontGlyphs).sort().forEach(name => {
        const item = document.createElement("div");
        item.className = "glyphItem";

        const canvas = document.createElement("canvas");
        drawMatrixPreview(fontGlyphs[name], canvas, 3);

        const label = document.createElement("strong");
        label.textContent = name;

        const remove = document.createElement("button");
        remove.className = "secondary";
        remove.textContent = "Remove";
        remove.onclick = () => {
            delete fontGlyphs[name];
            saveGlyphs();
            renderGlyphList();
            showJson();
        };

        item.append(canvas, label, remove);
        els.glyphList.appendChild(item);
    });
}

els.fontName.addEventListener("input", renderGlyphList);

function autoProposeGlyphs(scanBox = null) {
    if (!sourceBitmap) {
        setStatus("Load a glyph map first.");
        return;
    }

    const region = scanBox || {
        x: 0,
        y: 0,
        w: els.sourceCanvas.width,
        h: els.sourceCanvas.height
    };
    const raw = sourceCtx.getImageData(region.x, region.y, region.w, region.h);
    const threshold = Number(els.threshold.value);
    const boxes = findInkComponents(raw, threshold);

    candidates = mergeNearbyBoxes(boxes)
        .filter(box => box.w >= 8 && box.h >= 8 && box.w * box.h >= 90)
        .filter(box => box.w < sourceBitmap.width * 0.45 && box.h < sourceBitmap.height * 0.45)
        .map(box => ({
            x: box.x + region.x,
            y: box.y + region.y,
            w: box.w,
            h: box.h
        }))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x))
        .slice(0, 120);

    renderCandidates();
    setStatus(`Found ${candidates.length} possible glyphs.`);
}

function findInkComponents(imgData, threshold) {
    const { width, height, data } = imgData;
    const visited = new Uint8Array(width * height);
    const boxes = [];

    const isInk = (x, y) => {
        const i = (y * width + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        return invert ? lum > threshold : lum < threshold;
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx] || !isInk(x, y)) continue;

            const box = floodFillBox(x, y, width, height, visited, isInk);
            if (box.count > 12) boxes.push(box);
        }
    }

    return boxes.map(box => ({
        x: Math.max(0, box.x0 - 4),
        y: Math.max(0, box.y0 - 4),
        w: Math.min(width - box.x0, box.x1 - box.x0 + 9),
        h: Math.min(height - box.y0, box.y1 - box.y0 + 9)
    }));
}

function floodFillBox(startX, startY, width, height, visited, isInk) {
    const stack = [[startX, startY]];
    let x0 = startX, y0 = startY, x1 = startX, y1 = startY, count = 0;

    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const idx = y * width + x;
        if (visited[idx]) continue;
        visited[idx] = 1;
        if (!isInk(x, y)) continue;

        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return { x0, y0, x1, y1, count };
}

function mergeNearbyBoxes(boxes) {
    const merged = [];

    boxes.forEach(box => {
        let target = merged.find(existing => boxesOverlap(expandBox(existing, 10), box));
        if (!target) {
            merged.push({ ...box });
            return;
        }

        const x0 = Math.min(target.x, box.x);
        const y0 = Math.min(target.y, box.y);
        const x1 = Math.max(target.x + target.w, box.x + box.w);
        const y1 = Math.max(target.y + target.h, box.y + box.h);
        target.x = x0;
        target.y = y0;
        target.w = x1 - x0;
        target.h = y1 - y0;
    });

    return merged;
}

function expandBox(box, amount) {
    return {
        x: box.x - amount,
        y: box.y - amount,
        w: box.w + amount * 2,
        h: box.h + amount * 2
    };
}

function boxesOverlap(a, b) {
    return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
}

function renderCandidates() {
    els.candidates.innerHTML = "";

    candidates.forEach((box, index) => {
        const button = document.createElement("button");
        button.className = "candidate secondary";
        button.textContent = `${index + 1}: ${box.w}x${box.h}`;
        button.onclick = () => {
            crop = { ...box };
            positionCropBox();
            updatePreview();
            setStatus(`Selected proposal ${index + 1}.`);
        };
        els.candidates.appendChild(button);
    });
}

function trimCropToInk() {
    if (!sourceBitmap) return;

    const raw = sourceCtx.getImageData(crop.x, crop.y, crop.w, crop.h);
    const threshold = Number(els.threshold.value);
    const boxes = findInkComponents(raw, threshold);
    if (!boxes.length) {
        setStatus("No ink found inside the capture box.");
        return;
    }

    const bounds = boxes.reduce((acc, box) => {
        const x1 = box.x + box.w;
        const y1 = box.y + box.h;
        return {
            x: Math.min(acc.x, box.x),
            y: Math.min(acc.y, box.y),
            x1: Math.max(acc.x1, x1),
            y1: Math.max(acc.y1, y1)
        };
    }, { x: Infinity, y: Infinity, x1: -Infinity, y1: -Infinity });

    crop = {
        x: clamp(crop.x + bounds.x - 2, 0, sourceBitmap.width - 12),
        y: clamp(crop.y + bounds.y - 2, 0, sourceBitmap.height - 12),
        w: clamp(bounds.x1 - bounds.x + 4, 12, sourceBitmap.width),
        h: clamp(bounds.y1 - bounds.y + 4, 12, sourceBitmap.height)
    };

    positionCropBox();
    updatePreview();
}

function setStatus(message) {
    els.status.textContent = message;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Legacy button compatibility for older cached Importer.html.
function processGlyph() {
    handleMapUpload();
}
