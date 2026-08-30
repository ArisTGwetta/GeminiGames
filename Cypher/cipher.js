/* ---------------------------------------------------------
   Load glyphs.json dynamically
--------------------------------------------------------- */

let GLYPHS = {};

window.onload = async () => {
    try {
        const response = await fetch("glyphs.json");
        GLYPHS = await response.json();

        const cipherFont = document.getElementById("cipherFont");
        const decodeFont = document.getElementById("decodeFont");

        Object.keys(GLYPHS).forEach(font => {
            const opt1 = document.createElement("option");
            opt1.value = font;
            opt1.textContent = font;
            cipherFont.appendChild(opt1);

            const opt2 = document.createElement("option");
            opt2.value = font;
            opt2.textContent = font;
            decodeFont.appendChild(opt2);
        });
    } catch (e) {
        alert("Could not load glyphs.json");
    }
};

/* ---------------------------------------------------------
   Cipher (Text → Image)
   - 16x16 glyphs
   - 3px black frame around each glyph (stamp/block)
--------------------------------------------------------- */

function generateCipher() {
    const font = document.getElementById("cipherFont").value;
    const text = document.getElementById("cipherText").value;

    const TILE = 16;
    const PAD = 1;          // inner padding
    const FRAME = 3;        // black frame thickness around each glyph

    const canvas = document.getElementById("cipherCanvas");
    const ctx = canvas.getContext("2d");

    const chars = text.split("");

    // Each glyph tile width: FRAME (left) + TILE + FRAME (right)
    const tileWidth = FRAME + TILE + FRAME;
    const tileHeight = FRAME + TILE + FRAME;

    const width = chars.length * tileWidth + PAD * 2;
    const height = tileHeight + PAD * 2;

    canvas.width = width;
    canvas.height = height;

    // Consistent background color (ghost)
    ctx.fillStyle = "rgb(200,200,200)";
    ctx.fillRect(0, 0, width, height);

    chars.forEach((ch, i) => {
        const glyph = GLYPHS[font][ch.toUpperCase()] || GLYPHS[font][" "];

        const x0 = PAD + i * tileWidth;
        const y0 = PAD;

        // Draw black frame (stamp block) around glyph
        ctx.fillStyle = "black";

        // Top frame
        ctx.fillRect(x0, y0, tileWidth, FRAME);
        // Bottom frame
        ctx.fillRect(x0, y0 + FRAME + TILE, tileWidth, FRAME);
        // Left frame
        ctx.fillRect(x0, y0 + FRAME, FRAME, TILE);
        // Right frame
        ctx.fillRect(x0 + FRAME + TILE, y0 + FRAME, FRAME, TILE);

        // Draw glyph inside frame
        for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
                if (glyph[y][x] === 1) {
                    ctx.fillRect(x0 + FRAME + x, y0 + FRAME + y, 1, 1);
                }
            }
        }
    });
}

/* ---------------------------------------------------------
   Export: Download (Blob)
--------------------------------------------------------- */

function downloadCipherImage() {
    const finalCanvas = buildCipherExportCanvas();
    const filename = getCipherFilename();

    finalCanvas.toBlob(blob => {
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        setCipherStatus("Image downloaded.");
    }, "image/png");
}

function getCipherFilename() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");

    return `cypher-${yyyy}${mm}${dd}-${hh}${min}.png`;
}

function buildCipherExportCanvas() {
    const canvas = document.getElementById("cipherCanvas");

    const SCALE = 6;
    const PADDING = 60;

    const scaledWidth = canvas.width * SCALE;
    const scaledHeight = canvas.height * SCALE;

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = scaledWidth + PADDING * 2;
    finalCanvas.height = scaledHeight + PADDING * 2;

    const fctx = finalCanvas.getContext("2d");
    fctx.imageSmoothingEnabled = false;

    fctx.fillStyle = "rgb(200,200,200)";
    fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    fctx.drawImage(
        canvas,
        0, 0, canvas.width, canvas.height,
        PADDING, PADDING, scaledWidth, scaledHeight
    );

    return finalCanvas;
}

