import React, { useState, useEffect } from 'react';
import { Workflow, Position, User, ProjectStructure, StructurePositionNode } from '../types';
import { api } from '../services/api';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  Briefcase, 
  X, 
  ArrowUp, 
  ArrowDown, 
  Star, 
  Edit2, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Users,
  FolderTree,
  Building2,
  RefreshCw
} from 'lucide-react';

interface WorkflowManagerProps {
  workflows: Workflow[];
  positions: Position[];
  structures?: ProjectStructure[];
  users?: User[];
  currentUser: User;
  onRefresh: () => void;
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  workflows,
  positions,
  structures = [],
  users = [],
  currentUser,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  
  // Dynamic Steps definition with target structure and position
  const [steps, setSteps] = useState<Array<{
    id?: string;
    title: string;
    structureId?: string | null;
    positionId: string;
    actionType: string;
    description?: string;
  }>>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cache for positions inside each structure
  const [structurePositionsMap, setStructurePositionsMap] = useState<Record<string, StructurePositionNode[]>>({});
  const [loadingStructureMap, setLoadingStructureMap] = useState(false);

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

  // Pre-load all structure positions so users can pick positions per structure seamlessly
  const loadAllStructurePositions = async () => {
    if (structures.length === 0) return;
    setLoadingStructureMap(true);
    try {
      const map: Record<string, StructurePositionNode[]> = {};
      await Promise.all(
        structures.map(async (st) => {
          try {
            const data = await api.getStructurePositions(st.id);
            map[st.id] = data.positions || [];
          } catch (e) {
            map[st.id] = [];
          }
        })
      );
      setStructurePositionsMap(map);
    } catch (e) {
      console.error('Failed to load structure positions map', e);
    } finally {
      setLoadingStructureMap(false);
    }
  };

  useEffect(() => {
    loadAllStructurePositions();
  }, [structures]);

  const getPositionDetails = (posId: string, structureId?: string | null) => {
    // If inside a specific structure, look for structure-assigned users
    if (structureId && structurePositionsMap[structureId]) {
      const node = structurePositionsMap[structureId].find((sp) => sp.positionId === posId);
      if (node && node.users && node.users.length > 0) {
        return {
          title: node.title,
          parentTitle: node.parentTitle,
          userNames: node.users.map((u) => u.name).join('، '),
        };
      }
    }

    const pos = positions.find((p) => p.id === posId);
    if (!pos) return { title: 'سمت نامشخص', userNames: 'بدون انتصاب' };
    
    // Find users assigned to this position generally
    const assignedUsers = users.filter((u) => u.positionId === pos.id).map((u) => u.name);
    return {
      title: pos.title,
      parentTitle: pos.parentTitle,
      userNames: assignedUsers.length > 0 ? assignedUsers.join('، ') : 'بدون متصدی مستقیم',
    };
  };

  const getStructureTitle = (structureId?: string | null) => {
    if (!structureId) return 'چارت عمومی سازمان';
    const found = structures.find((s) => s.id === structureId);
    return found ? found.title : 'ساختار اختصاصی';
  };

