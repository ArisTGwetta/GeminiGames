/* ---------------------------------------------------------
   Load Fonts
--------------------------------------------------------- */

const glyphs = {
    "Namor": NAMOR_GLYPHS,   // your existing glyph set
    // add more fonts later
};

window.onload = () => {
    const cipherFont = document.getElementById("cipherFont");
    const decodeFont = document.getElementById("decodeFont");

    Object.keys(glyphs).forEach(f => {
        const opt1 = document.createElement("option");
        opt1.value = f;
        opt1.textContent = f;
        cipherFont.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = f;
        opt2.textContent = f;
        decodeFont.appendChild(opt2);
    });
};

/* ---------------------------------------------------------
   Cipher (Text → Image)
--------------------------------------------------------- */

function generateCipher() {
    const font = document.getElementById("cipherFont").value;
    const text = document.getElementById("cipherText").value;

    const TILE = 16;
    const PADDING = 1;

    const canvas = document.getElementById("cipherCanvas");
    const ctx = canvas.getContext("2d");

    const chars = text.split("");
    const width = chars.length * (TILE + PADDING) + PADDING;
    const height = TILE + PADDING * 2;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "rgb(230,230,230)";
    ctx.fillRect(0, 0, width, height);

    chars.forEach((ch, i) => {
        const glyph = glyphs[font][ch.toUpperCase()] || glyphs[font][" "];
        const x0 = PADDING + i * (TILE + PADDING);
        const y0 = PADDING;

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
    const url = canvas.toDataURL("image/png");
    window.open(url);
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

    /* Draw screenshot into canvas */
    const temp = document.createElement("canvas");
    temp.width = img.width;
    temp.height = img.height;
    const tctx = temp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);

    /* Convert to grayscale + aggressive threshold */
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

    /* Crop to frame */
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;

    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const cctx = crop.getContext("2d", { willReadFrequently: true });
    cctx.drawImage(temp, x0, y0, w, h, 0, 0, w, h);

    /* Snap to grid */
    const chars = Math.floor(w / (TILE + 1));
    let result = "";

    const font = document.getElementById("decodeFont").value;
    const fontGlyphs = glyphs[font];

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
        if (isGhost(px[0], px[1], px[2])) {
            top = y;
            break;
        }
    }

    for (let y = h - 1; y >= 0; y--) {
        const px = ctx.getImageData(0, y, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) {
            bottom = y;
            break;
        }
    }

    for (let x = 0; x < w; x++) {
        const px = ctx.getImageData(x, 0, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) {
            left = x;
            break;
        }
    }

    for (let x = w - 1; x >= 0; x--) {
        const px = ctx.getImageData(x, 0, 1, 1).data;
        if (isGhost(px[0], px[1], px[2])) {
            right = x;
            break;
        }
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
