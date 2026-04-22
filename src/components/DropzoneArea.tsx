import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

interface DropzoneAreaProps {
  onFilesAdded: (files: File[]) => void;
}

export function DropzoneArea({ onFilesAdded }: DropzoneAreaProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesAdded(acceptedFiles);
  }, [onFilesAdded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    }
  });

  return (
    <div 
      {...getRootProps()} 
      className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-3xl transition-colors cursor-pointer p-12 text-center group
        ${isDragActive ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 bg-white'}
      `}
    >
      <input {...getInputProps()} />
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 transition-colors ${isDragActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
        <UploadCloud size={28} />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-2">拖拽图片到这里</h3>
      <p className="text-xs text-slate-400 max-w-sm">
        支持同时上传多张图片进行批量去水印。如果所有图片上的水印位置都完全一致，处理效果最佳。
      </p>
      
      <button className="mt-6 px-6 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
        选择文件
      </button>
    </div>
  );
}
