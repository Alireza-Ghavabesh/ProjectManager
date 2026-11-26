import React, { useState, useEffect } from 'react';
import {
  Workflow,
  WorkflowActionKey,
  WorkflowDiagramLayout,
  WorkflowNotificationChannel,
  WorkflowNotificationRecipientMode,
  WorkflowNotificationRule,
  WorkflowNotificationTriggerEvent,
  WorkflowStartTrigger,
  WorkflowStepConfig,
  Position,
  User,
  ProjectStructure,
  ProjectType,
  StructurePositionNode,
} from '../types';
import { api } from '../services/api';
import { hasPerm } from '../utils/permissions';
import { WorkflowTrackingView } from './WorkflowTrackingView';
import {
  BpmnWorkflowCanvas,
  BpmnBranchKind,
  BpmnConnectTarget,
  BpmnSelection,
  BpmnDragPayload,
  getDefaultDiagramLayout,
  getDefaultNodePosition,
  getDefaultGatewayPosition,
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
  Diamond,
  Zap,
  UserCheck,
  Flag,
  XCircle,
  Save,
  LogOut,
  Eye,
  Bell,
  Inbox,
  MessageSquareText,
  Paperclip,
  ShieldCheck,
} from 'lucide-react';

interface WorkflowManagerProps {
  workflows: Workflow[];
  positions: Position[];
  structures?: ProjectStructure[];
  projectTypes?: ProjectType[];
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
  projectTypes = [],
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
  const [selection, setSelection] = useState<BpmnSelection>({ kind: 'step', idx: 0 });
  const [diagramLayout, setDiagramLayout] = useState<WorkflowDiagramLayout>(() =>
    getDefaultDiagramLayout(1)
  );
  const [designerMode, setDesignerMode] = useState<'bpmn' | 'list'>('bpmn');
  const [loadedProjectTypes, setLoadedProjectTypes] = useState<ProjectType[]>(projectTypes);

  // Toolbox state inside visual designer
  const [toolboxStructureId, setToolboxStructureId] = useState<string>('');
  const [toolboxSearch, setToolboxSearch] = useState<string>('');

  const [dragPayload, setDragPayload] = useState<BpmnDragPayload | null>(null);
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

  useEffect(() => {
    if (projectTypes.length > 0) {
      setLoadedProjectTypes(projectTypes);
    } else {
      api.getProjectTypes().then(setLoadedProjectTypes).catch(() => {});
    }
  }, [projectTypes]);

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

