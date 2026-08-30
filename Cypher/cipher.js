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

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");

    const filename = `cypher-${yyyy}${mm}${dd}-${hh}${min}.png`;

    finalCanvas.toBlob(blob => {
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }, "image/png");
}

/* ---------------------------------------------------------
   Export: Copy to Clipboard
--------------------------------------------------------- */

async function copyCipherToClipboard() {
    const canvas = document.getElementById("cipherCanvas");

    const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/png")
    );

    const item = new ClipboardItem({ "image/png": blob });
    await navigator.clipboard.write([item]);

    alert("Cipher image copied to clipboard!");
}

/* ---------------------------------------------------------
   Export: Save to Photos (iOS-friendly)
--------------------------------------------------------- */

function saveCipherToPhotos() {
    const canvas = document.getElementById("cipherCanvas");

    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
}

/* ---------------------------------------------------------
   Decipher (Image → Text)
--------------------------------------------------------- */

function decodeImage() {
    const file = document.getElementById("decodeUpload").files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => processDecode(img);
    img.src = URL.createObjectURL(file);
}

function processDecode(img) {
    const TILE = 16;
    const FRAME = 3;   // must match cipher frame thickness

    const temp = document.createElement("canvas");
    temp.width = img.width;
    temp.height = img.height;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);

    // Aggressive threshold to black/white
    const data = tctx.getImageData(0, 0, temp.width, temp.height);
    const px = data.data;

    for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
        const bw = lum < 180 ? 0 : 255;
        px[i] = px[i+1] = px[i+2] = bw;
    }
    tctx.putImageData(data, 0, 0);

    // Detect outer ghost frame
    const frame = detectGhostFrame(tctx, temp.width, temp.height);
    if (!frame) {
        document.getElementById("decodeOutput").textContent =
            "Could not detect ghost frame.";
        return;
    }

    const { x0, y0, x1, y1 } = frame;

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;

    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const cctx = crop.getContext("2d", { willReadFrequently: true });
    cctx.drawImage(temp, x0, y0, w, h, 0, 0, w, h);

    const font = document.getElementById("decodeFont").value;
    const fontGlyphs = GLYPHS[font];

    // Each tile width in the exported image:
    // scaled: (FRAME + TILE + FRAME) * SCALE
    // but we can infer tile width by scanning for vertical black frames.
    // For now, assume original spacing: FRAME + TILE + FRAME + (no extra gap).
    // We know the cipher used: tileWidth = FRAME + TILE + FRAME.
    const tileWidth = FRAME + TILE + FRAME;

    // We thresholded, so frames are pure black (0).
    // We can detect tiles by stepping across width.
    const chars = Math.floor((w - 2) / tileWidth); // small safety margin
    let result = "";

    for (let i = 0; i < chars; i++) {
        const gx = i * tileWidth + FRAME; // skip left frame

        const matrix = [];
        for (let y = 0; y < TILE; y++) {
            const row = [];
            for (let x = 0; x < TILE; x++) {
                const px = cctx.getImageData(gx + x, FRAME + y, 1, 1).data;
                row.push(px[0] < 128 ? 1 : 0);
            }
            matrix.push(row);
        }

        const ch = matchGlyph(matrix, fontGlyphs);
        result += ch;
    }

    document.getElementById("decodeOutput").textContent = result;
}

/* ---------------------------------------------------------
   Ghost Frame Detection (Tolerant Mode B)
--------------------------------------------------------- */

function detectGhostFrame(ctx, w, h) {
    const isGhostPixel = (r, g, b) => {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum >= 180 && lum <= 220;
    };

    const rowIsMostlyGhost = (y) => {
        let ghostCount = 0;
        for (let x = 0; x < w; x++) {
            const px = ctx.getImageData(x, y, 1, 1).data;
            if (isGhostPixel(px[0], px[1], px[2])) ghostCount++;
        }
        return ghostCount > w * 0.7;
    };

    const colIsMostlyGhost = (x) => {
        let ghostCount = 0;
        for (let y = 0; y < h; y++) {
            const px = ctx.getImageData(x, y, 1, 1).data;
            if (isGhostPixel(px[0], px[1], px[2])) ghostCount++;
        }
        return ghostCount > h * 0.7;
    };

    let top = null, bottom = null, left = null, right = null;

    for (let y = 0; y < h; y++) {
        if (rowIsMostlyGhost(y)) { top = y; break; }
    }

    for (let y = h - 1; y >= 0; y--) {
        if (rowIsMostlyGhost(y)) { bottom = y; break; }
    }

    for (let x = 0; x < w; x++) {
        if (colIsMostlyGhost(x)) { left = x; break; }
    }

    for (let x = w - 1; x >= 0; x--) {
        if (colIsMostlyGhost(x)) { right = x; break; }
    }

    if (top === null || bottom === null || left === null || right === null)
        return null;

    return { x0: left, y0: top, x1: right, y1: bottom };
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
    const img = new Image();
    img.onload = () => processDecode(img);
    img.src = URL.createObjectURL(blob);
}
