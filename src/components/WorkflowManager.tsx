import React, { useState } from 'react';
import { Workflow, Position, User } from '../types';
import { api } from '../services/api';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  Briefcase, 
  X,
  FileCheck2,
  ArrowUp,
  ArrowDown,
  Star,
  Edit2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Layers,
  Users
} from 'lucide-react';

interface WorkflowManagerProps {
  workflows: Workflow[];
  positions: Position[];
  users?: User[];
  currentUser: User;
  onRefresh: () => void;
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  workflows,
  positions,
  users = [],
  currentUser,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  
  // Dynamic Steps definition based on positions
  const [steps, setSteps] = useState<Array<{
    id?: string;
    title: string;
    positionId: string;
    actionType: string;
    description?: string;
  }>>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN' || 
    (Array.isArray(currentUser.permissions) && currentUser.permissions.includes('workflow.definitions.manage'));

  const actionTypeLabels: Record<string, string> = {
    'TECHNICAL_APPROVE': 'ارزیابی فنی و تجهیزات تولید',
    'CONTENT_APPROVE': 'بررسی کیفی، متنی و فیلم‌نامه',
    'BUDGET_APPROVE': 'کنترل مالی، هزینه‌ها و برآورد بودجه',
    'COUNCIL_REVIEW': 'بررسی کارشناسی و استعلام',
    'FINAL_COUNCIL_VOTE': 'طرح در صحن شورا و اخذ آرای محرمانه',
    'DIRECTOR_SANCTION': 'تنفیذ نهایی، تایید ریاست و صدور ابلاغیه',
    'REVIEW': 'بررسی عمومی و اعلام نظر اولیه',
  };

  const getPositionDetails = (posId: string) => {
    const pos = positions.find((p) => p.id === posId);
    if (!pos) return { title: 'سمت نامشخص', userNames: 'بدون انتصاب' };
    
    // Find users assigned to this position
    const assignedUsers = users.filter((u) => u.positionId === pos.id).map((u) => u.name);
    return {
      title: pos.title,
      parentTitle: pos.parentTitle,
      userNames: assignedUsers.length > 0 ? assignedUsers.join('، ') : 'بدون متصدی مستقیم',
    };
  };

