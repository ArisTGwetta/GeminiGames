let glyphs = {};
let fonts = [];

async function loadGlyphs() {
    const response = await fetch("glyphs.json");
    glyphs = await response.json();

    fonts = Object.keys(glyphs);

    const cipherFont = document.getElementById("cipherFont");
    const decipherFont = document.getElementById("decipherFont");

    fonts.forEach(font => {
        const opt1 = document.createElement("option");
        opt1.value = font;
        opt1.textContent = font;
        cipherFont.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = font;
        opt2.textContent = font;
        decipherFont.appendChild(opt2);
    });
}

loadGlyphs();

function encode() {
    const fontName = document.getElementById("cipherFont").value;
    const font = glyphs[fontName];

    const text = document.getElementById("cipherInput").value.toUpperCase();
    const lines = text.split("\n");

    const TILE = 16;
    const SCALE = 4;
    const ghost = "rgb(230,230,230)";

    const glyphW = TILE * SCALE;
    const glyphH = TILE * SCALE;

    const canvas = document.getElementById("cipherCanvas");
    const ctx = canvas.getContext("2d");

    const maxLen = Math.max(...lines.map(l => l.length));
    const width = (1 + maxLen * 16 + (maxLen - 1) * 1 + 1) * SCALE;
    const height = lines.length * (glyphH + SCALE * 2);

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    let yCell = 0;

    for (const line of lines) {
        let xCell = 0;

        // top frame
        ctx.fillStyle = ghost;
        ctx.fillRect(0, yCell, width, SCALE);

        // left frame
        ctx.fillRect(0, yCell, SCALE, glyphH + SCALE);

        xCell = SCALE;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const matrix = font[ch];
            if (!matrix) {
                xCell += glyphW + SCALE;
                continue;
            }

            // draw glyph
            for (let gy = 0; gy < TILE; gy++) {
                for (let gx = 0; gx < TILE; gx++) {
                    ctx.fillStyle = matrix[gy][gx] === 1 ? "black" : "white";
                    ctx.fillRect(
                        xCell + gx * SCALE,
                        yCell + SCALE + gy * SCALE,
                        SCALE,
                        SCALE
                    );
                }
            }

            // vertical ghost divider
            ctx.fillStyle = ghost;
            ctx.fillRect(xCell + glyphW, yCell, SCALE, glyphH + SCALE);

            xCell += glyphW + SCALE;
        }

        // right frame
        ctx.fillRect(width - SCALE, yCell, SCALE, glyphH + SCALE);

        // bottom frame
        ctx.fillRect(0, yCell + glyphH + SCALE, width, SCALE);

        yCell += glyphH + SCALE * 2;
    }
}

function downloadCipher() {
    const canvas = document.getElementById("cipherCanvas");
    const link = document.createElement("a");
    link.download = "cipher.png";
    link.href = canvas.toDataURL();
    link.click();
}

function decode() {
    const fontName = document.getElementById("decipherFont").value;
    const font = glyphs[fontName];

    const file = document.getElementById("imageUpload").files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        const TILE = 16;
        const SCALE = 4;

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const cellSize = SCALE;

        let result = "";
        let yCell = 0;

        while (yCell + (TILE + 2) * cellSize <= canvas.height) {
            let xCell = 0;
            let line = "";

            xCell += cellSize; // skip left frame

            while (xCell + TILE * cellSize <= canvas.width - cellSize) {
                const matrix = [];

                for (let gy = 0; gy < TILE; gy++) {
                    const row = [];
                    for (let gx = 0; gx < TILE; gx++) {
                        const px = sampleCell(ctx, xCell + gx * cellSize, yCell + cellSize + gy * cellSize, cellSize);
                        row.push(px < 128 ? 1 : 0);
                    }
                    matrix.push(row);
                }

                const ch = matchGlyph(matrix, font);
                line += ch;

                xCell += TILE * cellSize + cellSize; // skip divider
            }

            result += line + "\n";
            yCell += (TILE + 2) * cellSize;
        }

        document.getElementById("decipherOutput").textContent = result.trim();
    };

    img.src = URL.createObjectURL(file);
}

function sampleCell(ctx, x, y, size) {
    const data = ctx.getImageData(x, y, size, size).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
        sum += data[i]; // red channel
    }
    return sum / (data.length / 4);
}

function matchGlyph(tile, font) {
    for (const ch in font) {
        if (sameMatrix(tile, font[ch])) return ch;
    }
    return "?";
}

function sameMatrix(a, b) {
    for (let y = 0; y < a.length; y++) {
        for (let x = 0; x < a[y].length; x++) {
            if (a[y][x] !== b[y][x]) return false;
        }
    }
    return true;
}
