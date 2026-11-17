import React, { useState, useEffect } from 'react';
import {
  Workflow,
  WorkflowDiagramLayout,
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
  BpmnWorkflowCanvas,
  BpmnBranchKind,
  BpmnConnectTarget,
  getDefaultDiagramLayout,
  getDefaultNodePosition,
} from './BpmnWorkflowCanvas';
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
  Clock,
  LayoutGrid,
  List,
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
  RETURN_STEP_1: 'بازگشت به گام ۱ گردش کار',
  RETURN_CREATOR: 'کارتابل ثبت‌کننده (اصلاح)',
  REJECT_PROJECT: 'رد و مختومه شدن طرح',
  CUSTOM_STEP: 'ارجاع به گام دلخواه',
};

function normalizeBranchMode(
  branchMode: string | undefined,
  approvalMode: string | undefined,
  kind: 'revision' | 'reject'
): 'SINGLE' | 'MAJORITY' | 'ALL' {
  if (branchMode === 'SINGLE' || branchMode === 'MAJORITY' || branchMode === 'ALL') {
    return branchMode;
  }
  if (kind === 'revision') {
    if (approvalMode === 'MAJORITY' || approvalMode === 'ALL') return 'MAJORITY';
    return 'SINGLE';
  }
  if (approvalMode === 'MAJORITY') return 'MAJORITY';
  return 'SINGLE';
}

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
  const [diagramLayout, setDiagramLayout] = useState<WorkflowDiagramLayout>(() =>
    getDefaultDiagramLayout(1)
  );
  const [designerMode, setDesignerMode] = useState<'bpmn' | 'list'>('bpmn');

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

  const getStepUniqueAssignees = (positionIds: string[], structureId?: string | null, explicitUserIds?: string[]) => {
    const seen = new Map<string, string>();
    for (const pid of positionIds) {
      const d = getPositionDetails(pid, structureId);
      d.userIds.forEach((uid, idx) => {
        const u = users.find((x) => x.id === uid);
        seen.set(uid, u?.name || `کاربر ${idx + 1}`);
      });
    }
    if (Array.isArray(explicitUserIds)) {
      for (const uid of explicitUserIds) {
        const u = users.find((x) => x.id === uid);
        if (u) seen.set(uid, u.name);
      }
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
        return 'پروژه هم‌زمان در کارتابل تمام افراد این گام قرار می‌گیرد؛ هر فرد می‌تواند رای موافق یا مخالف ثبت کند و با رسیدن آرا به اکثریت (بیش از ۵۰٪) نتیجه اعمال می‌شود.';
      }
      const req = Math.floor(n / 2) + 1;
      return `این گام هم‌اکنون ${n} نفر عضو دارد؛ پروژه هم‌زمان به کارتابل هر ${n} نفر می‌رود و با کسب حداقل ${req} رای موافق تایید یا با اکثریت آرای مخالف رد می‌شود.`;
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
        config: {
          approvalMode: 'SINGLE',
          voteCollectionMode: 'EARLY_DECIDE',
          revisionMode: 'SINGLE',
          rejectMode: 'SINGLE',
          tieBreaker: 'REVISION',
          approveTarget: 'NEXT_STEP',
          onRevisionAction: 'RETURN_PREV',
          onRejectAction: 'REJECT_PROJECT',
          nodePosition: getDefaultNodePosition(0),
        },
      },
    ]);
    setDiagramLayout(getDefaultDiagramLayout(1));
    setDesignerMode('bpmn');
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
    setToolboxStructureId('');
    setToolboxSearch('');
    const mapped: EditableStep[] = wf.steps.map((s, idx) => {
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
      const legacyRev = parsedCfg.onRevisionAction || parsedCfg.onRejectAction || 'RETURN_PREV';
      const legacyReject =
        parsedCfg.onRevisionAction !== undefined
          ? parsedCfg.onRejectAction || 'REJECT_PROJECT'
          : parsedCfg.onRejectAction === 'RETURN_CREATOR' ||
            parsedCfg.onRejectAction === 'RETURN_STEP_1' ||
            parsedCfg.onRejectAction === 'CUSTOM_STEP'
          ? parsedCfg.onRejectAction
          : 'REJECT_PROJECT';

      return {
        id: s.id,
        localKey: makeLocalKey(),
        title: s.title,
        structureId: s.structureId || null,
        positionIds: posIds,
        description: s.description || '',
        config: {
          approvalMode: parsedCfg.approvalMode || 'SINGLE',
          voteCollectionMode: parsedCfg.voteCollectionMode || 'EARLY_DECIDE',
          revisionMode: normalizeBranchMode(parsedCfg.revisionMode, parsedCfg.approvalMode, 'revision'),
          rejectMode: normalizeBranchMode(parsedCfg.rejectMode, parsedCfg.approvalMode, 'reject'),
          tieBreaker: parsedCfg.tieBreaker || 'REVISION',
          approveTarget: parsedCfg.approveTarget || 'NEXT_STEP',
          onApproveStepOrder: parsedCfg.onApproveStepOrder,
          onRevisionAction: legacyRev,
          onRevisionStepOrder: parsedCfg.onRevisionStepOrder ?? parsedCfg.onRejectStepOrder,
          onRejectAction: legacyReject,
          onRejectStepOrder: parsedCfg.onRejectStepOrder,
          conditionLabel: parsedCfg.conditionLabel || '',
          userIds: Array.isArray(parsedCfg.userIds) ? parsedCfg.userIds : [],
          nodePosition: parsedCfg.nodePosition || getDefaultNodePosition(idx),
        },
      };
    });
    setSteps(mapped);
    setDiagramLayout(wf.diagram || getDefaultDiagramLayout(mapped.length));
    setDesignerMode('bpmn');
    setSelectedStepIdx(0);
    setError('');
    setModalOpen(true);
    if (structures.length > 0 && Object.keys(structurePositionsMap).length === 0) {
      loadAllStructurePositions();
    }
  };

  const createDefaultStep = (overrides: Partial<EditableStep> = {}): EditableStep => {
    const structId = overrides.structureId !== undefined ? overrides.structureId : null;
    const fallbackPos = positions[0]?.id || '';
    const positionIds =
      overrides.positionIds && overrides.positionIds.length > 0
        ? overrides.positionIds
        : fallbackPos
        ? [fallbackPos]
        : [];
    const baseIdx = steps.length;
    return {
      localKey: makeLocalKey(),
      title: overrides.title || `گام ${steps.length + 1}`,
      structureId: structId,
      positionIds,
      description: overrides.description || '',
      config: overrides.config || {
        approvalMode: 'SINGLE',
        voteCollectionMode: 'EARLY_DECIDE',
        revisionMode: 'SINGLE',
        rejectMode: 'SINGLE',
        tieBreaker: 'REVISION',
        approveTarget: 'NEXT_STEP',
        onRevisionAction: 'RETURN_PREV',
        onRejectAction: 'REJECT_PROJECT',
        nodePosition: getDefaultNodePosition(baseIdx),
      },
    };
  };

  const handleUpdateStepPos = (idx: number, pos: { x: number; y: number }) => {
    setSteps((prev) => {
      const copy = [...prev];
      if (!copy[idx]) return prev;
      copy[idx] = {
        ...copy[idx],
        config: {
          ...copy[idx].config,
          nodePosition: pos,
        },
      };
      return copy;
    });
  };

  const handleUpdateStepConfigPatch = (index: number, patch: Partial<WorkflowStepConfig>) => {
    setSteps((prev) => {
      const copy = [...prev];
      if (!copy[index]) return prev;
      copy[index] = {
        ...copy[index],
        config: {
          ...copy[index].config,
          ...patch,
        },
      };
      return copy;
    });
  };

  const handleConnectBpmnBranch = (
    fromIdx: number,
    branch: BpmnBranchKind,
    target: BpmnConnectTarget
  ) => {
    setSteps((prev) => {
      const copy = [...prev];
      const step = copy[fromIdx];
      if (!step) return prev;
      const nextCfg = { ...step.config };

      if (branch === 'approve') {
        if (target.kind === 'end_approved') {
          nextCfg.approveTarget = 'END_APPROVED';
          nextCfg.onApproveStepOrder = undefined;
        } else if (target.kind === 'step') {
          if (target.stepOrder === fromIdx + 2) {
            nextCfg.approveTarget = 'NEXT_STEP';
            nextCfg.onApproveStepOrder = undefined;
          } else {
            nextCfg.approveTarget = 'CUSTOM_STEP';
            nextCfg.onApproveStepOrder = target.stepOrder;
          }
        }
      } else if (branch === 'revision') {
        if (target.kind === 'creator') {
          nextCfg.onRevisionAction = 'RETURN_CREATOR';
          nextCfg.onRevisionStepOrder = undefined;
        } else if (target.kind === 'end_rejected') {
          nextCfg.onRevisionAction = 'REJECT_PROJECT';
          nextCfg.onRevisionStepOrder = undefined;
        } else if (target.kind === 'step') {
          if (fromIdx > 0 && target.stepOrder === Math.max(1, fromIdx)) {
            nextCfg.onRevisionAction = 'RETURN_PREV';
            nextCfg.onRevisionStepOrder = undefined;
          } else if (target.stepOrder === 1) {
            nextCfg.onRevisionAction = 'RETURN_STEP_1';
            nextCfg.onRevisionStepOrder = undefined;
          } else {
            nextCfg.onRevisionAction = 'CUSTOM_STEP';
            nextCfg.onRevisionStepOrder = target.stepOrder;
          }
        }
      } else {
        if (target.kind === 'creator') {
          nextCfg.onRejectAction = 'RETURN_CREATOR';
          nextCfg.onRejectStepOrder = undefined;
        } else if (target.kind === 'end_rejected') {
          nextCfg.onRejectAction = 'REJECT_PROJECT';
          nextCfg.onRejectStepOrder = undefined;
        } else if (target.kind === 'step') {
          if (fromIdx > 0 && target.stepOrder === Math.max(1, fromIdx)) {
            nextCfg.onRejectAction = 'RETURN_PREV';
            nextCfg.onRejectStepOrder = undefined;
          } else if (target.stepOrder === 1) {
            nextCfg.onRejectAction = 'RETURN_STEP_1';
            nextCfg.onRejectStepOrder = undefined;
          } else {
            nextCfg.onRejectAction = 'CUSTOM_STEP';
            nextCfg.onRejectStepOrder = target.stepOrder;
          }
        }
      }

      copy[fromIdx] = { ...step, config: nextCfg };
      return copy;
    });
  };

  const handleAutoLayoutBpmn = () => {
    setSteps((prev) =>
      prev.map((st, idx) => ({
        ...st,
        config: {
          ...st.config,
          nodePosition: getDefaultNodePosition(idx),
        },
      }))
    );
    setDiagramLayout(getDefaultDiagramLayout(steps.length));
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

  const addDirectUserToStep = (stepIndex: number, userId: string) => {
    if (!userId) return;
    setSteps((prev) => {
      const copy = [...prev];
      const step = copy[stepIndex];
      if (!step) return prev;
      const existing = Array.isArray(step.config.userIds) ? step.config.userIds : [];
      if (existing.includes(userId)) return prev;
      copy[stepIndex] = {
        ...step,
        config: {
          ...step.config,
          userIds: [...existing, userId],
        },
      };
      return copy;
    });
  };

  const removeDirectUserFromStep = (stepIndex: number, userId: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      const step = copy[stepIndex];
      if (!step) return prev;
      const existing = Array.isArray(step.config.userIds) ? step.config.userIds : [];
      copy[stepIndex] = {
        ...step,
        config: {
          ...step.config,
          userIds: existing.filter((id) => id !== userId),
        },
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
          structureId: null,
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
      addParallelPositionToStep(targetStepIdx, payload.positionId, null);
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
        diagram: diagramLayout,
        steps: steps.map((s, idx) => ({
          id: s.id,
          title: s.title,
          structureId: s.structureId || null,
          positionId: s.positionIds[0],
          positionIds: s.positionIds,
          actionType: 'APPROVAL',
          description: s.description || '',
          config: {
            ...s.config,
            nodePosition: s.config.nodePosition || getDefaultNodePosition(idx),
          },
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
                      const stepAssignees = getStepUniqueAssignees(posIds, st.structureId, st.config?.userIds);
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
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                                  تایید: {getApprovalSummaryText(stepCfg.approvalMode, stepAssignees.count)}
                                </span>
                                {(() => {
                                  const revQ = normalizeBranchMode(stepCfg.revisionMode, stepCfg.approvalMode, 'revision');
                                  const rejQ = normalizeBranchMode(stepCfg.rejectMode, stepCfg.approvalMode, 'reject');
                                  return (
                                    <>
                                      {revQ !== 'SINGLE' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                          اصلاح: {revQ === 'MAJORITY' ? 'اکثریت' : 'اجماع'}
                                        </span>
                                      )}
                                      {rejQ !== 'SINGLE' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                                          رد: {rejQ === 'MAJORITY' ? 'اکثریت' : 'اجماع'}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                {stepCfg.voteCollectionMode === 'WAIT_ALL' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold">
                                    <Clock className="w-3 h-3 text-indigo-600" />
                                    صبر تا اقدام همه
                                  </span>
                                )}
                                {stepCfg.conditionLabel && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                    شرط: {stepCfg.conditionLabel}
                                  </span>
                                )}
                                {(stepCfg.approveTarget === 'END_APPROVED' ||
                                  (stepCfg.approveTarget === 'CUSTOM_STEP' && stepCfg.onApproveStepOrder)) && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                                    تایید ←{' '}
                                    {stepCfg.approveTarget === 'END_APPROVED'
                                      ? 'تصویب نهایی'
                                      : `گام ${stepCfg.onApproveStepOrder}`}
                                  </span>
                                )}
                                {stepCfg.onRevisionAction && stepCfg.onRevisionAction !== 'RETURN_PREV' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                    اصلاح ←{' '}
                                    {stepCfg.onRevisionAction === 'CUSTOM_STEP' && stepCfg.onRevisionStepOrder
                                      ? `گام ${stepCfg.onRevisionStepOrder}`
                                      : REJECT_ACTION_LABELS[stepCfg.onRevisionAction] || stepCfg.onRevisionAction}
                                  </span>
                                )}
                                {stepCfg.onRejectAction && stepCfg.onRejectAction !== 'REJECT_PROJECT' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                                    رد ←{' '}
                                    {stepCfg.onRejectAction === 'CUSTOM_STEP' && stepCfg.onRejectStepOrder
                                      ? `گام ${stepCfg.onRejectStepOrder}`
                                      : REJECT_ACTION_LABELS[stepCfg.onRejectAction] || stepCfg.onRejectAction}
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
                      <option value="">همه سمت‌ها (مستقل از ساختار — توصیه‌شده)</option>
                      {structures.map((s) => (
                        <option key={s.id} value={s.id}>
                          فیلتر بر اساس ساختار: {s.title}
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
                                    addParallelPositionToStep(selectedStepIdx, sp.positionId, null)
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
                                      structureId: null,
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
                                        null
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
                                        structureId: null,
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

                {/* LEFT SIDE IN RTL: BPMN VISUAL DESIGNER / LIST VIEW + STEP INSPECTOR */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Designer Mode Switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setDesignerMode('bpmn')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                          designerMode === 'bpmn'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>بوم بصری BPMN (چسباندن مسیرها)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesignerMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                          designerMode === 'list'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>نمای لیستی ترتیب مراحل</span>
                      </button>
                    </div>
                  </div>

                  {designerMode === 'bpmn' ? (
                    <BpmnWorkflowCanvas
                      steps={steps}
                      selectedStepIdx={selectedStepIdx}
                      diagram={diagramLayout}
                      onSelectStep={(idx) => setSelectedStepIdx(idx)}
                      onDiagramChange={(next) => setDiagramLayout(next)}
                      onUpdateStepPos={handleUpdateStepPos}
                      onUpdateStepConfig={handleUpdateStepConfigPatch}
                      onConnectBranch={handleConnectBpmnBranch}
                      onDeleteStep={removeStep}
                      onAddBlankStepAt={(pos) => {
                        const newIdx = steps.length;
                        insertStepAt(
                          newIdx,
                          createDefaultStep({
                            config: {
                              approvalMode: 'SINGLE',
                              voteCollectionMode: 'EARLY_DECIDE',
                              revisionMode: 'SINGLE',
                              rejectMode: 'SINGLE',
                              tieBreaker: 'REVISION',
                              approveTarget: 'NEXT_STEP',
                              onRevisionAction: 'RETURN_PREV',
                              onRejectAction: 'REJECT_PROJECT',
                              nodePosition: pos || getDefaultNodePosition(newIdx),
                            },
                          })
                        );
                      }}
                      onAutoLayout={handleAutoLayoutBpmn}
                      getPositionTitle={(pid, structId) => getPositionDetails(pid, structId).title}
                      getStepAssigneeCount={(st) =>
                        getStepUniqueAssignees(st.positionIds, st.structureId, st.config.userIds).count
                      }
                      dragPayload={dragPayload}
                      onDropPositionAtCanvas={(positionId, posTitle, pos) => {
                        const newIdx = steps.length;
                        insertStepAt(
                          newIdx,
                          createDefaultStep({
                            title: `بررسی در ${posTitle}`,
                            structureId: null,
                            positionIds: [positionId],
                            config: {
                              approvalMode: 'SINGLE',
                              voteCollectionMode: 'EARLY_DECIDE',
                              revisionMode: 'SINGLE',
                              rejectMode: 'SINGLE',
                              tieBreaker: 'REVISION',
                              approveTarget: 'NEXT_STEP',
                              onRevisionAction: 'RETURN_PREV',
                              onRejectAction: 'REJECT_PROJECT',
                              nodePosition: pos,
                            },
                          })
                        );
                      }}
                      onDropPositionOnStep={(targetIdx, positionId) =>
                        addParallelPositionToStep(targetIdx, positionId, null)
                      }
                      onClearDrag={clearDragState}
                    />
                  ) : (
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
                        const assignees = getStepUniqueAssignees(st.positionIds, st.structureId, st.config.userIds);
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
                  )}

                  {/* Step Inspector Panel (Full Customization for Selected Step) */}
                  {selectedStep && (() => {
                    const inspectorAssignees = getStepUniqueAssignees(
                      selectedStep.positionIds,
                      selectedStep.structureId,
                      selectedStep.config.userIds
                    );
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

                          {/* Optional Structure Filter */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              محدودیت ساختار (اختیاری)
                            </label>
                            <select
                              value={selectedStep.structureId || ''}
                              onChange={(e) =>
                                handleStepChange(selectedStepIdx, 'structureId', e.target.value || null)
                              }
                              className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3 py-2 text-xs font-bold text-indigo-900 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                            >
                              <option value="">همه ساختارها (بدون محدودیت — پیش‌فرض)</option>
                              {structures.map((s) => (
                                <option key={s.id} value={s.id}>
                                  فقط در ساختار: {s.title}
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

                          {/* Optional Direct Individual Users Selection */}
                          <div className="pt-2.5 mt-2 border-t border-slate-200/80 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-slate-700">
                                افزودن مستقیم کاربران خاص به این گام (اختیاری — علاوه بر سمت‌ها):
                              </span>
                              <span className="text-[10px] text-slate-500">
                                مجموع کل افراد این گام: <strong className="text-indigo-700">{inspectorAssignees.count} نفر</strong>
                              </span>
                            </div>

                            {Array.isArray(selectedStep.config.userIds) && selectedStep.config.userIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {selectedStep.config.userIds.map((uid) => {
                                  const usr = users.find((u) => u.id === uid);
                                  if (!usr) return null;
                                  return (
                                    <span
                                      key={uid}
                                      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900"
                                    >
                                      <span>{usr.name} (@{usr.username})</span>
                                      <button
                                        type="button"
                                        onClick={() => removeDirectUserFromStep(selectedStepIdx, uid)}
                                        className="p-0.5 rounded text-emerald-700 hover:text-rose-600 cursor-pointer"
                                        title="حذف کاربر از این گام"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  addDirectUserToStep(selectedStepIdx, e.target.value);
                                }
                              }}
                              className="w-full sm:w-auto min-w-[240px] rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                            >
                              <option value="">+ انتخاب مستقیم کاربر خاص (مثلاً Usertest1..4 یا مدیر)...</option>
                              {users
                                .filter((u) => !(selectedStep.config.userIds || []).includes(u.id))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} (@{u.username}){u.positionTitle ? ` — ${u.positionTitle}` : ''}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>

                        {/* BPMN Gateway Voting & Branch Routing Panel (Per-Action Quorum Matrix) */}
                        <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-200/80 space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                              <GitBranch className="w-4 h-4 text-indigo-600" />
                              <span>قوانین دروازه تصمیم‌گیری، نصاب مستقل هر اقدام و مسیرهای BPMN</span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 tabular-nums">
                              اعضای فعلی این گام: {inspectorAssignees.count} نفر
                            </span>
                          </div>

                          {/* 3-Column Independent Per-Action Decision Matrix */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            {/* Green Branch: Approve */}
                            <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
                              <div className="text-[11px] font-black text-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>اقدام تایید (سبز)</span>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-emerald-900/80 mb-1">
                                  نصاب لازم برای تایید:
                                </label>
                                <select
                                  value={selectedStep.config.approvalMode || 'SINGLE'}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'approvalMode', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900 cursor-pointer"
                                >
                                  {APPROVAL_MODE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-emerald-900/80 mb-1">
                                  مسیر خروجی پس از تایید:
                                </label>
                                <select
                                  value={selectedStep.config.approveTarget || 'NEXT_STEP'}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'approveTarget', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer"
                                >
                                  <option value="NEXT_STEP">گام بعدی (یا تصویب نهایی)</option>
                                  <option value="CUSTOM_STEP">انتقال به گام دلخواه</option>
                                  <option value="END_APPROVED">تصویب نهایی مستقیم</option>
                                </select>
                              </div>

                              {selectedStep.config.approveTarget === 'CUSTOM_STEP' && (
                                <select
                                  value={selectedStep.config.onApproveStepOrder || 1}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'onApproveStepOrder',
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] text-slate-900"
                                >
                                  {steps.map((targetSt, tIdx) => (
                                    <option key={targetSt.localKey} value={tIdx + 1}>
                                      گام {tIdx + 1}: {targetSt.title}
                                    </option>
                                  ))}
                                </select>
                              )}

                              <div className="text-[10px] text-emerald-900/90 bg-white/80 rounded-lg p-1.5 border border-emerald-200/70 leading-relaxed">
                                {getApprovalSummaryText(selectedStep.config.approvalMode, inspectorAssignees.count)}
                              </div>
                            </div>

                            {/* Amber Branch: Revision */}
                            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                              <div className="text-[11px] font-black text-amber-950 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>اقدام اصلاح (زرد)</span>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-amber-950/80 mb-1">
                                  نصاب لازم برای بازگشت / اصلاح:
                                </label>
                                <select
                                  value={normalizeBranchMode(
                                    selectedStep.config.revisionMode,
                                    selectedStep.config.approvalMode,
                                    'revision'
                                  )}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'revisionMode', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900 cursor-pointer"
                                >
                                  <option value="SINGLE">فوری با رای ۱ نفر (تک‌نفره)</option>
                                  <option value="MAJORITY">اکثریت افراد این مرحله (&gt;۵۰٪)</option>
                                  <option value="ALL">اجماع تمام افراد این مرحله (۱۰۰٪)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-amber-950/80 mb-1">
                                  مسیر عودت هنگام نیاز به اصلاح:
                                </label>
                                <select
                                  value={selectedStep.config.onRevisionAction || 'RETURN_PREV'}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'onRevisionAction', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer"
                                >
                                  <option value="RETURN_CREATOR">کارتابل ثبت‌کننده پروژه (نیازمند اصلاح)</option>
                                  <option value="RETURN_PREV">بازگشت به گام قبلی</option>
                                  <option value="RETURN_STEP_1">بازگشت به گام ۱ گردش کار</option>
                                  <option value="CUSTOM_STEP">ارجاع به گام دلخواه</option>
                                  <option value="REJECT_PROJECT">رد و مختومه شدن طرح</option>
                                </select>
                              </div>

                              {selectedStep.config.onRevisionAction === 'CUSTOM_STEP' && (
                                <select
                                  value={selectedStep.config.onRevisionStepOrder || 1}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'onRevisionStepOrder',
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] text-slate-900"
                                >
                                  {steps.map((targetSt, tIdx) => (
                                    <option key={targetSt.localKey} value={tIdx + 1}>
                                      گام {tIdx + 1}: {targetSt.title}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {/* Rose Branch: Reject */}
                            <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
                              <div className="text-[11px] font-black text-rose-950 flex items-center gap-1.5">
                                <CornerDownLeft className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>اقدام رد طرح (قرمز)</span>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-rose-950/80 mb-1">
                                  نصاب لازم برای رد شدن پروژه:
                                </label>
                                <select
                                  value={normalizeBranchMode(
                                    selectedStep.config.rejectMode,
                                    selectedStep.config.approvalMode,
                                    'reject'
                                  )}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'rejectMode', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900 cursor-pointer"
                                >
                                  <option value="SINGLE">فوری با رای ۱ نفر (تک‌نفره)</option>
                                  <option value="MAJORITY">اکثریت افراد این مرحله (&gt;۵۰٪)</option>
                                  <option value="ALL">اجماع تمام افراد این مرحله (۱۰۰٪)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-rose-950/80 mb-1">
                                  مسیر خروجی پس از رد:
                                </label>
                                <select
                                  value={selectedStep.config.onRejectAction || 'REJECT_PROJECT'}
                                  onChange={(e) =>
                                    handleStepConfigChange(selectedStepIdx, 'onRejectAction', e.target.value)
                                  }
                                  className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer"
                                >
                                  <option value="REJECT_PROJECT">رد و مختومه شدن طرح</option>
                                  <option value="RETURN_CREATOR">کارتابل ثبت‌کننده پروژه (نیازمند اصلاح)</option>
                                  <option value="RETURN_PREV">بازگشت به گام قبلی</option>
                                  <option value="RETURN_STEP_1">بازگشت به گام ۱ گردش کار</option>
                                  <option value="CUSTOM_STEP">ارجاع به گام دلخواه</option>
                                </select>
                              </div>

                              {selectedStep.config.onRejectAction === 'CUSTOM_STEP' && (
                                <select
                                  value={selectedStep.config.onRejectStepOrder || 1}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'onRejectStepOrder',
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] text-slate-900"
                                >
                                  {steps.map((targetSt, tIdx) => (
                                    <option key={targetSt.localKey} value={tIdx + 1}>
                                      گام {tIdx + 1}: {targetSt.title}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>

                          {/* Wait Strategy + Tie Breaker + Condition Note */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-200/70">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                سیاست انتظار برای جمع‌آوری آرا
                              </label>
                              <select
                                value={selectedStep.config.voteCollectionMode || 'EARLY_DECIDE'}
                                onChange={(e) =>
                                  handleStepConfigChange(
                                    selectedStepIdx,
                                    'voteCollectionMode',
                                    e.target.value
                                  )
                                }
                                className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-2 text-[11px] font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="EARLY_DECIDE">تصمیم‌گیری به محض تحقق نصاب</option>
                                <option value="WAIT_ALL">صبر اجباری تا اقدام تمام اعضا</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                در صورت تساوی آرا (یا نرسیدن به حدنصاب)
                              </label>
                              <select
                                value={selectedStep.config.tieBreaker || 'REVISION'}
                                onChange={(e) =>
                                  handleStepConfigChange(selectedStepIdx, 'tieBreaker', e.target.value)
                                }
                                className="w-full rounded-xl bg-white border border-slate-300 px-2.5 py-2 text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="REVISION">اجرای مسیر اصلاح</option>
                                <option value="REJECT">اجرای مسیر رد</option>
                                <option value="APPROVE">اجرای مسیر تایید</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                برچسب شرط یا یادداشت مرحله (اختیاری)
                              </label>
                              <input
                                type="text"
                                value={selectedStep.config.conditionLabel || ''}
                                onChange={(e) =>
                                  handleStepConfigChange(selectedStepIdx, 'conditionLabel', e.target.value)
                                }
                                placeholder="مثلاً: برای طرح‌های بالای ۱۰۰ میلیون..."
                                className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
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
