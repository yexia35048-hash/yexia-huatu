import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Palette, Grid, Sparkles } from 'lucide-react';
import type { RemovalMethod } from '../utils/imageProcessing';

export interface BoundingBox {
  x: number; // 0 to 1
  y: number; // 0 to 1
  width: number; // 0 to 1
  height: number; // 0 to 1
}

interface ImageEditorProps {
  imageFile: File;
  boundingBox: BoundingBox | null;
  onChangeBox: (box: BoundingBox | null) => void;
  method: RemovalMethod;
  onChangeMethod: (method: RemovalMethod) => void;
  intensity: number; // 0 to 1
  onChangeIntensity: (i: number) => void;
  solidColor: string;
  onChangeColor: (c: string) => void;
}

export function ImageEditor({
  imageFile,
  boundingBox,
  onChangeBox,
  method,
  onChangeMethod,
  intensity,
  onChangeIntensity,
  solidColor,
  onChangeColor
}: ImageEditorProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Dragging state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Check if clicked inside actual image bounds
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    setStartPos({ x, y });
    setIsDrawing(true);
    onChangeBox({ x, y, width: 0, height: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    let currentX = (e.clientX - rect.left) / rect.width;
    let currentY = (e.clientY - rect.top) / rect.height;
    
    // Clamp to 0..1
    currentX = Math.max(0, Math.min(1, currentX));
    currentY = Math.max(0, Math.min(1, currentY));

    onChangeBox({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y)
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // If box is too small, cancel it
    if (boundingBox && (boundingBox.width < 0.01 || boundingBox.height < 0.01)) {
      onChangeBox(null);
    }
  };

  const methodDescription =
    method === 'inpaint'
      ? '补全修复会从选区边缘向内填补纹理，适合背景连续或细节不复杂的区域。'
      : '在图片上拖拽鼠标框选需要去除的水印区域。';

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">去水印设置</h2>
          <p className="text-xs text-slate-500 mt-1">{methodDescription}</p>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1 flex-wrap">
            <button
              onClick={() => onChangeMethod('patch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${method === 'patch' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              <Sparkles size={14} /> 智能消除
            </button>
            <button
              onClick={() => onChangeMethod('inpaint')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${method === 'inpaint' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              <Sparkles size={14} /> 补全修复
            </button>
            <button
              onClick={() => onChangeMethod('blur')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${method === 'blur' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              <Eraser size={14} /> 模糊
            </button>
            <button
              onClick={() => onChangeMethod('pixelate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${method === 'pixelate' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              <Grid size={14} /> 马赛克
            </button>
            <button
              onClick={() => onChangeMethod('solid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${method === 'solid' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              <Palette size={14} /> 纯色
            </button>
          </div>
          
          {(method === 'blur' || method === 'pixelate') && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">强度</span>
              <input 
                type="range" 
                min="0.1" max="1" step="0.05"
                value={intensity}
                onChange={e => onChangeIntensity(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
              />
            </div>
          )}
          
          {method === 'solid' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">颜色</span>
              <input 
                type="color" 
                value={solidColor}
                onChange={e => onChangeColor(e.target.value)}
                className="w-7 h-7 rounded border border-slate-200 p-0 cursor-pointer overflow-hidden"
              />
            </div>
          )}
          
          <>
            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>
            <button 
              onClick={() => onChangeBox(null)}
              className="text-xs font-medium px-2 py-1.5 text-slate-500 hover:text-slate-800 transition-colors"
            >
                清除选框
              </button>
            </>
        </div>
      </div>

      <div className="flex-1 bg-slate-50 relative overflow-hidden flex items-center justify-center p-4 lg:p-8">
        {imgSrc && (
          <div 
            className="relative select-none touch-none shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_8px_40px_rgba(0,0,0,0.04)] bg-white overflow-hidden"
            style={{
               display: 'flex',
               justifyContent: 'center',
               alignItems: 'center',
               maxWidth: '100%',
               maxHeight: 'calc(100vh - 200px)',
            }}
          >
            <div className="relative inline-flex leading-[0]">
              <img 
                ref={imgRef}
                src={imgSrc} 
                alt="Preview" 
                draggable={false}
                className="block"
                style={{
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 200px)',
                  backgroundImage: `radial-gradient(#e2e8f0 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }}
              />
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                 {boundingBox && (
                   <div 
                     className="absolute border-[2px] border-indigo-500 overflow-hidden"
                     style={{
                       left: `${boundingBox.x * 100}%`,
                       top: `${boundingBox.y * 100}%`,
                       width: `${boundingBox.width * 100}%`,
                       height: `${boundingBox.height * 100}%`,
                       backgroundColor:
                         method === 'solid'
                           ? solidColor
                           : method === 'patch'
                             ? 'rgba(99,102,241,0.1)'
                             : method === 'inpaint'
                               ? 'rgba(14,165,233,0.08)'
                               : 'rgba(99,102,241,0.05)',
                       backdropFilter: method === 'blur' ? `blur(${Math.max(4, intensity * 20)}px)` : undefined,
                       boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)', // Dim the rest of the image to focus on selection
                     }}
                   >
                     {method === 'pixelate' && (
                       <div className="absolute inset-0 backdrop-blur-[2px] bg-white/30" />
                     )}
                   </div>
                 )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
