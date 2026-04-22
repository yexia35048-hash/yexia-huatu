import { GoogleGenAI } from "@google/genai";

export const processImage = (
  file: File,
  box: { x: number; y: number; width: number; height: number } | null,
  options: { method: 'patch' | 'blur' | 'pixelate' | 'solid'; intensity: number; color?: string }
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
