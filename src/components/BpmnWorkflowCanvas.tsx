import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { WorkflowActionKey, WorkflowDiagramLayout, WorkflowStepConfig } from '../types';
import {
  Play,
  Flag,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Users,
  Trash2,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Plus,
  Clock,
  UserCheck,
  Maximize2,
  Grid,
  Spline,
  CornerUpRight,
  Diamond,
  Map as MapIcon,
  LogOut,
  Zap,
  Bell,
  Inbox,
  MessageSquareText,
} from 'lucide-react';
import type { WorkflowNotificationRule } from '../types';

export interface BpmnEditableStep {
  id?: string;
  localKey: string;
  title: string;
  structureId?: string | null;
  positionIds: string[];
  description?: string;
  config: WorkflowStepConfig;
}

export type BpmnBranchKind = 'approve' | 'revision' | 'reject';

export type BpmnConnectTarget =
  | { kind: 'step'; stepOrder: number }
  | { kind: 'creator' }
  | { kind: 'end_approved' }
  | { kind: 'end_rejected' };

export type BpmnSelection =
  | { kind: 'start' }
  | { kind: 'step'; idx: number }
  | { kind: 'gateway'; idx: number }
  | { kind: 'creator_return' }
  | { kind: 'end_approved' }
  | { kind: 'end_rejected' }
  | { kind: 'notification'; notifId: string };

export type BpmnDragPayload =
  | { kind: 'step-reorder'; fromIndex: number }
  | { kind: 'toolbox-position'; structureId: string | null; positionId: string; title: string }
  | { kind: 'toolbox-creator' }
  | { kind: 'toolbox-gateway' }
  | { kind: 'toolbox-notification' };

interface BpmnWorkflowCanvasProps {
  steps: BpmnEditableStep[];
  selectedStepIdx: number;
  selection?: BpmnSelection;
  diagram: WorkflowDiagramLayout;
  onSelectStep: (idx: number) => void;
  onSelectElement?: (sel: BpmnSelection) => void;
  onDiagramChange: (next: WorkflowDiagramLayout) => void;
  onUpdateStepPos: (idx: number, pos: { x: number; y: number }) => void;
  onUpdateStepConfig?: (idx: number, patch: Partial<WorkflowStepConfig>) => void;
  onConnectBranch: (
    fromIdx: number,
    branch: BpmnBranchKind,
    target: BpmnConnectTarget
  ) => void;
  onDeleteStep: (idx: number) => void;
  onAddBlankStepAt: (pos?: { x: number; y: number }, mode?: 'POSITIONS' | 'CREATOR') => void;
  onAutoLayout: () => void;
  getPositionTitle: (posId: string, structureId?: string | null) => string;
  getStepAssigneeCount: (step: BpmnEditableStep) => number;
  dragPayload: BpmnDragPayload | null;
  onDropPositionAtCanvas: (
    positionId: string,
    title: string,
    pos: { x: number; y: number }
  ) => void;
  onDropPositionOnStep: (stepIdx: number, positionId: string) => void;
  onDropNotificationAt?: (opts: {
    pos?: { x: number; y: number };
    triggerEvent: WorkflowNotificationRule['triggerEvent'];
    sourceStepOrder?: number | null;
    branchCondition?: WorkflowNotificationRule['branchCondition'];
    endOutcomeCondition?: WorkflowNotificationRule['endOutcomeCondition'];
  }) => void;
  onDeleteNotification?: (notifId: string) => void;
  onClearDrag: () => void;
}

const NODE_W = 248;
const NODE_H = 152;
const GW_SIZE = 72;
const CIRCLE_SIZE = 74;
const CREATOR_W = 168;
const CREATOR_H = 68;
const NOTIF_W = 224;
const NOTIF_H = 104;
const GRID_STEP = 20;

export function getDefaultNodePosition(idx: number): { x: number; y: number } {
  return {
    x: 220 + idx * 400,
    y: 180,
  };
}

export function getDefaultGatewayPosition(stepPos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: stepPos.x + NODE_W + 64,
    y: stepPos.y + Math.round((NODE_H - GW_SIZE) / 2),
  };
}

export function getDefaultDiagramLayout(stepCount: number): WorkflowDiagramLayout {
  const endX = Math.max(760, 220 + Math.max(1, stepCount) * 400 + 20);
  return {
    startPos: { x: 60, y: 218 },
    creatorPos: { x: 220, y: 420 },
    endApprovedPos: { x: endX, y: 120 },
    endRejectedPos: { x: endX, y: 340 },
    connectorStyle: 'ORTHOGONAL',
    snapToGrid: true,
    startTrigger: { event: 'PROJECT_CREATED' },
  };
}

function getEffectiveBranchMode(
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

function modeShortLabel(mode: string | undefined): string {
  if (mode === 'MAJORITY') return 'اکثریت';
  if (mode === 'ALL') return 'اجماع';
  if (mode === 'NOTIFY_ONLY') return 'اطلاع';
  return '۱ نفر';
}

function startTriggerLabel(trigger?: WorkflowDiagramLayout['startTrigger']): string {
  if (!trigger || trigger.event === 'PROJECT_CREATED') return 'ثبت پروژه جدید';
  if (trigger.event === 'PROJECT_APPROVED') return 'پس از تایید پروژه';
  return 'انتخاب دستی';
}

function snapCoord(val: number, enabled: boolean): number {
  if (!enabled) return Math.round(val);
  return Math.round(val / GRID_STEP) * GRID_STEP;
}

function buildRoundedOrthogonalPath(pts: Array<{ x: number; y: number }>, radius = 8) {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  const cmds: string[] = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];
    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;
    const d1 = Math.hypot(v1x, v1y);
    const d2 = Math.hypot(v2x, v2y);
    if (d1 < 1 || d2 < 1) {
      cmds.push(`L ${pCurr.x} ${pCurr.y}`);
      continue;
    }
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const ax = pCurr.x - (v1x / d1) * r;
    const ay = pCurr.y - (v1y / d1) * r;
    const bx = pCurr.x + (v2x / d2) * r;
    const by = pCurr.y + (v2y / d2) * r;
    cmds.push(`L ${ax} ${ay}`);
    cmds.push(`Q ${pCurr.x} ${pCurr.y} ${bx} ${by}`);
  }
  const last = pts[pts.length - 1];
  cmds.push(`L ${last.x} ${last.y}`);
  return cmds.join(' ');
}

