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
--------------------------------------------------------- */

function generateCipher() {
    const font = document.getElementById("cipherFont").value;
    const text = document.getElementById("cipherText").value;

    const TILE = 16;
    const PAD = 1;

    const canvas = document.getElementById("cipherCanvas");
    const ctx = canvas.getContext("2d");

    const chars = text.split("");
    const width = chars.length * (TILE + PAD) + PAD;
    const height = TILE + PAD * 2;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "rgb(230,230,230)";
    ctx.fillRect(0, 0, width, height);

    chars.forEach((ch, i) => {
        const glyph = GLYPHS[font][ch.toUpperCase()] || GLYPHS[font][" "];
        const x0 = PAD + i * (TILE + PAD);
        const y0 = PAD;

        for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
                if (glyph[y][x] === 1) {
                    ctx.fillStyle = "black";
                    ctx.fillRect(x0 + x, y0 + y, 1, 1);
                }
            }
        }
    });
}

function openCipherImage() {
    const canvas = document.getElementById("cipherCanvas");

    const SCALE = 6;
    const PADDING = 60;

    // Scaled cipher dimensions
    const scaledWidth = canvas.width * SCALE;
    const scaledHeight = canvas.height * SCALE;

    // Final padded canvas
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = scaledWidth + PADDING * 2;
    finalCanvas.height = scaledHeight + PADDING * 2;

    const fctx = finalCanvas.getContext("2d");
    fctx.imageSmoothingEnabled = false;

    // Fill background with light gray (same as cipher)
    fctx.fillStyle = "rgb(230,230,230)";
    fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Draw scaled cipher centered inside padding
    fctx.drawImage(
        canvas,
        0, 0, canvas.width, canvas.height,
        PADDING, PADDING, scaledWidth, scaledHeight
    );

    const url = finalCanvas.toDataURL("image/png");
    window.open(url);
}

function downloadCipherImage() {
    const canvas = document.getElementById("cipherCanvas");

    const SCALE = 6;
    const PADDING = 60;

    // Scaled cipher dimensions
    const scaledWidth = canvas.width * SCALE;
    const scaledHeight = canvas.height * SCALE;

    // Final padded canvas
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = scaledWidth + PADDING * 2;
    finalCanvas.height = scaledHeight + PADDING * 2;

    const fctx = finalCanvas.getContext("2d");
    fctx.imageSmoothingEnabled = false;

    // Background
    fctx.fillStyle = "rgb(230,230,230)";
    fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Draw scaled cipher centered
    fctx.drawImage(
        canvas,
        0, 0, canvas.width, canvas.height,
        PADDING, PADDING, scaledWidth, scaledHeight
    );

    // Generate timestamp
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");

    const filename = `cypher-${yyyy}${mm}${dd}-${hh}${min}.png`;

    // Convert to Blob (THIS is the fix)
    finalCanvas.toBlob(blob => {
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();

        // Cleanup
        URL.revokeObjectURL(link.href);
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

    const temp = document.createElement("canvas");
    temp.width = img.width;
    temp.height = img.height;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);

    /* Aggressive threshold */
    const data = tctx.getImageData(0, 0, temp.width, temp.height);
    const px = data.data;

    for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
        const bw = lum < 180 ? 0 : 255;
        px[i] = px[i+1] = px[i+2] = bw;
    }
    tctx.putImageData(data, 0, 0);

    /* Detect ghost frame */
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

    const chars = Math.floor(w / (TILE + 1));
    let result = "";

    for (let i = 0; i < chars; i++) {
        const gx = i * (TILE + 1);

        const matrix = [];
        for (let y = 0; y < TILE; y++) {
            const row = [];
            for (let x = 0; x < TILE; x++) {
                const px = cctx.getImageData(gx + x, 1 + y, 1, 1).data;
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
   Ghost Frame Detection
--------------------------------------------------------- */

function detectGhostFrame(ctx, w, h) {
    const isGhost = (r,g,b) =>
        r >= 220 && r <= 240 &&
        g >= 220 && g <= 240 &&
        b >= 220 && b <= 240;

    let top = null, bottom = null, left = null, right = null;

    for (let y = 0; y < h; y++) {
        const px = ctx.getImageData(0, y, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) { top = y; break; }
    }

    for (let y = h - 1; y >= 0; y--) {
        const px = ctx.getImageData(0, y, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) { bottom = y; break; }
    }

    for (let x = 0; x < w; x++) {
        const px = ctx.getImageData(x, 0, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) { left = x; break; }
    }

    for (let x = w - 1; x >= 0; x--) {
        const px = ctx.getImageData(x, 0, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) { right = x; break; }
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
