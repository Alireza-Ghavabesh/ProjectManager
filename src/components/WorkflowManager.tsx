import React, { useState } from 'react';
import { Workflow, Position, User } from '../types';
import { api } from '../services/api';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  Briefcase, 
  X,
  FileCheck2
} from 'lucide-react';

interface WorkflowManagerProps {
  workflows: Workflow[];
  positions: Position[];
  currentUser: User;
  onRefresh: () => void;
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  workflows,
  positions,
  currentUser,
  onRefresh,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<Array<{ title: string; positionId: string; actionType: string; description?: string }>>([
    { title: 'ارزیابی فنی و تجهیزات', positionId: positions[0]?.id || '', actionType: 'TECHNICAL_APPROVE' },
    { title: 'بررسی کیفی و محتوایی', positionId: positions[1]?.id || positions[0]?.id || '', actionType: 'CONTENT_APPROVE' },
    { title: 'تصویب در صحن شورا', positionId: positions[2]?.id || positions[0]?.id || '', actionType: 'FINAL_COUNCIL_VOTE' },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN';

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        title: `مرحله ${prev.length + 1}`,
        positionId: positions[0]?.id || '',
        actionType: 'REVIEW',
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      alert('گردش کار باید حداقل شامل یک مرحله باشد.');
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: string, value: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('عنوان گردش کار الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.createWorkflow({
        title: title.trim(),
        description: description.trim(),
        steps,
      });

      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت فرآیند گردش کار');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <GitBranch className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              طراحی و مدیریت گردش کار بر روی ساختار سازمانی
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            تعریف مراحل گردش پروژه‌ها میان سمت‌های تعریف‌شده در چارت سازمانی (ارزیابی فنی، بررسی کیفی، برآورد مالی و تصویب نهایی در صحن شورا)
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>طراحی فرآیند گردش کار جدید</span>
          </button>
        )}
      </div>

      {/* Workflows List */}
      <div className="space-y-6">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{wf.title}</span>
                    {wf.isDefault ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        گردش کار پیش‌فرض سیستم
                      </span>
                    ) : null}
                  </h3>
                  {wf.description && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {wf.description}
                    </p>
                  )}
                </div>
              </div>

              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {wf.steps.length} مرحله سازمانی
              </span>
            </div>

            {/* Steps Timeline Visual */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
              {wf.steps.map((st, idx) => (
                <div
                  key={st.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between relative group hover:border-emerald-400 transition"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-xs flex items-center justify-center border border-emerald-300">
                        {idx + 1}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 font-medium">
                        گام {idx + 1}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 mb-1.5 leading-snug">
                      {st.title}
                    </h4>

                    {st.description && (
                      <p className="text-[11px] text-slate-600 leading-relaxed mb-3 line-clamp-2">
                        {st.description}
                      </p>
                    )}
                  </div>

                  {/* Responsible Position from Org Chart */}
                  <div className="pt-2 border-t border-slate-200 mt-2">
                    <span className="text-[10px] text-slate-400 block mb-0.5">سمت مسئول در چارت:</span>
                    <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5 truncate">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      {st.positionTitle || 'تعیین نشده'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Create Workflow */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-emerald-600" />
                طراحی فرآیند گردش کار جدید بر روی سمت‌های چارت
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateWorkflow} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان گردش کار *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: گردش کار ویژه پروژه‌های داستانی و سریال"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  توضیحات فرآیند
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="توضیح کوتاه در مورد این روال ارزیابی..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              {/* Dynamic Steps on Org Structure */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800">
                    مراحل ارجاع و بررسی در ساختار سازمانی:
                  </label>
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-xs text-emerald-600 font-bold hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    افزودن مرحله
                  </button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto p-1">
                  {steps.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={st.title}
                          onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                          placeholder="عنوان این مرحله"
                          className="rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                          required
                        />

                        {/* Select Position from Organizational Chart */}
                        <select
                          value={st.positionId}
                          onChange={(e) => handleStepChange(idx, 'positionId', e.target.value)}
                          className="rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs text-blue-700 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer transition"
                        >
                          {positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              سمت مسئول: {p.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="حذف مرحله"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  {loading ? 'در حال ذخیره...' : 'ثبت فرآیند گردش کار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