export const BpmnWorkflowCanvas: React.FC<BpmnWorkflowCanvasProps> = ({
  steps,
  selectedStepIdx,
  selection,
  diagram,
  onSelectStep,
  onSelectElement,
  onDiagramChange,
  onUpdateStepPos,
  onUpdateStepConfig,
  onConnectBranch,
  onDeleteStep,
  onAddBlankStepAt,
  onAutoLayout,
  getPositionTitle,
  getStepAssigneeCount,
  dragPayload,
  onDropPositionAtCanvas,
  onDropPositionOnStep,
  onDropNotificationAt,
  onDeleteNotification,
  onClearDrag,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(0.95);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [isPanning, setIsPanning] = useState<{
    startClientX: number;
    startClientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const [connecting, setConnecting] = useState<{
    fromIdx: number;
    branch: BpmnBranchKind;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [hoverTargetKey, setHoverTargetKey] = useState<string | null>(null);
  const [hoverDropStepIdx, setHoverDropStepIdx] = useState<number | null>(null);
  const [isCanvasDropActive, setIsCanvasDropActive] = useState(false);

  const [draggingNode, setDraggingNode] = useState<{
    target:
      | { kind: 'start' }
      | { kind: 'creator' }
      | { kind: 'end_approved' }
      | { kind: 'end_rejected' }
      | { kind: 'step'; idx: number }
      | { kind: 'gateway'; idx: number }
      | { kind: 'notification'; notifId: string };
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const activeSelection: BpmnSelection = selection || { kind: 'step', idx: selectedStepIdx };
  const snapEnabled = diagram.snapToGrid !== false;
  const connectorStyle = diagram.connectorStyle || 'ORTHOGONAL';

  const selectEl = useCallback(
    (sel: BpmnSelection) => {
      if (sel.kind === 'step' || sel.kind === 'gateway') {
        onSelectStep(sel.idx);
      }
      if (onSelectElement) {
        onSelectElement(sel);
      }
    },
    [onSelectElement, onSelectStep]
  );

  const defaultLayout = getDefaultDiagramLayout(steps.length);
  const startPos = diagram.startPos || defaultLayout.startPos!;
  const creatorPos = diagram.creatorPos || defaultLayout.creatorPos!;
  const endApprovedPos = diagram.endApprovedPos || defaultLayout.endApprovedPos!;
  const endRejectedPos = diagram.endRejectedPos || defaultLayout.endRejectedPos!;

  const getStepPos = useCallback(
    (idx: number) => steps[idx]?.config?.nodePosition || getDefaultNodePosition(idx),
    [steps]
  );

  const getGatewayPos = useCallback(
    (idx: number) => {
      const sPos = getStepPos(idx);
      return steps[idx]?.config?.gatewayPos || getDefaultGatewayPosition(sPos);
    },
    [steps, getStepPos]
  );

  const stepHasGateway = useCallback((idx: number) => {
    const cfg = steps[idx]?.config;
    if (!cfg) return true;
    return cfg.hasGateway !== false;
  }, [steps]);

  const getAllowedActions = useCallback((idx: number): WorkflowActionKey[] => {
    const cfg = steps[idx]?.config;
    if (Array.isArray(cfg?.allowedActions) && cfg.allowedActions.length > 0) {
      return cfg.allowedActions;
    }
    return ['APPROVE', 'REVISION', 'REJECT'];
  }, [steps]);

  const notificationsList = useMemo(
    () => (Array.isArray(diagram.notifications) ? diagram.notifications : []),
    [diagram.notifications]
  );

  const getNotificationPos = useCallback(
    (rule: WorkflowNotificationRule, idx: number): { x: number; y: number } => {
      if (rule.pos && typeof rule.pos.x === 'number' && typeof rule.pos.y === 'number') {
        return rule.pos;
      }
      const stepIdx =
        rule.sourceStepOrder && rule.sourceStepOrder >= 1 && rule.sourceStepOrder <= steps.length
          ? rule.sourceStepOrder - 1
          : -1;
      if (rule.triggerEvent === 'ON_WORKFLOW_START') {
        return { x: startPos.x, y: startPos.y + CIRCLE_SIZE + 80 + idx * 24 };
      }
      if (rule.triggerEvent === 'ON_STEP_ENTER' || rule.triggerEvent === 'ON_STEP_VOTE') {
        if (stepIdx >= 0) {
          const sp = getStepPos(stepIdx);
          return { x: sp.x + 12, y: Math.max(20, sp.y - NOTIF_H - 56) };
        }
        return { x: 220 + idx * 40, y: 40 };
      }
      if (rule.triggerEvent === 'ON_GATEWAY_OUTCOME') {
        if (stepIdx >= 0) {
          const gp = getGatewayPos(stepIdx);
          return { x: gp.x - 40, y: Math.max(20, gp.y - NOTIF_H - 64) };
        }
        return { x: 420 + idx * 40, y: 40 };
      }
      if (rule.endOutcomeCondition === 'APPROVED') {
        return { x: endApprovedPos.x - 40, y: Math.max(20, endApprovedPos.y - NOTIF_H - 36) };
      }
      if (rule.endOutcomeCondition === 'REJECTED') {
        return { x: endRejectedPos.x - 40, y: endRejectedPos.y + CIRCLE_SIZE + 44 };
      }
      if (rule.endOutcomeCondition === 'NEEDS_REVISION') {
        return { x: creatorPos.x, y: creatorPos.y + CREATOR_H + 44 };
      }
      return { x: endApprovedPos.x - 40, y: endApprovedPos.y + CIRCLE_SIZE + 44 + idx * 24 };
    },
    [steps.length, startPos, creatorPos, endApprovedPos, endRejectedPos, getStepPos, getGatewayPos]
  );

  const canvasDimensions = useMemo(() => {
    let maxX = Math.max(
      1440,
      startPos.x + 260,
      creatorPos.x + CREATOR_W + 220,
      endApprovedPos.x + 240,
      endRejectedPos.x + 240
    );
    let maxY = Math.max(
      760,
      startPos.y + 240,
      creatorPos.y + CREATOR_H + 200,
      endApprovedPos.y + 220,
      endRejectedPos.y + 220
    );
    steps.forEach((_, idx) => {
      const p = getStepPos(idx);
      const gp = getGatewayPos(idx);
      maxX = Math.max(maxX, p.x + NODE_W + 260, gp.x + GW_SIZE + 220);
      maxY = Math.max(maxY, p.y + NODE_H + 240, gp.y + GW_SIZE + 220);
    });
    notificationsList.forEach((rule, idx) => {
      const np = getNotificationPos(rule, idx);
      maxX = Math.max(maxX, np.x + NOTIF_W + 180);
      maxY = Math.max(maxY, np.y + NOTIF_H + 180);
    });
    return { width: maxX, height: maxY };
  }, [steps, notificationsList, startPos, creatorPos, endApprovedPos, endRejectedPos, getStepPos, getGatewayPos, getNotificationPos]);

  const handleFitToScreen = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let contentMaxX = Math.max(startPos.x + CIRCLE_SIZE, endApprovedPos.x + CIRCLE_SIZE, endRejectedPos.x + CIRCLE_SIZE);
    let contentMaxY = Math.max(startPos.y + CIRCLE_SIZE, creatorPos.y + CREATOR_H, endRejectedPos.y + CIRCLE_SIZE);
    steps.forEach((_, idx) => {
      const p = getStepPos(idx);
      contentMaxX = Math.max(contentMaxX, p.x + NODE_W + 120);
      contentMaxY = Math.max(contentMaxY, p.y + NODE_H + 80);
      if (stepHasGateway(idx)) {
        const g = getGatewayPos(idx);
        contentMaxX = Math.max(contentMaxX, g.x + GW_SIZE + 80);
        contentMaxY = Math.max(contentMaxY, g.y + GW_SIZE + 80);
      }
    });
    notificationsList.forEach((rule, idx) => {
      const np = getNotificationPos(rule, idx);
      contentMaxX = Math.max(contentMaxX, np.x + NOTIF_W + 60);
      contentMaxY = Math.max(contentMaxY, np.y + NOTIF_H + 60);
    });
    const wRatio = (vp.clientWidth - 48) / Math.max(400, contentMaxX);
    const hRatio = (vp.clientHeight - 48) / Math.max(320, contentMaxY);
    const fitted = Math.max(0.4, Math.min(1.15, Number(Math.min(wRatio, hRatio).toFixed(2))));
    setZoom(fitted);
    vp.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }, [steps, notificationsList, startPos, creatorPos, endApprovedPos, endRejectedPos, getStepPos, getGatewayPos, getNotificationPos, stepHasGateway]);

  // Keyboard Delete shortcut for selected step / gateway / notification
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape' && connecting) {
        setConnecting(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeSelection.kind === 'notification' && onDeleteNotification) {
          e.preventDefault();
          onDeleteNotification(activeSelection.notifId);
        } else if (activeSelection.kind === 'step' && steps.length > 1) {
          e.preventDefault();
          onDeleteStep(activeSelection.idx);
        } else if (activeSelection.kind === 'gateway' && onUpdateStepConfig) {
          e.preventDefault();
          onUpdateStepConfig(activeSelection.idx, { hasGateway: false });
          selectEl({ kind: 'step', idx: activeSelection.idx });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSelection, steps.length, connecting, onDeleteStep, onDeleteNotification, onUpdateStepConfig, selectEl]);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 200, y: 200 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(20, Math.round((clientX - rect.left) / zoom)),
      y: Math.max(20, Math.round((clientY - rect.top) / zoom)),
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (isPanning && viewportRef.current) {
      const dx = e.clientX - isPanning.startClientX;
      const dy = e.clientY - isPanning.startClientY;
      viewportRef.current.scrollLeft = isPanning.scrollLeft - dx;
      viewportRef.current.scrollTop = isPanning.scrollTop - dy;
      return;
    }

    if (draggingNode) {
      const pt = toCanvasCoords(e.clientX, e.clientY);
      const rawX = pt.x - draggingNode.offsetX;
      const rawY = pt.y - draggingNode.offsetY;
      const nextPos = {
        x: snapCoord(Math.max(20, Math.min(canvasDimensions.width - 140, rawX)), snapEnabled),
        y: snapCoord(Math.max(20, Math.min(canvasDimensions.height - 110, rawY)), snapEnabled),
      };
      if (draggingNode.target.kind === 'start') {
        onDiagramChange({ ...diagram, startPos: nextPos });
      } else if (draggingNode.target.kind === 'creator') {
        onDiagramChange({ ...diagram, creatorPos: nextPos });
      } else if (draggingNode.target.kind === 'end_approved') {
        onDiagramChange({ ...diagram, endApprovedPos: nextPos });
      } else if (draggingNode.target.kind === 'end_rejected') {
        onDiagramChange({ ...diagram, endRejectedPos: nextPos });
      } else if (draggingNode.target.kind === 'notification') {
        const targetId = draggingNode.target.notifId;
        onDiagramChange({
          ...diagram,
          notifications: notificationsList.map((n) =>
            n.id === targetId ? { ...n, pos: nextPos } : n
          ),
        });
      } else if (draggingNode.target.kind === 'gateway') {
        if (onUpdateStepConfig) {
          onUpdateStepConfig(draggingNode.target.idx, { gatewayPos: nextPos });
        }
      } else {
        const oldStepPos = getStepPos(draggingNode.target.idx);
        const dx = nextPos.x - oldStepPos.x;
        const dy = nextPos.y - oldStepPos.y;
        onUpdateStepPos(draggingNode.target.idx, nextPos);
        // Move attached gateway together if it had custom gatewayPos
        const stCfg = steps[draggingNode.target.idx]?.config;
        if (stCfg?.gatewayPos && onUpdateStepConfig) {
          onUpdateStepConfig(draggingNode.target.idx, {
            nodePosition: nextPos,
            gatewayPos: {
              x: stCfg.gatewayPos.x + dx,
              y: stCfg.gatewayPos.y + dy,
            },
          });
        }
      }
      return;
    }

    if (connecting) {
      const pt = toCanvasCoords(e.clientX, e.clientY);
      setConnecting((prev) => (prev ? { ...prev, mouseX: pt.x, mouseY: pt.y } : null));
    }
  };

  const handleCanvasPointerUp = () => {
    if (draggingNode) setDraggingNode(null);
    if (isPanning) setIsPanning(null);
  };

  const startDragNode = (
    e: React.PointerEvent,
    target:
      | { kind: 'start' }
      | { kind: 'creator' }
      | { kind: 'end_approved' }
      | { kind: 'end_rejected' }
      | { kind: 'step'; idx: number }
      | { kind: 'gateway'; idx: number }
      | { kind: 'notification'; notifId: string },
    currentPos: { x: number; y: number }
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const pt = toCanvasCoords(e.clientX, e.clientY);
    setDraggingNode({
      target,
      offsetX: pt.x - currentPos.x,
      offsetY: pt.y - currentPos.y,
    });
  };

  type ResolvedTarget =
    | { kind: 'step'; idx: number }
    | { kind: 'creator' }
    | { kind: 'end_approved' }
    | { kind: 'end_rejected' };

  const resolveOutgoingTargets = useCallback((idx: number) => {
    const step = steps[idx];
    const cfg = step?.config || {};
    const stepOrder = idx + 1;

    let approveTarget: ResolvedTarget;
    if (cfg.approveTarget === 'END_APPROVED') {
      approveTarget = { kind: 'end_approved' };
    } else if (
      cfg.approveTarget === 'CUSTOM_STEP' &&
      cfg.onApproveStepOrder &&
      cfg.onApproveStepOrder >= 1 &&
      cfg.onApproveStepOrder <= steps.length
    ) {
      approveTarget = { kind: 'step', idx: cfg.onApproveStepOrder - 1 };
    } else if (idx < steps.length - 1) {
      approveTarget = { kind: 'step', idx: idx + 1 };
    } else {
      approveTarget = { kind: 'end_approved' };
    }

    const revRule = cfg.onRevisionAction || cfg.onRejectAction || 'RETURN_PREV';
    const revStepOrd = cfg.onRevisionStepOrder ?? cfg.onRejectStepOrder;
    let revisionTarget: ResolvedTarget;
    if (revRule === 'REJECT_PROJECT') {
      revisionTarget = { kind: 'end_rejected' };
    } else if (revRule === 'RETURN_CREATOR') {
      revisionTarget = { kind: 'creator' };
    } else if (revRule === 'RETURN_STEP_1') {
      revisionTarget = { kind: 'step', idx: 0 };
    } else if (revRule === 'CUSTOM_STEP' && revStepOrd && revStepOrd >= 1 && revStepOrd <= steps.length) {
      revisionTarget = { kind: 'step', idx: revStepOrd - 1 };
    } else {
      revisionTarget = { kind: 'step', idx: Math.max(0, stepOrder - 2) };
    }

    const rejectRule =
      cfg.onRevisionAction !== undefined
        ? cfg.onRejectAction || 'REJECT_PROJECT'
        : cfg.onRejectAction === 'RETURN_CREATOR' ||
          cfg.onRejectAction === 'RETURN_STEP_1' ||
          cfg.onRejectAction === 'CUSTOM_STEP'
        ? cfg.onRejectAction
        : 'REJECT_PROJECT';
    let rejectTarget: ResolvedTarget;
    if (rejectRule === 'RETURN_CREATOR') {
      rejectTarget = { kind: 'creator' };
    } else if (rejectRule === 'RETURN_STEP_1') {
      rejectTarget = { kind: 'step', idx: 0 };
    } else if (rejectRule === 'RETURN_PREV') {
      rejectTarget = { kind: 'step', idx: Math.max(0, stepOrder - 2) };
    } else if (
      rejectRule === 'CUSTOM_STEP' &&
      cfg.onRejectStepOrder &&
      cfg.onRejectStepOrder >= 1 &&
      cfg.onRejectStepOrder <= steps.length
    ) {
      rejectTarget = { kind: 'step', idx: cfg.onRejectStepOrder - 1 };
    } else {
      rejectTarget = { kind: 'end_rejected' };
    }

    return { approveTarget, revisionTarget, rejectTarget };
  }, [steps]);

  const getPortOrigin = useCallback(
    (idx: number, branch: BpmnBranchKind) => {
      if (stepHasGateway(idx)) {
        const gp = getGatewayPos(idx);
        const cx = gp.x + GW_SIZE / 2;
        const cy = gp.y + GW_SIZE / 2;
        if (branch === 'approve') return { x: gp.x + GW_SIZE, y: cy };
        if (branch === 'revision') return { x: cx, y: gp.y + GW_SIZE };
        return { x: cx, y: gp.y };
      }
      const p = getStepPos(idx);
      const offset = branch === 'approve' ? 42 : branch === 'revision' ? NODE_H / 2 : NODE_H - 36;
      return { x: p.x + NODE_W, y: p.y + offset };
    },
    [stepHasGateway, getGatewayPos, getStepPos]
  );

  const getTargetAnchor = useCallback(
    (fromPt: { x: number; y: number }, target: ResolvedTarget) => {
      if (target.kind === 'end_approved') {
        return { x: endApprovedPos.x, y: endApprovedPos.y + CIRCLE_SIZE / 2 };
      }
      if (target.kind === 'end_rejected') {
        return { x: endRejectedPos.x, y: endRejectedPos.y + CIRCLE_SIZE / 2 };
      }
      if (target.kind === 'creator') {
        return {
          x: creatorPos.x + CREATOR_W / 2,
          y: fromPt.y < creatorPos.y ? creatorPos.y : creatorPos.y + CREATOR_H,
        };
      }
      const tp = getStepPos(target.idx);
      const centerTx = tp.x + NODE_W / 2;
      const centerTy = tp.y + NODE_H / 2;
      if (fromPt.x <= tp.x + 12) return { x: tp.x, y: centerTy };
      if (fromPt.x >= tp.x + NODE_W - 12) return { x: tp.x + NODE_W, y: centerTy };
      if (fromPt.y < tp.y) return { x: centerTx, y: tp.y };
      return { x: centerTx, y: tp.y + NODE_H };
    },
    [endApprovedPos, endRejectedPos, creatorPos, getStepPos]
  );

  const buildEdgePath = useCallback(
    (
      from: { x: number; y: number },
      to: { x: number; y: number },
      branch: BpmnBranchKind | 'start' | 'task_to_gateway' | 'creator_return',
      isBackwardLoop: boolean
    ) => {
      if (branch === 'task_to_gateway') {
        const path =
          connectorStyle === 'ORTHOGONAL'
            ? buildRoundedOrthogonalPath([
                from,
                { x: Math.round((from.x + to.x) / 2), y: from.y },
                { x: Math.round((from.x + to.x) / 2), y: to.y },
                to,
              ])
            : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        return { path, midX: (from.x + to.x) / 2, midY: (from.y + to.y) / 2 };
      }

      if (connectorStyle === 'ORTHOGONAL') {
        if (branch === 'start') {
          const midX = Math.round((from.x + to.x) / 2);
          return {
            path: buildRoundedOrthogonalPath([
              from,
              { x: midX, y: from.y },
              { x: midX, y: to.y },
              to,
            ]),
            midX,
            midY: Math.round((from.y + to.y) / 2),
          };
        }

        if (branch === 'creator_return') {
          const laneX = Math.min(from.x, to.x) - 36;
          const pts = [
            from,
            { x: from.x, y: from.y - 24 },
            { x: laneX, y: from.y - 24 },
            { x: laneX, y: to.y },
            to,
          ];
          return {
            path: buildRoundedOrthogonalPath(pts),
            midX: Math.round((from.x + laneX) / 2),
            midY: from.y - 24,
          };
        }

        if (isBackwardLoop) {
          const offset = branch === 'revision' ? 68 : 104;
          const laneY = Math.max(from.y, to.y) + offset;
          const pts = [
            from,
            { x: from.x, y: laneY },
            { x: to.x, y: laneY },
            to,
          ];
          return {
            path: buildRoundedOrthogonalPath(pts),
            midX: Math.round((from.x + to.x) / 2),
            midY: laneY,
          };
        }

        // Standard forward or branch orthogonal Visio elbow
        if (branch === 'revision') {
          const dropY = from.y + 34;
          if (to.y >= from.y + 20) {
            const pts = [from, { x: from.x, y: dropY }, { x: to.x, y: dropY }, to];
            return {
              path: buildRoundedOrthogonalPath(pts),
              midX: Math.round((from.x + to.x) / 2),
              midY: dropY,
            };
          }
        }
        if (branch === 'reject') {
          const riseY = from.y - 38;
          const midX = Math.round((from.x + to.x) / 2);
          const pts = [
            from,
            { x: from.x, y: riseY },
            { x: midX, y: riseY },
            { x: midX, y: to.y },
            to,
          ];
          return {
            path: buildRoundedOrthogonalPath(pts),
            midX: Math.round((from.x + midX) / 2),
            midY: riseY,
          };
        }

        const midX =
          to.x >= from.x + 24
            ? Math.round((from.x + to.x) / 2)
            : from.x + 38;
        const pts = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
        return {
          path: buildRoundedOrthogonalPath(pts),
          midX,
          midY: Math.round((from.y + to.y) / 2),
        };
      }

      // Smooth Bezier mode
      if (branch === 'start') {
        const dx = Math.max(50, Math.abs(to.x - from.x) * 0.45);
        return {
          path: `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`,
          midX: (from.x + to.x) / 2,
          midY: (from.y + to.y) / 2,
        };
      }

      if (branch === 'creator_return') {
        const path = `M ${from.x} ${from.y} C ${from.x} ${from.y - 45}, ${to.x - 55} ${to.y}, ${to.x} ${to.y}`;
        return { path, midX: (from.x + to.x) / 2 - 16, midY: (from.y + to.y) / 2 };
      }

      if (isBackwardLoop) {
        const arcDepth = branch === 'revision' ? 75 : 108;
        const peakY = Math.max(from.y, to.y) + arcDepth;
        const path = `M ${from.x} ${from.y} C ${from.x} ${peakY}, ${to.x} ${peakY}, ${to.x} ${to.y}`;
        return {
          path,
          midX: (from.x + to.x) / 2,
          midY: 0.125 * from.y + 0.75 * peakY + 0.125 * to.y,
        };
      }

      const dropY = branch === 'approve' ? 0 : branch === 'revision' ? 42 : -42;
      const c1x = from.x + (branch === 'approve' ? 60 : 20);
      const c1y = from.y + dropY;
      const c2x = to.x - (to.x > from.x ? 55 : -55);
      const c2y = to.y;
      return {
        path: `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`,
        midX: 0.125 * from.x + 0.375 * c1x + 0.375 * c2x + 0.125 * to.x,
        midY: 0.125 * from.y + 0.375 * c1y + 0.375 * c2y + 0.125 * to.y,
      };
    },
    [connectorStyle]
  );

  const completeConnection = (target: BpmnConnectTarget) => {
    if (!connecting) return;
    if (
      connecting.branch === 'approve' &&
      (target.kind === 'end_rejected' || target.kind === 'creator')
    ) {
      setConnecting(null);
      setHoverTargetKey(null);
      return;
    }
    if ((connecting.branch === 'revision' || connecting.branch === 'reject') && target.kind === 'end_approved') {
      setConnecting(null);
      setHoverTargetKey(null);
      return;
    }
    onConnectBranch(connecting.fromIdx, connecting.branch, target);
    setConnecting(null);
    setHoverTargetKey(null);
  };

  const hasAnyCreatorReturnRoute = useMemo(() => {
    return steps.some((st) => {
      const cfg = st.config || {};
      return cfg.onRevisionAction === 'RETURN_CREATOR' || cfg.onRejectAction === 'RETURN_CREATOR';
    });
  }, [steps]);

  const edges = useMemo(() => {
    const list: Array<{
      id: string;
      fromIdx: number;
      selectTarget: BpmnSelection;
      branch: BpmnBranchKind | 'start' | 'task_to_gateway' | 'creator_return';
      label: string;
      color: string;
      badgeBg: string;
      badgeBorder: string;
      badgeText: string;
      markerId: string;
      path: string;
      midX: number;
      midY: number;
      isDashed?: boolean;
    }> = [];

    if (steps.length > 0) {
      const sFrom = { x: startPos.x + CIRCLE_SIZE, y: startPos.y + CIRCLE_SIZE / 2 };
      const sTo = getTargetAnchor(sFrom, { kind: 'step', idx: 0 });
      const { path, midX, midY } = buildEdgePath(sFrom, sTo, 'start', false);
      list.push({
        id: 'edge-start',
        fromIdx: 0,
        selectTarget: { kind: 'start' },
        branch: 'start',
        label: startTriggerLabel(diagram.startTrigger),
        color: '#4f46e5',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        badgeText: '#3730a3',
        markerId: 'arrow-start',
        path,
        midX,
        midY,
      });

      if (hasAnyCreatorReturnRoute) {
        const cFrom = { x: creatorPos.x + CREATOR_W / 2, y: creatorPos.y };
        const step0 = getStepPos(0);
        const cTo = { x: step0.x, y: step0.y + NODE_H * 0.72 };
        const { path: cPath, midX: cMidX, midY: cMidY } = buildEdgePath(
          cFrom,
          cTo,
          'creator_return',
          false
        );
        list.push({
          id: 'edge-creator-return',
          fromIdx: 0,
          selectTarget: { kind: 'creator_return' },
          branch: 'creator_return',
          label: 'ارسال مجدد اصلاحات',
          color: '#0d9488',
          badgeBg: '#f0fdfa',
          badgeBorder: '#99f6e4',
          badgeText: '#115e59',
          markerId: 'arrow-creator',
          path: cPath,
          midX: cMidX,
          midY: cMidY,
          isDashed: true,
        });
      }
    }

    steps.forEach((st, idx) => {
      const cfg = st.config || {};
      const allowed = getAllowedActions(idx);
      const hasGw = stepHasGateway(idx);
      const sPos = getStepPos(idx);
      const gPos = getGatewayPos(idx);

      if (hasGw) {
        const tFrom = { x: sPos.x + NODE_W, y: sPos.y + Math.round(NODE_H / 2) };
        const gTo = { x: gPos.x, y: gPos.y + Math.round(GW_SIZE / 2) };
        const { path, midX, midY } = buildEdgePath(tFrom, gTo, 'task_to_gateway', false);
        list.push({
          id: `edge-${idx}-gw`,
          fromIdx: idx,
          selectTarget: { kind: 'gateway', idx },
          branch: 'task_to_gateway',
          label: '',
          color: '#64748b',
          badgeBg: '#f8fafc',
          badgeBorder: '#cbd5e1',
          badgeText: '#334155',
          markerId: 'arrow-neutral',
          path,
          midX,
          midY,
        });
      }

      const { approveTarget, revisionTarget, rejectTarget } = resolveOutgoingTargets(idx);
      const revMode = getEffectiveBranchMode(cfg.revisionMode, cfg.approvalMode, 'revision');
      const rejMode = getEffectiveBranchMode(cfg.rejectMode, cfg.approvalMode, 'reject');
      const targetSel: BpmnSelection = hasGw ? { kind: 'gateway', idx } : { kind: 'step', idx };

      if (allowed.includes('APPROVE')) {
        const from = getPortOrigin(idx, 'approve');
        const to = getTargetAnchor(from, approveTarget);
        const isBack = approveTarget.kind === 'step' && approveTarget.idx <= idx;
        const { path, midX, midY } = buildEdgePath(from, to, 'approve', isBack);
        const customLbl = cfg.actionLabels?.APPROVE?.trim();
        const baseLbl = customLbl || (approveTarget.kind === 'end_approved' ? 'تایید نهایی' : 'تایید');
        const waitSuffix = cfg.approveBehavior === 'RECORD_AND_WAIT' ? ' · ثبت و صبر' : '';
        list.push({
          id: `edge-${idx}-approve`,
          fromIdx: idx,
          selectTarget: targetSel,
          branch: 'approve',
          label:
            cfg.assigneeMode === 'CREATOR' && !hasGw
              ? baseLbl
              : `${baseLbl} (${modeShortLabel(cfg.approvalMode)})${waitSuffix}`,
          color: '#059669',
          badgeBg: '#ecfdf5',
          badgeBorder: '#a7f3d0',
          badgeText: '#065f46',
          markerId: 'arrow-approve',
          path,
          midX,
          midY,
        });
      }

      if (allowed.includes('REVISION')) {
        const from = getPortOrigin(idx, 'revision');
        const to = getTargetAnchor(from, revisionTarget);
        const isBack =
          revisionTarget.kind === 'creator' ||
          (revisionTarget.kind === 'step' && revisionTarget.idx <= idx);
        const { path, midX, midY } = buildEdgePath(from, to, 'revision', isBack);
        const customLbl = cfg.actionLabels?.REVISION?.trim();
        const revLbl =
          customLbl ||
          (revisionTarget.kind === 'creator'
            ? `اصلاح ← ${cfg.returnCreatorTaskTitle || 'نیاز به اصلاح'}`
            : revisionTarget.kind === 'end_rejected'
            ? 'اصلاح ← رد'
            : 'اصلاح');
        const waitSuffix = cfg.revisionBehavior === 'RECORD_AND_WAIT' ? ' · ثبت و صبر' : '';
        list.push({
          id: `edge-${idx}-revision`,
          fromIdx: idx,
          selectTarget: targetSel,
          branch: 'revision',
          label: `${revLbl} (${modeShortLabel(revMode)})${waitSuffix}`,
          color: '#d97706',
          badgeBg: '#fffbeb',
          badgeBorder: '#fde68a',
          badgeText: '#92400e',
          markerId: 'arrow-revision',
          path,
          midX,
          midY,
          isDashed: true,
        });
      }

      if (allowed.includes('REJECT')) {
        const from = getPortOrigin(idx, 'reject');
        const to = getTargetAnchor(from, rejectTarget);
        const isBack =
          rejectTarget.kind === 'creator' ||
          (rejectTarget.kind === 'step' && rejectTarget.idx <= idx);
        const { path, midX, midY } = buildEdgePath(from, to, 'reject', isBack);
        const customLbl = cfg.actionLabels?.REJECT?.trim();
        const rejLbl =
          customLbl ||
          (rejectTarget.kind === 'end_rejected'
            ? 'رد اکثریت / خاتمه'
            : rejectTarget.kind === 'creator'
            ? 'رد ← ثبت‌کننده'
            : 'رد ← گام');
        const waitSuffix = cfg.rejectBehavior === 'RECORD_AND_WAIT' ? ' · ثبت و صبر' : '';
        list.push({
          id: `edge-${idx}-reject`,
          fromIdx: idx,
          selectTarget: targetSel,
          branch: 'reject',
          label: `${rejLbl} (${modeShortLabel(rejMode)})${waitSuffix}`,
          color: '#e11d48',
          badgeBg: '#fff1f2',
          badgeBorder: '#fecdd3',
          badgeText: '#9f1239',
          markerId: 'arrow-reject',
          path,
          midX,
          midY,
          isDashed: true,
        });
      }
    });

    return list;
  }, [
    steps,
    startPos,
    creatorPos,
    diagram.startTrigger,
    hasAnyCreatorReturnRoute,
    getAllowedActions,
    stepHasGateway,
    getStepPos,
    getGatewayPos,
    resolveOutgoingTargets,
    getPortOrigin,
    getTargetAnchor,
    buildEdgePath,
  ]);

  const notifEdges = useMemo(() => {
    return notificationsList.map((rule, idx) => {
      const nPos = getNotificationPos(rule, idx);
      const nCenter = { x: nPos.x + NOTIF_W / 2, y: nPos.y + NOTIF_H / 2 };
      const stepIdx =
        rule.sourceStepOrder && rule.sourceStepOrder >= 1 && rule.sourceStepOrder <= steps.length
          ? rule.sourceStepOrder - 1
          : -1;

      let origin = { x: startPos.x + CIRCLE_SIZE / 2, y: startPos.y + CIRCLE_SIZE / 2 };
      let triggerText = 'شروع گردش کار';
      let color = '#0284c7';

      if (rule.triggerEvent === 'ON_WORKFLOW_START') {
        origin = { x: startPos.x + CIRCLE_SIZE / 2, y: startPos.y + CIRCLE_SIZE };
        triggerText = 'رویداد شروع';
      } else if (rule.triggerEvent === 'ON_STEP_ENTER') {
        if (stepIdx >= 0) {
          const sp = getStepPos(stepIdx);
          origin = { x: sp.x + NODE_W / 2, y: nCenter.y < sp.y ? sp.y : sp.y + NODE_H };
          triggerText = `ورود به گام ${stepIdx + 1}`;
        } else {
          origin = { x: startPos.x + CIRCLE_SIZE / 2, y: startPos.y + CIRCLE_SIZE / 2 };
          triggerText = 'ورود به هر گام';
        }
      } else if (rule.triggerEvent === 'ON_STEP_VOTE') {
        const condLbl =
          rule.branchCondition === 'APPROVE'
            ? 'رای تایید'
            : rule.branchCondition === 'REVISION'
            ? 'رای اصلاح'
            : rule.branchCondition === 'REJECT'
            ? 'رای رد'
            : 'ثبت هر رای';
        if (stepIdx >= 0) {
          const sp = getStepPos(stepIdx);
          origin = { x: sp.x + NODE_W / 2, y: nCenter.y < sp.y ? sp.y : sp.y + NODE_H };
          triggerText = `${condLbl} (گام ${stepIdx + 1})`;
        } else {
          triggerText = `${condLbl} (همه گام‌ها)`;
        }
      } else if (rule.triggerEvent === 'ON_GATEWAY_OUTCOME') {
        const brLbl =
          rule.branchCondition === 'APPROVE'
            ? 'نتیجه لوزی: تایید'
            : rule.branchCondition === 'REVISION'
            ? 'نتیجه لوزی: اصلاح'
            : rule.branchCondition === 'REJECT'
            ? 'نتیجه لوزی: رد'
            : 'هر نتیجه لوزی';
        color =
          rule.branchCondition === 'APPROVE'
            ? '#059669'
            : rule.branchCondition === 'REVISION'
            ? '#d97706'
            : rule.branchCondition === 'REJECT'
            ? '#e11d48'
            : '#0284c7';
        if (stepIdx >= 0) {
          const gp = getGatewayPos(stepIdx);
          origin = { x: gp.x + GW_SIZE / 2, y: nCenter.y < gp.y ? gp.y : gp.y + GW_SIZE };
          triggerText = `${brLbl} (گام ${stepIdx + 1})`;
        } else {
          triggerText = `${brLbl}`;
        }
      } else if (rule.triggerEvent === 'ON_WORKFLOW_END') {
        if (rule.endOutcomeCondition === 'APPROVED') {
          origin = { x: endApprovedPos.x + CIRCLE_SIZE / 2, y: endApprovedPos.y + CIRCLE_SIZE / 2 };
          triggerText = 'نتیجه نهایی: تایید';
          color = '#059669';
        } else if (rule.endOutcomeCondition === 'REJECTED') {
          origin = { x: endRejectedPos.x + CIRCLE_SIZE / 2, y: endRejectedPos.y + CIRCLE_SIZE / 2 };
          triggerText = 'نتیجه نهایی: رد';
          color = '#e11d48';
        } else if (rule.endOutcomeCondition === 'NEEDS_REVISION') {
          origin = { x: creatorPos.x + CREATOR_W / 2, y: creatorPos.y + CREATOR_H / 2 };
          triggerText = 'عودت برای اصلاح';
          color = '#d97706';
        } else {
          origin = { x: endApprovedPos.x + CIRCLE_SIZE / 2, y: endApprovedPos.y + CIRCLE_SIZE };
          triggerText = 'پایان / نتیجه گردش';
        }
      }

      const targetAnchor =
        Math.abs(nCenter.y - origin.y) > Math.abs(nCenter.x - origin.x)
          ? {
              x: nPos.x + NOTIF_W / 2,
              y: nCenter.y > origin.y ? nPos.y : nPos.y + NOTIF_H,
            }
          : {
              x: nCenter.x > origin.x ? nPos.x : nPos.x + NOTIF_W,
              y: nPos.y + NOTIF_H / 2,
            };

      const midX = Math.round((origin.x + targetAnchor.x) / 2);
      const midY = Math.round((origin.y + targetAnchor.y) / 2);
      const path = `M ${origin.x} ${origin.y} Q ${origin.x} ${targetAnchor.y}, ${targetAnchor.x} ${targetAnchor.y}`;

      return {
        id: rule.id,
        path,
        midX,
        midY,
        triggerText,
        color,
      };
    });
  }, [notificationsList, steps.length, startPos, creatorPos, endApprovedPos, endRejectedPos, getStepPos, getGatewayPos, getNotificationPos]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Visio Ribbon Toolbar */}
      <div className="px-3.5 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onAddBlankStepAt(undefined, 'CREATOR')}
            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="افزودن مرحله برای ثبت‌کننده اولیه پروژه"
          >
            <UserCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>+ گام ثبت‌کننده اولیه</span>
          </button>

          <button
            type="button"
            onClick={() => onAddBlankStepAt(undefined, 'POSITIONS')}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="افزودن گام سازمانی جدید به بوم"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ گام سازمانی جدید</span>
          </button>

          {onDropNotificationAt && (
            <button
              type="button"
              onClick={() =>
                onDropNotificationAt({
                  triggerEvent: activeSelection.kind === 'step' || activeSelection.kind === 'gateway'
                    ? (activeSelection.kind === 'gateway' ? 'ON_GATEWAY_OUTCOME' : 'ON_STEP_VOTE')
                    : activeSelection.kind === 'end_approved' || activeSelection.kind === 'end_rejected' || activeSelection.kind === 'creator_return'
                    ? 'ON_WORKFLOW_END'
                    : 'ON_WORKFLOW_START',
                  sourceStepOrder:
                    activeSelection.kind === 'step' || activeSelection.kind === 'gateway'
                      ? activeSelection.idx + 1
                      : null,
                  endOutcomeCondition:
                    activeSelection.kind === 'end_approved'
                      ? 'APPROVED'
                      : activeSelection.kind === 'end_rejected'
                      ? 'REJECTED'
                      : activeSelection.kind === 'creator_return'
                      ? 'NEEDS_REVISION'
                      : 'ANY',
                })
              }
              className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
              title="افزودن گره اطلاع‌رسانی (پوش، پیامک، اعلان کارتابل) متصل به عنصر انتخاب‌شده"
            >
              <Bell className="w-3.5 h-3.5 text-sky-600" />
              <span>+ گره اطلاع‌رسانی</span>
            </button>
          )}

          <button
            type="button"
            onClick={onAutoLayout}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="مرتب‌سازی خودکار گره‌ها و دروازه‌های تصمیم‌گیری"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
            <span>چیدمان خودکار Visio</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Connector Style Switcher */}
          <button
            type="button"
            onClick={() =>
              onDiagramChange({
                ...diagram,
                connectorStyle: connectorStyle === 'ORTHOGONAL' ? 'BEZIER' : 'ORTHOGONAL',
              })
            }
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${
              connectorStyle === 'ORTHOGONAL'
                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="تغییر نوع خطوط اتصال (مسیر مهندسی زاویه‌دار / منحنی)"
          >
            {connectorStyle === 'ORTHOGONAL' ? (
              <CornerUpRight className="w-3.5 h-3.5" />
            ) : (
              <Spline className="w-3.5 h-3.5" />
            )}
            <span>{connectorStyle === 'ORTHOGONAL' ? 'خطوط مهندسی' : 'خطوط منحنی'}</span>
          </button>

          {/* Snap to Grid */}
          <button
            type="button"
            onClick={() =>
              onDiagramChange({
                ...diagram,
                snapToGrid: !snapEnabled,
              })
            }
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${
              snapEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="تراز خودکار روی شبکه ۲۰ پیکسلی"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>تراز شبکه‌ای</span>
          </button>

          {/* MiniMap Toggle */}
          <button
            type="button"
            onClick={() => setShowMinimap((m) => !m)}
            className={`p-1.5 rounded-lg border cursor-pointer transition ${
              showMinimap
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="نمایش/مخفی کردن نقشه کوچک (MiniMap)"
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Controls */}
          <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="کوچک‌نمایی"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-bold text-slate-700 px-1.5 tabular-nums min-w-[40px] text-center">
              {Math.round(zoom * 100)}٪
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="بزرگ‌نمایی"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitToScreen}
              className="p-1 text-indigo-600 hover:text-indigo-800 cursor-pointer border-r border-slate-200 mr-0.5 pr-1.5"
              title="تناسب خودکار با صفحه"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                title="بزرگ‌نمایی ۱۰۰٪"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Status Hint Strip */}
      {connecting && (
        <div className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold flex items-center justify-between gap-2 shrink-0">
          <span>
            در حال رسم مسیر «
            {connecting.branch === 'approve'
              ? 'تایید'
              : connecting.branch === 'revision'
              ? 'اصلاح'
              : 'رد'}
            » از گام {connecting.fromIdx + 1}: روی گام مقصد، «کارتابل ثبت‌کننده (اصلاح)» یا گره پایان مورد نظر کلیک کنید.
          </span>
          <button
            type="button"
            onClick={() => setConnecting(null)}
            className="px-2.5 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] cursor-pointer"
          >
            لغو اتصال (Esc)
          </button>
        </div>
      )}

      {/* Full-Screen Visio Blueprint Grid Viewport */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={viewportRef}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.08 : -0.08;
              setZoom((z) => Math.max(0.35, Math.min(2.0, Number((z + delta).toFixed(2)))));
            }
          }}
          className="w-full h-full overflow-auto bg-[#f8fafc] relative"
          dir="ltr"
        >
          <div
            ref={canvasRef}
            onPointerDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget && viewportRef.current) {
                setIsPanning({
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  scrollLeft: viewportRef.current.scrollLeft,
                  scrollTop: viewportRef.current.scrollTop,
                });
              }
            }}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onClick={() => {
              if (connecting) setConnecting(null);
            }}
            onDragOver={(e) => {
              if (
                dragPayload?.kind === 'toolbox-position' ||
                dragPayload?.kind === 'toolbox-creator' ||
                dragPayload?.kind === 'toolbox-notification'
              ) {
                e.preventDefault();
                setIsCanvasDropActive(true);
              }
            }}
            onDragLeave={() => setIsCanvasDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsCanvasDropActive(false);
              setHoverDropStepIdx(null);
              const pt = toCanvasCoords(e.clientX, e.clientY);
              const dropPos = {
                x: snapCoord(Math.max(140, pt.x - NODE_W / 2), snapEnabled),
                y: snapCoord(Math.max(40, pt.y - NODE_H / 2), snapEnabled),
              };
              if (dragPayload?.kind === 'toolbox-position') {
                onDropPositionAtCanvas(dragPayload.positionId, dragPayload.title, dropPos);
                onClearDrag();
              } else if (dragPayload?.kind === 'toolbox-creator') {
                onAddBlankStepAt(dropPos, 'CREATOR');
                onClearDrag();
              } else if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                onDropNotificationAt({
                  pos: {
                    x: snapCoord(Math.max(40, pt.x - NOTIF_W / 2), snapEnabled),
                    y: snapCoord(Math.max(30, pt.y - NOTIF_H / 2), snapEnabled),
                  },
                  triggerEvent: 'ON_WORKFLOW_START',
                });
                onClearDrag();
              }
            }}
            style={{
              width: `${canvasDimensions.width * zoom}px`,
              height: `${canvasDimensions.height * zoom}px`,
              position: 'relative',
              cursor: isPanning ? 'grabbing' : connecting ? 'crosshair' : 'default',
            }}
          >
            <div
              onPointerDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget && viewportRef.current) {
                  setIsPanning({
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    scrollLeft: viewportRef.current.scrollLeft,
                    scrollTop: viewportRef.current.scrollTop,
                  });
                }
              }}
              style={{
                width: `${canvasDimensions.width}px`,
                height: `${canvasDimensions.height}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                backgroundColor: '#f8fafc',
                backgroundImage:
                  'linear-gradient(to right, rgba(203, 213, 225, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(203, 213, 225, 0.45) 1px, transparent 1px), linear-gradient(to right, rgba(226, 232, 240, 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(226, 232, 240, 0.55) 1px, transparent 1px)',
                backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
              }}
              className={`relative select-none transition-colors ${
                isCanvasDropActive ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50/30' : ''
              }`}
            >
              {/* SVG Sequence Flows Layer */}
              <svg
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                className="absolute inset-0 pointer-events-none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  {[
                    { id: 'arrow-start', color: '#4f46e5' },
                    { id: 'arrow-neutral', color: '#64748b' },
                    { id: 'arrow-creator', color: '#0d9488' },
                    { id: 'arrow-approve', color: '#059669' },
                    { id: 'arrow-revision', color: '#d97706' },
                    { id: 'arrow-reject', color: '#e11d48' },
                    { id: 'arrow-notif', color: '#0284c7' },
                  ].map((m) => (
                    <marker
                      key={m.id}
                      id={m.id}
                      markerWidth="9"
                      markerHeight="9"
                      refX="7"
                      refY="4.5"
                      orient="auto"
                    >
                      <path d="M 1 1 L 8 4.5 L 1 8 z" fill={m.color} />
                    </marker>
                  ))}
                </defs>

                {edges.map((edge) => {
                  const isFocused =
                    edge.branch === 'start'
                      ? activeSelection.kind === 'start'
                      : edge.branch === 'creator_return'
                      ? activeSelection.kind === 'creator_return'
                      : (activeSelection.kind === 'step' || activeSelection.kind === 'gateway') &&
                        edge.fromIdx === activeSelection.idx;
                  return (
                    <path
                      key={edge.id}
                      d={edge.path}
                      fill="none"
                      stroke={edge.color}
                      strokeWidth={isFocused ? 2.5 : 1.75}
                      strokeDasharray={edge.isDashed ? '6 4' : undefined}
                      markerEnd={`url(#${edge.markerId})`}
                      opacity={isFocused ? 1 : 0.78}
                    />
                  );
                })}

                {notifEdges.map((ne) => {
                  const isFocused = activeSelection.kind === 'notification' && activeSelection.notifId === ne.id;
                  return (
                    <path
                      key={`notif-edge-${ne.id}`}
                      d={ne.path}
                      fill="none"
                      stroke={ne.color}
                      strokeWidth={isFocused ? 2.5 : 1.75}
                      strokeDasharray="5 4"
                      markerEnd="url(#arrow-notif)"
                      opacity={isFocused ? 1 : 0.82}
                    />
                  );
                })}

                {connecting && (() => {
                  const from = getPortOrigin(connecting.fromIdx, connecting.branch);
                  const previewColor =
                    connecting.branch === 'approve'
                      ? '#059669'
                      : connecting.branch === 'revision'
                      ? '#d97706'
                      : '#e11d48';
                  return (
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={connecting.mouseX}
                      y2={connecting.mouseY}
                      stroke={previewColor}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                    />
                  );
                })()}
              </svg>

              {/* Interactive Edge Labels */}
              {edges
                .filter((e) => e.label)
                .map((edge) => (
                  <button
                    key={`${edge.id}-label`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectEl(edge.selectTarget);
                    }}
                    style={{
                      left: `${edge.midX}px`,
                      top: `${edge.midY}px`,
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: edge.badgeBg,
                      borderColor: edge.badgeBorder,
                      color: edge.badgeText,
                    }}
                    dir="rtl"
                    className="absolute z-10 px-2 py-0.5 rounded-md border text-[10px] font-bold shadow-2xs hover:scale-105 transition cursor-pointer whitespace-nowrap"
                  >
                    {edge.label}
                  </button>
                ))}

              {/* Interactive Notification Edge Labels */}
              {notifEdges.map((ne) => (
                <button
                  key={`notif-lbl-${ne.id}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectEl({ kind: 'notification', notifId: ne.id });
                  }}
                  style={{
                    left: `${ne.midX}px`,
                    top: `${ne.midY}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  dir="rtl"
                  className="absolute z-10 px-2 py-0.5 rounded-md border border-sky-200 bg-sky-50 text-sky-900 text-[9px] font-bold shadow-2xs hover:scale-105 transition cursor-pointer whitespace-nowrap"
                >
                  {ne.triggerText}
                </button>
              ))}

              {/* START EVENT NODE */}
              <div
                onPointerDown={(e) => {
                  selectEl({ kind: 'start' });
                  startDragNode(e, { kind: 'start' }, startPos);
                }}
                onDragOver={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCanvasDropActive(false);
                  }
                }}
                onDrop={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropNotificationAt({
                      pos: { x: startPos.x, y: startPos.y + CIRCLE_SIZE + 80 },
                      triggerEvent: 'ON_WORKFLOW_START',
                    });
                    onClearDrag();
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectEl({ kind: 'start' });
                }}
                style={{
                  left: `${startPos.x}px`,
                  top: `${startPos.y}px`,
                  width: `${CIRCLE_SIZE}px`,
                  height: `${CIRCLE_SIZE}px`,
                }}
                dir="rtl"
                className={`absolute z-20 rounded-full bg-emerald-50 border-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition ${
                  activeSelection.kind === 'start'
                    ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-md'
                    : 'border-emerald-600 hover:ring-4 hover:ring-emerald-200/60 shadow-xs'
                }`}
                title="رویداد شروع گردش کار — برای تنظیم رویداد آغازگر کلیک کنید"
              >
                <Zap className="w-4 h-4 text-emerald-700" />
                <span className="text-[10px] font-black text-emerald-950 mt-0.5">شروع</span>
              </div>
              <div
                style={{
                  left: `${startPos.x - 28}px`,
                  top: `${startPos.y + CIRCLE_SIZE + 6}px`,
                  width: `${CIRCLE_SIZE + 56}px`,
                }}
                dir="rtl"
                className="absolute z-10 text-center pointer-events-none"
              >
                <span className="inline-block px-2 py-0.5 rounded bg-white/95 border border-slate-200 text-[10px] font-bold text-slate-700 shadow-2xs truncate max-w-full">
                  {startTriggerLabel(diagram.startTrigger)}
                </span>
              </div>

              {/* CREATOR REVISION RETURN NODE */}
              <div
                onPointerDown={(e) => {
                  selectEl({ kind: 'creator_return' });
                  startDragNode(e, { kind: 'creator' }, creatorPos);
                }}
                onDragOver={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCanvasDropActive(false);
                  }
                }}
                onDrop={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropNotificationAt({
                      pos: { x: creatorPos.x, y: creatorPos.y + CREATOR_H + 44 },
                      triggerEvent: 'ON_WORKFLOW_END',
                      endOutcomeCondition: 'NEEDS_REVISION',
                    });
                    onClearDrag();
                  }
                }}
                onPointerEnter={() => connecting && setHoverTargetKey('creator')}
                onPointerLeave={() => hoverTargetKey === 'creator' && setHoverTargetKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connecting) {
                    completeConnection({ kind: 'creator' });
                  } else {
                    selectEl({ kind: 'creator_return' });
                  }
                }}
                style={{
                  left: `${creatorPos.x}px`,
                  top: `${creatorPos.y}px`,
                  width: `${CREATOR_W}px`,
                  height: `${CREATOR_H}px`,
                }}
                dir="rtl"
                className={`absolute z-20 rounded-xl bg-amber-50 border-2 px-2.5 flex flex-col items-center justify-center transition ${
                  connecting
                    ? connecting.branch !== 'approve'
                      ? 'cursor-crosshair ring-4 ring-amber-300 border-amber-600 scale-105'
                      : 'opacity-40 cursor-not-allowed border-amber-400'
                    : activeSelection.kind === 'creator_return'
                    ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-md cursor-grab'
                    : 'border-amber-500 cursor-grab active:cursor-grabbing hover:ring-4 hover:ring-amber-200/60 shadow-xs'
                } ${hoverTargetKey === 'creator' ? 'bg-amber-100 scale-105' : ''}`}
                title="کارتابل ثبت‌کننده پروژه در حالت عودت / نیاز به اصلاح"
              >
                <div className="flex items-center gap-1.5 text-amber-900">
                  <UserCheck className="w-4 h-4 shrink-0 text-amber-700" />
                  <span className="text-[11px] font-black leading-tight">
                    {diagram.creatorLabel || 'کارتابل ثبت‌کننده اولیه'}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-amber-800 mt-1 truncate max-w-full">
                  عنوان کار: «{steps.find((s) => s.config.returnCreatorTaskTitle)?.config.returnCreatorTaskTitle || 'نیاز به اصلاح'}»
                </span>
              </div>

              {/* END APPROVED TERMINATOR */}
              <div
                onPointerDown={(e) => {
                  selectEl({ kind: 'end_approved' });
                  startDragNode(e, { kind: 'end_approved' }, endApprovedPos);
                }}
                onDragOver={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCanvasDropActive(false);
                  }
                }}
                onDrop={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropNotificationAt({
                      pos: { x: endApprovedPos.x - 40, y: Math.max(20, endApprovedPos.y - NOTIF_H - 36) },
                      triggerEvent: 'ON_WORKFLOW_END',
                      endOutcomeCondition: 'APPROVED',
                    });
                    onClearDrag();
                  }
                }}
                onPointerEnter={() => connecting && setHoverTargetKey('end_approved')}
                onPointerLeave={() => hoverTargetKey === 'end_approved' && setHoverTargetKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connecting) {
                    completeConnection({ kind: 'end_approved' });
                  } else {
                    selectEl({ kind: 'end_approved' });
                  }
                }}
                style={{
                  left: `${endApprovedPos.x}px`,
                  top: `${endApprovedPos.y}px`,
                  width: `${CIRCLE_SIZE}px`,
                  height: `${CIRCLE_SIZE}px`,
                }}
                dir="rtl"
                className={`absolute z-20 rounded-full bg-emerald-50 border-4 flex flex-col items-center justify-center transition ${
                  connecting
                    ? connecting.branch === 'approve'
                      ? 'cursor-crosshair ring-4 ring-emerald-300 border-emerald-600 scale-105'
                      : 'opacity-40 cursor-not-allowed border-emerald-500'
                    : activeSelection.kind === 'end_approved'
                    ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-md cursor-grab'
                    : 'border-emerald-600 cursor-grab active:cursor-grabbing shadow-xs'
                } ${hoverTargetKey === 'end_approved' ? 'bg-emerald-100 scale-105' : ''}`}
                title="پایان فرآیند با تصویب نهایی / تایید اکثریت"
              >
                <Flag className="w-4 h-4 text-emerald-700" />
                <span className="text-[9px] font-black text-emerald-950 leading-tight text-center mt-0.5 px-1">
                  {diagram.endApprovedLabel || 'تایید اکثریت'}
                </span>
              </div>

              {/* END REJECTED TERMINATOR */}
              <div
                onPointerDown={(e) => {
                  selectEl({ kind: 'end_rejected' });
                  startDragNode(e, { kind: 'end_rejected' }, endRejectedPos);
                }}
                onDragOver={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCanvasDropActive(false);
                  }
                }}
                onDrop={(e) => {
                  if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropNotificationAt({
                      pos: { x: endRejectedPos.x - 40, y: endRejectedPos.y + CIRCLE_SIZE + 44 },
                      triggerEvent: 'ON_WORKFLOW_END',
                      endOutcomeCondition: 'REJECTED',
                    });
                    onClearDrag();
                  }
                }}
                onPointerEnter={() => connecting && setHoverTargetKey('end_rejected')}
                onPointerLeave={() => hoverTargetKey === 'end_rejected' && setHoverTargetKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connecting) {
                    completeConnection({ kind: 'end_rejected' });
                  } else {
                    selectEl({ kind: 'end_rejected' });
                  }
                }}
                style={{
                  left: `${endRejectedPos.x}px`,
                  top: `${endRejectedPos.y}px`,
                  width: `${CIRCLE_SIZE}px`,
                  height: `${CIRCLE_SIZE}px`,
                }}
                dir="rtl"
                className={`absolute z-20 rounded-full bg-rose-50 border-4 flex flex-col items-center justify-center transition ${
                  connecting
                    ? connecting.branch !== 'approve'
                      ? 'cursor-crosshair ring-4 ring-rose-300 border-rose-600 scale-105'
                      : 'opacity-40 cursor-not-allowed border-rose-500'
                    : activeSelection.kind === 'end_rejected'
                    ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-md cursor-grab'
                    : 'border-rose-600 cursor-grab active:cursor-grabbing shadow-xs'
                } ${hoverTargetKey === 'end_rejected' ? 'bg-rose-100 scale-105' : ''}`}
                title="پایان فرآیند با رد اکثریت / مختومه"
              >
                <XCircle className="w-4 h-4 text-rose-700" />
                <span className="text-[9px] font-black text-rose-950 leading-tight text-center mt-0.5 px-1">
                  {diagram.endRejectedLabel || 'رد اکثریت'}
                </span>
              </div>

              {/* STEP TASK CARDS & VISIO DIAMOND GATEWAYS */}
              {steps.map((st, idx) => {
                const pos = getStepPos(idx);
                const gPos = getGatewayPos(idx);
                const hasGw = stepHasGateway(idx);
                const allowed = getAllowedActions(idx);
                const isStepSelected = activeSelection.kind === 'step' && activeSelection.idx === idx;
                const isGatewaySelected = activeSelection.kind === 'gateway' && activeSelection.idx === idx;
                const isCreatorMode = st.config.assigneeMode === 'CREATOR';
                const assigneeCount = getStepAssigneeCount(st);
                const isConnectTarget = Boolean(connecting);
                const isHoverConnect = hoverTargetKey === `step-${idx}`;
                const isParallelDrop =
                  hoverDropStepIdx === idx &&
                  (dragPayload?.kind === 'toolbox-position' ||
                    dragPayload?.kind === 'toolbox-gateway' ||
                    dragPayload?.kind === 'toolbox-notification');
                const isWaitAll = st.config.voteCollectionMode === 'WAIT_ALL';
                const leavesCartable = Boolean(
                  st.config.removeFromCartableAfterVote ?? isWaitAll
                );

                return (
                  <React.Fragment key={st.localKey}>
                    {/* TASK CARD */}
                    <div
                      onPointerDown={(e) => {
                        if (connecting) return;
                        selectEl({ kind: 'step', idx });
                        startDragNode(e, { kind: 'step', idx }, pos);
                      }}
                      onPointerEnter={() => connecting && setHoverTargetKey(`step-${idx}`)}
                      onPointerLeave={() => hoverTargetKey === `step-${idx}` && setHoverTargetKey(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (connecting) {
                          completeConnection({ kind: 'step', stepOrder: idx + 1 });
                        } else {
                          selectEl({ kind: 'step', idx });
                        }
                      }}
                      onDragOver={(e) => {
                        if (
                          dragPayload?.kind === 'toolbox-position' ||
                          dragPayload?.kind === 'toolbox-gateway' ||
                          dragPayload?.kind === 'toolbox-notification'
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          setHoverDropStepIdx(idx);
                          setIsCanvasDropActive(false);
                        }
                      }}
                      onDragLeave={(e) => {
                        e.stopPropagation();
                        if (hoverDropStepIdx === idx) setHoverDropStepIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHoverDropStepIdx(null);
                        setIsCanvasDropActive(false);
                        if (dragPayload?.kind === 'toolbox-position') {
                          onDropPositionOnStep(idx, dragPayload.positionId);
                          onClearDrag();
                        } else if (dragPayload?.kind === 'toolbox-gateway' && onUpdateStepConfig) {
                          onUpdateStepConfig(idx, { hasGateway: true });
                          selectEl({ kind: 'gateway', idx });
                          onClearDrag();
                        } else if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                          onDropNotificationAt({
                            pos: { x: pos.x + 12, y: Math.max(20, pos.y - NOTIF_H - 56) },
                            triggerEvent: 'ON_STEP_VOTE',
                            sourceStepOrder: idx + 1,
                          });
                          onClearDrag();
                        }
                      }}
                      style={{
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        width: `${NODE_W}px`,
                        height: `${NODE_H}px`,
                      }}
                      dir="rtl"
                      className={`absolute z-20 rounded-xl bg-white border flex flex-col justify-between transition ${
                        isParallelDrop
                          ? 'border-2 border-emerald-500 ring-4 ring-emerald-200 bg-emerald-50/40'
                          : isHoverConnect
                          ? 'border-2 border-indigo-600 ring-4 ring-indigo-300 scale-[1.02]'
                          : isStepSelected
                          ? 'border-2 border-indigo-600 ring-4 ring-indigo-500/15 shadow-md'
                          : 'border-slate-300 hover:border-indigo-400 shadow-xs'
                      } ${isConnectTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                    >
                      {/* Header */}
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-1.5 bg-slate-50/60 rounded-t-xl">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 tabular-nums ${
                              isCreatorMode
                                ? 'bg-amber-600 text-white'
                                : idx === 0
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-white'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {st.title || `گام ${idx + 1}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-bold tabular-nums">
                            <Users className="w-3 h-3 text-slate-400" />
                            {isCreatorMode ? '۱' : assigneeCount}
                          </span>
                          {steps.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteStep(idx);
                              }}
                              className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                              title="حذف گام"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Body: Assignee + Action Labels */}
                      <div className="px-3 py-1.5 space-y-1.5 flex-1 overflow-hidden">
                        <div className="flex flex-wrap gap-1">
                          {isCreatorMode ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                              <UserCheck className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                              <span>ثبت‌کننده اولیه پروژه</span>
                            </span>
                          ) : (
                            <>
                              {st.positionIds.slice(0, 2).map((pid) => (
                                <span
                                  key={pid}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 truncate max-w-[115px]"
                                >
                                  <Briefcase className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                                  <span className="truncate">{getPositionTitle(pid, st.structureId)}</span>
                                </span>
                              ))}
                              {st.positionIds.length > 2 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                                  +{st.positionIds.length - 2}
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Allowed Actions Preview */}
                        <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
                          {allowed.includes('APPROVE') && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 truncate max-w-[110px]">
                              {st.config.actionLabels?.APPROVE?.trim() || 'تایید'}
                            </span>
                          )}
                          {allowed.includes('REVISION') && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 truncate max-w-[90px]">
                              {st.config.actionLabels?.REVISION?.trim() || 'اصلاح'}
                            </span>
                          )}
                          {allowed.includes('REJECT') && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 truncate max-w-[85px]">
                              {st.config.actionLabels?.REJECT?.trim() || 'رد'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer Strip: Gateway toggle or direct ports */}
                      <div className="px-2.5 py-1.5 border-t border-slate-100 bg-slate-50/70 rounded-b-xl flex items-center justify-between gap-1 text-[10px]">
                        <div className="flex items-center gap-1.5 text-slate-500 font-semibold truncate">
                          {isWaitAll && (
                            <span className="inline-flex items-center gap-0.5 text-indigo-700 font-bold">
                              <Clock className="w-2.5 h-2.5" />
                              صبر همه
                            </span>
                          )}
                          {leavesCartable && (
                            <span className="inline-flex items-center gap-0.5 text-slate-600" title="خروج از کارتابل کاربر پس از رای">
                              <LogOut className="w-2.5 h-2.5" />
                              خروج پس از رای
                            </span>
                          )}
                          {!isWaitAll && !leavesCartable && (
                            <span>{hasGw ? 'متصل به دروازه لوزی' : 'خروجی مستقیم'}</span>
                          )}
                        </div>

                        {!hasGw ? (
                          <div className="flex items-center gap-1">
                            {allowed.includes('APPROVE') && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectEl({ kind: 'step', idx });
                                  const orig = getPortOrigin(idx, 'approve');
                                  setConnecting({ fromIdx: idx, branch: 'approve', mouseX: orig.x + 25, mouseY: orig.y });
                                }}
                                className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 font-bold cursor-pointer transition"
                                title="رسم اتصال مسیر تایید / ارسال"
                              >
                                اتصال
                              </button>
                            )}
                            {onUpdateStepConfig && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateStepConfig(idx, { hasGateway: true });
                                  selectEl({ kind: 'gateway', idx });
                                }}
                                className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold cursor-pointer transition"
                                title="افزودن لوزی شرط تصمیم‌گیری"
                              >
                                + لوزی
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectEl({ kind: 'gateway', idx });
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold cursor-pointer transition"
                            title="تنظیم شروط دروازه لوزی"
                          >
                            <Diamond className="w-2.5 h-2.5" />
                            <span>شروط لوزی</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* VISIO 45-DEGREE DIAMOND DECISION GATEWAY */}
                    {hasGw && (
                      <div
                        style={{
                          left: `${gPos.x}px`,
                          top: `${gPos.y}px`,
                          width: `${GW_SIZE}px`,
                          height: `${GW_SIZE}px`,
                        }}
                        className="absolute z-20"
                      >
                        <div
                          onPointerDown={(e) => {
                            selectEl({ kind: 'gateway', idx });
                            startDragNode(e, { kind: 'gateway', idx }, gPos);
                          }}
                          onDragOver={(e) => {
                            if (dragPayload?.kind === 'toolbox-notification') {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsCanvasDropActive(false);
                            }
                          }}
                          onDrop={(e) => {
                            if (dragPayload?.kind === 'toolbox-notification' && onDropNotificationAt) {
                              e.preventDefault();
                              e.stopPropagation();
                              onDropNotificationAt({
                                pos: { x: gPos.x - 40, y: Math.max(20, gPos.y - NOTIF_H - 64) },
                                triggerEvent: 'ON_GATEWAY_OUTCOME',
                                sourceStepOrder: idx + 1,
                              });
                              onClearDrag();
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEl({ kind: 'gateway', idx });
                          }}
                          style={{
                            transform: 'rotate(45deg)',
                          }}
                          className={`w-full h-full rounded-lg bg-amber-50 border-2 flex items-center justify-center cursor-grab active:cursor-grabbing transition ${
                            isGatewaySelected
                              ? 'border-indigo-600 ring-4 ring-indigo-500/25 shadow-md bg-amber-100/80'
                              : 'border-amber-500 hover:border-indigo-500 shadow-xs'
                          }`}
                          title="دروازه تصمیم‌گیری Visio (کلیک برای ویرایش شروط و نصاب آرا)"
                        >
                          <div
                            style={{ transform: 'rotate(-45deg)' }}
                            className="flex flex-col items-center justify-center text-center pointer-events-none"
                          >
                            <span className="text-sm font-black text-amber-800 leading-none">✕</span>
                            <span className="text-[8px] font-black text-amber-900 mt-0.5">
                              شرط
                            </span>
                          </div>
                        </div>

                        {/* Directional Output Port Handles around Diamond */}
                        {allowed.includes('APPROVE') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectEl({ kind: 'gateway', idx });
                              const orig = getPortOrigin(idx, 'approve');
                              setConnecting({ fromIdx: idx, branch: 'approve', mouseX: orig.x + 30, mouseY: orig.y });
                            }}
                            style={{ right: '-10px', top: `${GW_SIZE / 2 - 10}px` }}
                            className={`absolute w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-crosshair transition shadow-xs ${
                              connecting?.fromIdx === idx && connecting.branch === 'approve'
                                ? 'bg-emerald-600 border-white text-white scale-110'
                                : 'bg-white border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white'
                            }`}
                            title="اتصال مسیر تایید از لوزی شرط"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                          </button>
                        )}

                        {allowed.includes('REVISION') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectEl({ kind: 'gateway', idx });
                              const orig = getPortOrigin(idx, 'revision');
                              setConnecting({ fromIdx: idx, branch: 'revision', mouseX: orig.x, mouseY: orig.y + 30 });
                            }}
                            style={{ left: `${GW_SIZE / 2 - 10}px`, bottom: '-10px' }}
                            className={`absolute w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-crosshair transition shadow-xs ${
                              connecting?.fromIdx === idx && connecting.branch === 'revision'
                                ? 'bg-amber-600 border-white text-white scale-110'
                                : 'bg-white border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white'
                            }`}
                            title="اتصال مسیر اصلاح از لوزی شرط"
                          >
                            <AlertTriangle className="w-3 h-3" />
                          </button>
                        )}

                        {allowed.includes('REJECT') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectEl({ kind: 'gateway', idx });
                              const orig = getPortOrigin(idx, 'reject');
                              setConnecting({ fromIdx: idx, branch: 'reject', mouseX: orig.x, mouseY: orig.y - 30 });
                            }}
                            style={{ left: `${GW_SIZE / 2 - 10}px`, top: '-10px' }}
                            className={`absolute w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-crosshair transition shadow-xs ${
                              connecting?.fromIdx === idx && connecting.branch === 'reject'
                                ? 'bg-rose-600 border-white text-white scale-110'
                                : 'bg-white border-rose-600 text-rose-700 hover:bg-rose-600 hover:text-white'
                            }`}
                            title="اتصال مسیر رد از لوزی شرط"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}

                        {/* Gateway Title Pill Below */}
                        {st.config.gatewayTitle && (
                          <div
                            style={{ left: '-34px', top: `${GW_SIZE + 14}px`, width: `${GW_SIZE + 68}px` }}
                            dir="rtl"
                            className="absolute text-center pointer-events-none"
                          >
                            <span className="inline-block px-1.5 py-0.5 rounded bg-white/95 border border-amber-200 text-[9px] font-bold text-amber-900 shadow-2xs truncate max-w-full">
                              {st.config.gatewayTitle}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* VISIO NOTIFICATION / ALERT NODES */}
              {notificationsList.map((rule, nIdx) => {
                const nPos = getNotificationPos(rule, nIdx);
                const isSelected =
                  activeSelection.kind === 'notification' && activeSelection.notifId === rule.id;
                const channels = Array.isArray(rule.channels) ? rule.channels : [];
                const isEnabled = rule.enabled !== false;

                return (
                  <div
                    key={rule.id}
                    onPointerDown={(e) => {
                      if (connecting) return;
                      selectEl({ kind: 'notification', notifId: rule.id });
                      startDragNode(e, { kind: 'notification', notifId: rule.id }, nPos);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectEl({ kind: 'notification', notifId: rule.id });
                    }}
                    style={{
                      left: `${nPos.x}px`,
                      top: `${nPos.y}px`,
                      width: `${NOTIF_W}px`,
                      height: `${NOTIF_H}px`,
                    }}
                    dir="rtl"
                    className={`absolute z-20 rounded-xl bg-white border flex flex-col justify-between transition cursor-grab active:cursor-grabbing ${
                      !isEnabled
                        ? 'border-dashed border-slate-300 opacity-65'
                        : isSelected
                        ? 'border-2 border-indigo-600 ring-4 ring-indigo-500/20 shadow-md'
                        : 'border-sky-400 hover:border-sky-600 shadow-xs'
                    }`}
                  >
                    <div className="px-2.5 py-1.5 border-b border-sky-100 bg-sky-50/70 rounded-t-xl flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-sky-600 text-white flex items-center justify-center shrink-0">
                          <Bell className="w-3 h-3" />
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-900 truncate">
                          {rule.title || 'اطلاع‌رسانی'}
                        </span>
                      </div>
                      {onDeleteNotification && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNotification(rule.id);
                          }}
                          className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                          title="حذف گره اطلاع‌رسانی"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="px-2.5 py-1.5 flex-1 flex flex-col justify-between overflow-hidden">
                      <div className="flex flex-wrap items-center gap-1">
                        {channels.includes('PUSH') && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[9px] font-bold">
                            <Bell className="w-2.5 h-2.5" />
                            پوش
                          </span>
                        )}
                        {channels.includes('SMS') && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold">
                            <MessageSquareText className="w-2.5 h-2.5" />
                            پیامک
                          </span>
                        )}
                        {channels.includes('CARTABLE') && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold">
                            <Inbox className="w-2.5 h-2.5" />
                            کارتابل
                          </span>
                        )}
                        {channels.length === 0 && (
                          <span className="text-[9px] text-rose-600 font-semibold">بدون کانال ارسال</span>
                        )}
                      </div>

                      <div className="text-[9px] text-slate-500 font-medium truncate">
                        {rule.messageTemplate || 'متن اعلان تعریف نشده'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visio MiniMap Overlay */}
        {showMinimap && (
          <div
            className="absolute bottom-3 left-3 z-30 w-44 h-28 rounded-xl bg-white/95 border border-slate-300 shadow-md p-1.5 pointer-events-none overflow-hidden"
            dir="ltr"
          >
            <svg
              viewBox={`0 0 ${canvasDimensions.width} ${canvasDimensions.height}`}
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <circle
                cx={startPos.x + CIRCLE_SIZE / 2}
                cy={startPos.y + CIRCLE_SIZE / 2}
                r={CIRCLE_SIZE / 2}
                fill="#10b981"
                opacity="0.7"
              />
              <rect
                x={creatorPos.x}
                y={creatorPos.y}
                width={CREATOR_W}
                height={CREATOR_H}
                rx={12}
                fill="#f59e0b"
                opacity="0.65"
              />
              <circle
                cx={endApprovedPos.x + CIRCLE_SIZE / 2}
                cy={endApprovedPos.y + CIRCLE_SIZE / 2}
                r={CIRCLE_SIZE / 2}
                fill="#059669"
                opacity="0.8"
              />
              <circle
                cx={endRejectedPos.x + CIRCLE_SIZE / 2}
                cy={endRejectedPos.y + CIRCLE_SIZE / 2}
                r={CIRCLE_SIZE / 2}
                fill="#e11d48"
                opacity="0.8"
              />
              {steps.map((_, idx) => {
                const p = getStepPos(idx);
                const gp = getGatewayPos(idx);
                return (
                  <React.Fragment key={idx}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={14}
                      fill={idx === selectedStepIdx ? '#4f46e5' : '#64748b'}
                      opacity={idx === selectedStepIdx ? 0.9 : 0.55}
                    />
                    {stepHasGateway(idx) && (
                      <rect
                        x={gp.x}
                        y={gp.y}
                        width={GW_SIZE}
                        height={GW_SIZE}
                        transform={`rotate(45 ${gp.x + GW_SIZE / 2} ${gp.y + GW_SIZE / 2})`}
                        fill="#f59e0b"
                        opacity="0.85"
                      />
                    )}
                  </React.Fragment>
                );
              })}
              {notificationsList.map((rule, nIdx) => {
                const np = getNotificationPos(rule, nIdx);
                return (
                  <rect
                    key={rule.id}
                    x={np.x}
                    y={np.y}
                    width={NOTIF_W}
                    height={NOTIF_H}
                    rx={10}
                    fill="#0ea5e9"
                    opacity="0.7"
                  />
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
