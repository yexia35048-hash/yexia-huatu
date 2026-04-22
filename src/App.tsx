import React, { useState } from 'react';
import { DropzoneArea } from './components/DropzoneArea';
import { ImageEditor, BoundingBox } from './components/ImageEditor';
import { processImage, type RemovalMethod } from './utils/imageProcessing';
import { Download, Trash2, Loader2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Editor state
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [method, setMethod] = useState<RemovalMethod>('patch');
  const [intensity, setIntensity] = useState(0.5);
  const [solidColor, setSolidColor] = useState('#FFFFFF');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
    setErrorMsg(null);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= files.length - 1) {
      setSelectedIndex(Math.max(0, files.length - 2));
    }
    setErrorMsg(null);
  };

  const processAndDownloadAll = async () => {
    if (!boundingBox || files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    setErrorMsg(null);

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const blob = await processImage(file, boundingBox, { method, intensity, color: solidColor });
        // Use original name but add "clean_" prefix
        zip.file(`clean_${file.name}`, blob);
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'watermark_free_images.zip');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || '处理过程中发生错误，请稍后重试。');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col p-4 sm:p-6 lg:p-8">
      
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">批量去水印工具</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">快速移除多张图片中的水印</p>
        </div>
        
        {files.length > 0 && (
          <label className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500 text-slate-700">
            <span>添加更多</span>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="sr-only" 
              onChange={e => {
                if (e.target.files) handleFilesAdded(Array.from(e.target.files));
                e.target.value = '';
              }} 
            />
          </label>
        )}
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)]">
        {files.length === 0 ? (
          <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <DropzoneArea onFilesAdded={handleFilesAdded} />
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <aside className="w-full lg:w-80 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
              <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">已选中 {files.length} 张图片</span>
                <button 
                  onClick={() => {
                    setFiles([]);
                    setErrorMsg(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                >
                  清空列表
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {files.map((file, idx) => (
                  <div 
                    key={`${file.name}-${idx}`} 
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${idx === selectedIndex ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50 border border-transparent hover:bg-slate-100 hover:border-slate-200'}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                        <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate text-slate-800">{file.name}</span>
                        <span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                {errorMsg && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex items-start gap-2 shadow-sm">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                )}
                
                <button
                  onClick={processAndDownloadAll}
                  disabled={!boundingBox || isProcessing}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all
                    ${!boundingBox
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                      : isProcessing
                        ? 'bg-indigo-600 text-white opacity-80 cursor-wait'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)]'
                    }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      正在处理 {progress}%
                    </>
                  ) : !boundingBox ? (
                    '请先框选水印区域'
                  ) : (
                    <>
                      <Download size={18} />
                      一键导出 {files.length} 张图片
                    </>
                  )}
                </button>
              </div>
            </aside>

            {/* Editor Area */}
            <div className="flex-1 min-w-0">
              <ImageEditor 
                imageFile={files[selectedIndex]}
                boundingBox={boundingBox}
                onChangeBox={setBoundingBox}
                method={method}
                onChangeMethod={setMethod}
                intensity={intensity}
                onChangeIntensity={setIntensity}
                solidColor={solidColor}
                onChangeColor={setSolidColor}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