  const handleOpenCreate = () => {
    setEditingWorkflow(null);
    setTitle('');
    setDescription('');
    setIsDefault(false);
    // Default initial step
    setSteps([
      {
        title: 'گام ۱ (شروع ارزیابی)',
        structureId: structures[0]?.id || null,
        positionId: positions[0]?.id || '',
        actionType: 'REVIEW',
        description: 'سمت اولیه دریافت‌کننده طرح',
      }
    ]);
    setError('');
    setModalOpen(true);
    loadAllStructurePositions();
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
        structureId: s.structureId || null,
        positionId: s.positionId,
        actionType: s.actionType || 'REVIEW',
        description: s.description || '',
      }))
    );
    setError('');
    setModalOpen(true);
    loadAllStructurePositions();
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        title: `مرحله ${prev.length + 1}`,
        structureId: structures[0]?.id || null,
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

  const handleStepChange = (index: number, field: string, value: any) => {
    setSteps((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: value };

      // If structure changed, automatically pick first valid position from that structure if available
      if (field === 'structureId') {
        const structId = value;
        if (structId && structurePositionsMap[structId] && structurePositionsMap[structId].length > 0) {
          updated.positionId = structurePositionsMap[structId][0].positionId;
        } else if (positions.length > 0) {
          updated.positionId = positions[0].id;
        }
      }

      copy[index] = updated;
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

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        isDefault,
        steps: steps.map((s, idx) => ({
          ...s,
          stepOrder: idx + 1,
        })),
      };

      if (editingWorkflow) {
        await api.updateWorkflow(editingWorkflow.id, payload);
      } else {
        await api.createWorkflow(payload);
      }

      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت گردش کار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkflow = async (id: string, titleStr: string) => {
    if (!confirm(`آیا از حذف گردش کار «${titleStr}» اطمینان دارید؟`)) return;
    try {
      await api.deleteWorkflow(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف گردش کار');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.setDefaultWorkflow(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در تعیین گردش کار پیش‌فرض');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shadow-xs">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              طراحی و مدیریت گردش کار پروژه‌ها
            </h2>
            <p className="text-xs text-slate-500">
              تعیین مسیر ارجاع پروژه به سمت‌های مشخص از هر ساختار سازمانی، مراحل ارزیابی و اخذ مصوبه شورا.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllStructurePositions}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            title="بروزرسانی سمت‌ها و ساختارها"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStructureMap ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف گردش کار جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Info notice about targeting positions of specific structures */}
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-3">
        <Building2 className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="leading-relaxed">
          <strong>تخصیص ساختار و سمت:</strong> در این سامانه هر گام از گردش کار می‌تواند مستقیماً به <strong>سمت مشخصی از یک ساختار سازمانی اختصاصی</strong> (مانند ساختار مرخصی، ساختار ماموریت، ساختار تولید فیلم) یا چارت عمومی سازمان ارجاع داده شود.
        </p>
      </div>

      {/* Workflows List */}
      <div className="space-y-4">
        {workflows.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3">
            <Layers className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">هیچ گردش کاری تعریف نشده است</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              با ایجاد اولین فرآیند گردش کار، مشخص کنید پروژه‌ها پس از ثبت به کدام سمت‌ها از کدام ساختارها ارسال شوند.
            </p>
          </div>
        ) : (
          workflows.map((wf) => (
            <div
              key={wf.id}
              className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:border-slate-300 transition"
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs border border-indigo-200">
                    <GitBranch className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {wf.title}
                  </h3>
                  {Boolean(wf.isDefault) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Star className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                      گردش پیش‌فرض
                    </span>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    {!wf.isDefault && (
                      <button
                        onClick={() => handleSetDefault(wf.id)}
                        className="px-3 py-1 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                        title="تعیین به عنوان پیش‌فرض شورا"
                      >
                        تنظیم به عنوان پیش‌فرض
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(wf)}
                      className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                      title="ویرایش گردش کار"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!wf.isDefault && (
                      <button
                        onClick={() => handleDeleteWorkflow(wf.id, wf.title)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="حذف گردش کار"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {wf.description && (
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  {wf.description}
                </p>
              )}

              {/* Steps Timeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {wf.steps.map((st, idx) => {
                  const isFirst = idx === 0;
                  const posDetails = getPositionDetails(st.positionId, st.structureId);
                  const structTitle = st.structureTitle || getStructureTitle(st.structureId);

                  return (
                    <div
                      key={st.id || idx}
                      className={`p-4 rounded-2xl border transition relative ${
                        isFirst 
                          ? 'bg-emerald-50/40 border-emerald-200 shadow-2xs' 
                          : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center border ${
                            isFirst 
                              ? 'bg-emerald-600 text-white border-emerald-600' 
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {st.title}
                          </span>
                        </div>

                        {isFirst ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                            آغاز گردش
                          </span>
                        ) : idx === wf.steps.length - 1 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                            مرحله پایانی
                          </span>
                        ) : null}
                      </div>

                      {/* Structure badge */}
                      <div className="mb-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-indigo-700 shadow-2xs">
                          <FolderTree className="w-3 h-3 text-indigo-600" />
                          ساختار: {structTitle}
                        </span>
                      </div>

                      {/* Action Type */}
                      <div className="mb-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 inline-block font-medium">
                          {actionTypeLabels[st.actionType] || st.actionType}
                        </span>
                      </div>

                      {st.description && (
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-2 line-clamp-2">
                          {st.description}
                        </p>
                      )}

                      {/* Responsible Position & Users in that Structure */}
                      <div className="pt-2.5 border-t border-slate-200 mt-2">
                        <span className="text-[10px] text-slate-400 block mb-0.5">سمت هدف در ساختار:</span>
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                          <Briefcase className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                          {st.positionTitle || posDetails.title}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate block mt-0.5 flex items-center gap-1">
                          <Users className="w-3 h-3 text-slate-400 shrink-0" />
                          متصدی: {posDetails.userNames}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Create or Edit Workflow */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <GitBranch className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingWorkflow ? 'ویرایش فرآیند گردش کار و ساختارها' : 'طراحی فرآیند گردش کار جدید بر اساس ساختارها و سمت‌ها'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    برای هر مرحله از گردش مشخص کنید پروژه به کدام سمت از کدام ساختار سازمانی ارجاع داده شود.
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
                    placeholder="مثال: گردش کار بررسی طرح‌های سازمانی و پروژه‌ای"
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
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
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
                  placeholder="توضیح در خصوص ساختارها و نحوه ارجاع طرح‌ها در این فرآیند..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* Dynamic Steps sequence builder based on Structures & Positions */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">
                      مراحل ارجاع: تعیین ساختار و سمت مسئول برای هر گام
                    </label>
                    <p className="text-[11px] text-slate-500">
                      پروژه به ترتیب از گام ۱ به سمت‌های مشخص شده در ساختارهای انتخابی ارسال خواهد شد.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addStep}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    افزودن گام جدید
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto p-1">
                  {steps.map((st, idx) => {
                    const isFirst = idx === 0;
                    const currentStructId = st.structureId || '';
                    const structPositions = currentStructId && structurePositionsMap[currentStructId]
                      ? structurePositionsMap[currentStructId]
                      : [];

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition flex flex-col gap-3 ${
                          isFirst 
                            ? 'bg-emerald-50/40 border-emerald-200' 
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        {/* Step Top Bar */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center border ${
                              isFirst 
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' 
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              گام شماره {idx + 1}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => moveStepUp(idx)}
                              disabled={idx === 0}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="انتقال به گام قبل"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStepDown(idx)}
                              disabled={idx === steps.length - 1}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="انتقال به گام بعد"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeStep(idx)}
                              className="p-1 rounded-lg bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 cursor-pointer mr-1"
                              title="حذف این گام"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Fields Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          
                          {/* Step Title */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              عنوان این مرحله:
                            </label>
                            <input
                              type="text"
                              value={st.title}
                              onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                              placeholder="مثال: ارزیابی فنی و مالی"
                              className="w-full rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                              required
                            />
                          </div>

                          {/* 1. Project Structure Selector */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                              <FolderTree className="w-3 h-3 text-indigo-600" />
                              از کدام ساختار پروژه / سازمانی؟
                            </label>
                            <select
                              value={st.structureId || ''}
                              onChange={(e) => handleStepChange(idx, 'structureId', e.target.value || null)}
                              className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-indigo-900 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                            >
                              <option value="">چارت عمومی سازمان</option>
                              {structures.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title} ({s.category || 'ساختار سازمانی'})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 2. Position Selector for chosen Structure */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-indigo-600" />
                              سمت هدف از این ساختار:
                            </label>
                            <select
                              value={st.positionId}
                              onChange={(e) => handleStepChange(idx, 'positionId', e.target.value)}
                              className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-indigo-700 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                            >
                              {/* If specific structure chosen and has positions defined */}
                              {currentStructId && structPositions.length > 0 ? (
                                structPositions.map((sp) => {
                                  const userList = sp.users && sp.users.length > 0 
                                    ? sp.users.map((u) => u.name).join('، ')
                                    : 'بدون متصدی مستقیم';
                                  return (
                                    <option key={sp.id} value={sp.positionId}>
                                      {sp.title} ({userList})
                                    </option>
                                  );
                                })
                              ) : (
                                /* Fallback to general positions */
                                positions.map((p) => {
                                  const details = getPositionDetails(p.id);
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.title} ({details.userNames})
                                    </option>
                                  );
                                })
                              )}
                            </select>
                          </div>

                          {/* 3. Action Type */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              نوع اقدام:
                            </label>
                            <select
                              value={st.actionType}
                              onChange={(e) => handleStepChange(idx, 'actionType', e.target.value)}
                              className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                            >
                              {Object.entries(actionTypeLabels).map(([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'در حال ذخیره‌سازی...' : editingWorkflow ? 'ذخیره تغییرات' : 'ایجاد گردش کار'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
