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
  CheckCircle2,
  AlertTriangle,
  CornerDownLeft,
  Move,
  Wand2,
  Search,
  Info,
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
  positionIds: string[];
  description?: string;
  config: WorkflowStepConfig;
}

const APPROVAL_MODE_OPTIONS: Array<{
  value: 'SINGLE' | 'MAJORITY' | 'ALL' | 'NOTIFY_ONLY';
  label: string;
  shortLabel: string;
}> = [
  {
    value: 'SINGLE',
    label: 'تایید یک نفر از افراد این مرحله (تک‌نفره)',
    shortLabel: 'تایید یک نفر',
  },
  {
    value: 'MAJORITY',
    label: 'تایید اکثریت افراد این مرحله (بیش از ۵۰٪)',
    shortLabel: 'تایید اکثریت اعضا',
  },
  {
    value: 'ALL',
    label: 'تایید اجماعی تمام افراد این مرحله (۱۰۰٪)',
    shortLabel: 'تایید همه اعضا',
  },
  {
    value: 'NOTIFY_ONLY',
    label: 'فقط اطلاع‌رسانی (عبور با اولین ثبت)',
    shortLabel: 'اطلاع‌رسانی و عبور',
  },
];

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

  // Toolbox state inside visual designer: default to empty ("چارت عمومی سازمان") so all positions match cleanly
  const [toolboxStructureId, setToolboxStructureId] = useState<string>('');
  const [toolboxSearch, setToolboxSearch] = useState<string>('');

  // Drag & Drop state for visual workflow builder
  type WfDragPayload =
    | { kind: 'step-reorder'; fromIndex: number }
    | { kind: 'toolbox-position'; structureId: string | null; positionId: string; title: string };

  const [dragPayload, setDragPayload] = useState<WfDragPayload | null>(null);
  const [dropSlotIndex, setDropSlotIndex] = useState<number | null>(null);
  const [dropParallelStepIdx, setDropParallelStepIdx] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cache for positions inside each structure
  const [structurePositionsMap, setStructurePositionsMap] = useState<Record<string, StructurePositionNode[]>>({});
  const [loadingStructureMap, setLoadingStructureMap] = useState(false);

  const canCreateWf = hasPerm(currentUser, 'workflow.create');
  const canEditWf = hasPerm(currentUser, 'workflow.edit');
  const canDeleteWf = hasPerm(currentUser, 'workflow.delete');

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

  const structuresKey = structures
    .map((s) => `${s.id}:${s.positionCount || 0}:${s.userCount || 0}`)
    .join('|');

  useEffect(() => {
    loadAllStructurePositions();
  }, [structuresKey]);

  const makeLocalKey = () => `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const getPositionDetails = (posId: string, structureId?: string | null) => {
    const pos = positions.find((p) => p.id === posId);
    const directUsers = users.filter((u) => u.positionId === posId);

    if (structureId && structurePositionsMap[structureId]) {
      const node = structurePositionsMap[structureId].find((sp) => sp.positionId === posId);
      if (node) {
        const mergedUsersMap = new Map<string, { id: string; name: string }>();
        directUsers.forEach((u) => mergedUsersMap.set(u.id, { id: u.id, name: u.name }));
        (node.users || []).forEach((u) => mergedUsersMap.set(u.id, { id: u.id, name: u.name }));
        const allNames = Array.from(mergedUsersMap.values()).map((u) => u.name);
        return {
          id: posId,
          title: node.title || pos?.title || 'سمت سازمانی',
          userIds: Array.from(mergedUsersMap.keys()),
          userCount: mergedUsersMap.size,
          userNames: allNames.length > 0 ? allNames.join('، ') : 'بدون متصدی',
        };
      }
    }

    return {
      id: posId,
      title: pos?.title || 'سمت نامشخص',
      userIds: directUsers.map((u) => u.id),
      userCount: directUsers.length,
      userNames: directUsers.length > 0 ? directUsers.map((u) => u.name).join('، ') : 'بدون متصدی',
    };
  };

  const getStepUniqueAssignees = (positionIds: string[], structureId?: string | null) => {
    const seen = new Map<string, string>();
    for (const pid of positionIds) {
      const d = getPositionDetails(pid, structureId);
      d.userIds.forEach((uid, idx) => {
        const u = users.find((x) => x.id === uid);
        seen.set(uid, u?.name || `کاربر ${idx + 1}`);
      });
    }
    const names = Array.from(seen.values());
    return {
      count: seen.size,
      names,
      namesText: names.length > 0 ? names.join('، ') : 'بدون متصدی منتسب',
    };
  };

  const getStructureTitle = (structureId?: string | null) => {
    if (!structureId) return 'چارت عمومی سازمان';
    const found = structures.find((s) => s.id === structureId);
    return found ? found.title : 'ساختار اختصاصی';
  };

  const getApprovalSummaryText = (mode: string | undefined, memberCount: number) => {
    const n = memberCount;
    if (mode === 'MAJORITY') {
      if (n <= 0) return 'اکثریت اعضای سمت (بیش از ۵۰٪)';
      const req = Math.floor(n / 2) + 1;
      return `اکثریت اعضا (${req} از ${n} نفر)`;
    }
    if (mode === 'ALL') {
      if (n <= 0) return 'اجماع همه اعضای مرحله (۱۰۰٪)';
      return `تایید همه اعضا (${n} از ${n} نفر)`;
    }
    if (mode === 'NOTIFY_ONLY') {
      return 'اطلاع‌رسانی و عبور با اولین بررسی';
    }
    return 'تایید یک نفر از اعضا کافیست';
  };

  const getApprovalExplanationText = (mode: string | undefined, memberCount: number) => {
    const n = memberCount;
    if (mode === 'MAJORITY') {
      if (n <= 0) {
        return 'پروژه هم‌زمان در کارتابل تمام افراد این گام قرار می‌گیرد و پس از تایید بیش از نصف آن‌ها (بیش از ۵۰٪) به مرحله بعد می‌رود.';
      }
      const req = Math.floor(n / 2) + 1;
      return `این گام هم‌اکنون ${n} نفر عضو دارد؛ پروژه در کارتابل هر ${n} نفر قرار می‌گیرد و پس از تایید حداقل ${req} نفر به مرحله بعد می‌رود.`;
    }
    if (mode === 'ALL') {
      if (n <= 0) {
        return 'پروژه هم‌زمان به کارتابل تمام افراد این گام می‌رود و باید تک‌تک آن‌ها تایید کنند تا پرونده وارد گام بعد شود.';
      }
      return `این گام هم‌اکنون ${n} نفر عضو دارد؛ تمام ${n} نفر باید به صورت جداگانه تایید کنند تا پروژه به مرحله بعد منتقل شود.`;
    }
    if (mode === 'NOTIFY_ONLY') {
      return 'پروژه در کارتابل تمام افراد این مرحله قرار می‌گیرد و صرفاً برای اطلاع‌رسانی و بررسی سریع با اولین اقدام به گام بعد می‌رود.';
    }
    if (n <= 1) {
      return 'با تایید نفر مسئول این گام، پروژه بلافاصله به مرحله بعد منتقل می‌شود.';
    }
    return `این گام ${n} نفر عضو دارد؛ پرونده در کارتابل هر ${n} نفر ظاهر می‌شود و با تایید اولین نفر، بلافاصله به مرحله بعد می‌رود.`;
  };

  const handleOpenCreate = () => {
    setEditingWorkflow(null);
    setTitle('');
    setDescription('');
    setIsDefault(false);
    setToolboxStructureId('');
    setToolboxSearch('');
    const defaultPos = positions[0]?.id ? [positions[0].id] : [];
    setSteps([
      {
        localKey: makeLocalKey(),
        title: 'گام ۱ (بررسی اولیه)',
        structureId: null,
        positionIds: defaultPos,
        description: 'سمت اولیه دریافت‌کننده پروژه',
        config: { approvalMode: 'SINGLE', onRejectAction: 'RETURN_PREV' },
      },
    ]);
    setSelectedStepIdx(0);
    setError('');
    setModalOpen(true);
    if (structures.length > 0 && Object.keys(structurePositionsMap).length === 0) {
      loadAllStructurePositions();
    }
  };

  const handleOpenEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setTitle(wf.title);
    setDescription(wf.description || '');
    setIsDefault(Boolean(wf.isDefault));
    setToolboxStructureId(wf.steps[0]?.structureId || '');
    setToolboxSearch('');
    const mapped: EditableStep[] = wf.steps.map((s) => {
      let parsedCfg: WorkflowStepConfig = s.config || {};
      if (!s.config && s.configJson) {
        try {
          parsedCfg = JSON.parse(s.configJson);
        } catch {
          parsedCfg = {};
        }
      }
      const posIds =
        Array.isArray(s.positionIds) && s.positionIds.length > 0
          ? Array.from(new Set(s.positionIds))
          : s.positionId
          ? [s.positionId]
          : [];
      return {
        id: s.id,
        localKey: makeLocalKey(),
        title: s.title,
        structureId: s.structureId || null,
        positionIds: posIds,
        description: s.description || '',
        config: {
          approvalMode: parsedCfg.approvalMode || 'SINGLE',
          onRejectAction: parsedCfg.onRejectAction || 'RETURN_PREV',
          onRejectStepOrder: parsedCfg.onRejectStepOrder,
          onApproveStepOrder: parsedCfg.onApproveStepOrder,
          conditionLabel: parsedCfg.conditionLabel || '',
        },
      };
    });
    setSteps(mapped);
    setSelectedStepIdx(0);
    setError('');
    setModalOpen(true);
    if (structures.length > 0 && Object.keys(structurePositionsMap).length === 0) {
      loadAllStructurePositions();
    }
  };

  const createDefaultStep = (overrides: Partial<EditableStep> = {}): EditableStep => {
    const structId = overrides.structureId !== undefined ? overrides.structureId : toolboxStructureId || null;
    const structPositions = structId ? structurePositionsMap[structId] : undefined;
    const fallbackPos =
      structPositions && structPositions.length > 0 ? structPositions[0].positionId : positions[0]?.id || '';
    const positionIds =
      overrides.positionIds && overrides.positionIds.length > 0
        ? overrides.positionIds
        : fallbackPos
        ? [fallbackPos]
        : [];
    return {
      localKey: makeLocalKey(),
      title: overrides.title || `گام ${steps.length + 1}`,
      structureId: structId,
      positionIds,
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

  const addParallelPositionToStep = (stepIndex: number, positionId: string, structureId?: string | null) => {
    if (!positionId) return;
    setSteps((prev) => {
      const copy = [...prev];
      const step = copy[stepIndex];
      if (!step) return prev;
      if (step.positionIds.includes(positionId)) {
        return prev;
      }
      const nextStructureId =
        step.structureId && structureId && step.structureId !== structureId
          ? null
          : step.structureId || structureId || null;
      copy[stepIndex] = {
        ...step,
        structureId: nextStructureId,
        positionIds: [...step.positionIds, positionId],
      };
      return copy;
    });
    setSelectedStepIdx(stepIndex);
  };

  const removeParallelPositionFromStep = (stepIndex: number, positionId: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      const step = copy[stepIndex];
      if (!step || step.positionIds.length <= 1) return prev;
      copy[stepIndex] = {
        ...step,
        positionIds: step.positionIds.filter((id) => id !== positionId),
      };
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
          const validSet = new Set(structurePositionsMap[structId].map((sp) => sp.positionId));
          const kept = updated.positionIds.filter((id) => validSet.has(id));
          updated.positionIds =
            kept.length > 0 ? kept : [structurePositionsMap[structId][0].positionId];
        } else if (updated.positionIds.length === 0 && positions.length > 0) {
          updated.positionIds = [positions[0].id];
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

  const clearDragState = () => {
    setDragPayload(null);
    setDropSlotIndex(null);
    setDropParallelStepIdx(null);
  };

  const handleDropAtSlot = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    clearDragState();
    if (!payload) return;

    if (payload.kind === 'step-reorder') {
      reorderStep(payload.fromIndex, slotIdx);
    } else if (payload.kind === 'toolbox-position') {
      insertStepAt(
        slotIdx,
        createDefaultStep({
          title: `بررسی در ${payload.title}`,
          structureId: payload.structureId,
          positionIds: [payload.positionId],
        })
      );
    }
  };

  const handleDropOnStepCard = (e: React.DragEvent, targetStepIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    clearDragState();
    if (!payload) return;

    if (payload.kind === 'toolbox-position') {
      addParallelPositionToStep(targetStepIdx, payload.positionId, payload.structureId);
    } else if (payload.kind === 'step-reorder' && payload.fromIndex !== targetStepIdx) {
      reorderStep(payload.fromIndex, targetStepIdx > payload.fromIndex ? targetStepIdx + 1 : targetStepIdx);
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

    const missingPos = steps.find((s) => !s.positionIds || s.positionIds.length === 0);
    if (missingPos) {
      setError(`لطفاً حداقل یک سمت مسئول برای گام «${missingPos.title}» انتخاب کنید.`);
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
          positionId: s.positionIds[0],
          positionIds: s.positionIds,
          actionType: 'APPROVAL',
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

  const qBox = toolboxSearch.trim().toLowerCase();
  const filteredStructPositions = activeToolboxStructPositions.filter(
    (sp) => !qBox || sp.title.toLowerCase().includes(qBox)
  );
  const filteredGeneralPositions = positions.filter(
    (p) => !qBox || p.title.toLowerCase().includes(qBox)
  );

  // Available positions to add in parallel for the currently selected step
  const stepCandidatePositions =
    selectedStep?.structureId && structurePositionsMap[selectedStep.structureId]?.length > 0
      ? structurePositionsMap[selectedStep.structureId].map((sp) => ({
          id: sp.positionId,
          title: sp.title,
        }))
      : positions.map((p) => ({ id: p.id, title: p.title }));

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
              سمت‌ها را با درگ‌اند‌دراپ به ترتیب مراحل بچینید یا چند سمت را برای ارسال هم‌زمان روی یک گام رها کنید.
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

      {/* Sub-Tabs */}
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
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 text-indigo-950 text-xs flex items-center gap-3">
            <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <p className="leading-relaxed">
              <strong>ارسال ترتیبی و هم‌زمان به کارتابل‌ها:</strong> در طراحی هر گردش کار می‌توانید تعیین کنید پروژه پس از هر مرحله به کدام سمت برود، یا در یک گام به طور <strong>هم‌زمان به کارتابل چند سمت و چند شخص</strong> ارسال شود و با چه نصابی (یک نفر، اکثریت یا همه) به گام بعد برود.
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
                      const posIds =
                        Array.isArray(st.positionIds) && st.positionIds.length > 0
                          ? st.positionIds
                          : st.positionId
                          ? [st.positionId]
                          : [];
                      const stepAssignees = getStepUniqueAssignees(posIds, st.structureId);
                      const structTitle = st.structureTitle || getStructureTitle(st.structureId);
                      const stepCfg: WorkflowStepConfig = st.config || {};

                      return (
                        <React.Fragment key={st.id || idx}>
                          <div
                            className={`flex-1 min-w-[240px] max-w-[340px] p-4 rounded-2xl border transition flex flex-col justify-between ${
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
                                    className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center border shrink-0 tabular-nums ${
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

                              {/* Scope + Decision Rule */}
                              <div className="flex flex-wrap gap-1 mb-2">
                                {st.structureId && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-indigo-700">
                                    <FolderTree className="w-3 h-3 text-indigo-600" />
                                    {structTitle}
                                  </span>
                                )}
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-800 font-semibold">
                                  {getApprovalSummaryText(stepCfg.approvalMode, stepAssignees.count)}
                                </span>
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

                            {/* Responsible Positions (supports parallel multiple positions) & Users */}
                            <div className="pt-2 border-t border-slate-200/80 mt-1 space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {posIds.map((pid) => {
                                  const d = getPositionDetails(pid, st.structureId);
                                  return (
                                    <span
                                      key={pid}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200"
                                    >
                                      <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
                                      <span>{d.title}</span>
                                      <span className="text-[10px] font-semibold text-indigo-600 tabular-nums">
                                        ({d.userCount})
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-start gap-1 leading-relaxed">
                                <Users className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">
                                  کارتابل ({stepAssignees.count} نفر): {stepAssignees.namesText}
                                </span>
                              </div>
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
                      : 'طراحی بصری گردش کار و مسیر کارتابل (درگ‌اند‌دراپ)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    برای مرحله جدید، سمت را بین گام‌ها رها کنید؛ برای ارسال هم‌زمان به چند سمت، آن را مستقیماً روی کارت یک گام رها کنید.
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
                {/* RIGHT SIDE IN RTL: DRAGGABLE POSITIONS TOOLBOX */}
                <div className="lg:col-span-4 space-y-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <FolderTree className="w-4 h-4 text-indigo-600" />
                        <span>سمت‌های سازمانی (بکشید به بوم)</span>
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

                    <div className="relative">
                      <input
                        type="text"
                        value={toolboxSearch}
                        onChange={(e) => setToolboxSearch(e.target.value)}
                        placeholder="جستجوی نام سمت..."
                        className="w-full rounded-xl bg-white border border-slate-200 px-3 py-1.5 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-2 pr-0.5">
                      {toolboxStructureId && filteredStructPositions.length > 0 ? (
                        filteredStructPositions.map((sp) => (
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
                            onDragEnd={clearDragState}
                            className="p-2.5 rounded-xl bg-white border border-indigo-200/80 hover:border-indigo-400 text-xs flex flex-col gap-2 cursor-grab active:cursor-grabbing shadow-2xs transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800 truncate">{sp.title}</div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {sp.users?.length > 0
                                      ? `${sp.users.length} نفر: ${sp.users.map((u) => u.name).join('، ')}`
                                      : 'بدون متصدی در ساختار'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 justify-end">
                              {selectedStep && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    addParallelPositionToStep(selectedStepIdx, sp.positionId, toolboxStructureId)
                                  }
                                  className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white font-bold cursor-pointer transition"
                                  title="ارسال هم‌زمان به این سمت در گام انتخاب‌شده"
                                >
                                  + هم‌زمان به گام {selectedStepIdx + 1}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  insertStepAt(
                                    steps.length,
                                    createDefaultStep({
                                      title: `بررسی در ${sp.title}`,
                                      structureId: toolboxStructureId,
                                      positionIds: [sp.positionId],
                                    })
                                  )
                                }
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-600 hover:text-white font-bold cursor-pointer transition"
                              >
                                + گام جدید
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        filteredGeneralPositions.map((pos) => {
                          const posDetails = getPositionDetails(pos.id, null);
                          return (
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
                              onDragEnd={clearDragState}
                              className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-xs flex flex-col gap-2 cursor-grab active:cursor-grabbing shadow-2xs transition"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate">{pos.title}</div>
                                    <div className="text-[10px] text-slate-400 truncate tabular-nums">
                                      {posDetails.userCount > 0
                                        ? `${posDetails.userCount} نفر: ${posDetails.userNames}`
                                        : 'بدون متصدی منتسب'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 justify-end">
                                {selectedStep && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addParallelPositionToStep(
                                        selectedStepIdx,
                                        pos.id,
                                        toolboxStructureId || null
                                      )
                                    }
                                    className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white font-bold cursor-pointer transition"
                                    title="ارسال هم‌زمان به این سمت در گام انتخاب‌شده"
                                  >
                                    + هم‌زمان به گام {selectedStepIdx + 1}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    insertStepAt(
                                      steps.length,
                                      createDefaultStep({
                                        title: `بررسی در ${pos.title}`,
                                        structureId: toolboxStructureId || null,
                                        positionIds: [pos.id],
                                      })
                                    )
                                  }
                                  className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white font-bold cursor-pointer transition"
                                >
                                  + گام جدید
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
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
                          چیدمان گام‌ها ({steps.length} مرحله)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={addStep}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        افزودن گام جدید
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200/80 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>
                        برای <strong>ساخت گام جدید یا تغییر ترتیب</strong> بین کارت‌ها رها کنید؛ برای <strong>ارسال هم‌زمان به چند سمت</strong>، سمت را مستقیماً روی کارت یک گام رها کنید.
                      </span>
                    </div>

                    {/* Visual Connected Steps Canvas */}
                    <div className="space-y-1.5 max-h-[340px] overflow-y-auto p-1">
                      {steps.map((st, idx) => {
                        const isSelected = idx === selectedStepIdx;
                        const isFirst = idx === 0;
                        const assignees = getStepUniqueAssignees(st.positionIds, st.structureId);
                        const isBeingDragged =
                          dragPayload?.kind === 'step-reorder' && dragPayload.fromIndex === idx;
                        const isParallelDropActive =
                          dropParallelStepIdx === idx && dragPayload?.kind === 'toolbox-position';

                        return (
                          <React.Fragment key={st.localKey}>
                            {/* Drop Slot BEFORE step idx */}
                            <div
                              onDragOver={(e) => {
                                if (!dragPayload) return;
                                e.preventDefault();
                                setDropSlotIndex(idx);
                                if (dropParallelStepIdx !== null) setDropParallelStepIdx(null);
                              }}
                              onDragLeave={() => {
                                if (dropSlotIndex === idx) setDropSlotIndex(null);
                              }}
                              onDrop={(e) => handleDropAtSlot(e, idx)}
                              className={`transition-all rounded-xl text-center text-[10px] font-bold flex items-center justify-center ${
                                dropSlotIndex === idx
                                  ? 'h-8 bg-indigo-100 border-2 border-dashed border-indigo-500 text-indigo-700 my-1'
                                  : dragPayload
                                  ? 'h-3.5 bg-indigo-50/70 border border-dashed border-indigo-200 text-transparent'
                                  : 'h-1'
                              }`}
                            >
                              {dropSlotIndex === idx && `رها کنید تا گام جدید / جابجا شده در ردیف ${idx + 1} قرار گیرد`}
                            </div>

                            {/* Visual Step Card (ALSO accepts drops for Parallel Multi-Position routing!) */}
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', st.localKey);
                                setDragPayload({ kind: 'step-reorder', fromIndex: idx });
                              }}
                              onDragEnd={clearDragState}
                              onDragOver={(e) => {
                                if (!dragPayload) return;
                                e.preventDefault();
                                e.stopPropagation();
                                if (dragPayload.kind === 'toolbox-position') {
                                  setDropParallelStepIdx(idx);
                                  if (dropSlotIndex !== null) setDropSlotIndex(null);
                                }
                              }}
                              onDragLeave={(e) => {
                                e.stopPropagation();
                                if (dropParallelStepIdx === idx) setDropParallelStepIdx(null);
                              }}
                              onDrop={(e) => handleDropOnStepCard(e, idx)}
                              onClick={() => setSelectedStepIdx(idx)}
                              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                isBeingDragged
                                  ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50'
                                  : isParallelDropActive
                                  ? 'bg-emerald-50 border-2 border-dashed border-emerald-500 ring-2 ring-emerald-500/20'
                                  : isSelected
                                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <span
                                  className="mt-0.5 p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing shrink-0"
                                  title="برای تغییر ترتیب بکشید"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <span
                                  className={`mt-0.5 w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shrink-0 tabular-nums ${
                                    isFirst
                                      ? 'bg-emerald-600 text-white'
                                      : idx === steps.length - 1
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-800 text-white'
                                  }`}
                                >
                                  {idx + 1}
                                </span>

                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-black text-slate-900 truncate">
                                      {st.title || `گام ${idx + 1}`}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-semibold">
                                      {getApprovalSummaryText(st.config.approvalMode, assignees.count)}
                                    </span>
                                    {st.positionIds.length > 1 && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                                        ارسال هم‌زمان ({st.positionIds.length} سمت)
                                      </span>
                                    )}
                                    {st.config.conditionLabel && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                        شرط: {st.config.conditionLabel}
                                      </span>
                                    )}
                                  </div>

                                  {isParallelDropActive && (
                                    <div className="text-[11px] font-bold text-emerald-700 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-300">
                                      رها کنید تا سمت «{dragPayload.title}» هم‌زمان به این مرحله اضافه شود
                                    </div>
                                  )}

                                  {/* Parallel Positions Chips */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {st.positionIds.map((pid) => {
                                      const posInfo = getPositionDetails(pid, st.structureId);
                                      return (
                                        <span
                                          key={pid}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg"
                                        >
                                          <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
                                          <span>{posInfo.title}</span>
                                          <span className="text-[10px] text-slate-500 tabular-nums">
                                            ({posInfo.userCount} نفر)
                                          </span>
                                          {st.positionIds.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeParallelPositionFromStep(idx, pid);
                                              }}
                                              className="mr-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                              title="حذف این سمت از گام"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>

                                  <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-2">
                                    {st.structureId && (
                                      <span className="flex items-center gap-1 text-indigo-700 font-semibold">
                                        <FolderTree className="w-3 h-3" />
                                        {getStructureTitle(st.structureId)}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Users className="w-3 h-3 text-slate-400" />
                                      کارتابل ({assignees.count} نفر): {assignees.namesText}
                                    </span>
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
                          if (dropParallelStepIdx !== null) setDropParallelStepIdx(null);
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
                        {dragPayload ? 'برای افزودن به عنوان گام جدید در انتهای مسیر اینجا رها کنید' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Step Inspector Panel (Full Customization for Selected Step) */}
                  {selectedStep && (() => {
                    const inspectorAssignees = getStepUniqueAssignees(selectedStep.positionIds, selectedStep.structureId);
                    const availableToAddParallel = stepCandidatePositions.filter(
                      (p) => !selectedStep.positionIds.includes(p.id)
                    );

                    return (
                      <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-indigo-100 shadow-xs space-y-4">
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                              <SlidersHorizontal className="w-4 h-4" />
                            </span>
                            <h4 className="text-xs sm:text-sm font-black text-slate-900">
                              تنظیمات گام {selectedStepIdx + 1}: «{selectedStep.title || 'بدون عنوان'}»
                            </h4>
                          </div>
                          <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ذخیره زنده در بوم
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Step Title */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              عنوان مرحله *
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
                              محدوده سمت‌ها (ساختار سازمانی)
                            </label>
                            <select
                              value={selectedStep.structureId || ''}
                              onChange={(e) =>
                                handleStepChange(selectedStepIdx, 'structureId', e.target.value || null)
                              }
                              className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs font-bold text-indigo-900 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                            >
                              <option value="">چارت عمومی سازمان (پیش‌فرض — بدون محدودیت ساختار)</option>
                              {structures.map((s) => (
                                <option key={s.id} value={s.id}>
                                  ساختار اختصاصی: {s.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Parallel Positions Recipient Panel */}
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-indigo-600" />
                              <span>سمت‌های دریافت‌کننده هم‌زمان در این مرحله ({selectedStep.positionIds.length} سمت — {inspectorAssignees.count} نفر):</span>
                            </label>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {selectedStep.positionIds.map((pid) => {
                              const posD = getPositionDetails(pid, selectedStep.structureId);
                              return (
                                <span
                                  key={pid}
                                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-slate-800 shadow-2xs"
                                >
                                  <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span>{posD.title}</span>
                                  <span className="text-[10px] font-semibold text-indigo-600 tabular-nums">
                                    ({posD.userCount} نفر: {posD.userNames})
                                  </span>
                                  {selectedStep.positionIds.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeParallelPositionFromStep(selectedStepIdx, pid)}
                                      className="p-0.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      title="حذف سمت"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  addParallelPositionToStep(
                                    selectedStepIdx,
                                    e.target.value,
                                    selectedStep.structureId
                                  );
                                }
                              }}
                              disabled={availableToAddParallel.length === 0}
                              className="flex-1 min-w-[200px] rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-50"
                            >
                              <option value="">
                                {availableToAddParallel.length > 0
                                  ? '+ افزودن سمت هم‌زمان دیگر به کارتابل این گام...'
                                  : 'همه سمت‌های موجود به این گام اضافه شده‌اند'}
                              </option>
                              {availableToAddParallel.map((p) => {
                                const pd = getPositionDetails(p.id, selectedStep.structureId);
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.title} ({pd.userCount} نفر)
                                  </option>
                                );
                              })}
                            </select>
                            <span className="text-[10px] text-slate-500">
                              یا سمت مورد نظر را مستقیماً روی کارت همین گام در بوم بکشید.
                            </span>
                          </div>
                        </div>

                        {/* Clarified Approval Rule & Rejection Routing */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-700">
                              نحوه تایید و عبور به مرحله بعد
                            </label>
                            <select
                              value={selectedStep.config.approvalMode || 'SINGLE'}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'approvalMode', e.target.value)
                              }
                              className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                            >
                              {APPROVAL_MODE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-[11px] text-indigo-900 leading-relaxed">
                              {getApprovalExplanationText(selectedStep.config.approvalMode, inspectorAssignees.count)}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                                <CornerDownLeft className="w-3 h-3 text-rose-500" />
                                <span>اگر این مرحله رد یا نیاز به اصلاح زد، پروژه کجا برود؟</span>
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

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                برچسب شرط یا یادداشت کوتاه مرحله (اختیاری)
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
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            دستورالعمل و توضیحات راهنما برای افراد این مرحله
                          </label>
                          <input
                            type="text"
                            value={selectedStep.description || ''}
                            onChange={(e) => handleStepChange(selectedStepIdx, 'description', e.target.value)}
                            placeholder="توضیحات راهنما برای متصدیان این مرحله..."
                            className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                          />
                        </div>
                      </div>
                    );
                  })()}
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