function openCipherImage() {
    const canvas = buildCipherExportCanvas();

    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setCipherStatus("Image opened in a new tab.");
    }, "image/png");
}

async function shareCipherImage() {
    const blob = await getCipherBlob();
    const filename = getCipherFilename();
    const file = new File([blob], filename, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try {
            await navigator.share({
                files: [file],
                title: "Cipher image",
                text: "Cipher image"
            });
            setCipherStatus("Share sheet opened.");
            return;
        } catch (e) {
            if (e && e.name === "AbortError") {
                setCipherStatus("Share canceled.");
                return;
            }
        }
    }

    openCipherBlob(blob);
    setCipherStatus("Your browser cannot save directly to Photos. The image opened so you can save it.");
}

function getCipherBlob() {
    const canvas = buildCipherExportCanvas();
    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function openCipherBlob(blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function setCipherStatus(message) {
    const status = document.getElementById("cipherStatus");
    if (status) status.textContent = message;
}

/* ---------------------------------------------------------
   Export: Copy to Clipboard
--------------------------------------------------------- */

async function copyCipherToClipboard() {
    if (!navigator.clipboard || !window.ClipboardItem) {
        setCipherStatus("Image clipboard is not available in this browser. Try Share / Save Image.");
        return;
    }

    try {
        const blob = await getCipherBlob();
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);

        setCipherStatus("Cipher image copied.");
    } catch (e) {
        console.error(e);
        setCipherStatus("Could not copy the image here. Try Share / Save Image.");
    }
}

/* ---------------------------------------------------------
   Export: Save to Photos (iOS-friendly)
--------------------------------------------------------- */

function saveCipherToPhotos() {
    shareCipherImage();
}

/* ---------------------------------------------------------
   Decipher (Image → Text)
--------------------------------------------------------- */

function decodeImage() {
    const file = document.getElementById("decodeUpload").files[0];
    if (!file) return;

    loadUploadedImage(file)
        .then(processDecode)
        .catch(err => {
            console.error(err);
            document.getElementById("decodeOutput").textContent =
                "Could not load that image.";
        });
}

async function pasteImageFromClipboard() {
    const output = document.getElementById("decodeOutput");

    if (!navigator.clipboard || !navigator.clipboard.read) {
        output.textContent = "Image paste is not available in this browser. Use upload instead.";
        return;
    }

    try {
        const items = await navigator.clipboard.read();

        for (const item of items) {
            const imageType = item.types.find(type => type.startsWith("image/"));
            if (!imageType) continue;

            const blob = await item.getType(imageType);
            await processDecodeFromClipboardImage(blob);
            return;
        }

        output.textContent = "The clipboard does not contain an image.";
    } catch (e) {
        console.error(e);
        output.textContent = "Could not read an image from the clipboard. Use upload instead.";
    }
}

async function loadUploadedImage(file) {
    if ("createImageBitmap" in window) {
        try {
            return await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (e) {
            // iOS Safari has partial createImageBitmap support in some versions.
        }
    }

    return await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            URL.revokeObjectURL(url);
            if (img.decode) {
                try { await img.decode(); } catch (e) {}
            }
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };
        img.src = url;
    });
}

