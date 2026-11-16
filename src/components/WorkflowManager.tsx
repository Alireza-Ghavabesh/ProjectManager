import React, { useState, useEffect } from 'react';
import {
  Workflow,
  WorkflowStepConfig,
  Position,
  User,
  ProjectStructure,
  StructurePositionNode,
} from '../types';
import { api } from '../services/api';
import { hasPerm } from '../utils/permissions';
import { WorkflowTrackingView } from './WorkflowTrackingView';
import {
  GitBranch,
  Plus,
  Trash2,
  Briefcase,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Star,
  Edit2,
  Layers,
  Users,
  FolderTree,
  Building2,
  RefreshCw,
  GripVertical,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  CornerDownLeft,
  Move,
  Wand2,
  Search,
} from 'lucide-react';

interface WorkflowManagerProps {
  workflows: Workflow[];
  positions: Position[];
  structures?: ProjectStructure[];
  users?: User[];
  currentUser: User;
  onRefresh: () => void;
  onOpenWorkflowModalByProjectId?: (projectId: string) => void;
}

interface EditableStep {
  id?: string;
  localKey: string;
  title: string;
  structureId?: string | null;
  positionId: string;
  actionType: string;
  description?: string;
  config: WorkflowStepConfig;
}

const ACTION_PRESETS: Array<{ value: string; label: string; short: string; color: string }> = [
  { value: 'REVIEW', label: 'بررسی عمومی و اعلام نظر اولیه', short: 'بررسی اولیه', color: 'slate' },
  { value: 'TECHNICAL_APPROVE', label: 'ارزیابی فنی و تجهیزات تولید', short: 'ارزیابی فنی', color: 'blue' },
  { value: 'CONTENT_APPROVE', label: 'بررسی کیفی، متنی و محتوایی', short: 'ارزیابی کیفی', color: 'violet' },
  { value: 'BUDGET_APPROVE', label: 'کنترل مالی، هزینه‌ها و برآورد بودجه', short: 'کنترل مالی', color: 'amber' },
  { value: 'COUNCIL_REVIEW', label: 'بررسی کارشناسی و استعلام تخصصی', short: 'کارشناسی', color: 'cyan' },
  { value: 'FINAL_COUNCIL_VOTE', label: 'طرح در صحن شورا و اخذ آرای محرمانه', short: 'رای‌گیری شورا', color: 'indigo' },
  { value: 'DIRECTOR_SANCTION', label: 'تنفیذ نهایی، تایید ریاست و صدور ابلاغیه', short: 'تنفیذ و ابلاغ', color: 'emerald' },
  { value: 'CUSTOM', label: 'اقدام اختصاصی و سفارشی (نام دلخواه)', short: 'اقدام دلخواه', color: 'rose' },
];

const APPROVAL_MODE_LABELS: Record<string, string> = {
  SINGLE: 'تایید متصدی / مسئول گام',
  MAJORITY: 'رای‌گیری اکثریت اعضا',
  ALL: 'تایید اجماعی همه نفرات',
  NOTIFY_ONLY: 'اطلاع‌رسانی و عبور خودکار',
};

