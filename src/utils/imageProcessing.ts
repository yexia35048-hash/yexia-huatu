export type RemovalMethod = 'patch' | 'inpaint' | 'blur' | 'pixelate' | 'solid';

interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProcessOptions {
  method: RemovalMethod;
  intensity: number;
  color?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPixelOffset = (x: number, y: number, width: number) => (y * width + x) * 4;

const fillUnknownPixel = (
  data: Float32Array,
  knownMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxRadius: number
) => {
  for (let radius = 1; radius <= maxRadius; radius++) {
    let weightSum = 0;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const maskIndex = ny * width + nx;
        if (!knownMask[maskIndex]) continue;

        const distanceSq = dx * dx + dy * dy;
        const weight = 1 / Math.max(1, distanceSq);
        const pixelOffset = getPixelOffset(nx, ny, width);
        weightSum += weight;
        red += data[pixelOffset] * weight;
        green += data[pixelOffset + 1] * weight;
        blue += data[pixelOffset + 2] * weight;
      }
    }

    if (weightSum > 0) {
      const pixelOffset = getPixelOffset(x, y, width);
      data[pixelOffset] = red / weightSum;
      data[pixelOffset + 1] = green / weightSum;
      data[pixelOffset + 2] = blue / weightSum;
      data[pixelOffset + 3] = 255;
      knownMask[y * width + x] = 1;
      return true;
    }
  }

  return false;
};

const smoothMaskRegion = (
  data: Float32Array,
  selectionMask: Uint8Array,
  width: number,
  height: number,
  passes: number
) => {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = new Float32Array(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIndex = y * width + x;
        if (!selectionMask[maskIndex]) continue;

        const pixelOffset = getPixelOffset(x, y, width);
        let weightSum = 4;
        let red = snapshot[pixelOffset] * 4;
        let green = snapshot[pixelOffset + 1] * 4;
        let blue = snapshot[pixelOffset + 2] * 4;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            const neighborMaskIndex = ny * width + nx;
            const neighborOffset = getPixelOffset(nx, ny, width);
            const weight = selectionMask[neighborMaskIndex] ? 1 : 1.5;

            weightSum += weight;
            red += snapshot[neighborOffset] * weight;
            green += snapshot[neighborOffset + 1] * weight;
            blue += snapshot[neighborOffset + 2] * weight;
          }
        }

        data[pixelOffset] = red / weightSum;
        data[pixelOffset + 1] = green / weightSum;
        data[pixelOffset + 2] = blue / weightSum;
        data[pixelOffset + 3] = 255;
      }
    }
  }
};

const inpaintSelection = (ctx: CanvasRenderingContext2D, selection: SelectionBox) => {
  const padding = Math.max(16, Math.round(Math.max(selection.width, selection.height) * 0.35));
  const regionX = Math.max(0, selection.x - padding);
  const regionY = Math.max(0, selection.y - padding);
  const regionRight = Math.min(ctx.canvas.width, selection.x + selection.width + padding);
  const regionBottom = Math.min(ctx.canvas.height, selection.y + selection.height + padding);
  const regionWidth = regionRight - regionX;
  const regionHeight = regionBottom - regionY;

  if (regionWidth <= 0 || regionHeight <= 0) return;

  const localX = selection.x - regionX;
  const localY = selection.y - regionY;
  const localRight = localX + selection.width;
  const localBottom = localY + selection.height;

  const region = ctx.getImageData(regionX, regionY, regionWidth, regionHeight);
  const data = new Float32Array(region.data.length);
  const knownMask = new Uint8Array(regionWidth * regionHeight).fill(1);
  const selectionMask = new Uint8Array(regionWidth * regionHeight);
  data.set(region.data);

  for (let y = localY; y < localBottom; y++) {
    for (let x = localX; x < localRight; x++) {
      const maskIndex = y * regionWidth + x;
      knownMask[maskIndex] = 0;
      selectionMask[maskIndex] = 1;
    }
  }

  let remaining = selection.width * selection.height;
  const samplingRadius = 3;
  const maxIterations = Math.max(selection.width, selection.height) + padding;

  for (let iteration = 0; iteration < maxIterations && remaining > 0; iteration++) {
    const updates: Array<{x: number; y: number; red: number; green: number; blue: number}> = [];

    for (let y = localY; y < localBottom; y++) {
      for (let x = localX; x < localRight; x++) {
        const maskIndex = y * regionWidth + x;
        if (knownMask[maskIndex]) continue;

        let neighborCount = 0;
        let weightSum = 0;
        let red = 0;
        let green = 0;
        let blue = 0;

        for (let dy = -samplingRadius; dy <= samplingRadius; dy++) {
          for (let dx = -samplingRadius; dx <= samplingRadius; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= regionWidth || ny < 0 || ny >= regionHeight) continue;

            const distanceSq = dx * dx + dy * dy;
            if (distanceSq > samplingRadius * samplingRadius) continue;

            const neighborMaskIndex = ny * regionWidth + nx;
            if (!knownMask[neighborMaskIndex]) continue;

            neighborCount++;
            const weight = 1 / Math.max(1, distanceSq);
            const neighborOffset = getPixelOffset(nx, ny, regionWidth);
            weightSum += weight;
            red += data[neighborOffset] * weight;
            green += data[neighborOffset + 1] * weight;
            blue += data[neighborOffset + 2] * weight;
          }
        }

        if (neighborCount >= 3 && weightSum > 0) {
          updates.push({
            x,
            y,
            red: red / weightSum,
            green: green / weightSum,
            blue: blue / weightSum,
          });
        }
      }
    }

    if (updates.length === 0) break;

    for (const update of updates) {
      const pixelOffset = getPixelOffset(update.x, update.y, regionWidth);
      data[pixelOffset] = update.red;
      data[pixelOffset + 1] = update.green;
      data[pixelOffset + 2] = update.blue;
      data[pixelOffset + 3] = 255;
      knownMask[update.y * regionWidth + update.x] = 1;
    }

    remaining -= updates.length;
  }

  if (remaining > 0) {
    const fallbackRadius = Math.max(8, samplingRadius * 4);

    for (let y = localY; y < localBottom; y++) {
      for (let x = localX; x < localRight; x++) {
        const maskIndex = y * regionWidth + x;
        if (knownMask[maskIndex]) continue;
        if (fillUnknownPixel(data, knownMask, regionWidth, regionHeight, x, y, fallbackRadius)) {
          remaining--;
        }
      }
    }
  }

  smoothMaskRegion(data, selectionMask, regionWidth, regionHeight, 2);

  for (let i = 0; i < region.data.length; i++) {
    region.data[i] = Math.round(clamp(data[i], 0, 255));
  }

  ctx.putImageData(region, regionX, regionY);
};

