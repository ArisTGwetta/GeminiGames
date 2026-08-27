function processGlyph() {
    const file = document.getElementById("upload").files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        const TILE = 16;

        // Step 1: Draw original image into a temp canvas
        const temp = document.createElement("canvas");
        temp.width = TILE;
        temp.height = TILE;
        const tctx = temp.getContext("2d");

        // Step 2: Resize automatically to 16×16
        tctx.drawImage(img, 0, 0, TILE, TILE);

        // Step 3: Convert to grayscale + threshold
        const imgData = tctx.getImageData(0, 0, TILE, TILE);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const lum = 0.299*r + 0.587*g + 0.114*b;
            const bw = lum < 128 ? 0 : 255;
            data[i] = data[i+1] = data[i+2] = bw;
        }

        tctx.putImageData(imgData, 0, 0);

        // Step 4: Show preview
        const preview = document.getElementById("preview");
        preview.width = TILE * 16;
        preview.height = TILE * 16;
        const pctx = preview.getContext("2d");
        pctx.imageSmoothingEnabled = false;
        pctx.drawImage(temp, 0, 0, preview.width, preview.height);

        // Step 5: Build matrix
        const matrix = [];
        for (let y = 0; y < TILE; y++) {
            const row = [];
            for (let x = 0; x < TILE; x++) {
                const px = tctx.getImageData(x, y, 1, 1).data;
                row.push(px[0] < 128 ? 1 : 0);
            }
            matrix.push(row);
        }

        // Step 6: Output matrix
        document.getElementById("output").textContent =
            JSON.stringify(matrix, null, 2);
    };

    img.src = URL.createObjectURL(file);
}