const REJECT_ACTION_LABELS: Record<string, string> = {
  RETURN_PREV: 'بازگشت به گام قبلی',
  RETURN_CREATOR: 'بازگشت به گام اول (اصلاح)',
  REJECT_PROJECT: 'رد و مختومه شدن طرح',
  CUSTOM_STEP: 'ارجاع به گام دلخواه',
};

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  workflows,
  positions,
  structures = [],
  users = [],
  currentUser,
  onRefresh,
  onOpenWorkflowModalByProjectId,
}) => {
  const canViewWfDefs = hasPerm(currentUser, ['workflow.view', 'workflow.create', 'workflow.edit', 'workflow.delete']);
  const [subTab, setSubTab] = useState<'definitions' | 'tracking'>(canViewWfDefs ? 'definitions' : 'tracking');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0);

  // Toolbox state inside visual designer
  const [toolboxStructureId, setToolboxStructureId] = useState<string>(structures[0]?.id || '');

  // Drag & Drop state for visual workflow builder
  type WfDragPayload =
    | { kind: 'step-reorder'; fromIndex: number }
    | { kind: 'toolbox-position'; structureId: string | null; positionId: string; title: string }
    | { kind: 'toolbox-action'; actionType: string; title: string };

  const [dragPayload, setDragPayload] = useState<WfDragPayload | null>(null);
  const [dropSlotIndex, setDropSlotIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cache for positions inside each structure
  const [structurePositionsMap, setStructurePositionsMap] = useState<Record<string, StructurePositionNode[]>>({});
  const [loadingStructureMap, setLoadingStructureMap] = useState(false);

  const canCreateWf = hasPerm(currentUser, 'workflow.create');
  const canEditWf = hasPerm(currentUser, 'workflow.edit');
  const canDeleteWf = hasPerm(currentUser, 'workflow.delete');

  const actionTypeLabels: Record<string, string> = Object.fromEntries(
    ACTION_PRESETS.map((p) => [p.value, p.label])
  );

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
          } catch {
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

  const makeLocalKey = () => `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const getPositionDetails = (posId: string, structureId?: string | null) => {
    if (structureId && structurePositionsMap[structureId]) {
      const node = structurePositionsMap[structureId].find((sp) => sp.positionId === posId);
      if (node) {
        return {
          title: node.title,
          parentTitle: node.parentTitle,
          userNames:
            node.users && node.users.length > 0
              ? node.users.map((u) => u.name).join('، ')
              : 'بدون متصدی در ساختار',
        };
      }
    }

    const pos = positions.find((p) => p.id === posId);
    if (!pos) return { title: 'سمت نامشخص', userNames: 'بدون انتصاب' };

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

  const getStepActionDisplay = (actionType: string, config?: WorkflowStepConfig) => {
    if (actionType === 'CUSTOM' && config?.customActionLabel?.trim()) {
      return config.customActionLabel.trim();
    }
    return actionTypeLabels[actionType] || actionType;
  };

  const handleOpenCreate = () => {
    setEditingWorkflow(null);
    setTitle('');
    setDescription('');
    setIsDefault(false);
    const initialStructId = structures[0]?.id || null;
    setToolboxStructureId(initialStructId || '');
    const firstStructPos = initialStructId ? structurePositionsMap[initialStructId]?.[0]?.positionId : undefined;
    setSteps([
      {
        localKey: makeLocalKey(),
        title: 'گام ۱ (آغاز و بررسی اولیه)',
        structureId: initialStructId,
        positionId: firstStructPos || positions[0]?.id || '',
        actionType: 'REVIEW',
        description: 'سمت اولیه دریافت‌کننده طرح',
        config: { approvalMode: 'SINGLE', onRejectAction: 'RETURN_PREV' },
      },
    ]);
    setSelectedStepIdx(0);
    setError('');
    setModalOpen(true);
    loadAllStructurePositions();
  };

  const handleOpenEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setTitle(wf.title);
    setDescription(wf.description || '');
    setIsDefault(Boolean(wf.isDefault));
    setToolboxStructureId(wf.steps[0]?.structureId || structures[0]?.id || '');
    const mapped: EditableStep[] = wf.steps.map((s) => {
      let parsedCfg: WorkflowStepConfig = s.config || {};
      if (!s.config && s.configJson) {
        try {
          parsedCfg = JSON.parse(s.configJson);
        } catch {
          parsedCfg = {};
        }
      }
      return {
        id: s.id,
        localKey: makeLocalKey(),
        title: s.title,
        structureId: s.structureId || null,
        positionId: s.positionId,
        actionType: s.actionType || 'REVIEW',
        description: s.description || '',
        config: {
          approvalMode: parsedCfg.approvalMode || 'SINGLE',
          onRejectAction: parsedCfg.onRejectAction || 'RETURN_PREV',
          onRejectStepOrder: parsedCfg.onRejectStepOrder,
          onApproveStepOrder: parsedCfg.onApproveStepOrder,
          conditionLabel: parsedCfg.conditionLabel || '',
          customActionLabel: parsedCfg.customActionLabel || '',
        },
      };
    });
    setSteps(mapped);
    setSelectedStepIdx(0);
    setError('');
    setModalOpen(true);
    loadAllStructurePositions();
  };

  const createDefaultStep = (overrides: Partial<EditableStep> = {}): EditableStep => {
    const structId = overrides.structureId !== undefined ? overrides.structureId : (toolboxStructureId || null);
    const structPositions = structId ? structurePositionsMap[structId] : undefined;
    const defaultPos =
      overrides.positionId ||
      (structPositions && structPositions.length > 0 ? structPositions[0].positionId : positions[0]?.id || '');
    return {
      localKey: makeLocalKey(),
      title: overrides.title || `مرحله ${steps.length + 1}`,
      structureId: structId,
      positionId: defaultPos,
      actionType: overrides.actionType || 'REVIEW',
      description: overrides.description || '',
      config: overrides.config || { approvalMode: 'SINGLE', onRejectAction: 'RETURN_PREV' },
    };
  };

  const insertStepAt = (index: number, newStep: EditableStep) => {
    setSteps((prev) => {
      const copy = [...prev];
      const clamped = Math.max(0, Math.min(copy.length, index));
      copy.splice(clamped, 0, newStep);
      setSelectedStepIdx(clamped);
      return copy;
    });
  };

  const addStep = () => {
    insertStepAt(steps.length, createDefaultStep());
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      setError('گردش کار باید حداقل شامل یک مرحله سازمانی باشد.');
      return;
    }
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (selectedStepIdx >= next.length) {
        setSelectedStepIdx(Math.max(0, next.length - 1));
      } else if (selectedStepIdx > index) {
        setSelectedStepIdx(selectedStepIdx - 1);
      }
      return next;
    });
  };

  const reorderStep = (fromIdx: number, toSlotIdx: number) => {
    if (fromIdx === toSlotIdx || fromIdx + 1 === toSlotIdx) return;
    setSteps((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      const targetIdx = toSlotIdx > fromIdx ? toSlotIdx - 1 : toSlotIdx;
      copy.splice(targetIdx, 0, moved);
      setSelectedStepIdx(targetIdx);
      return copy;
    });
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    reorderStep(index, index - 1);
  };

  const moveStepDown = (index: number) => {
    if (index >= steps.length - 1) return;
    reorderStep(index, index + 2);
  };

  const handleStepChange = (index: number, field: keyof EditableStep, value: any) => {
    setSteps((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: value };

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

  const handleStepConfigChange = (index: number, cfgField: keyof WorkflowStepConfig, value: any) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        config: {
          ...copy[index].config,
          [cfgField]: value,
        },
      };
      return copy;
    });
  };

  const handleDropAtSlot = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropSlotIndex(null);
    if (!dragPayload) return;

    const payload = dragPayload;
    setDragPayload(null);

    if (payload.kind === 'step-reorder') {
      reorderStep(payload.fromIndex, slotIdx);
    } else if (payload.kind === 'toolbox-position') {
      insertStepAt(
        slotIdx,
        createDefaultStep({
          title: `بررسی در ${payload.title}`,
          structureId: payload.structureId,
          positionId: payload.positionId,
          actionType: 'REVIEW',
        })
      );
    } else if (payload.kind === 'toolbox-action') {
      insertStepAt(
        slotIdx,
        createDefaultStep({
          title: payload.title,
          actionType: payload.actionType,
          config: {
            approvalMode: payload.actionType === 'FINAL_COUNCIL_VOTE' ? 'MAJORITY' : 'SINGLE',
            onRejectAction: 'RETURN_PREV',
            customActionLabel: payload.actionType === 'CUSTOM' ? 'اقدام اختصاصی' : undefined,
          },
        })
      );
    }
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

    const missingPos = steps.find((s) => !s.positionId);
    if (missingPos) {
      setError(`لطفاً سمت هدف را برای گام «${missingPos.title}» انتخاب کنید.`);
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
          id: s.id,
          title: s.title,
          structureId: s.structureId || null,
          positionId: s.positionId,
          actionType: s.actionType,
          description: s.description || '',
          config: s.config,
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
      setError(err.message || 'خطا در حذف گردش کار');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.setDefaultWorkflow(id);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در تعیین گردش کار پیش‌فرض');
    }
  };

  const selectedStep = steps[selectedStepIdx] || null;
  const activeToolboxStructPositions =
    toolboxStructureId && structurePositionsMap[toolboxStructureId]
      ? structurePositionsMap[toolboxStructureId]
      : [];

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
              طراحی بصری و مدیریت گردش کارهای پویا
            </h2>
            <p className="text-xs text-slate-500">
              با کشیدن و رها کردن سمت‌ها و بلوک‌های عملیات، هر نوع مسیر ارجاع، شرط، نحوه رای‌گیری و بازگشت به مرحله دلخواه را طراحی کنید.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadAllStructurePositions}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            title="بروزرسانی سمت‌ها و ساختارها"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStructureMap ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {subTab === 'definitions' && canCreateWf && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              <span>طراحی گردش کار جدید (درگ‌اند‌دراپ)</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs: Tracking by Workflow Code & Filters vs Workflow Definitions */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs w-fit">
        <button
          type="button"
          onClick={() => setSubTab('tracking')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'tracking'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>رهگیری با کد گردش کار و کارتابل اشخاص</span>
        </button>

        {canViewWfDefs && (
          <button
            type="button"
            onClick={() => setSubTab('definitions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              subTab === 'definitions'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>تعاریف و طراحی گردش کارها ({workflows.length})</span>
          </button>
        )}
      </div>

      {subTab === 'tracking' ? (
        <WorkflowTrackingView
          workflows={workflows}
          positions={positions}
          users={users}
          currentUser={currentUser}
          onOpenWorkflowModalByProjectId={onOpenWorkflowModalByProjectId}
        />
      ) : (
        <>
          {/* Info notice */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-3">
            <Building2 className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="leading-relaxed">
              <strong>استودیوی بصری گردش کار:</strong> می‌توانید هر گام را به سمت‌های یک ساختار اختصاصی متصل کنید، نوع اقدام سفارشی بنویسید، شرط اجرا بگذارید و تعیین کنید در صورت عدم تایید، طرح به کدام مرحله برگردد.
            </p>
          </div>

          {/* Workflows List */}
          <div className="space-y-4">
        {workflows.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3">
            <Layers className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">هیچ گردش کاری تعریف نشده است</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              با استودیوی بصری درگ‌اند‌دراپ، اولین فرآیند گردش کار سازمان خود را طراحی کنید.
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
                  <h3 className="text-base font-bold text-slate-900">{wf.title}</h3>
                  {Boolean(wf.isDefault) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Star className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                      گردش پیش‌فرض
                    </span>
                  )}
                </div>

                {(canEditWf || canDeleteWf) && (
                  <div className="flex items-center gap-1.5">
                    {canEditWf && !wf.isDefault && (
                      <button
                        onClick={() => handleSetDefault(wf.id)}
                        className="px-3 py-1 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                      >
                        تنظیم به عنوان پیش‌فرض
                      </button>
                    )}
                    {canEditWf && (
                      <button
                        onClick={() => handleOpenEdit(wf)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition cursor-pointer"
                        title="ویرایش بصری گردش کار"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>ویرایش بصری</span>
                      </button>
                    )}
                    {canDeleteWf && !wf.isDefault && (
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
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">{wf.description}</p>
              )}

              {/* Visual Flowchart Timeline */}
              <div className="flex flex-wrap items-stretch gap-2.5">
                {wf.steps.map((st, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === wf.steps.length - 1;
                  const posDetails = getPositionDetails(st.positionId, st.structureId);
                  const structTitle = st.structureTitle || getStructureTitle(st.structureId);
                  const stepCfg: WorkflowStepConfig = st.config || {};

                  return (
                    <React.Fragment key={st.id || idx}>
                      <div
                        className={`flex-1 min-w-[230px] max-w-[320px] p-4 rounded-2xl border transition flex flex-col justify-between ${
                          isFirst
                            ? 'bg-emerald-50/40 border-emerald-200 shadow-2xs'
                            : isLast
                            ? 'bg-indigo-50/30 border-indigo-200 shadow-2xs'
                            : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          {/* Step Header */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center border shrink-0 ${
                                  isFirst
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : isLast
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-slate-200 text-slate-700 border-slate-300'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-900 truncate">{st.title}</span>
                            </div>

                            {isFirst ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 shrink-0">
                                آغاز
                              </span>
                            ) : isLast ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200 shrink-0">
                                پایان
                              </span>
                            ) : null}
                          </div>

                          {/* Structure badge */}
                          <div className="mb-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-indigo-700">
                              <FolderTree className="w-3 h-3 text-indigo-600" />
                              {structTitle}
                            </span>
                          </div>

                          {/* Action & Rules badges */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                              {getStepActionDisplay(st.actionType, stepCfg)}
                            </span>
                            {stepCfg.approvalMode && stepCfg.approvalMode !== 'SINGLE' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 font-semibold">
                                {APPROVAL_MODE_LABELS[stepCfg.approvalMode]}
                              </span>
                            )}
                            {stepCfg.conditionLabel && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                شرط: {stepCfg.conditionLabel}
                              </span>
                            )}
                            {stepCfg.onRejectAction && stepCfg.onRejectAction !== 'RETURN_PREV' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                                در عدم تایید:{' '}
                                {stepCfg.onRejectAction === 'CUSTOM_STEP' && stepCfg.onRejectStepOrder
                                  ? `بازگشت به گام ${stepCfg.onRejectStepOrder}`
                                  : REJECT_ACTION_LABELS[stepCfg.onRejectAction]}
                              </span>
                            )}
                          </div>

                          {st.description && (
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2 line-clamp-2">
                              {st.description}
                            </p>
                          )}
                        </div>

                        {/* Responsible Position & Users */}
                        <div className="pt-2 border-t border-slate-200/80 mt-1">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                            <Briefcase className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                            {st.positionTitle || posDetails.title}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400 shrink-0" />
                            {posDetails.userNames}
                          </span>
                        </div>
                      </div>

                      {!isLast && (
                        <div className="hidden sm:flex items-center justify-center text-indigo-400 px-0.5">
                          <ArrowLeft className="w-5 h-5" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))
        )}
          </div>
        </>
      )}

      {/* ===================== VISUAL DRAG & DROP WORKFLOW STUDIO MODAL ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-6xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-4 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                  <GitBranch className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingWorkflow
                      ? `ویرایش بصری گردش کار: ${editingWorkflow.title}`
                      : 'استودیوی بصری طراحی گردش کار (درگ‌اند‌دراپ)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    سمت‌ها یا بلوک‌های عملیات را از جعبه ابزار به بوم گردش کار بکشید، ترتیب گام‌ها را جابجا کنید و قواعد هر گام را تنظیم نمایید.
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
              <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmitWorkflow} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Top Metadata Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    عنوان گردش کار *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: فرآیند تصویب پروژه‌های ویژه / مالی..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                    required
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    شرح و کاربرد فرآیند
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="توضیح مختصر در خصوص نحوه جریان پرونده..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <label className="w-full flex items-center gap-2 h-9 px-3 rounded-xl bg-white border border-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-700">پیش‌فرض شورا</span>
                  </label>
                </div>
              </div>

              {/* Main 2-Column Visual Builder */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* RIGHT SIDE IN RTL: DRAGGABLE TOOLBOX */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Toolbox 1: Draggable Structure Positions */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <FolderTree className="w-4 h-4 text-indigo-600" />
                        <span>سمت‌های ساختار (بکشید به بوم)</span>
                      </h4>
                    </div>

                    <select
                      value={toolboxStructureId}
                      onChange={(e) => setToolboxStructureId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-indigo-900 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">چارت عمومی سازمان (همه سمت‌ها)</option>
                      {structures.map((s) => (
                        <option key={s.id} value={s.id}>
                          ساختار: {s.title}
                        </option>
                      ))}
                    </select>

                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {toolboxStructureId && activeToolboxStructPositions.length > 0 ? (
                        activeToolboxStructPositions.map((sp) => (
                          <div
                            key={sp.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData('text/plain', sp.positionId);
                              setDragPayload({
                                kind: 'toolbox-position',
                                structureId: toolboxStructureId,
                                positionId: sp.positionId,
                                title: sp.title,
                              });
                            }}
                            onDragEnd={() => {
                              setDragPayload(null);
                              setDropSlotIndex(null);
                            }}
                            className="p-2.5 rounded-xl bg-white border border-indigo-200/80 hover:border-indigo-400 text-xs flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing shadow-2xs transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 truncate">{sp.title}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {sp.users?.length > 0
                                    ? sp.users.map((u) => u.name).join('، ')
                                    : 'بدون متصدی'}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                insertStepAt(
                                  steps.length,
                                  createDefaultStep({
                                    title: `بررسی در ${sp.title}`,
                                    structureId: toolboxStructureId,
                                    positionId: sp.positionId,
                                  })
                                )
                              }
                              className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white font-bold cursor-pointer shrink-0 transition"
                            >
                              + گام
                            </button>
                          </div>
                        ))
                      ) : (
                        positions.map((pos) => (
                          <div
                            key={pos.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData('text/plain', pos.id);
                              setDragPayload({
                                kind: 'toolbox-position',
                                structureId: toolboxStructureId || null,
                                positionId: pos.id,
                                title: pos.title,
                              });
                            }}
                            onDragEnd={() => {
                              setDragPayload(null);
                              setDropSlotIndex(null);
                            }}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-xs flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing shadow-2xs transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-800 truncate">{pos.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                insertStepAt(
                                  steps.length,
                                  createDefaultStep({
                                    title: `بررسی در ${pos.title}`,
                                    structureId: toolboxStructureId || null,
                                    positionId: pos.id,
                                  })
                                )
                              }
                              className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white font-bold cursor-pointer shrink-0 transition"
                            >
                              + گام
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Toolbox 2: Draggable Action Block Templates */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>بلوک‌های عملیات (بکشید یا کلیک کنید)</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ACTION_PRESETS.map((preset) => (
                        <div
                          key={preset.value}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'copy';
                            e.dataTransfer.setData('text/plain', preset.value);
                            setDragPayload({
                              kind: 'toolbox-action',
                              actionType: preset.value,
                              title: preset.short,
                            });
                          }}
                          onDragEnd={() => {
                            setDragPayload(null);
                            setDropSlotIndex(null);
                          }}
                          onClick={() =>
                            insertStepAt(
                              steps.length,
                              createDefaultStep({
                                title: preset.short,
                                actionType: preset.value,
                                config: {
                                  approvalMode: preset.value === 'FINAL_COUNCIL_VOTE' ? 'MAJORITY' : 'SINGLE',
                                  onRejectAction: 'RETURN_PREV',
                                  customActionLabel: preset.value === 'CUSTOM' ? 'اقدام اختصاصی' : undefined,
                                },
                              })
                            )
                          }
                          className="p-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 text-[11px] font-bold text-slate-700 flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition shadow-2xs"
                        >
                          <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{preset.short}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* LEFT SIDE IN RTL: VISUAL FLOWCHART CANVAS + STEP INSPECTOR */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Flowchart Canvas */}
                  <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Move className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-black text-slate-900">
                          بوم جریان مراحل ({steps.length} گام) — برای چیدمان بکشید و رها کنید
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={addStep}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        افزودن گام
                      </button>
                    </div>

                    {/* Visual Connected Steps Canvas */}
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto p-1">
                      {steps.map((st, idx) => {
                        const isSelected = idx === selectedStepIdx;
                        const isFirst = idx === 0;
                        const posInfo = getPositionDetails(st.positionId, st.structureId);
                        const isBeingDragged =
                          dragPayload?.kind === 'step-reorder' && dragPayload.fromIndex === idx;

                        return (
                          <React.Fragment key={st.localKey}>
                            {/* Drop Slot BEFORE step idx */}
                            <div
                              onDragOver={(e) => {
                                if (!dragPayload) return;
                                e.preventDefault();
                                setDropSlotIndex(idx);
                              }}
                              onDragLeave={() => {
                                if (dropSlotIndex === idx) setDropSlotIndex(null);
                              }}
                              onDrop={(e) => handleDropAtSlot(e, idx)}
                              className={`transition-all rounded-xl text-center text-[10px] font-bold flex items-center justify-center ${
                                dropSlotIndex === idx
                                  ? 'h-8 bg-indigo-100 border-2 border-dashed border-indigo-500 text-indigo-700 my-1'
                                  : dragPayload
                                  ? 'h-3 bg-indigo-50/60 border border-dashed border-indigo-200 text-transparent'
                                  : 'h-1'
                              }`}
                            >
                              {dropSlotIndex === idx && `رها کنید تا در گام ${idx + 1} قرار گیرد`}
                            </div>

                            {/* Visual Step Card */}
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', st.localKey);
                                setDragPayload({ kind: 'step-reorder', fromIndex: idx });
                              }}
                              onDragEnd={() => {
                                setDragPayload(null);
                                setDropSlotIndex(null);
                              }}
                              onClick={() => setSelectedStepIdx(idx)}
                              className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                                isBeingDragged
                                  ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50'
                                  : isSelected
                                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing shrink-0"
                                  title="برای تغییر ترتیب بکشید"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <span
                                  className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                                    isFirst
                                      ? 'bg-emerald-600 text-white'
                                      : idx === steps.length - 1
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-800 text-white'
                                  }`}
                                >
                                  {idx + 1}
                                </span>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-black text-slate-900 truncate">
                                      {st.title || `گام ${idx + 1}`}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                                      {getStepActionDisplay(st.actionType, st.config)}
                                    </span>
                                    {st.config.conditionLabel && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                        شرط: {st.config.conditionLabel}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                    <span className="flex items-center gap-1">
                                      <FolderTree className="w-3 h-3 text-slate-400" />
                                      {getStructureTitle(st.structureId)}
                                    </span>
                                    <span>•</span>
                                    <span className="font-bold text-slate-700 flex items-center gap-1">
                                      <Briefcase className="w-3 h-3 text-indigo-500" />
                                      {posInfo.title}
                                    </span>
                                    <span className="text-[10px] text-slate-400">({posInfo.userNames})</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => moveStepUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                                  title="انتقال به بالا"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStepDown(idx)}
                                  disabled={idx === steps.length - 1}
                                  className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                                  title="انتقال به پایین"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeStep(idx)}
                                  className="p-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer mr-1"
                                  title="حذف گام"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}

                      {/* Final Drop Slot at END of list */}
                      <div
                        onDragOver={(e) => {
                          if (!dragPayload) return;
                          e.preventDefault();
                          setDropSlotIndex(steps.length);
                        }}
                        onDragLeave={() => {
                          if (dropSlotIndex === steps.length) setDropSlotIndex(null);
                        }}
                        onDrop={(e) => handleDropAtSlot(e, steps.length)}
                        className={`transition-all rounded-xl text-center text-[11px] font-bold flex items-center justify-center ${
                          dropSlotIndex === steps.length
                            ? 'h-10 bg-emerald-100 border-2 border-dashed border-emerald-500 text-emerald-800 mt-1'
                            : dragPayload
                            ? 'h-8 bg-slate-100 border border-dashed border-slate-300 text-slate-500 mt-1'
                            : 'h-2'
                        }`}
                      >
                        {dragPayload ? 'برای افزودن به انتهای گردش کار اینجا رها کنید' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Step Inspector Panel (Full Customization for Selected Step) */}
                  {selectedStep && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-indigo-100 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                            <SlidersHorizontal className="w-4 h-4" />
                          </span>
                          <h4 className="text-xs sm:text-sm font-black text-slate-900">
                            تنظیمات پیشرفته گام {selectedStepIdx + 1}: «{selectedStep.title || 'بدون عنوان'}»
                          </h4>
                        </div>
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          ویرایش زنده
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Step Title */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            عنوان گام *
                          </label>
                          <input
                            type="text"
                            value={selectedStep.title}
                            onChange={(e) => handleStepChange(selectedStepIdx, 'title', e.target.value)}
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            required
                          />
                        </div>

                        {/* Structure Selector */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            ساختار سازمانی مرتبط
                          </label>
                          <select
                            value={selectedStep.structureId || ''}
                            onChange={(e) =>
                              handleStepChange(selectedStepIdx, 'structureId', e.target.value || null)
                            }
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs font-bold text-indigo-900 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                          >
                            <option value="">چارت عمومی سازمان</option>
                            {structures.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Position Selector */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            سمت مسئول در این گام
                          </label>
                          <select
                            value={selectedStep.positionId}
                            onChange={(e) => handleStepChange(selectedStepIdx, 'positionId', e.target.value)}
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs font-bold text-indigo-700 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                          >
                            {selectedStep.structureId &&
                            structurePositionsMap[selectedStep.structureId]?.length > 0
                              ? structurePositionsMap[selectedStep.structureId].map((sp) => (
                                  <option key={sp.id} value={sp.positionId}>
                                    {sp.title} (
                                    {sp.users?.length > 0
                                      ? sp.users.map((u) => u.name).join('، ')
                                      : 'بدون متصدی'}
                                    )
                                  </option>
                                ))
                              : positions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title}
                                  </option>
                                ))}
                          </select>
                        </div>

                        {/* Action Type */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            نوع اقدام در این گام
                          </label>
                          <select
                            value={selectedStep.actionType}
                            onChange={(e) => handleStepChange(selectedStepIdx, 'actionType', e.target.value)}
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                          >
                            {ACTION_PRESETS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Custom Action Label if CUSTOM */}
                        {selectedStep.actionType === 'CUSTOM' && (
                          <div>
                            <label className="block text-[11px] font-bold text-rose-700 mb-1">
                              عنوان اقدام دلخواه (سفارشی) *
                            </label>
                            <input
                              type="text"
                              value={selectedStep.config.customActionLabel || ''}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'customActionLabel', e.target.value)
                              }
                              placeholder="مثلاً: تاییدیه حراست / امضای قرارداد..."
                              className="w-full rounded-xl bg-rose-50/40 border border-rose-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-rose-500"
                            />
                          </div>
                        )}

                        {/* Approval Mode */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            نحوه تصمیم‌گیری و تایید
                          </label>
                          <select
                            value={selectedStep.config.approvalMode || 'SINGLE'}
                            onChange={(e) =>
                              handleStepConfigChange(selectedStepIdx, 'approvalMode', e.target.value)
                            }
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                          >
                            {Object.entries(APPROVAL_MODE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Reject / Revision Routing */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <CornerDownLeft className="w-3 h-3 text-rose-500" />
                            <span>مسیر در صورت عدم تایید / اصلاح</span>
                          </label>
                          <select
                            value={selectedStep.config.onRejectAction || 'RETURN_PREV'}
                            onChange={(e) =>
                              handleStepConfigChange(selectedStepIdx, 'onRejectAction', e.target.value)
                            }
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                          >
                            {Object.entries(REJECT_ACTION_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Custom Reject Target Step */}
                        {selectedStep.config.onRejectAction === 'CUSTOM_STEP' && (
                          <div>
                            <label className="block text-[11px] font-bold text-rose-700 mb-1">
                              بازگشت به کدام گام؟
                            </label>
                            <select
                              value={selectedStep.config.onRejectStepOrder || 1}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'onRejectStepOrder',
                                  parseInt(e.target.value, 10)
                                )
                              }
                              className="w-full rounded-xl bg-rose-50/40 border border-rose-300 px-3 py-2 text-xs text-slate-900"
                            >
                              {steps.map((targetSt, tIdx) => (
                                <option key={targetSt.localKey} value={tIdx + 1}>
                                  گام {tIdx + 1}: {targetSt.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Condition Label */}
                        <div className="sm:col-span-2 lg:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            شرط اجرای گام (اختیاری)
                          </label>
                          <input
                            type="text"
                            value={selectedStep.config.conditionLabel || ''}
                            onChange={(e) =>
                              handleStepConfigChange(selectedStepIdx, 'conditionLabel', e.target.value)
                            }
                            placeholder="مثلاً: برای طرح‌های بالای ۱۰۰ میلیون..."
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          دستورالعمل و توضیحات این گام
                        </label>
                        <input
                          type="text"
                          value={selectedStep.description || ''}
                          onChange={(e) => handleStepChange(selectedStepIdx, 'description', e.target.value)}
                          placeholder="توضیحات راهنما برای مسئول این مرحله..."
                          className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  )}
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
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'در حال ذخیره‌سازی...' : editingWorkflow ? 'ذخیره گردش کار' : 'ایجاد گردش کار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