  const getStepUniqueAssignees = (
    positionIds: string[],
    structureId?: string | null,
    explicitUserIds?: string[],
    assigneeMode?: 'POSITIONS' | 'CREATOR'
  ) => {
    if (assigneeMode === 'CREATOR') {
      return {
        count: 1,
        names: ['ثبت‌کننده اولیه پروژه'],
        namesText: 'ثبت‌کننده اولیه پروژه (به‌صورت پویا برای هر طرح)',
      };
    }
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
    const pos0 = getDefaultNodePosition(0);
    setSteps([
      {
        localKey: makeLocalKey(),
        title: 'گام ۱ (بررسی اولیه)',
        structureId: null,
        positionIds: defaultPos,
        description: 'سمت اولیه دریافت‌کننده پروژه',
        config: {
          assigneeMode: 'POSITIONS',
          allowedActions: ['APPROVE', 'REVISION', 'REJECT'],
          actionLabels: {},
          showVotesInStatusHistory: true,
          removeFromCartableAfterVote: false,
          returnCreatorTaskTitle: 'نیاز به اصلاح',
          hasGateway: true,
          gatewayTitle: 'تصمیم مرحله ۱',
          gatewayPos: getDefaultGatewayPosition(pos0),
          approveBehavior: 'ROUTE',
          revisionBehavior: 'ROUTE',
          rejectBehavior: 'ROUTE',
          approvalMode: 'SINGLE',
          voteCollectionMode: 'EARLY_DECIDE',
          revisionMode: 'SINGLE',
          rejectMode: 'SINGLE',
          tieBreaker: 'REVISION',
          approveTarget: 'NEXT_STEP',
          onRevisionAction: 'RETURN_PREV',
          onRejectAction: 'REJECT_PROJECT',
          nodePosition: pos0,
        },
      },
    ]);
    setDiagramLayout(getDefaultDiagramLayout(1));
    setDesignerMode('bpmn');
    setSelectedStepIdx(0);
    setSelection({ kind: 'step', idx: 0 });
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
      const isCreatorStep = parsedCfg.assigneeMode === 'CREATOR';
      const posIds = isCreatorStep
        ? []
        : Array.isArray(s.positionIds) && s.positionIds.length > 0
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

      const nodePos = parsedCfg.nodePosition || getDefaultNodePosition(idx);
      const allowedActs: WorkflowActionKey[] =
        Array.isArray(parsedCfg.allowedActions) && parsedCfg.allowedActions.length > 0
          ? parsedCfg.allowedActions
          : ['APPROVE', 'REVISION', 'REJECT'];

      return {
        id: s.id,
        localKey: makeLocalKey(),
        title: s.title,
        structureId: s.structureId || null,
        positionIds: posIds,
        description: s.description || '',
        config: {
          assigneeMode: parsedCfg.assigneeMode || 'POSITIONS',
          taskTitle: parsedCfg.taskTitle || '',
          allowedActions: allowedActs,
          actionLabels: parsedCfg.actionLabels || {},
          removeFromCartableAfterVote: parsedCfg.removeFromCartableAfterVote,
          showVotesInStatusHistory: parsedCfg.showVotesInStatusHistory !== false,
          returnCreatorTaskTitle: parsedCfg.returnCreatorTaskTitle || 'نیاز به اصلاح',
          hasGateway: parsedCfg.hasGateway !== false,
          gatewayTitle: parsedCfg.gatewayTitle || '',
          gatewayPos: parsedCfg.gatewayPos || getDefaultGatewayPosition(nodePos),
          approveBehavior: parsedCfg.approveBehavior || 'ROUTE',
          revisionBehavior: parsedCfg.revisionBehavior || 'ROUTE',
          rejectBehavior: parsedCfg.rejectBehavior || 'ROUTE',
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
          nodePosition: nodePos,
          requireAttachment: Boolean(parsedCfg.requireAttachment),
          requireNewAttachmentInStep: Boolean(parsedCfg.requireNewAttachmentInStep),
          minAttachmentsCount: parsedCfg.minAttachmentsCount ? Number(parsedCfg.minAttachmentsCount) : 1,
          attachmentRequirementMessage: parsedCfg.attachmentRequirementMessage || '',
          requireCommentOnApprove: Boolean(parsedCfg.requireCommentOnApprove),
          requireCommentOnReject: Boolean(parsedCfg.requireCommentOnReject),
          allowAttachmentUploadInStep: parsedCfg.allowAttachmentUploadInStep !== false,
        },
      };
    });
    setSteps(mapped);
    setDiagramLayout({
      ...getDefaultDiagramLayout(mapped.length),
      ...(wf.diagram || {}),
    });
    setDesignerMode('bpmn');
    setSelectedStepIdx(0);
    setSelection({ kind: 'step', idx: 0 });
    setError('');
    setModalOpen(true);
    if (structures.length > 0 && Object.keys(structurePositionsMap).length === 0) {
      loadAllStructurePositions();
    }
  };

  const createDefaultStep = (
    overrides: Partial<EditableStep> = {},
    mode: 'POSITIONS' | 'CREATOR' = 'POSITIONS'
  ): EditableStep => {
    const structId = overrides.structureId !== undefined ? overrides.structureId : null;
    const isCreator = mode === 'CREATOR' || overrides.config?.assigneeMode === 'CREATOR';
    const fallbackPos = positions[0]?.id || '';
    const positionIds = isCreator
      ? []
      : overrides.positionIds && overrides.positionIds.length > 0
      ? overrides.positionIds
      : fallbackPos
      ? [fallbackPos]
      : [];
    const baseIdx = steps.length;
    const nodePos = overrides.config?.nodePosition || getDefaultNodePosition(baseIdx);
    return {
      localKey: makeLocalKey(),
      title: overrides.title || (isCreator ? 'ارسال پروژه توسط ثبت‌کننده' : `گام ${steps.length + 1}`),
      structureId: isCreator ? null : structId,
      positionIds,
      description: overrides.description || '',
      config: overrides.config || {
        assigneeMode: isCreator ? 'CREATOR' : 'POSITIONS',
        taskTitle: isCreator ? 'آماده ارسال به گردش کار' : '',
        allowedActions: isCreator ? ['APPROVE'] : ['APPROVE', 'REVISION', 'REJECT'],
        actionLabels: isCreator ? { APPROVE: 'ارسال به گردش کار' } : {},
        showVotesInStatusHistory: true,
        removeFromCartableAfterVote: false,
        returnCreatorTaskTitle: 'نیاز به اصلاح',
        hasGateway: !isCreator,
        gatewayTitle: isCreator ? '' : `تصمیم گام ${steps.length + 1}`,
        gatewayPos: getDefaultGatewayPosition(nodePos),
        approveBehavior: 'ROUTE',
        revisionBehavior: 'ROUTE',
        rejectBehavior: 'ROUTE',
        approvalMode: 'SINGLE',
        voteCollectionMode: 'EARLY_DECIDE',
        revisionMode: 'SINGLE',
        rejectMode: 'SINGLE',
        tieBreaker: 'REVISION',
        approveTarget: 'NEXT_STEP',
        onRevisionAction: 'RETURN_PREV',
        onRejectAction: 'REJECT_PROJECT',
        nodePosition: nodePos,
        allowAttachmentUploadInStep: true,
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
      prev.map((st, idx) => {
        const np = getDefaultNodePosition(idx);
        return {
          ...st,
          config: {
            ...st.config,
            nodePosition: np,
            gatewayPos: getDefaultGatewayPosition(np),
          },
        };
      })
    );
    setDiagramLayout((prev) => ({
      ...getDefaultDiagramLayout(steps.length),
      startTrigger: prev.startTrigger || { event: 'PROJECT_CREATED' },
      connectorStyle: prev.connectorStyle || 'ORTHOGONAL',
      snapToGrid: prev.snapToGrid !== false,
      creatorLabel: prev.creatorLabel,
      endApprovedLabel: prev.endApprovedLabel,
      endRejectedLabel: prev.endRejectedLabel,
      notifications: (prev.notifications || []).map((n) => ({ ...n, pos: undefined })),
      edgeWaypoints: {},
    }));
  };

  const NOTIF_TEMPLATE_VARS: Array<{ token: string; label: string }> = [
    { token: '{project_title}', label: 'عنوان پروژه' },
    { token: '{project_code}', label: 'کد پروژه' },
    { token: '{tracking_code}', label: 'کد گردش' },
    { token: '{project_status}', label: 'وضعیت پروژه' },
    { token: '{step_title}', label: 'نام مرحله' },
    { token: '{task_title}', label: 'عنوان کارتابل' },
    { token: '{actor_name}', label: 'نام اقدام‌کننده' },
    { token: '{actor_position}', label: 'سمت اقدام‌کننده' },
    { token: '{decision}', label: 'نتیجه رای / اقدام' },
    { token: '{comment}', label: 'توضیح ثبت‌شده' },
    { token: '{creator_name}', label: 'ثبت‌کننده اولیه' },
    { token: '{recipient_name}', label: 'نام گیرنده' },
    { token: '{workflow_title}', label: 'نام گردش کار' },
    { token: '{budget}', label: 'بودجه' },
    { token: '{deadline}', label: 'مهلت' },
    { token: '{date}', label: 'تاریخ' },
    { token: '{time}', label: 'ساعت' },
  ];

  const handleCreateNotificationRule = (opts: {
    pos?: { x: number; y: number };
    triggerEvent: WorkflowNotificationTriggerEvent;
    sourceStepOrder?: number | null;
    branchCondition?: WorkflowNotificationRule['branchCondition'];
    endOutcomeCondition?: WorkflowNotificationRule['endOutcomeCondition'];
  }) => {
    const defaultTitle =
      opts.triggerEvent === 'ON_WORKFLOW_START'
        ? 'اطلاع‌رسانی شروع گردش کار'
        : opts.triggerEvent === 'ON_STEP_ENTER'
        ? opts.sourceStepOrder
          ? `اطلاع ورود به گام ${opts.sourceStepOrder}`
          : 'اطلاع ورود به مرحله'
        : opts.triggerEvent === 'ON_STEP_VOTE'
        ? opts.sourceStepOrder
          ? `اطلاع ثبت رای در گام ${opts.sourceStepOrder}`
          : 'اطلاع ثبت رای'
        : opts.triggerEvent === 'ON_GATEWAY_OUTCOME'
        ? opts.sourceStepOrder
          ? `اطلاع نتیجه شرط گام ${opts.sourceStepOrder}`
          : 'اطلاع نتیجه دروازه شرط'
        : opts.endOutcomeCondition === 'APPROVED'
        ? 'اطلاع‌رسانی تصویب نهایی'
        : opts.endOutcomeCondition === 'REJECTED'
        ? 'اطلاع‌رسانی رد طرح'
        : opts.endOutcomeCondition === 'NEEDS_REVISION'
        ? 'اطلاع‌رسانی نیاز به اصلاح'
        : 'اطلاع‌رسانی نتیجه گردش کار';

    const defaultMsg =
      opts.triggerEvent === 'ON_WORKFLOW_START'
        ? 'پروژه «{project_title}» با کد رهگیری {tracking_code} وارد گردش کار «{workflow_title}» شد.'
        : opts.triggerEvent === 'ON_STEP_ENTER'
        ? 'پرونده «{project_title}» جهت «{task_title}» وارد مرحله «{step_title}» و کارتابل شما شد.'
        : opts.triggerEvent === 'ON_STEP_VOTE'
        ? '{actor_name} در مرحله «{step_title}» نظر «{decision}» را برای پروژه «{project_title}» ثبت کرد. {comment}'
        : opts.triggerEvent === 'ON_GATEWAY_OUTCOME'
        ? 'تصمیم نهایی مرحله «{step_title}» برای پروژه «{project_title}»: {decision}'
        : 'وضعیت نهایی پروژه «{project_title}» (کد {tracking_code}): {project_status}.';

    const defaultRecip: WorkflowNotificationRecipientMode =
      opts.triggerEvent === 'ON_STEP_ENTER' ? 'CURRENT_STEP_ASSIGNEES' : 'PROJECT_CREATOR';

    const newRule: WorkflowNotificationRule = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: defaultTitle,
      enabled: true,
      channels: ['PUSH', 'CARTABLE'],
      triggerEvent: opts.triggerEvent,
      sourceStepOrder: opts.sourceStepOrder ?? null,
      branchCondition: opts.branchCondition || 'ANY',
      endOutcomeCondition: opts.endOutcomeCondition || 'ANY',
      projectTypeId: null,
      actorPositionId: null,
      recipientModes: [defaultRecip],
      targetStructureId: null,
      targetPositionIds: [],
      targetUserIds: [],
      customPhones: [],
      titleTemplate: defaultTitle,
      messageTemplate: defaultMsg,
      pos: opts.pos,
    };

    setDiagramLayout((prev) => ({
      ...prev,
      notifications: [...(prev.notifications || []), newRule],
    }));
    setSelection({ kind: 'notification', notifId: newRule.id });
  };

  const handleUpdateNotificationRule = (notifId: string, patch: Partial<WorkflowNotificationRule>) => {
    setDiagramLayout((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) =>
        n.id === notifId ? { ...n, ...patch } : n
      ),
    }));
  };

  const handleDeleteNotificationRule = (notifId: string) => {
    setDiagramLayout((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => n.id !== notifId),
    }));
    if (selection.kind === 'notification' && selection.notifId === notifId) {
      setSelection({ kind: 'step', idx: Math.max(0, selectedStepIdx) });
    }
  };

  const insertStepAt = (index: number, newStep: EditableStep) => {
    setSteps((prev) => {
      const copy = [...prev];
      const clamped = Math.max(0, Math.min(copy.length, index));
      copy.splice(clamped, 0, newStep);
      setSelectedStepIdx(clamped);
      setSelection({ kind: 'step', idx: clamped });
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

  const handleStepConfigPatch = (index: number, patch: Partial<WorkflowStepConfig>) => {
    setSteps((prev) => {
      const copy = [...prev];
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

    const missingPos = steps.find(
      (s) => s.config.assigneeMode !== 'CREATOR' && (!s.positionIds || s.positionIds.length === 0)
    );
    if (missingPos) {
      setError(`لطفاً حداقل یک سمت مسئول برای گام «${missingPos.title}» انتخاب کنید (یا حالت ثبت‌کننده اولیه را فعال نمایید).`);
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
        steps: steps.map((s, idx) => {
          const isCreator = s.config.assigneeMode === 'CREATOR';
          return {
            id: s.id,
            title: s.title,
            structureId: isCreator ? null : (s.structureId || null),
            positionId: isCreator ? null : s.positionIds[0],
            positionIds: isCreator ? [] : s.positionIds,
            actionType: 'APPROVAL',
            description: s.description || '',
            config: {
              ...s.config,
              nodePosition: s.config.nodePosition || getDefaultNodePosition(idx),
            },
            stepOrder: idx + 1,
          };
        }),
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

  const handleDeleteWorkflow = async (wf: Workflow) => {
    setError('');
    if (wf.isDefault) {
      setError(
        `گردش کار «${wf.title}» به عنوان گردش کار پیش‌فرض سیستم تنظیم شده و قابل حذف نیست. ابتدا گردش کار دیگری را به عنوان پیش‌فرض انتخاب کنید و سپس اقدام به حذف نمایید.`
      );
      return;
    }
    if (!confirm(`آیا از حذف گردش کار «${wf.title}» اطمینان دارید؟`)) return;
    try {
      await api.deleteWorkflow(wf.id);
      setError('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف گردش کار');
    }
  };

  const handleSetDefault = async (id: string) => {
    setError('');
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

          {error && !modalOpen && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-black block mb-0.5">عملیات انجام نشد:</strong>
                  <span>{error}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="p-1 rounded-lg text-rose-500 hover:text-rose-800 hover:bg-rose-100 cursor-pointer shrink-0"
                title="بستن پیام خطا"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
                    <div className="flex items-center gap-2.5 flex-wrap">
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
                      {(wf.projectCount || 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 tabular-nums"
                          title="تا زمانی که پروژه‌ای به این گردش کار متصل باشد، امکان حذف مستقیم وجود ندارد"
                        >
                          <Layers className="w-3 h-3 text-amber-600" />
                          متصل به {wf.projectCount} پروژه
                        </span>
                      )}
                      {(() => {
                        const trig = wf.diagram?.startTrigger?.event || 'PROJECT_CREATED';
                        const trigLbl =
                          trig === 'PROJECT_APPROVED'
                            ? 'شروع: پس از تایید پروژه'
                            : trig === 'MANUAL'
                            ? 'شروع: انتخاب دستی'
                            : 'شروع: ثبت پروژه جدید';
                        return (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                            <Zap className="w-3 h-3 text-indigo-600" />
                            {trigLbl}
                          </span>
                        );
                      })()}
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
                            title="ویرایش بصری گردش کار در بوم Visio"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>طراحی Visio / ویرایش</span>
                          </button>
                        )}
                        {canDeleteWf && (
                          <button
                            onClick={() => handleDeleteWorkflow(wf)}
                            className={`p-2 rounded-xl transition cursor-pointer ${
                              wf.isDefault || (wf.projectCount || 0) > 0
                                ? 'text-slate-300 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={
                              wf.isDefault
                                ? 'گردش کار پیش‌فرض قابل حذف نیست (برای مشاهده جزئیات کلیک کنید)'
                                : (wf.projectCount || 0) > 0
                                ? `متصل به ${wf.projectCount} پروژه — برای مشاهده دلیل عدم حذف کلیک کنید`
                                : 'حذف گردش کار'
                            }
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
                      const stepCfg: WorkflowStepConfig = st.config || {};
                      const isCreatorStep = stepCfg.assigneeMode === 'CREATOR';
                      const posIds = isCreatorStep
                        ? []
                        : Array.isArray(st.positionIds) && st.positionIds.length > 0
                        ? st.positionIds
                        : st.positionId
                        ? [st.positionId]
                        : [];
                      const stepAssignees = getStepUniqueAssignees(
                        posIds,
                        st.structureId,
                        st.config?.userIds,
                        stepCfg.assigneeMode
                      );
                      const structTitle = st.structureTitle || getStructureTitle(st.structureId);

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
                                {stepCfg.requireAttachment && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                                    <Paperclip className="w-3 h-3" />
                                    {stepCfg.requireNewAttachmentInStep ? 'الزام آپلود فایل جدید' : 'الزام فایل پیوست'}
                                  </span>
                                )}
                                {(stepCfg.requireCommentOnApprove || stepCfg.requireCommentOnReject) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                                    <ShieldCheck className="w-3 h-3" />
                                    الزام ثبت توضیح
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

                            {/* Responsible Positions (or CREATOR) & Users */}
                            <div className="pt-2 border-t border-slate-200/80 mt-1 space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {isCreatorStep ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                                    <UserCheck className="w-3 h-3 text-amber-700 shrink-0" />
                                    <span>ثبت‌کننده اولیه پروژه</span>
                                  </span>
                                ) : (
                                  posIds.map((pid) => {
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
                                  })
                                )}
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

      {/* ===================== FULL-SCREEN MICROSOFT VISIO-STYLE BPMN STUDIO ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 w-screen h-screen bg-slate-100 flex flex-col overflow-hidden" dir="rtl">
          <form onSubmit={handleSubmitWorkflow} className="w-full h-full flex flex-col overflow-hidden">
            {/* Top Visio Studio Ribbon */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
              <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <GitBranch className="w-5 h-5" />
                </span>

                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="نام فرآیند گردش کار *"
                    className="w-56 sm:w-64 rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                    required
                  />
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="شرح کوتاه فرآیند (اختیاری)..."
                    className="hidden md:block w-60 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer text-[11px] font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600"
                    />
                    <span>پیش‌فرض سیستم</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setSelection({ kind: 'start' })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100 text-[11px] font-bold cursor-pointer transition"
                    title="تنظیم رویداد آغازگر گردش کار"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      شروع:{' '}
                      {diagramLayout.startTrigger?.event === 'PROJECT_APPROVED'
                        ? 'پس از تایید پروژه'
                        : diagramLayout.startTrigger?.event === 'MANUAL'
                        ? 'انتخاب دستی'
                        : 'ثبت پروژه جدید'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode Toggle */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDesignerMode('bpmn')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                      designerMode === 'bpmn'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>بوم Visio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesignerMode('list')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                      designerMode === 'list'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>لیست گام‌ها</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  بستن
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {loading ? 'در حال ذخیره...' : editingWorkflow ? 'ذخیره گردش کار' : 'ایجاد گردش کار'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2 shrink-0">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  {error}
                </span>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="text-rose-600 hover:text-rose-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 3-Pane Full-Screen Visio Workspace */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* RIGHT SIDEBAR IN RTL: VISIO STENCILS & ORGANIZATIONAL POSITIONS */}
              <aside className="w-64 lg:w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
                {/* Quick Visio Shapes Stencil */}
                <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
                  <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>اشکال استاندارد Visio / BPMN</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: 'start' })}
                      className={`p-2 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition text-right ${
                        selection.kind === 'start'
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-950'
                          : 'bg-white border-slate-200 hover:border-emerald-400 text-slate-700'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">رویداد شروع</span>
                    </button>

                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragPayload({ kind: 'toolbox-creator' });
                      }}
                      onDragEnd={clearDragState}
                      onClick={() => insertStepAt(steps.length, createDefaultStep({}, 'CREATOR'))}
                      className="p-2 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-950 text-[10px] font-bold flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition"
                      title="کلیک یا کشیدن به بوم برای افزودن مرحله ثبت‌کننده اولیه"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span className="truncate">ثبت‌کننده اولیه</span>
                    </div>

                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragPayload({ kind: 'toolbox-gateway' });
                      }}
                      onDragEnd={clearDragState}
                      onClick={() => {
                        if (selectedStep) {
                          handleStepConfigChange(selectedStepIdx, 'hasGateway', true);
                          setSelection({ kind: 'gateway', idx: selectedStepIdx });
                        }
                      }}
                      className="p-2 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-950 text-[10px] font-bold flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition"
                      title="بکشید روی گام یا کلیک کنید تا لوزی شرط به مرحله اضافه شود"
                    >
                      <Diamond className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">لوزی شرط (شروط)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelection({ kind: 'creator_return' })}
                      className={`p-2 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition text-right ${
                        selection.kind === 'creator_return'
                          ? 'bg-amber-100 border-amber-500 text-amber-950'
                          : 'bg-white border-slate-200 hover:border-amber-400 text-slate-700'
                      }`}
                    >
                      <CornerDownLeft className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">عودت ثبت‌کننده</span>
                    </button>

                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragPayload({ kind: 'toolbox-notification' });
                      }}
                      onDragEnd={clearDragState}
                      onClick={() =>
                        handleCreateNotificationRule({
                          triggerEvent:
                            selection.kind === 'step'
                              ? 'ON_STEP_VOTE'
                              : selection.kind === 'gateway'
                              ? 'ON_GATEWAY_OUTCOME'
                              : selection.kind === 'end_approved' ||
                                selection.kind === 'end_rejected' ||
                                selection.kind === 'creator_return'
                              ? 'ON_WORKFLOW_END'
                              : 'ON_WORKFLOW_START',
                          sourceStepOrder:
                            selection.kind === 'step' || selection.kind === 'gateway'
                              ? selection.idx + 1
                              : null,
                          endOutcomeCondition:
                            selection.kind === 'end_approved'
                              ? 'APPROVED'
                              : selection.kind === 'end_rejected'
                              ? 'REJECTED'
                              : selection.kind === 'creator_return'
                              ? 'NEEDS_REVISION'
                              : 'ANY',
                        })
                      }
                      className="col-span-2 p-2 rounded-lg border border-sky-200 bg-sky-50/80 hover:bg-sky-100 text-sky-950 text-[10px] font-bold flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing transition"
                      title="بکشید روی هر مرحله، لوزی یا گره پایان (یا کلیک کنید) تا پیامک/پوش/اعلان کارتابل تعریف شود"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Bell className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">اطلاع‌رسانی (پوش / پیامک / کارتابل)</span>
                      </span>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white text-sky-700 border border-sky-200 tabular-nums shrink-0">
                        {(diagramLayout.notifications || []).length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Organizational Positions Palette */}
                <div className="p-3 border-b border-slate-200 space-y-2">
                  <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                    <FolderTree className="w-3.5 h-3.5 text-indigo-600" />
                    <span>سمت‌های سازمانی (بکشید به بوم)</span>
                  </div>
                  <select
                    value={toolboxStructureId}
                    onChange={(e) => setToolboxStructureId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-[11px] font-bold text-indigo-950 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">همه سمت‌ها (چارت عمومی سازمان)</option>
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
                      className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 pr-7 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                  {(toolboxStructureId && filteredStructPositions.length > 0
                    ? filteredStructPositions.map((sp) => ({
                        id: sp.id,
                        positionId: sp.positionId,
                        title: sp.title,
                        userCount: sp.users?.length || 0,
                        userNames:
                          sp.users?.length > 0 ? sp.users.map((u) => u.name).join('، ') : 'بدون متصدی',
                      }))
                    : filteredGeneralPositions.map((pos) => {
                        const pd = getPositionDetails(pos.id, null);
                        return {
                          id: pos.id,
                          positionId: pos.id,
                          title: pos.title,
                          userCount: pd.userCount,
                          userNames: pd.userNames,
                        };
                      })
                  ).map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/plain', item.positionId);
                        setDragPayload({
                          kind: 'toolbox-position',
                          structureId: toolboxStructureId || null,
                          positionId: item.positionId,
                          title: item.title,
                        });
                      }}
                      onDragEnd={clearDragState}
                      className="p-2 rounded-lg bg-slate-50/70 border border-slate-200 hover:border-indigo-400 hover:bg-white text-[11px] flex flex-col gap-1.5 cursor-grab active:cursor-grabbing transition"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">{item.title}</div>
                          <div className="text-[10px] text-slate-500 truncate tabular-nums">
                            {item.userCount} نفر: {item.userNames}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        {selectedStep && selectedStep.config.assigneeMode !== 'CREATOR' && (
                          <button
                            type="button"
                            onClick={() =>
                              addParallelPositionToStep(selectedStepIdx, item.positionId, null)
                            }
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-600 hover:text-white font-bold cursor-pointer transition"
                          >
                            + به گام {selectedStepIdx + 1}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            insertStepAt(
                              steps.length,
                              createDefaultStep({
                                title: `بررسی در ${item.title}`,
                                structureId: null,
                                positionIds: [item.positionId],
                              })
                            )
                          }
                          className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-600 hover:text-white font-bold cursor-pointer transition"
                        >
                          + گام جدید
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>

              {/* CENTER WORKSPACE: FULL-HEIGHT VISIO CANVAS OR LIST VIEW */}
              <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                {designerMode === 'bpmn' ? (
                  <BpmnWorkflowCanvas
                    steps={steps}
                    selectedStepIdx={selectedStepIdx}
                    selection={selection}
                    diagram={diagramLayout}
                    onSelectStep={(idx) => setSelectedStepIdx(idx)}
                    onSelectElement={(sel) => {
                      setSelection(sel);
                      if (sel.kind === 'step' || sel.kind === 'gateway') {
                        setSelectedStepIdx(sel.idx);
                      }
                    }}
                    onDiagramChange={(next) => setDiagramLayout(next)}
                    onUpdateStepPos={handleUpdateStepPos}
                    onUpdateStepConfig={handleUpdateStepConfigPatch}
                    onConnectBranch={handleConnectBpmnBranch}
                    onDeleteStep={removeStep}
                    onAddBlankStepAt={(pos, mode) => {
                      const newIdx = steps.length;
                      const nodePos = pos || getDefaultNodePosition(newIdx);
                      insertStepAt(
                        newIdx,
                        createDefaultStep(
                          {
                            config: {
                              assigneeMode: mode === 'CREATOR' ? 'CREATOR' : 'POSITIONS',
                              taskTitle: mode === 'CREATOR' ? 'آماده ارسال به گردش کار' : '',
                              allowedActions: mode === 'CREATOR' ? ['APPROVE'] : ['APPROVE', 'REVISION', 'REJECT'],
                              actionLabels: mode === 'CREATOR' ? { APPROVE: 'ارسال به گردش کار' } : {},
                              showVotesInStatusHistory: true,
                              removeFromCartableAfterVote: false,
                              returnCreatorTaskTitle: 'نیاز به اصلاح',
                              hasGateway: mode !== 'CREATOR',
                              gatewayTitle: mode === 'CREATOR' ? '' : `تصمیم گام ${newIdx + 1}`,
                              gatewayPos: getDefaultGatewayPosition(nodePos),
                              approveBehavior: 'ROUTE',
                              revisionBehavior: 'ROUTE',
                              rejectBehavior: 'ROUTE',
                              approvalMode: 'SINGLE',
                              voteCollectionMode: 'EARLY_DECIDE',
                              revisionMode: 'SINGLE',
                              rejectMode: 'SINGLE',
                              tieBreaker: 'REVISION',
                              approveTarget: 'NEXT_STEP',
                              onRevisionAction: 'RETURN_PREV',
                              onRejectAction: 'REJECT_PROJECT',
                              nodePosition: nodePos,
                            },
                          },
                          mode || 'POSITIONS'
                        )
                      );
                    }}
                    onAutoLayout={handleAutoLayoutBpmn}
                    getPositionTitle={(pid, structId) => getPositionDetails(pid, structId).title}
                    getStepAssigneeCount={(st) =>
                      getStepUniqueAssignees(
                        st.positionIds,
                        st.structureId,
                        st.config.userIds,
                        st.config.assigneeMode
                      ).count
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
                            assigneeMode: 'POSITIONS',
                            allowedActions: ['APPROVE', 'REVISION', 'REJECT'],
                            actionLabels: {},
                            showVotesInStatusHistory: true,
                            removeFromCartableAfterVote: false,
                            returnCreatorTaskTitle: 'نیاز به اصلاح',
                            hasGateway: true,
                            gatewayTitle: `تصمیم ${posTitle}`,
                            gatewayPos: getDefaultGatewayPosition(pos),
                            approveBehavior: 'ROUTE',
                            revisionBehavior: 'ROUTE',
                            rejectBehavior: 'ROUTE',
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
                    onDropNotificationAt={handleCreateNotificationRule}
                    onDeleteNotification={handleDeleteNotificationRule}
                    onClearDrag={clearDragState}
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
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

                    <div className="space-y-1.5">
                      {steps.map((st, idx) => {
                        const isSelected = idx === selectedStepIdx;
                        const isFirst = idx === 0;
                        const assignees = getStepUniqueAssignees(
                          st.positionIds,
                          st.structureId,
                          st.config.userIds,
                          st.config.assigneeMode
                        );
                        const isBeingDragged =
                          dragPayload?.kind === 'step-reorder' && dragPayload.fromIndex === idx;
                        const isParallelDropActive =
                          dropParallelStepIdx === idx && dragPayload?.kind === 'toolbox-position';

                        return (
                          <React.Fragment key={st.localKey}>
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
                              {dropSlotIndex === idx && `رها کنید تا گام در ردیف ${idx + 1} قرار گیرد`}
                            </div>

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
                              onClick={() => {
                                setSelectedStepIdx(idx);
                                setSelection({ kind: 'step', idx });
                              }}
                              className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                isBeingDragged
                                  ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50'
                                  : isParallelDropActive
                                  ? 'bg-emerald-50 border-2 border-dashed border-emerald-500'
                                  : isSelected
                                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <span className="mt-0.5 p-1 rounded bg-slate-100 text-slate-400 cursor-grab shrink-0">
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <span
                                  className={`mt-0.5 w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 tabular-nums ${
                                    isFirst ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="text-xs font-black text-slate-900 truncate">
                                    {st.title || `گام ${idx + 1}`}
                                  </div>
                                  <div className="text-[11px] text-slate-600">
                                    {st.config.assigneeMode === 'CREATOR'
                                      ? 'ثبت‌کننده اولیه پروژه'
                                      : `${st.positionIds.map((pid) => getPositionDetails(pid, st.structureId).title).join('، ')} (${assignees.count} نفر)`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => moveStepUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStepDown(idx)}
                                  disabled={idx === steps.length - 1}
                                  className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeStep(idx)}
                                  className="p-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer mr-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {/* List Mode Notifications Strip */}
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <Bell className="w-4 h-4 text-sky-600" />
                            قوانین اطلاع‌رسانی ({(diagramLayout.notifications || []).length})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateNotificationRule({ triggerEvent: 'ON_WORKFLOW_START' })
                            }
                            className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            افزودن اطلاع‌رسانی
                          </button>
                        </div>
                        {(diagramLayout.notifications || []).length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(diagramLayout.notifications || []).map((rule) => (
                              <div
                                key={rule.id}
                                onClick={() => setSelection({ kind: 'notification', notifId: rule.id })}
                                className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-2 transition ${
                                  selection.kind === 'notification' && selection.notifId === rule.id
                                    ? 'bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20'
                                    : 'bg-white border-slate-200 hover:border-sky-300'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 truncate">
                                    {rule.title}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {rule.channels.join(' + ')} · {rule.messageTemplate}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNotificationRule(rule.id);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                  </div>
                )}
              </main>

              {/* LEFT CONTEXTUAL INSPECTOR IN RTL (Visio Properties Pane) */}
              <aside className="w-80 xl:w-96 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
                {/* Inspector Header */}
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">
                      {selection.kind === 'start' ? (
                        <Zap className="w-4 h-4 text-emerald-600" />
                      ) : selection.kind === 'gateway' ? (
                        <Diamond className="w-4 h-4 text-amber-600" />
                      ) : selection.kind === 'creator_return' ? (
                        <UserCheck className="w-4 h-4 text-amber-600" />
                      ) : selection.kind === 'notification' ? (
                        <Bell className="w-4 h-4 text-sky-600" />
                      ) : (
                        <SlidersHorizontal className="w-4 h-4" />
                      )}
                    </span>
                    <h4 className="text-xs font-black text-slate-900 truncate">
                      {selection.kind === 'start'
                        ? 'تنظیمات رویداد شروع گردش کار'
                        : selection.kind === 'notification'
                        ? 'تنظیمات گره اطلاع‌رسانی (پوش / پیامک / کارتابل)'
                        : selection.kind === 'gateway' && selectedStep
                        ? `دروازه لوزی (شروط) — گام ${selectedStepIdx + 1}`
                        : selection.kind === 'creator_return'
                        ? 'کارتابل عودت ثبت‌کننده پروژه'
                        : selection.kind === 'end_approved'
                        ? 'نقطه پایان: تایید نهایی'
                        : selection.kind === 'end_rejected'
                        ? 'نقطه پایان: رد طرح'
                        : selectedStep
                        ? `تنظیمات گام ${selectedStepIdx + 1}: ${selectedStep.title || ''}`
                        : 'ویژگی‌های المان'}
                    </h4>
                  </div>

                  {(selection.kind === 'step' || selection.kind === 'gateway') && selectedStep && (
                    <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: 'step', idx: selectedStepIdx })}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          selection.kind === 'step'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600'
                        }`}
                      >
                        گام
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: 'gateway', idx: selectedStepIdx })}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          selection.kind === 'gateway'
                            ? 'bg-white text-amber-800 shadow-2xs'
                            : 'text-slate-600'
                        }`}
                      >
                        لوزی شرط
                      </button>
                    </div>
                  )}
                </div>

                {/* Inspector Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* 1. START TRIGGER INSPECTOR */}
                  {selection.kind === 'start' && (() => {
                    const trig: WorkflowStartTrigger = diagramLayout.startTrigger || {
                      event: 'PROJECT_CREATED',
                    };
                    const updateTrig = (patch: Partial<WorkflowStartTrigger>) => {
                      setDiagramLayout((prev) => ({
                        ...prev,
                        startTrigger: {
                          ...(prev.startTrigger || { event: 'PROJECT_CREATED' }),
                          ...patch,
                        },
                      }));
                    };

                    return (
                      <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-950 leading-relaxed">
                          تعیین کنید این گردش کار دقیقاً با وقوع چه رویدادی در سامانه به صورت خودکار یا دستی شروع شود.
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-slate-800">
                            رویداد آغازگر گردش کار:
                          </label>
                          {[
                            {
                              val: 'PROJECT_CREATED' as const,
                              title: 'ثبت پروژه جدید',
                              desc: 'به‌محض ثبت پروژه جدید توسط کاربر، وارد گام ۱ این گردش می‌شود.',
                            },
                            {
                              val: 'PROJECT_APPROVED' as const,
                              title: 'تایید شدن پروژه (زنجیره‌ای)',
                              desc: 'وقتی پروژه‌ای در گردش کار قبلی تایید نهایی شد، خودکار به این گردش کار وارد شود.',
                            },
                            {
                              val: 'MANUAL' as const,
                              title: 'انتخاب دستی هنگام ثبت پروژه',
                              desc: 'فقط زمانی اجرا می‌شود که کاربر هنگام ثبت پروژه آن را انتخاب کند.',
                            },
                          ].map((opt) => (
                            <label
                              key={opt.val}
                              className={`block p-3 rounded-xl border cursor-pointer transition ${
                                trig.event === opt.val
                                  ? 'bg-indigo-50/80 border-indigo-500 ring-1 ring-indigo-500/20'
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="startTriggerEvent"
                                  checked={trig.event === opt.val}
                                  onChange={() => updateTrig({ event: opt.val })}
                                  className="text-indigo-600"
                                />
                                <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 pr-5 leading-relaxed">
                                {opt.desc}
                              </p>
                            </label>
                          ))}
                        </div>

                        {trig.event === 'PROJECT_APPROVED' && (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-800 mb-1">
                              پس از تایید در کدام گردش کار مبدا؟
                            </label>
                            <select
                              value={trig.sourceWorkflowId || ''}
                              onChange={(e) => updateTrig({ sourceWorkflowId: e.target.value || null })}
                              className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2.5 py-2 text-xs text-slate-900"
                            >
                              <option value="">همه گردش کارهای تاییدشده</option>
                              {workflows
                                .filter((w) => !editingWorkflow || w.id !== editingWorkflow.id)
                                .map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        {trig.event !== 'MANUAL' && (
                          <div className="space-y-3 pt-2 border-t border-slate-200">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                                فیلتر نوع پروژه (اختیاری):
                              </label>
                              <select
                                value={trig.projectTypeId || ''}
                                onChange={(e) => updateTrig({ projectTypeId: e.target.value || null })}
                                className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2.5 py-2 text-xs text-slate-900"
                              >
                                <option value="">همه انواع پروژه</option>
                                {loadedProjectTypes.map((pt) => (
                                  <option key={pt.id} value={pt.id}>
                                    {pt.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                                شرط سمت ثبت‌کننده اولیه (اختیاری):
                              </label>
                              <select
                                value={trig.creatorPositionId || ''}
                                onChange={(e) => updateTrig({ creatorPositionId: e.target.value || null })}
                                className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2.5 py-2 text-xs text-slate-900"
                              >
                                <option value="">همه سمت‌های ثبت‌کننده</option>
                                {positions.map((pos) => (
                                  <option key={pos.id} value={pos.id}>
                                    {pos.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                              <Bell className="w-3.5 h-3.5 text-sky-600" />
                              اطلاع‌رسانی خودکار هنگام شروع
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCreateNotificationRule({ triggerEvent: 'ON_WORKFLOW_START' })
                              }
                              className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold cursor-pointer"
                            >
                              + افزودن اعلان
                            </button>
                          </div>
                          {(diagramLayout.notifications || [])
                            .filter((n) => n.triggerEvent === 'ON_WORKFLOW_START')
                            .map((n) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                                className="w-full text-right p-2 rounded-lg bg-sky-50/70 border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-sky-950 flex items-center justify-between cursor-pointer"
                              >
                                <span className="truncate">{n.title}</span>
                                <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2. STEP INSPECTOR */}
                  {selection.kind === 'step' && selectedStep && (() => {
                    const isCreatorStep = selectedStep.config.assigneeMode === 'CREATOR';
                    const inspectorAssignees = getStepUniqueAssignees(
                      selectedStep.positionIds,
                      selectedStep.structureId,
                      selectedStep.config.userIds,
                      selectedStep.config.assigneeMode
                    );
                    const availableToAddParallel = stepCandidatePositions.filter(
                      (p) => !selectedStep.positionIds.includes(p.id)
                    );
                    const allowedActions: WorkflowActionKey[] =
                      Array.isArray(selectedStep.config.allowedActions) &&
                      selectedStep.config.allowedActions.length > 0
                        ? selectedStep.config.allowedActions
                        : ['APPROVE', 'REVISION', 'REJECT'];

                    const toggleAction = (key: WorkflowActionKey) => {
                      const has = allowedActions.includes(key);
                      if (has && allowedActions.length <= 1) return;
                      const next = has
                        ? allowedActions.filter((k) => k !== key)
                        : [...allowedActions, key];
                      handleStepConfigChange(selectedStepIdx, 'allowedActions', next);
                    };

                    const setActionLabel = (key: WorkflowActionKey, val: string) => {
                      handleStepConfigChange(selectedStepIdx, 'actionLabels', {
                        ...(selectedStep.config.actionLabels || {}),
                        [key]: val,
                      });
                    };

                    return (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            عنوان مرحله در نقشه *
                          </label>
                          <input
                            type="text"
                            value={selectedStep.title}
                            onChange={(e) => handleStepChange(selectedStepIdx, 'title', e.target.value)}
                            className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            عنوان کار در کارتابل (اختیاری)
                          </label>
                          <input
                            type="text"
                            value={selectedStep.config.taskTitle || ''}
                            onChange={(e) =>
                              handleStepConfigChange(selectedStepIdx, 'taskTitle', e.target.value)
                            }
                            placeholder="مثلاً: آماده ارسال به لایه ۲ / بررسی تخصصی..."
                            className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                          />
                        </div>

                        {/* Assignee Mode Toggle */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <label className="block text-[11px] font-bold text-slate-800">
                            دریافت‌کننده کارتابل این گام:
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const fallbackPos =
                                  selectedStep.positionIds.length > 0
                                    ? selectedStep.positionIds
                                    : positions[0]?.id
                                    ? [positions[0].id]
                                    : [];
                                setSteps((prev) => {
                                  const copy = [...prev];
                                  copy[selectedStepIdx] = {
                                    ...copy[selectedStepIdx],
                                    positionIds: fallbackPos,
                                    config: {
                                      ...copy[selectedStepIdx].config,
                                      assigneeMode: 'POSITIONS',
                                    },
                                  };
                                  return copy;
                                });
                              }}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                                !isCreatorStep
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              سمت / کاربر سازمانی
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStepConfigChange(selectedStepIdx, 'assigneeMode', 'CREATOR')
                              }
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                                isCreatorStep
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              ثبت‌کننده اولیه پروژه
                            </button>
                          </div>

                          {isCreatorStep ? (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-relaxed">
                              این گام به‌صورت خودکار فقط در کارتابل کاربری که پروژه را ثبت کرده قرار می‌گیرد.
                            </div>
                          ) : (
                            <div className="space-y-2.5 pt-1">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  محدودیت ساختار (اختیاری):
                                </label>
                                <select
                                  value={selectedStep.structureId || ''}
                                  onChange={(e) =>
                                    handleStepChange(selectedStepIdx, 'structureId', e.target.value || null)
                                  }
                                  className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-indigo-900"
                                >
                                  <option value="">همه ساختارها (چارت اصلی و ساختارها)</option>
                                  {structures.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      فقط ساختار: {s.title}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {selectedStep.positionIds.map((pid) => {
                                  const posD = getPositionDetails(pid, selectedStep.structureId);
                                  return (
                                    <span
                                      key={pid}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-slate-800"
                                    >
                                      <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
                                      <span>{posD.title}</span>
                                      <span className="text-[10px] text-indigo-600 tabular-nums">
                                        ({posD.userCount})
                                      </span>
                                      {selectedStep.positionIds.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeParallelPositionFromStep(selectedStepIdx, pid)
                                          }
                                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>

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
                                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 disabled:opacity-50"
                              >
                                <option value="">+ افزودن سمت هم‌زمان به این گام...</option>
                                {availableToAddParallel.map((p) => {
                                  const pd = getPositionDetails(p.id, selectedStep.structureId);
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.title} ({pd.userCount} نفر)
                                    </option>
                                  );
                                })}
                              </select>

                              <div className="pt-1 border-t border-slate-200 space-y-1.5">
                                <span className="block text-[10px] font-bold text-slate-600">
                                  افزودن کاربر خاص (علاوه بر سمت‌ها — مجموع {inspectorAssignees.count} نفر):
                                </span>
                                {Array.isArray(selectedStep.config.userIds) &&
                                  selectedStep.config.userIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {selectedStep.config.userIds.map((uid) => {
                                        const usr = users.find((u) => u.id === uid);
                                        if (!usr) return null;
                                        return (
                                          <span
                                            key={uid}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900"
                                          >
                                            <span>{usr.name}</span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeDirectUserFromStep(selectedStepIdx, uid)
                                              }
                                              className="text-emerald-700 hover:text-rose-600 cursor-pointer"
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
                                  className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-800"
                                >
                                  <option value="">+ انتخاب مستقیم کاربر...</option>
                                  {users
                                    .filter((u) => !(selectedStep.config.userIds || []).includes(u.id))
                                    .map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.name} (@{u.username})
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Allowed Actions & Custom Button Titles */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <label className="block text-[11px] font-bold text-slate-800">
                            اقدامات مجاز در کارتابل کاربر و عنوان دکمه‌ها:
                          </label>
                          {(
                            [
                              {
                                key: 'APPROVE' as WorkflowActionKey,
                                title: 'تایید / ارسال',
                                placeholder: 'ارسال به گردش کار / تایید',
                                tone: 'emerald',
                              },
                              {
                                key: 'REVISION' as WorkflowActionKey,
                                title: 'اصلاح',
                                placeholder: 'نیاز به اصلاح',
                                tone: 'amber',
                              },
                              {
                                key: 'REJECT' as WorkflowActionKey,
                                title: 'رد طرح',
                                placeholder: 'رد طرح',
                                tone: 'rose',
                              },
                            ] as const
                          ).map((item) => {
                            const checked = allowedActions.includes(item.key);
                            return (
                              <div
                                key={item.key}
                                className="p-2 rounded-lg bg-white border border-slate-200 space-y-1.5"
                              >
                                <label className="flex items-center justify-between gap-2 cursor-pointer">
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleAction(item.key)}
                                      className="rounded text-indigo-600"
                                    />
                                    <span>{item.title}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {checked ? 'فعال در کارتابل' : 'غیرفعال'}
                                  </span>
                                </label>
                                {checked && (
                                  <input
                                    type="text"
                                    value={selectedStep.config.actionLabels?.[item.key] || ''}
                                    onChange={(e) => setActionLabel(item.key, e.target.value)}
                                    placeholder={`عنوان دکمه (پیش‌فرض: ${item.placeholder})`}
                                    className="w-full rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Cartable & Multi-User Voting Mode Selector */}
                        {(() => {
                          const isLeaveAfterVoteMode = Boolean(
                            selectedStep.config.removeFromCartableAfterVote ??
                              (selectedStep.config.voteCollectionMode === 'WAIT_ALL')
                          );
                          const isWaitAllCollection =
                            selectedStep.config.voteCollectionMode === 'WAIT_ALL';
                          return (
                            <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-2.5">
                              <div className="text-[11px] font-black text-indigo-950 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span>رفتار کارتابل پس از ثبت رای (سمت‌های چندنفره)</span>
                              </div>

                              {/* Mode 1: Stay in cartable, vote edit controlled by RBAC permission */}
                              <label
                                className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition text-[11px] ${
                                  !isLeaveAfterVoteMode
                                    ? 'bg-white border-indigo-400 ring-1 ring-indigo-300/60 shadow-2xs'
                                    : 'bg-white/60 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`cartable-vote-mode-${selectedStep.localKey}`}
                                  checked={!isLeaveAfterVoteMode}
                                  onChange={() =>
                                    handleStepConfigPatch(selectedStepIdx, {
                                      removeFromCartableAfterVote: false,
                                    })
                                  }
                                  className="mt-0.5 text-indigo-600 accent-indigo-600"
                                />
                                <span className="leading-relaxed">
                                  <strong className="block text-slate-900">
                                    حالت ۱: ماندن در کارتابل پس از رای (ویرایش فقط با مجوز)
                                  </strong>
                                  <span className="text-[10px] text-slate-500 block mt-0.5">
                                    پس از ثبت رای هر عضو، پرونده در کارتابل او باقی می‌ماند. تغییر رای فقط برای دارندگان دسترسی «امکان ویرایش رای در کارتابل» مجاز است.
                                  </span>
                                </span>
                              </label>

                              {!isLeaveAfterVoteMode && (
                                <label className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-white/80 border border-indigo-100 cursor-pointer text-[10px] text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={isWaitAllCollection}
                                    onChange={(e) =>
                                      handleStepConfigPatch(selectedStepIdx, {
                                        removeFromCartableAfterVote: false,
                                        voteCollectionMode: e.target.checked
                                          ? 'WAIT_ALL'
                                          : 'EARLY_DECIDE',
                                      })
                                    }
                                    className="mt-0.5 rounded text-indigo-600 accent-indigo-600"
                                  />
                                  <span className="leading-relaxed">
                                    <strong className="text-indigo-950">
                                      صبر تا رای‌دهی همه اعضای سمت پیش از رفتن به گام بعد
                                    </strong>
                                    <span className="block text-slate-500">
                                      در صورت فعال بودن، حتی پس از رای نفرات اول، مرحله تا ثبت نظر همه اعضای این سمت به گام بعدی نمی‌رود.
                                    </span>
                                  </span>
                                </label>
                              )}

                              {/* Mode 2: Leave cartable immediately after vote, wait for all members before moving on */}
                              <label
                                className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition text-[11px] ${
                                  isLeaveAfterVoteMode
                                    ? 'bg-white border-indigo-400 ring-1 ring-indigo-300/60 shadow-2xs'
                                    : 'bg-white/60 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`cartable-vote-mode-${selectedStep.localKey}`}
                                  checked={isLeaveAfterVoteMode}
                                  onChange={() =>
                                    handleStepConfigPatch(selectedStepIdx, {
                                      removeFromCartableAfterVote: true,
                                      voteCollectionMode: 'WAIT_ALL',
                                    })
                                  }
                                  className="mt-0.5 text-indigo-600 accent-indigo-600"
                                />
                                <span className="leading-relaxed">
                                  <strong className="flex items-center gap-1 text-indigo-950">
                                    <LogOut className="w-3 h-3 text-indigo-600 shrink-0" />
                                    حالت ۲: خروج از کارتابل هر نفر پس از رای + صبر تا رای همه اعضا
                                  </strong>
                                  <span className="text-[10px] text-slate-500 block mt-0.5">
                                    پرونده برای همه اعضای این سمت ارسال می‌شود؛ هر نفر که رای داد بلافاصله از کارتابلش خارج می‌شود، ولی تا همه اعضا رای ندهند به گام بعد منتقل نمی‌شود.
                                  </span>
                                </span>
                              </label>

                              <label className="flex items-start gap-2 pt-1 border-t border-indigo-200/60 cursor-pointer text-[11px] text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={selectedStep.config.showVotesInStatusHistory !== false}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'showVotesInStatusHistory',
                                      e.target.checked
                                    )
                                  }
                                  className="mt-0.5 rounded text-indigo-600"
                                />
                                <span className="leading-relaxed">
                                  <strong className="flex items-center gap-1 text-indigo-950">
                                    <Eye className="w-3 h-3 text-indigo-600" />
                                    ثبت رای و توضیحات هر کاربر در تاریخچه وضعیت پروژه
                                  </strong>
                                </span>
                              </label>
                            </div>
                          );
                        })()}

                        {/* Step Validation Controls & Direct File Attachment */}
                        <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200/80 space-y-2.5">
                          <div className="text-[11px] font-black text-rose-950 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>کنترل‌ها، الزامات پیش از ارجاع و بارگذاری فایل</span>
                          </div>

                          <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedStep.config.requireAttachment)}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'requireAttachment',
                                  e.target.checked
                                )
                              }
                              className="mt-0.5 rounded text-rose-600"
                            />
                            <span className="leading-relaxed">
                              <strong className="flex items-center gap-1 text-rose-950">
                                <Paperclip className="w-3 h-3 text-rose-600" />
                                الزام بارگذاری / وجود فایل پیوست پیش از تایید و ارجاع
                              </strong>
                              <span className="text-[10px] text-slate-500 block">
                                تا زمانی که فایل پروژه پیوست نشده باشد، کاربر نتواند این گام را ارجاع دهد و پیام خطا دریافت کند.
                              </span>
                            </span>
                          </label>

                          {selectedStep.config.requireAttachment && (
                            <div className="pr-5 space-y-2 pt-1 border-t border-rose-200/70">
                              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedStep.config.requireNewAttachmentInStep)}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'requireNewAttachmentInStep',
                                      e.target.checked
                                    )
                                  }
                                  className="mt-0.5 rounded text-rose-600"
                                />
                                <span className="leading-relaxed">
                                  <strong className="text-slate-900">
                                    الزام بارگذاری فایل جدید در همین مرحله
                                  </strong>
                                  <span className="text-[10px] text-slate-500 block">
                                    اگر فعال باشد، فایل‌های مراحل قبلی کافی نیست و باید پس از ورود به این مرحله فایل جدید آپلود شود.
                                  </span>
                                </span>
                              </label>

                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-bold text-slate-700">
                                  حداقل تعداد فایل الزامی:
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={selectedStep.config.minAttachmentsCount || 1}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'minAttachmentsCount',
                                      Math.max(1, parseInt(e.target.value, 10) || 1)
                                    )
                                  }
                                  className="w-16 rounded-lg bg-white border border-slate-300 px-2 py-1 text-xs text-center font-bold text-slate-900 tabular-nums"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                                  متن خطای سفارشی در صورت نبود فایل (اختیاری):
                                </label>
                                <input
                                  type="text"
                                  value={selectedStep.config.attachmentRequirementMessage || ''}
                                  onChange={(e) =>
                                    handleStepConfigChange(
                                      selectedStepIdx,
                                      'attachmentRequirementMessage',
                                      e.target.value
                                    )
                                  }
                                  placeholder="مثلاً: لطفاً ابتدا فایل نهایی پروژه را بارگذاری کنید."
                                  className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:border-rose-500"
                                />
                              </div>
                            </div>
                          )}

                          <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedStep.config.requireCommentOnApprove)}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'requireCommentOnApprove',
                                  e.target.checked
                                )
                              }
                              className="mt-0.5 rounded text-rose-600"
                            />
                            <span className="leading-relaxed">
                              <strong className="text-slate-900">الزام ثبت توضیحات هنگام تایید و ارجاع</strong>
                            </span>
                          </label>

                          <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedStep.config.requireCommentOnReject)}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'requireCommentOnReject',
                                  e.target.checked
                                )
                              }
                              className="mt-0.5 rounded text-rose-600"
                            />
                            <span className="leading-relaxed">
                              <strong className="text-slate-900">الزام ثبت دلیل هنگام رد طرح</strong>
                            </span>
                          </label>

                          <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800 pt-1 border-t border-rose-200/70">
                            <input
                              type="checkbox"
                              checked={selectedStep.config.allowAttachmentUploadInStep !== false}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'allowAttachmentUploadInStep',
                                  e.target.checked
                                )
                              }
                              className="mt-0.5 rounded text-indigo-600"
                            />
                            <span className="leading-relaxed">
                              <strong className="text-indigo-950">
                                نمایش بخش افزودن مستقیم فایل پروژه در پنجره اقدام این گام
                              </strong>
                              <span className="text-[10px] text-slate-500 block">
                                کاربر این مرحله بدون نیاز به ویرایش پروژه می‌تواند مستقیماً فایل پیوست اضافه کند.
                              </span>
                            </span>
                          </label>
                        </div>

                        {/* Gateway Link */}
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-amber-950">
                            <input
                              type="checkbox"
                              checked={selectedStep.config.hasGateway !== false}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'hasGateway', e.target.checked)
                              }
                              className="rounded text-amber-600"
                            />
                            <span>دارای لوزی شرط تصمیم‌گیری (Gateway)</span>
                          </label>
                          {selectedStep.config.hasGateway !== false && (
                            <button
                              type="button"
                              onClick={() => setSelection({ kind: 'gateway', idx: selectedStepIdx })}
                              className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-bold cursor-pointer"
                            >
                              تنظیم شروط لوزی
                            </button>
                          )}
                        </div>

                        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-sky-950 flex items-center gap-1">
                              <Bell className="w-3.5 h-3.5 text-sky-600" />
                              اطلاع‌رسانی خودکار این گام
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreateNotificationRule({
                                    triggerEvent: 'ON_STEP_ENTER',
                                    sourceStepOrder: selectedStepIdx + 1,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-white hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold cursor-pointer"
                              >
                                + هنگام ورود
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreateNotificationRule({
                                    triggerEvent: 'ON_STEP_VOTE',
                                    sourceStepOrder: selectedStepIdx + 1,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold cursor-pointer"
                              >
                                + هنگام رای
                              </button>
                            </div>
                          </div>
                          {(diagramLayout.notifications || [])
                            .filter(
                              (n) =>
                                (n.triggerEvent === 'ON_STEP_ENTER' || n.triggerEvent === 'ON_STEP_VOTE') &&
                                (!n.sourceStepOrder || n.sourceStepOrder === selectedStepIdx + 1)
                            )
                            .map((n) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                                className="w-full text-right p-2 rounded-lg bg-white border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-slate-900 flex items-center justify-between cursor-pointer"
                              >
                                <span className="truncate">{n.title}</span>
                                <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                              </button>
                            ))}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            راهنمای مرحله برای کاربران:
                          </label>
                          <input
                            type="text"
                            value={selectedStep.description || ''}
                            onChange={(e) =>
                              handleStepChange(selectedStepIdx, 'description', e.target.value)
                            }
                            placeholder="توضیحات راهنما..."
                            className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3. VISIO DIAMOND GATEWAY INSPECTOR */}
                  {selection.kind === 'gateway' && selectedStep && (() => {
                    const allowedActions: WorkflowActionKey[] =
                      Array.isArray(selectedStep.config.allowedActions) &&
                      selectedStep.config.allowedActions.length > 0
                        ? selectedStep.config.allowedActions
                        : ['APPROVE', 'REVISION', 'REJECT'];
                    const revMode = normalizeBranchMode(
                      selectedStep.config.revisionMode,
                      selectedStep.config.approvalMode,
                      'revision'
                    );
                    const rejMode = normalizeBranchMode(
                      selectedStep.config.rejectMode,
                      selectedStep.config.approvalMode,
                      'reject'
                    );

                    return (
                      <div className="space-y-3.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            عنوان لوزی شرط (اختیاری)
                          </label>
                          <input
                            type="text"
                            value={selectedStep.config.gatewayTitle || ''}
                            onChange={(e) =>
                              handleStepConfigChange(selectedStepIdx, 'gatewayTitle', e.target.value)
                            }
                            placeholder="مثلاً: جمع‌بندی آرای لایه ۲"
                            className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-1">
                              سیاست جمع‌آوری آرا در این دروازه:
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
                              className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-900"
                            >
                              <option value="WAIT_ALL">
                                صبر تا اقدام همه اعضای سمت (سپس اعمال اکثریت/نتیجه)
                              </option>
                              <option value="EARLY_DECIDE">
                                به‌محض رسیدن به حدنصاب اقدام (در صورت «ارسال به مسیر»)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-1">
                              نتیجه در صورت تساوی آرا:
                            </label>
                            <select
                              value={selectedStep.config.tieBreaker || 'REVISION'}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'tieBreaker', e.target.value)
                              }
                              className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800"
                            >
                              <option value="REVISION">مسیر اصلاح (نیاز به اصلاح)</option>
                              <option value="REJECT">مسیر رد (رد اکثریت)</option>
                              <option value="APPROVE">مسیر تایید (تایید اکثریت)</option>
                            </select>
                          </div>
                        </div>

                        {/* APPROVE CONDITION */}
                        {allowedActions.includes('APPROVE') && (
                          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                            <div className="text-[11px] font-black text-emerald-950 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>شرط اقدام تایید ({selectedStep.config.actionLabels?.APPROVE || 'تایید'})</span>
                            </div>

                            <select
                              value={selectedStep.config.approveBehavior || 'ROUTE'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'approveBehavior',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] font-bold text-slate-800"
                            >
                              <option value="ROUTE">هدایت به مسیر مقصد با تحقق نصاب</option>
                              <option value="RECORD_AND_WAIT">
                                فقط ثبت در وضعیت پروژه + صبر تا رای بقیه
                              </option>
                            </select>

                            <select
                              value={selectedStep.config.approvalMode || 'SINGLE'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'approvalMode',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900"
                            >
                              <option value="SINGLE">تک‌نفره (۱ نفر)</option>
                              <option value="MAJORITY">اکثریت اعضا (&gt;۵۰٪ — تایید اکثریت)</option>
                              <option value="ALL">اجماع تمام اعضا (۱۰۰٪)</option>
                              <option value="NOTIFY_ONLY">اطلاع‌رسانی و عبور</option>
                            </select>

                            <select
                              value={selectedStep.config.approveTarget || 'NEXT_STEP'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'approveTarget',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-emerald-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800"
                            >
                              <option value="NEXT_STEP">مقصد: گام بعدی (یا پایان تایید)</option>
                              <option value="CUSTOM_STEP">مقصد: ارسال به گام دلخواه</option>
                              <option value="END_APPROVED">مقصد: پایان با «تایید اکثریت / نهایی»</option>
                            </select>

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
                                {steps.map((t, i) => (
                                  <option key={t.localKey} value={i + 1}>
                                    گام {i + 1}: {t.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {/* REVISION CONDITION */}
                        {allowedActions.includes('REVISION') && (
                          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                            <div className="text-[11px] font-black text-amber-950 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>شرط اقدام اصلاح ({selectedStep.config.actionLabels?.REVISION || 'اصلاح'})</span>
                            </div>

                            <select
                              value={selectedStep.config.revisionBehavior || 'ROUTE'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'revisionBehavior',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] font-bold text-slate-800"
                            >
                              <option value="ROUTE">هدایت به مسیر مقصد با تحقق نصاب</option>
                              <option value="RECORD_AND_WAIT">
                                فقط ثبت در وضعیت پروژه + صبر تا رای بقیه
                              </option>
                            </select>

                            <select
                              value={revMode}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'revisionMode', e.target.value)
                              }
                              className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900"
                            >
                              <option value="SINGLE">تک‌نفره (۱ نفر)</option>
                              <option value="MAJORITY">اکثریت اعضا (&gt;۵۰٪)</option>
                              <option value="ALL">اجماع تمام اعضا (۱۰۰٪)</option>
                            </select>

                            <select
                              value={selectedStep.config.onRevisionAction || 'RETURN_PREV'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'onRevisionAction',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-amber-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800"
                            >
                              <option value="RETURN_CREATOR">
                                مقصد: کارتابل ثبت‌کننده اولیه پروژه
                              </option>
                              <option value="RETURN_PREV">مقصد: بازگشت به گام قبلی</option>
                              <option value="RETURN_STEP_1">مقصد: بازگشت به گام ۱</option>
                              <option value="CUSTOM_STEP">مقصد: ارجاع به گام دلخواه</option>
                              <option value="REJECT_PROJECT">مقصد: پایان و رد طرح</option>
                            </select>

                            {selectedStep.config.onRevisionAction === 'RETURN_CREATOR' && (
                              <input
                                type="text"
                                value={selectedStep.config.returnCreatorTaskTitle || 'نیاز به اصلاح'}
                                onChange={(e) =>
                                  handleStepConfigChange(
                                    selectedStepIdx,
                                    'returnCreatorTaskTitle',
                                    e.target.value
                                  )
                                }
                                placeholder="عنوان کار در کارتابل ثبت‌کننده (مثلاً: نیاز به اصلاح)"
                                className="w-full rounded-lg bg-white border border-amber-300 px-2.5 py-1.5 text-[11px] font-bold text-amber-950"
                              />
                            )}

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
                                {steps.map((t, i) => (
                                  <option key={t.localKey} value={i + 1}>
                                    گام {i + 1}: {t.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {/* REJECT CONDITION */}
                        {allowedActions.includes('REJECT') && (
                          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                            <div className="text-[11px] font-black text-rose-950 flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>شرط اقدام رد ({selectedStep.config.actionLabels?.REJECT || 'رد'})</span>
                            </div>

                            <select
                              value={selectedStep.config.rejectBehavior || 'ROUTE'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'rejectBehavior',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] font-bold text-slate-800"
                            >
                              <option value="ROUTE">هدایت به مسیر مقصد با تحقق نصاب</option>
                              <option value="RECORD_AND_WAIT">
                                فقط ثبت در وضعیت پروژه + صبر تا رای بقیه
                              </option>
                            </select>

                            <select
                              value={rejMode}
                              onChange={(e) =>
                                handleStepConfigChange(selectedStepIdx, 'rejectMode', e.target.value)
                              }
                              className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] font-semibold text-slate-900"
                            >
                              <option value="SINGLE">تک‌نفره (۱ نفر)</option>
                              <option value="MAJORITY">اکثریت اعضا (&gt;۵۰٪ — رد اکثریت)</option>
                              <option value="ALL">اجماع تمام اعضا (۱۰۰٪)</option>
                            </select>

                            <select
                              value={selectedStep.config.onRejectAction || 'REJECT_PROJECT'}
                              onChange={(e) =>
                                handleStepConfigChange(
                                  selectedStepIdx,
                                  'onRejectAction',
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg bg-white border border-rose-300 px-2 py-1.5 text-[11px] font-semibold text-slate-800"
                            >
                              <option value="REJECT_PROJECT">مقصد: پایان با «رد اکثریت / مختومه»</option>
                              <option value="RETURN_CREATOR">
                                مقصد: کارتابل ثبت‌کننده اولیه پروژه
                              </option>
                              <option value="RETURN_PREV">مقصد: بازگشت به گام قبلی</option>
                              <option value="RETURN_STEP_1">مقصد: بازگشت به گام ۱</option>
                              <option value="CUSTOM_STEP">مقصد: ارجاع به گام دلخواه</option>
                            </select>

                            {selectedStep.config.onRejectAction === 'RETURN_CREATOR' && (
                              <input
                                type="text"
                                value={selectedStep.config.returnCreatorTaskTitle || 'نیاز به اصلاح'}
                                onChange={(e) =>
                                  handleStepConfigChange(
                                    selectedStepIdx,
                                    'returnCreatorTaskTitle',
                                    e.target.value
                                  )
                                }
                                placeholder="عنوان کار در کارتابل ثبت‌کننده"
                                className="w-full rounded-lg bg-white border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-950"
                              />
                            )}

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
                                {steps.map((t, i) => (
                                  <option key={t.localKey} value={i + 1}>
                                    گام {i + 1}: {t.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-sky-950 flex items-center gap-1">
                              <Bell className="w-3.5 h-3.5 text-sky-600" />
                              اعلان نتیجه دروازه شرط (لوزی)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCreateNotificationRule({
                                  triggerEvent: 'ON_GATEWAY_OUTCOME',
                                  sourceStepOrder: selectedStepIdx + 1,
                                })
                              }
                              className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold cursor-pointer"
                            >
                              + افزودن اعلان
                            </button>
                          </div>
                          {(diagramLayout.notifications || [])
                            .filter(
                              (n) =>
                                n.triggerEvent === 'ON_GATEWAY_OUTCOME' &&
                                (!n.sourceStepOrder || n.sourceStepOrder === selectedStepIdx + 1)
                            )
                            .map((n) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                                className="w-full text-right p-2 rounded-lg bg-white border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-slate-900 flex items-center justify-between cursor-pointer"
                              >
                                <span className="truncate">{n.title}</span>
                                <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 4. CREATOR RETURN / END TERMINATOR INSPECTORS */}
                  {selection.kind === 'creator_return' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-relaxed">
                        وقتی نتیجه مرحله‌ای به «کارتابل ثبت‌کننده اولیه پروژه» ارجاع داده شود، پروژه با وضعیت «نیازمند اصلاح» در کارتابل ثبت‌کننده نمایش داده می‌شود.
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          عنوان گره در بوم:
                        </label>
                        <input
                          type="text"
                          value={diagramLayout.creatorLabel || 'کارتابل ثبت‌کننده اولیه'}
                          onChange={(e) =>
                            setDiagramLayout((prev) => ({
                              ...prev,
                              creatorLabel: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                        />
                      </div>

                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                            <Bell className="w-3.5 h-3.5 text-sky-600" />
                            اطلاع‌رسانی هنگام عودت برای اصلاح
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateNotificationRule({
                                triggerEvent: 'ON_WORKFLOW_END',
                                endOutcomeCondition: 'NEEDS_REVISION',
                              })
                            }
                            className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold cursor-pointer"
                          >
                            + افزودن اعلان
                          </button>
                        </div>
                        {(diagramLayout.notifications || [])
                          .filter((n) => n.triggerEvent === 'ON_WORKFLOW_END' && n.endOutcomeCondition === 'NEEDS_REVISION')
                          .map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                              className="w-full text-right p-2 rounded-lg bg-sky-50/70 border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-sky-950 flex items-center justify-between cursor-pointer"
                            >
                              <span className="truncate">{n.title}</span>
                              <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {selection.kind === 'end_approved' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950 leading-relaxed flex items-center gap-2">
                        <Flag className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          پروژه‌هایی که به این گره برسند با نتیجه نهایی تایید مختومه می‌شوند (و در صورت تعریف گردش کار زنجیره‌ای روی «پس از تایید پروژه»، خودکار وارد گردش بعدی می‌شوند).
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          برچسب گره پایان تایید:
                        </label>
                        <input
                          type="text"
                          value={diagramLayout.endApprovedLabel || 'تایید اکثریت'}
                          onChange={(e) =>
                            setDiagramLayout((prev) => ({
                              ...prev,
                              endApprovedLabel: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                        />
                      </div>

                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                            <Bell className="w-3.5 h-3.5 text-sky-600" />
                            اطلاع‌رسانی تصویب نهایی
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateNotificationRule({
                                triggerEvent: 'ON_WORKFLOW_END',
                                endOutcomeCondition: 'APPROVED',
                              })
                            }
                            className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold cursor-pointer"
                          >
                            + افزودن اعلان
                          </button>
                        </div>
                        {(diagramLayout.notifications || [])
                          .filter((n) => n.triggerEvent === 'ON_WORKFLOW_END' && (n.endOutcomeCondition === 'APPROVED' || n.endOutcomeCondition === 'ANY'))
                          .map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                              className="w-full text-right p-2 rounded-lg bg-sky-50/70 border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-sky-950 flex items-center justify-between cursor-pointer"
                            >
                              <span className="truncate">{n.title}</span>
                              <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {selection.kind === 'end_rejected' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-950 leading-relaxed flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          پروژه‌هایی که به این گره برسند با وضعیت «رد شده / رد اکثریت» در تاریخچه وضعیت پروژه ثبت و بسته می‌شوند.
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          برچسب گره پایان رد:
                        </label>
                        <input
                          type="text"
                          value={diagramLayout.endRejectedLabel || 'رد اکثریت'}
                          onChange={(e) =>
                            setDiagramLayout((prev) => ({
                              ...prev,
                              endRejectedLabel: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                        />
                      </div>

                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                            <Bell className="w-3.5 h-3.5 text-sky-600" />
                            اطلاع‌رسانی رد طرح
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateNotificationRule({
                                triggerEvent: 'ON_WORKFLOW_END',
                                endOutcomeCondition: 'REJECTED',
                              })
                            }
                            className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold cursor-pointer"
                          >
                            + افزودن اعلان
                          </button>
                        </div>
                        {(diagramLayout.notifications || [])
                          .filter((n) => n.triggerEvent === 'ON_WORKFLOW_END' && (n.endOutcomeCondition === 'REJECTED' || n.endOutcomeCondition === 'ANY'))
                          .map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelection({ kind: 'notification', notifId: n.id })}
                              className="w-full text-right p-2 rounded-lg bg-sky-50/70 border border-sky-200 hover:border-sky-400 text-[11px] font-bold text-sky-950 flex items-center justify-between cursor-pointer"
                            >
                              <span className="truncate">{n.title}</span>
                              <span className="text-[9px] text-sky-700 shrink-0">ویرایش</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 5. NOTIFICATION NODE INSPECTOR */}
                  {selection.kind === 'notification' && (() => {
                    const rule = (diagramLayout.notifications || []).find(
                      (n) => n.id === selection.notifId
                    );
                    if (!rule) {
                      return (
                        <div className="p-4 text-center text-xs text-slate-500">
                          گره اطلاع‌رسانی انتخاب‌شده یافت نشد.
                        </div>
                      );
                    }

                    const updateRule = (patch: Partial<WorkflowNotificationRule>) =>
                      handleUpdateNotificationRule(rule.id, patch);

                    const toggleChannel = (ch: WorkflowNotificationChannel) => {
                      const has = rule.channels.includes(ch);
                      const next = has
                        ? rule.channels.filter((c) => c !== ch)
                        : [...rule.channels, ch];
                      updateRule({ channels: next });
                    };

                    const toggleRecipientMode = (mode: WorkflowNotificationRecipientMode) => {
                      const has = rule.recipientModes.includes(mode);
                      const next = has
                        ? rule.recipientModes.filter((m) => m !== mode)
                        : [...rule.recipientModes, mode];
                      updateRule({ recipientModes: next });
                    };

                    const toggleTargetPosition = (posId: string) => {
                      const cur = rule.targetPositionIds || [];
                      const next = cur.includes(posId)
                        ? cur.filter((id) => id !== posId)
                        : [...cur, posId];
                      updateRule({ targetPositionIds: next });
                    };

                    const toggleTargetUser = (userId: string) => {
                      const cur = rule.targetUserIds || [];
                      const next = cur.includes(userId)
                        ? cur.filter((id) => id !== userId)
                        : [...cur, userId];
                      updateRule({ targetUserIds: next });
                    };

                    const notifCandidatePositions =
                      rule.targetStructureId &&
                      structurePositionsMap[rule.targetStructureId]?.length > 0
                        ? structurePositionsMap[rule.targetStructureId].map((sp) => ({
                            id: sp.positionId,
                            title: sp.title,
                          }))
                        : positions.map((p) => ({ id: p.id, title: p.title }));

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-sky-50 border border-sky-200">
                          <label className="flex items-center gap-2 text-xs font-bold text-sky-950 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.enabled !== false}
                              onChange={(e) => updateRule({ enabled: e.target.checked })}
                              className="rounded text-sky-600"
                            />
                            <span>این اطلاع‌رسانی فعال باشد</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteNotificationRule(rule.id)}
                            className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف</span>
                          </button>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            نام / عنوان گره در نقشه:
                          </label>
                          <input
                            type="text"
                            value={rule.title}
                            onChange={(e) => updateRule({ title: e.target.value })}
                            className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                          />
                        </div>

                        {/* 3 Delivery Channels */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                          <span className="block text-[11px] font-black text-slate-800">
                            ۱. روش‌های اطلاع‌رسانی (۱، ۲ یا هر ۳ هم‌زمان):
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {(
                              [
                                {
                                  ch: 'PUSH' as WorkflowNotificationChannel,
                                  label: 'پوش نوتیفیکیشن',
                                  Icon: Bell,
                                  activeCls: 'bg-indigo-600 text-white border-indigo-600',
                                },
                                {
                                  ch: 'SMS' as WorkflowNotificationChannel,
                                  label: 'ارسال پیامک',
                                  Icon: MessageSquareText,
                                  activeCls: 'bg-emerald-600 text-white border-emerald-600',
                                },
                                {
                                  ch: 'CARTABLE' as WorkflowNotificationChannel,
                                  label: 'اعلان کارتابل',
                                  Icon: Inbox,
                                  activeCls: 'bg-amber-600 text-white border-amber-600',
                                },
                              ] as const
                            ).map((item) => {
                              const active = rule.channels.includes(item.ch);
                              const ChIcon = item.Icon;
                              return (
                                <button
                                  key={item.ch}
                                  type="button"
                                  onClick={() => toggleChannel(item.ch)}
                                  className={`p-2 rounded-lg border text-[10px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                                    active
                                      ? item.activeCls
                                      : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                                  }`}
                                >
                                  <ChIcon className="w-3.5 h-3.5" />
                                  <span className="text-center leading-tight">{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                          {rule.channels.length === 0 && (
                            <p className="text-[10px] font-bold text-rose-600">
                              حداقل یک روش ارسال را انتخاب کنید.
                            </p>
                          )}
                        </div>

                        {/* 2. Trigger Event & Conditions */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <span className="block text-[11px] font-black text-slate-800">
                            ۲. زمان وقوع و شرط اجرا:
                          </span>
                          <select
                            value={rule.triggerEvent}
                            onChange={(e) =>
                              updateRule({
                                triggerEvent: e.target.value as WorkflowNotificationTriggerEvent,
                              })
                            }
                            className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-900"
                          >
                            <option value="ON_WORKFLOW_START">هنگام شروع گردش کار</option>
                            <option value="ON_STEP_ENTER">هنگام ورود پرونده به گام</option>
                            <option value="ON_STEP_VOTE">به‌محض ثبت رای هر کاربر در گام</option>
                            <option value="ON_GATEWAY_OUTCOME">پس از تصمیم‌گیری دروازه شرط (لوزی)</option>
                            <option value="ON_WORKFLOW_END">پایان و نتیجه نهایی گردش کار</option>
                          </select>

                          {(rule.triggerEvent === 'ON_STEP_ENTER' ||
                            rule.triggerEvent === 'ON_STEP_VOTE' ||
                            rule.triggerEvent === 'ON_GATEWAY_OUTCOME') && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                کدام مرحله؟
                              </label>
                              <select
                                value={rule.sourceStepOrder || ''}
                                onChange={(e) =>
                                  updateRule({
                                    sourceStepOrder: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-900"
                              >
                                <option value="">همه مراحل این گردش کار</option>
                                {steps.map((s, i) => (
                                  <option key={s.localKey} value={i + 1}>
                                    گام {i + 1}: {s.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {(rule.triggerEvent === 'ON_STEP_VOTE' ||
                            rule.triggerEvent === 'ON_GATEWAY_OUTCOME') && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                شرط نوع رای / مسیر خروجی:
                              </label>
                              <select
                                value={rule.branchCondition || 'ANY'}
                                onChange={(e) =>
                                  updateRule({
                                    branchCondition: e.target.value as WorkflowNotificationRule['branchCondition'],
                                  })
                                }
                                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-900"
                              >
                                <option value="ANY">همه حالت‌ها (تایید / اصلاح / رد)</option>
                                <option value="APPROVE">فقط تایید / موافقت</option>
                                <option value="REVISION">فقط درخواست اصلاح</option>
                                <option value="REJECT">فقط رد / مخالفت</option>
                              </select>
                            </div>
                          )}

                          {rule.triggerEvent === 'ON_WORKFLOW_END' && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                شرط نتیجه نهایی گردش کار:
                              </label>
                              <select
                                value={rule.endOutcomeCondition || 'ANY'}
                                onChange={(e) =>
                                  updateRule({
                                    endOutcomeCondition: e.target.value as WorkflowNotificationRule['endOutcomeCondition'],
                                  })
                                }
                                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-900"
                              >
                                <option value="ANY">هر نتیجه‌ای (تایید، اصلاح یا رد)</option>
                                <option value="APPROVED">فقط تصویب نهایی / تایید اکثریت</option>
                                <option value="NEEDS_REVISION">فقط نیاز به اصلاح (عودت به ثبت‌کننده)</option>
                                <option value="REJECTED">فقط رد شده / مختومه</option>
                              </select>
                            </div>
                          )}

                          <details className="pt-1">
                            <summary className="text-[10px] font-bold text-indigo-700 cursor-pointer select-none">
                              فیلترهای پیشرفته (نوع پروژه / سمت اقدام‌کننده)
                            </summary>
                            <div className="pt-2 space-y-2">
                              <select
                                value={rule.projectTypeId || ''}
                                onChange={(e) => updateRule({ projectTypeId: e.target.value || null })}
                                className="w-full rounded-lg bg-white border border-slate-300 px-2 py-1 text-[11px] text-slate-800"
                              >
                                <option value="">همه انواع پروژه</option>
                                {loadedProjectTypes.map((pt) => (
                                  <option key={pt.id} value={pt.id}>
                                    نوع پروژه: {pt.title}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={rule.actorPositionId || ''}
                                onChange={(e) => updateRule({ actorPositionId: e.target.value || null })}
                                className="w-full rounded-lg bg-white border border-slate-300 px-2 py-1 text-[11px] text-slate-800"
                              >
                                <option value="">همه سمت‌های اقدام‌کننده</option>
                                {positions.map((pos) => (
                                  <option key={pos.id} value={pos.id}>
                                    فقط اگر اقدام‌کننده سمت «{pos.title}» داشت
                                  </option>
                                ))}
                              </select>
                            </div>
                          </details>
                        </div>

                        {/* 3. Recipients */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                          <span className="block text-[11px] font-black text-slate-800">
                            ۳. گیرندگان اطلاع‌رسانی (چندانتخابی):
                          </span>
                          <div className="grid grid-cols-1 gap-1.5">
                            {(
                              [
                                { mode: 'PROJECT_CREATOR' as WorkflowNotificationRecipientMode, label: 'ثبت‌کننده اولیه پروژه' },
                                { mode: 'CURRENT_STEP_ASSIGNEES' as WorkflowNotificationRecipientMode, label: 'اعضا / سمت‌های مرحله فعال' },
                                { mode: 'ACTOR' as WorkflowNotificationRecipientMode, label: 'کاربر انجام‌دهنده اقدام فعلی' },
                                { mode: 'WORKFLOW_PARTICIPANTS' as WorkflowNotificationRecipientMode, label: 'تمامی مشارکت‌کنندگان پرونده' },
                                { mode: 'SPECIFIC_POSITIONS' as WorkflowNotificationRecipientMode, label: 'سمت‌های سازمانی دلخواه' },
                                { mode: 'SPECIFIC_USERS' as WorkflowNotificationRecipientMode, label: 'کاربران مشخص (شخصی)' },
                                { mode: 'ALL_ADMINS' as WorkflowNotificationRecipientMode, label: 'تمامی مدیران ارشد سامانه' },
                                { mode: 'ALL_COUNCIL' as WorkflowNotificationRecipientMode, label: 'تمامی اعضای شورا' },
                                { mode: 'CUSTOM_PHONES' as WorkflowNotificationRecipientMode, label: 'شماره موبایل دلخواه (فقط پیامک)' },
                              ] as const
                            ).map((opt) => (
                              <label
                                key={opt.mode}
                                className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-800 cursor-pointer hover:border-sky-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={rule.recipientModes.includes(opt.mode)}
                                  onChange={() => toggleRecipientMode(opt.mode)}
                                  className="rounded text-sky-600"
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </div>

                          {rule.recipientModes.includes('SPECIFIC_POSITIONS') && (
                            <div className="p-2.5 rounded-lg bg-white border border-sky-200 space-y-2">
                              <select
                                value={rule.targetStructureId || ''}
                                onChange={(e) =>
                                  updateRule({ targetStructureId: e.target.value || null })
                                }
                                className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-800"
                              >
                                <option value="">همه ساختارها (و سمت اصلی کاربران)</option>
                                {structures.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    فقط ساختار: {s.title}
                                  </option>
                                ))}
                              </select>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {notifCandidatePositions.map((p) => (
                                  <label
                                    key={p.id}
                                    className="flex items-center gap-1.5 text-[11px] text-slate-800 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(rule.targetPositionIds || []).includes(p.id)}
                                      onChange={() => toggleTargetPosition(p.id)}
                                      className="rounded text-sky-600"
                                    />
                                    <span className="truncate">{p.title}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {rule.recipientModes.includes('SPECIFIC_USERS') && (
                            <div className="p-2.5 rounded-lg bg-white border border-sky-200 max-h-36 overflow-y-auto space-y-1">
                              {users.map((u) => (
                                <label
                                  key={u.id}
                                  className="flex items-center gap-1.5 text-[11px] text-slate-800 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(rule.targetUserIds || []).includes(u.id)}
                                    onChange={() => toggleTargetUser(u.id)}
                                    className="rounded text-sky-600"
                                  />
                                  <span className="truncate">
                                    {u.name} (@{u.username})
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}

                          {rule.recipientModes.includes('CUSTOM_PHONES') && (
                            <div className="p-2 rounded-lg bg-white border border-emerald-200 space-y-1">
                              <label className="block text-[10px] font-bold text-emerald-900">
                                شماره‌های موبایل دلخواه (با ویرگول یا خط جدید جدا کنید):
                              </label>
                              <textarea
                                rows={2}
                                dir="ltr"
                                value={(rule.customPhones || []).join(', ')}
                                onChange={(e) =>
                                  updateRule({
                                    customPhones: e.target.value
                                      .split(/[,;\n\s]+/)
                                      .map((p) => p.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="09120000000, 09350000000"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-900"
                              />
                            </div>
                          )}
                        </div>

                        {/* 4. Message & Title Templates */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <span className="block text-[11px] font-black text-slate-800">
                            ۴. عنوان و متن دلخواه اطلاع‌رسانی:
                          </span>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              عنوان اعلان (در پوش و کارتابل):
                            </label>
                            <input
                              type="text"
                              value={rule.titleTemplate ?? rule.title}
                              onChange={(e) => updateRule({ titleTemplate: e.target.value })}
                              placeholder="مثلاً: نتیجه بررسی {project_title}"
                              className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              متن اصلی پیام (مشترک برای همه روش‌های انتخاب‌شده):
                            </label>
                            <textarea
                              rows={3}
                              value={rule.messageTemplate}
                              onChange={(e) => updateRule({ messageTemplate: e.target.value })}
                              placeholder="متن پیام دلخواه خود را بنویسید..."
                              className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 leading-relaxed"
                            />
                          </div>

                          <div>
                            <span className="block text-[10px] font-bold text-slate-500 mb-1">
                              درج متغیر پویا با کلیک در متن:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {NOTIF_TEMPLATE_VARS.map((v) => (
                                <button
                                  key={v.token}
                                  type="button"
                                  onClick={() =>
                                    updateRule({
                                      messageTemplate: `${rule.messageTemplate}${rule.messageTemplate ? ' ' : ''}${v.token}`,
                                    })
                                  }
                                  className="px-1.5 py-0.5 rounded bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[9px] font-bold text-slate-700 cursor-pointer"
                                  title={v.token}
                                >
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <details className="pt-1">
                            <summary className="text-[10px] font-bold text-sky-700 cursor-pointer select-none">
                              سفارشی‌سازی جداگانه متن هر کانال (اختیاری)
                            </summary>
                            <div className="pt-2 space-y-2">
                              {rule.channels.includes('PUSH') && (
                                <div>
                                  <label className="block text-[10px] font-bold text-indigo-800 mb-0.5">
                                    متن اختصاصی پوش نوتیفیکیشن:
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={rule.pushTemplate || ''}
                                    onChange={(e) => updateRule({ pushTemplate: e.target.value })}
                                    placeholder="خالی = استفاده از متن اصلی"
                                    className="w-full rounded bg-white border border-indigo-200 px-2 py-1 text-[11px]"
                                  />
                                </div>
                              )}
                              {rule.channels.includes('SMS') && (
                                <div>
                                  <label className="block text-[10px] font-bold text-emerald-800 mb-0.5">
                                    متن اختصاصی پیامک:
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={rule.smsTemplate || ''}
                                    onChange={(e) => updateRule({ smsTemplate: e.target.value })}
                                    placeholder="خالی = استفاده از متن اصلی"
                                    className="w-full rounded bg-white border border-emerald-200 px-2 py-1 text-[11px]"
                                  />
                                </div>
                              )}
                              {rule.channels.includes('CARTABLE') && (
                                <div>
                                  <label className="block text-[10px] font-bold text-amber-800 mb-0.5">
                                    متن اختصاصی اعلان کارتابل:
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={rule.cartableTemplate || ''}
                                    onChange={(e) => updateRule({ cartableTemplate: e.target.value })}
                                    placeholder="خالی = استفاده از متن اصلی"
                                    className="w-full rounded bg-white border border-amber-200 px-2 py-1 text-[11px]"
                                  />
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </aside>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