  const handleOpenCreate = () => {
    setEditingWorkflow(null);
    setTitle('');
    setDescription('');
    setIsDefault(false);
    // Provide sensible default multi-stage workflow from available positions
    const initialSteps = positions.slice(0, 3).map((pos, idx) => ({
      title: idx === 0 ? 'ارزیابی فنی و تجهیزات' : idx === 1 ? 'بررسی کیفی و محتوایی' : 'طرح در صحن شورا و مصوبه نهایی',
      positionId: pos.id,
      actionType: idx === 0 ? 'TECHNICAL_APPROVE' : idx === 1 ? 'CONTENT_APPROVE' : 'FINAL_COUNCIL_VOTE',
      description: idx === 0 ? 'اولین مرحله گردش کار پس از ثبت طرح' : undefined,
    }));
    setSteps(initialSteps.length > 0 ? initialSteps : [
      {
        title: 'گام ۱ (شروع فرآیند)',
        positionId: positions[0]?.id || '',
        actionType: 'REVIEW',
        description: 'سمت اولیه دریافت‌کننده طرح',
      }
    ]);
    setError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setTitle(wf.title);
    setDescription(wf.description || '');
    setIsDefault(Boolean(wf.isDefault));
    setSteps(
      wf.steps.map((s) => ({
        id: s.id,
        title: s.title,
        positionId: s.positionId,
        actionType: s.actionType || 'REVIEW',
        description: s.description || '',
      }))
    );
    setError('');
    setModalOpen(true);
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        title: `مرحله ${prev.length + 1}`,
        positionId: positions[0]?.id || '',
        actionType: 'REVIEW',
        description: '',
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      alert('گردش کار باید حداقل شامل یک مرحله سازمانی باشد.');
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    setSteps((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    setSteps((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleStepChange = (index: number, field: string, value: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmitWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('عنوان فرآیند گردش کار الزامی است.');
      return;
    }
    if (steps.length === 0) {
      setError('حداقل یک مرحله برای گردش کار باید تعیین شود.');
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].positionId) {
        setError(`لطفاً سمت سازمانی مسئول مرحله ${i + 1} را انتخاب فرمایید.`);
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        isDefault,
        steps,
      };

      if (editingWorkflow) {
        await api.updateWorkflow(editingWorkflow.id, payload);
      } else {
        await api.createWorkflow(payload);
      }

      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت فرآیند گردش کار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkflow = async (wf: Workflow) => {
    if (!confirm(`آیا از حذف گردش کار «${wf.title}» اطمینان دارید؟`)) return;
    try {
      await api.deleteWorkflow(wf.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف گردش کار');
    }
  };

  const handleSetDefault = async (wf: Workflow) => {
    try {
      await api.setDefaultWorkflow(wf.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در تعیین پیش‌فرض');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <GitBranch className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              طراحی و مدیریت گردش کار بر روی ساختار و سمت‌ها
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            تعریف گام‌به‌گام گردش پروژه‌ها میان سمت‌های چارت سازمانی. شما می‌توانید مشخص کنید وقتی طرح ثبت می‌شود ابتدا به کدام سمت برود و بعد از تایید به چه ترتیبی به سمت‌های بعدی ارجاع شود.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm transition cursor-pointer shrink-0"
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
            className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition"
          >
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{wf.title}</span>
                    {wf.isDefault ? (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1">
                        <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                        گردش کار پیش‌فرض سیستم
                      </span>
                    ) : null}
                  </h3>
                  {wf.description && (
                    <p className="text-xs text-slate-500 mt-1">
                      {wf.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                  {wf.steps.length} مرحله سازمانی
                </span>

                {isAdmin && (
                  <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                    {!wf.isDefault && (
                      <button
                        onClick={() => handleSetDefault(wf)}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer font-medium"
                        title="تعیین به عنوان گردش کار پیش‌فرض"
                      >
                        تنظیم پیش‌فرض
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(wf)}
                      className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                      title="ویرایش مراحل و سمت‌های گردش کار"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!wf.isDefault && (
                      <button
                        onClick={() => handleDeleteWorkflow(wf)}
                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="حذف گردش کار"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sequence flow explanation */}
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">ترتیب ارجاع در چارت سازمانی:</span>
              <span className="text-slate-400">ابتدا پروژه به گام اول ارسال و پس از تایید متصدی آن سمت به گام‌های بعد منتقل می‌شود.</span>
            </div>

            {/* Steps Timeline Visual */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 relative">
              {wf.steps.map((st, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === wf.steps.length - 1;
                const posDetails = getPositionDetails(st.positionId);

                return (
                  <div
                    key={st.id || idx}
                    className={`p-4 rounded-2xl border flex flex-col justify-between relative group transition ${
                      isFirst 
                        ? 'bg-emerald-50/40 border-emerald-200 shadow-xs' 
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      {/* Step Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-6 h-6 rounded-full font-extrabold text-xs flex items-center justify-center border ${
                            isFirst 
                              ? 'bg-emerald-600 text-white border-emerald-600' 
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600">
                            گام {idx + 1}
                          </span>
                        </div>

                        {isFirst ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                            نقطه شروع گردش
                          </span>
                        ) : isLast ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                            مرحله تصویب نهایی
                          </span>
                        ) : null}
                      </div>

                      {/* Step Title */}
                      <h4 className="text-xs font-bold text-slate-900 mb-1 leading-snug">
                        {st.title}
                      </h4>

                      {/* Action Type */}
                      <div className="mb-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 inline-block font-medium">
                          {actionTypeLabels[st.actionType] || st.actionType}
                        </span>
                      </div>

                      {st.description && (
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-2 line-clamp-2">
                          {st.description}
                        </p>
                      )}
                    </div>

                    {/* Responsible Position in Org Chart */}
                    <div className="pt-2 border-t border-slate-200 mt-2">
                      <span className="text-[10px] text-slate-400 block mb-0.5">سمت مسئول در ساختار سازمانی:</span>
                      <span className="text-xs font-bold text-indigo-700 flex items-center gap-1.5 truncate">
                        <Briefcase className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                        {st.positionTitle || posDetails.title}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate block mt-0.5 flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        متصدی: {posDetails.userNames}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Create or Edit Workflow */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <GitBranch className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingWorkflow ? 'ویرایش فرآیند گردش کار و سمت‌ها' : 'طراحی فرآیند گردش کار جدید بر روی سمت‌های چارت'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تعیین ترتیب دقیق ارجاع طرح میان سمت‌ها و مشخص کردن نقطه آغاز گردش.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmitWorkflow} className="p-5 space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    عنوان فرآیند گردش کار *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: گردش کار ویژه پروژه‌های داستانی و سریال"
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    وضعیت پیش‌فرض
                  </label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-slate-50 border border-slate-300">
                    <input
                      type="checkbox"
                      id="isDefaultWf"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="isDefaultWf" className="text-xs text-slate-700 font-medium cursor-pointer">
                      گردش کار پیش‌فرض شورا
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  شرح و هدف فرآیند
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="توضیح کوتاه در خصوص نحوه گردش طرح‌ها در این فرآیند..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              {/* Dynamic Steps sequence builder based on Organizational Positions */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">
                      ترتیب مراحل ارجاع به سمت‌های چارت سازمانی:
                    </label>
                    <p className="text-[11px] text-slate-500">
                      مرحله ۱ سمتی است که پروژه بلافاصله پس از ثبت به کارتابل آن ارسال خواهد شد. با دکمه‌های فلش می‌توانید اولویت مراحل را جابجا کنید.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addStep}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    افزودن مرحله به گردش
                  </button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto p-1">
                  {steps.map((st, idx) => {
                    const isFirst = idx === 0;
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row items-start sm:items-center gap-3 ${
                          isFirst 
                            ? 'bg-emerald-50/50 border-emerald-200' 
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        {/* Order & Reordering buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center border ${
                            isFirst 
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveStepUp(idx)}
                              disabled={idx === 0}
                              className="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="انتقال به گام قبل"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStepDown(idx)}
                              disabled={idx === steps.length - 1}
                              className="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="انتقال به گام بعد"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Step details fields */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                          
                          {/* Title */}
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">
                              عنوان این مرحله:
                            </label>
                            <input
                              type="text"
                              value={st.title}
                              onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                              placeholder="عنوان مرحله"
                              className="w-full rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                              required
                            />
                          </div>

                          {/* Position Selector from Organizational Chart */}
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">
                              سمت مسئول در چارت سازمانی:
                            </label>
                            <select
                              value={st.positionId}
                              onChange={(e) => handleStepChange(idx, 'positionId', e.target.value)}
                              className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-indigo-700 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer transition"
                            >
                              {positions.map((p) => {
                                const details = getPositionDetails(p.id);
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.title} ({details.userNames})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Action Type */}
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">
                              نوع اقدام در این مرحله:
                            </label>
                            <select
                              value={st.actionType}
                              onChange={(e) => handleStepChange(idx, 'actionType', e.target.value)}
                              className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer transition"
                            >
                              <option value="TECHNICAL_APPROVE">ارزیابی فنی و تجهیزات</option>
                              <option value="CONTENT_APPROVE">بررسی کیفی و فیلم‌نامه</option>
                              <option value="BUDGET_APPROVE">کنترل مالی و برآورد بودجه</option>
                              <option value="COUNCIL_REVIEW">بررسی کارشناسی و استعلام</option>
                              <option value="FINAL_COUNCIL_VOTE">طرح در صحن شورا و رای‌گیری</option>
                              <option value="DIRECTOR_SANCTION">تنفیذ و تایید نهایی مدیریت</option>
                              <option value="REVIEW">بررسی عمومی و ارزیابی اولیه</option>
                            </select>
                          </div>

                        </div>

                        {/* Delete step button */}
                        <button
                          type="button"
                          onClick={() => removeStep(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                          title="حذف مرحله"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  {loading ? 'در حال ذخیره...' : editingWorkflow ? 'ذخیره تغییرات گردش کار' : 'ثبت فرآیند گردش کار'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