function processDecode(img) {
    const TILE = 16;
    const FRAME = 3;   // must match cipher frame thickness
    const LOGICAL_TILE = FRAME + TILE + FRAME;

    const temp = document.createElement("canvas");
    temp.width = img.naturalWidth || img.width;
    temp.height = img.naturalHeight || img.height;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(img, 0, 0, temp.width, temp.height);

    const image = tctx.getImageData(0, 0, temp.width, temp.height);
    const data = image.data;
    const luma = (x, y) => {
        x = Math.max(0, Math.min(temp.width - 1, x));
        y = Math.max(0, Math.min(temp.height - 1, y));
        const i = (y * temp.width + x) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };

    const bgLum = estimateBackgroundLuma(luma, temp.width, temp.height);
    const threshold = Math.max(40, bgLum - 55);

    const content = detectGlyphBounds(luma, temp.width, temp.height, threshold);
    if (!content) {
        document.getElementById("decodeOutput").textContent =
            "Could not find glyphs in that image.";
        return;
    }

    const { x0, y0, x1, y1 } = content;
    const contentWidth = x1 - x0 + 1;
    const contentHeight = y1 - y0 + 1;
    const yScale = contentHeight / LOGICAL_TILE;

    if (!Number.isFinite(yScale) || yScale < 0.5) {
        document.getElementById("decodeOutput").textContent =
            "The glyphs are too small to decode reliably.";
        return;
    }

    const font = document.getElementById("decodeFont").value;
    const fontGlyphs = GLYPHS[font];

    const chars = Math.max(1, Math.round(contentWidth / (LOGICAL_TILE * yScale)));
    const xScale = contentWidth / (chars * LOGICAL_TILE);
    let result = "";

    for (let i = 0; i < chars; i++) {
        const matrix = [];
        for (let y = 0; y < TILE; y++) {
            const row = [];
            for (let x = 0; x < TILE; x++) {
                const sx0 = x0 + (i * LOGICAL_TILE + FRAME + x) * xScale;
                const sy0 = y0 + (FRAME + y) * yScale;
                row.push(sampleDarkCell(luma, sx0, sy0, xScale, yScale, threshold) ? 1 : 0);
            }
            matrix.push(row);
        }

        const ch = matchGlyph(matrix, fontGlyphs);
        result += ch;
    }

    document.getElementById("decodeOutput").textContent = result;
}

/* ---------------------------------------------------------
   Mobile-tolerant image analysis
--------------------------------------------------------- */

function estimateBackgroundLuma(luma, w, h) {
    const samples = [];
    const inset = 2;
    const points = [
        [inset, inset],
        [w - 1 - inset, inset],
        [inset, h - 1 - inset],
        [w - 1 - inset, h - 1 - inset],
        [Math.floor(w / 2), inset],
        [Math.floor(w / 2), h - 1 - inset]
    ];

    points.forEach(([x, y]) => samples.push(luma(x, y)));
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] || 200;
}

function detectGlyphBounds(luma, w, h, threshold) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (luma(x, y) < threshold) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }

    if (x1 < x0 || y1 < y0) return null;
    return { x0, y0, x1, y1 };
}

function sampleDarkCell(luma, sx0, sy0, xScale, yScale, threshold) {
    const samples = Math.max(2, Math.min(5, Math.ceil(Math.max(xScale, yScale))));
    let dark = 0;
    let total = 0;

    for (let yi = 0; yi < samples; yi++) {
        for (let xi = 0; xi < samples; xi++) {
            const x = Math.floor(sx0 + ((xi + 0.5) / samples) * xScale);
            const y = Math.floor(sy0 + ((yi + 0.5) / samples) * yScale);
            total++;
            if (luma(x, y) < threshold) dark++;
        }
    }

    return dark / Math.max(1, total) > 0.35;
}

/* ---------------------------------------------------------
   Glyph Matching
--------------------------------------------------------- */

function matchGlyph(matrix, fontGlyphs) {
    let best = " ";
    let bestScore = Infinity;

    for (const ch in fontGlyphs) {
        const g = fontGlyphs[ch];
        let score = 0;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                if (matrix[y][x] !== g[y][x]) score++;
            }
        }

        if (score < bestScore) {
            bestScore = score;
            best = ch;
        }
    }

    return best;
}

/* ---------------------------------------------------------
   Optional: Clipboard paste hook (for future UI)
--------------------------------------------------------- */

// Example: you can attach this to a hidden textarea or the document
// and call processDecodeFromClipboardImage(blob) when you detect an image.

async function processDecodeFromClipboardImage(blob) {
    const img = await loadUploadedImage(blob);
    processDecode(img);
}