export const processImage = (
  file: File,
  box: SelectionBox | null,
  options: ProcessOptions
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (!box) {
      return reject('No bounding box provided for local processing');
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No canvas context');

      ctx.drawImage(img, 0, 0);

      // Box coordinates in actual pixels relative to original image size
      const x = Math.round(box.x * img.naturalWidth);
      const y = Math.round(box.y * img.naturalHeight);
      const width = Math.round(box.width * img.naturalWidth);
      const height = Math.round(box.height * img.naturalHeight);

      if (options.method === 'patch') {
        const xStart = Math.max(0, x);
        const yStart = Math.max(0, y);
        const xEnd = Math.min(canvas.width - 1, x + width);
        const yEnd = Math.min(canvas.height - 1, y + height);
        const boxW = xEnd - xStart;
        const boxH = yEnd - yStart;

        if (boxW > 0 && boxH > 0) {
          const sx = Math.max(0, xStart - 1);
          const sy = Math.max(0, yStart - 1);
          const ex = Math.min(canvas.width - 1, xEnd + 1);
          const ey = Math.min(canvas.height - 1, yEnd + 1);
          const sw = ex - sx + 1;
          const sh = ey - sy + 1;

          const imageData = ctx.getImageData(sx, sy, sw, sh);
          const data = imageData.data;
          const getIdx = (ix: number, iy: number) => ((iy - sy) * sw + (ix - sx)) * 4;

          for (let cy = yStart; cy <= yEnd; cy++) {
            for (let cx = xStart; cx <= xEnd; cx++) {
              const tX = (cx - xStart) / boxW;
              const tY = (cy - yStart) / boxH;

              const cLeftX = xStart > 0 ? getIdx(xStart - 1, cy) : getIdx(xStart, cy);
              const cRightX = xEnd < canvas.width - 1 ? getIdx(xEnd + 1, cy) : getIdx(xEnd, cy);
              const cTopY = yStart > 0 ? getIdx(cx, yStart - 1) : getIdx(cx, yStart);
              const cBottomY = yEnd < canvas.height - 1 ? getIdx(cx, yEnd + 1) : getIdx(cx, yEnd);

              for (let c = 0; c < 3; c++) {
                const horiz = data[cLeftX + c] * (1 - tX) + data[cRightX + c] * tX;
                const vert = data[cTopY + c] * (1 - tY) + data[cBottomY + c] * tY;
                data[getIdx(cx, cy) + c] = (horiz + vert) / 2;
              }
              data[getIdx(cx, cy) + 3] = 255;
            }
          }
          ctx.putImageData(imageData, sx, sy);
        }
      } else if (options.method === 'inpaint') {
        inpaintSelection(ctx, { x, y, width, height });
      } else if (options.method === 'blur') {
        const maxBlur = Math.max(50, Math.min(width, height) / 2);
        const blurAmount = options.intensity * maxBlur;
        const bleed = Math.round(blurAmount);
        
        ctx.save();
        // Clip to the exact bounding box so we don't blur the rest of the image
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        
        ctx.filter = `blur(${blurAmount}px)`;
        
        // Expand the source rectangle by the bleed amount to pull in actual surrounding image pixels 
        // instead of transparent edges, preventing the dark halo effect.
        const sx = Math.max(0, x - bleed);
        const sy = Math.max(0, y - bleed);
        const sw = Math.min(img.naturalWidth - sx, width + bleed * 2);
        const sh = Math.min(img.naturalHeight - sy, height + bleed * 2);
        
        ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
        
        ctx.restore();
      } else if (options.method === 'pixelate') {
        const maxPixelSize = Math.max(15, Math.min(width, height) / 4);
        const pixelSize = Math.max(2, Math.round(options.intensity * maxPixelSize));
        
        // Extract the region
        const regionCanvas = document.createElement('canvas');
        regionCanvas.width = width;
        regionCanvas.height = height;
        const regionCtx = regionCanvas.getContext('2d');
        if (regionCtx) {
          regionCtx.drawImage(img, x, y, width, height, 0, 0, width, height);
          
          ctx.imageSmoothingEnabled = false;
          // Scale down and draw back scaled up
          const scaledW = Math.max(1, width / pixelSize);
          const scaledH = Math.max(1, height / pixelSize);
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = scaledW;
          tempCanvas.height = scaledH;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.drawImage(regionCanvas, 0, 0, scaledW, scaledH);
            ctx.drawImage(tempCanvas, 0, 0, scaledW, scaledH, x, y, width, height);
          }
        }
      } else if (options.method === 'solid') {
        ctx.fillStyle = options.color || '#FFFFFF';
        ctx.fillRect(x, y, width, height);
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('Failed to create blob');
      }, file.type || 'image/jpeg');
    };
    img.onerror = reject;
    img.src = url;
  });
};
