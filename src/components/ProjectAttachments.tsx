import React, { useState, useRef, useEffect } from 'react';
import { ProjectAttachment } from '../types';
import { api, fileToBase64, formatFileSize } from '../services/api';
import { 
  Paperclip, 
  Upload, 
  Trash2, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileArchive, 
  File, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  User as UserIcon,
  Eye
} from 'lucide-react';

interface ProjectAttachmentsProps {
  projectId: string;
  projectTitle?: string;
  attachments: ProjectAttachment[];
  canManage: boolean;
  onAttachmentChange: () => void;
  compact?: boolean;
}

export const ProjectAttachments: React.FC<ProjectAttachmentsProps> = ({
  projectId,
  projectTitle,
  attachments = [],
  canManage,
  onAttachmentChange,
  compact = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(1024);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const pendingReplaceAttachmentRef = useRef<ProjectAttachment | null>(null);

  // Load configured max upload size from system settings
  useEffect(() => {
    api.getSettings().then((res) => {
      if (res?.settings?.max_file_size_mb) {
        const parsed = parseInt(res.settings.max_file_size_mb, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setMaxFileSizeMb(parsed);
        }
      }
    }).catch(() => {});
  }, []);

  const formatMaxLimitDisplay = () => {
    if (maxFileSizeMb >= 1024) {
      return `${(maxFileSizeMb / 1024).toFixed(maxFileSizeMb % 1024 === 0 ? 0 : 1)} گیگابایت`;
    }
    return `${maxFileSizeMb} مگابایت`;
  };

  // Helper to get matching icon based on file type or extension
  const getFileIcon = (fileName: string, fileType?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf' || fileType?.includes('pdf')) {
      return <FileText className="w-5 h-5 text-rose-500 shrink-0" />;
    }
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext) || fileType?.includes('word') || fileType?.includes('officedocument.wordprocessingml')) {
      return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext) || fileType?.includes('sheet') || fileType?.includes('excel') || fileType?.includes('officedocument.spreadsheetml')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || fileType?.includes('image/')) {
      return <ImageIcon className="w-5 h-5 text-purple-600 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || fileType?.includes('zip') || fileType?.includes('compressed')) {
      return <FileArchive className="w-5 h-5 text-amber-600 shrink-0" />;
    }
    return <File className="w-5 h-5 text-slate-500 shrink-0" />;
  };

  const handleUploadFile = async (file: File) => {
    const maxBytes = maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const fileMb = (file.size / (1024 * 1024)).toFixed(1);
      setStatusMessage({ 
        type: 'error', 
        text: `حجم فایل «${file.name}» (${fileMb}MB) بیش از سقف مجاز سامانه (${formatMaxLimitDisplay()}) است.` 
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setStatusMessage(null);

    try {
      await api.uploadProjectAttachmentStream(projectId, file, (percent) => {
        setUploadProgress(percent);
      });

      setStatusMessage({ type: 'success', text: `فایل «${file.name}» با موفقیت پیوست گردید.` });
      onAttachmentChange();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'خطا در بارگذاری فایل' });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleUploadFile(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canManage) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleUploadFile(files[0]);
    }
  };

  // Replacement flow
  const handleInitiateReplace = (attachment: ProjectAttachment) => {
    pendingReplaceAttachmentRef.current = attachment;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const handleReplaceInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const oldAttachment = pendingReplaceAttachmentRef.current;
    if (!files || !files[0] || !oldAttachment) return;

    const newFile = files[0];
    const maxBytes = maxFileSizeMb * 1024 * 1024;
    if (newFile.size > maxBytes) {
      const fileMb = (newFile.size / (1024 * 1024)).toFixed(1);
      setStatusMessage({ 
        type: 'error', 
        text: `حجم فایل جدید (${fileMb}MB) بیش از سقف مجاز سامانه (${formatMaxLimitDisplay()}) است.` 
      });
      return;
    }

    setReplacingId(oldAttachment.id);
    setUploadProgress(0);
    setStatusMessage(null);

    try {
      // 1. Upload new attachment with direct streaming
      await api.uploadProjectAttachmentStream(projectId, newFile, (percent) => {
        setUploadProgress(percent);
      });

      // 2. Delete old attachment
      await api.deleteProjectAttachment(projectId, oldAttachment.id);

      setStatusMessage({
        type: 'success',
        text: `فایل «${oldAttachment.fileName}» با فایل جدید «${newFile.name}» با موفقیت جایگزین شد.`,
      });
      onAttachmentChange();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'خطا در جایگزینی فایل' });
    } finally {
      setReplacingId(null);
      setUploadProgress(null);
      pendingReplaceAttachmentRef.current = null;
    }
  };

  const handleDeleteAttachment = async (attachment: ProjectAttachment) => {
    if (!confirm(`آیا از حذف فایل «${attachment.fileName}» از این پروژه اطمینان دارید؟`)) {
      return;
    }

    setDeletingId(attachment.id);
    setStatusMessage(null);

    try {
      await api.deleteProjectAttachment(projectId, attachment.id);
      setStatusMessage({ type: 'success', text: `فایل «${attachment.fileName}» با موفقیت حذف گردید.` });
      onAttachmentChange();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'خطا در حذف فایل' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (attachment: ProjectAttachment) => {
    api.downloadAttachment(attachment.id, attachment.fileName);
  };

  return (
    <div className="space-y-3">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceInputChange}
      />

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/60">
            <Paperclip className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-800">
            فایل‌ها و اسناد پیوست پروژه
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {attachments.length} فایل
          </span>
        </div>

        {canManage && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>در حال آپلود...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>پیوست فایل جدید</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Upload Progress Bar for Large Files */}
      {uploading && uploadProgress !== null && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between font-bold text-xs">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>در حال ارسال مستقیم و استریم فایل روی سرور...</span>
            </span>
            <span className="font-mono font-bold text-indigo-700">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-indigo-200/70 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-indigo-600 to-blue-600 transition-all duration-150 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            فایل‌های حجیم به صورت تکه‌تکه (Stream) مستقیماً روی دیسک ذخیره می‌شوند تا به حافظه سرور فشار وارد نشود.
          </p>
        </div>
      )}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Attachments List */}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((att) => {
            const isDeleting = deletingId === att.id;
            const isReplacing = replacingId === att.id;

            return (
              <div
                key={att.id}
                className="p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50/30 border border-slate-200/90 hover:border-indigo-200 transition duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800"
              >
                {/* File info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                    {getFileIcon(att.fileName, att.fileType)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate" title={att.fileName} dir="ltr">
                      {att.fileName}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-700 font-mono">
                        {formatFileSize(att.fileSize)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        {new Date(att.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                      {att.uploaderName && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <UserIcon className="w-2.5 h-2.5 text-slate-400" />
                            {att.uploaderName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {/* Download */}
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-indigo-700 hover:text-indigo-800 text-xs font-bold transition shadow-2xs cursor-pointer"
                    title="دانلود و مشاهده فایل"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>دانلود</span>
                  </button>

                  {/* Admin controls: Replace & Delete */}
                  {canManage && (
                    <>
                      {/* Replace */}
                      <button
                        type="button"
                        disabled={isReplacing || isDeleting}
                        onClick={() => handleInitiateReplace(att)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-slate-200 text-amber-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                        title="جایگزینی این فایل با فایل جدید"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isReplacing ? 'animate-spin' : ''}`} />
                        <span>جایگزینی</span>
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        disabled={isDeleting || isReplacing}
                        onClick={() => handleDeleteAttachment(att)}
                        className="p-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-slate-400 hover:text-rose-600 transition shadow-2xs cursor-pointer disabled:opacity-50"
                        title="حذف فایل از پروژه"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
          <Paperclip className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
          <span>هنوز هیچ فایلی (فیلم‌نامه، برآورد، اسناد فنی) برای این پروژه پیوست نشده است.</span>
        </div>
      )}

      {/* Drag & Drop Upload Zone for Admin */}
      {canManage && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 rounded-2xl border-2 border-dashed transition cursor-pointer text-center ${
            isDragOver
              ? 'border-indigo-500 bg-indigo-50/70'
              : 'border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50/60'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-600">
            <Upload className={`w-5 h-5 ${isDragOver ? 'text-indigo-600 animate-bounce' : 'text-slate-400'}`} />
            <div className="text-xs font-bold text-slate-800">
              کلیک برای انتخاب فایل یا رها کردن فایل در این کادر
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              پشتیبانی از انواع اسناد، فایل‌های ویدیو و فشرده (سقف مجاز: حداکثر {formatMaxLimitDisplay()})
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
