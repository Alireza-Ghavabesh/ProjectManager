import React, { useRef, useState, useMemo } from 'react';
import { WorkflowDiagramLayout, WorkflowStepConfig } from '../types';
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
  GitBranch,
  Plus,
  Clock,
} from 'lucide-react';

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

interface BpmnWorkflowCanvasProps {
  steps: BpmnEditableStep[];
  selectedStepIdx: number;
  diagram: WorkflowDiagramLayout;
  onSelectStep: (idx: number) => void;
  onDiagramChange: (next: WorkflowDiagramLayout) => void;
  onUpdateStepPos: (idx: number, pos: { x: number; y: number }) => void;
  onConnectBranch: (
    fromIdx: number,
    branch: BpmnBranchKind,
    target: { kind: 'step'; stepOrder: number } | { kind: 'end_approved' } | { kind: 'end_rejected' }
  ) => void;
  onDeleteStep: (idx: number) => void;
  onAddBlankStepAt: (pos?: { x: number; y: number }) => void;
  onAutoLayout: () => void;
  getPositionTitle: (posId: string, structureId?: string | null) => string;
  getStepAssigneeCount: (step: BpmnEditableStep) => number;
  dragPayload:
    | { kind: 'step-reorder'; fromIndex: number }
    | { kind: 'toolbox-position'; structureId: string | null; positionId: string; title: string }
    | null;
  onDropPositionAtCanvas: (
    positionId: string,
    title: string,
    pos: { x: number; y: number }
  ) => void;
  onDropPositionOnStep: (stepIdx: number, positionId: string) => void;
  onClearDrag: () => void;
}

const NODE_W = 236;
const NODE_H = 148;
const CIRCLE_SIZE = 68;

export function getDefaultNodePosition(idx: number): { x: number; y: number } {
  return {
    x: 220 + idx * 300,
    y: 190,
  };
}

export function getDefaultDiagramLayout(stepCount: number): WorkflowDiagramLayout {
  const endX = Math.max(540, 220 + Math.max(1, stepCount) * 300);
  return {
    startPos: { x: 64, y: 230 },
    endApprovedPos: { x: endX, y: 120 },
    endRejectedPos: { x: endX, y: 340 },
  };
}

export const BpmnWorkflowCanvas: React.FC<BpmnWorkflowCanvasProps> = ({
  steps,
  selectedStepIdx,
  diagram,
  onSelectStep,
  onDiagramChange,
  onUpdateStepPos,
  onConnectBranch,
  onDeleteStep,
  onAddBlankStepAt,
  onAutoLayout,
  getPositionTitle,
  getStepAssigneeCount,
  dragPayload,
  onDropPositionAtCanvas,
  onDropPositionOnStep,
  onClearDrag,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
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
    target: { kind: 'start' } | { kind: 'end_approved' } | { kind: 'end_rejected' } | { kind: 'step'; idx: number };
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const startPos = diagram.startPos || { x: 64, y: 230 };
  const endApprovedPos = diagram.endApprovedPos || getDefaultDiagramLayout(steps.length).endApprovedPos!;
  const endRejectedPos = diagram.endRejectedPos || getDefaultDiagramLayout(steps.length).endRejectedPos!;

  const getStepPos = (idx: number) => steps[idx]?.config?.nodePosition || getDefaultNodePosition(idx);

  const canvasDimensions = useMemo(() => {
    let maxX = Math.max(1080, startPos.x + 200, endApprovedPos.x + 160, endRejectedPos.x + 160);
    let maxY = Math.max(560, startPos.y + 180, endApprovedPos.y + 160, endRejectedPos.y + 160);
    steps.forEach((_, idx) => {
      const p = getStepPos(idx);
      maxX = Math.max(maxX, p.x + NODE_W + 120);
      maxY = Math.max(maxY, p.y + NODE_H + 160);
    });
    return { width: maxX, height: maxY };
  }, [steps, startPos, endApprovedPos, endRejectedPos]);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 200, y: 200 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(16, Math.round((clientX - rect.left) / zoom)),
      y: Math.max(16, Math.round((clientY - rect.top) / zoom)),
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (draggingNode) {
      const pt = toCanvasCoords(e.clientX, e.clientY);
      const nextPos = {
        x: Math.max(16, Math.min(canvasDimensions.width - 100, pt.x - draggingNode.offsetX)),
        y: Math.max(16, Math.min(canvasDimensions.height - 90, pt.y - draggingNode.offsetY)),
      };
      if (draggingNode.target.kind === 'start') {
        onDiagramChange({ ...diagram, startPos: nextPos });
      } else if (draggingNode.target.kind === 'end_approved') {
        onDiagramChange({ ...diagram, endApprovedPos: nextPos });
      } else if (draggingNode.target.kind === 'end_rejected') {
        onDiagramChange({ ...diagram, endRejectedPos: nextPos });
      } else {
        onUpdateStepPos(draggingNode.target.idx, nextPos);
      }
      return;
    }

    if (connecting) {
      const pt = toCanvasCoords(e.clientX, e.clientY);
      setConnecting((prev) => (prev ? { ...prev, mouseX: pt.x, mouseY: pt.y } : null));
    }
  };

  const handleCanvasPointerUp = () => {
    if (draggingNode) {
      setDraggingNode(null);
    }
  };

  const startDragNode = (
    e: React.PointerEvent,
    target: { kind: 'start' } | { kind: 'end_approved' } | { kind: 'end_rejected' } | { kind: 'step'; idx: number },
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

  const resolveOutgoingTargets = (idx: number) => {
    const step = steps[idx];
    const cfg = step?.config || {};
    const stepOrder = idx + 1;

    // 1. Approve target
    let approveTarget: { kind: 'step'; idx: number } | { kind: 'end_approved' };
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

    // 2. Revision target
    const revRule = cfg.onRevisionAction || cfg.onRejectAction || 'RETURN_PREV';
    const revStepOrd = cfg.onRevisionStepOrder ?? cfg.onRejectStepOrder;
    let revisionTarget: { kind: 'step'; idx: number } | { kind: 'end_rejected' };
    if (revRule === 'REJECT_PROJECT') {
      revisionTarget = { kind: 'end_rejected' };
    } else if (revRule === 'RETURN_CREATOR') {
      revisionTarget = { kind: 'step', idx: 0 };
    } else if (revRule === 'CUSTOM_STEP' && revStepOrd && revStepOrd >= 1 && revStepOrd <= steps.length) {
      revisionTarget = { kind: 'step', idx: revStepOrd - 1 };
    } else {
      revisionTarget = { kind: 'step', idx: Math.max(0, stepOrder - 2) };
    }

    // 3. Reject target
    const rejectRule =
      cfg.onRevisionAction !== undefined
        ? cfg.onRejectAction || 'REJECT_PROJECT'
        : cfg.onRejectAction === 'RETURN_CREATOR' || cfg.onRejectAction === 'CUSTOM_STEP'
        ? cfg.onRejectAction
        : 'REJECT_PROJECT';
    let rejectTarget: { kind: 'step'; idx: number } | { kind: 'end_rejected' };
    if (rejectRule === 'RETURN_CREATOR') {
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
  };

  const getPortOrigin = (idx: number, branch: BpmnBranchKind) => {
    const p = getStepPos(idx);
    // Ports arranged horizontally along the bottom edge of the Task/Gateway node
    const offset = branch === 'approve' ? NODE_W - 44 : branch === 'revision' ? NODE_W / 2 : 44;
    return { x: p.x + offset, y: p.y + NODE_H };
  };

  const getTargetAnchor = (
    fromPt: { x: number; y: number },
    target: { kind: 'step'; idx: number } | { kind: 'end_approved' } | { kind: 'end_rejected' }
  ) => {
    if (target.kind === 'end_approved') {
      return {
        x: endApprovedPos.x,
        y: endApprovedPos.y + CIRCLE_SIZE / 2,
      };
    }
    if (target.kind === 'end_rejected') {
      return {
        x: endRejectedPos.x,
        y: endRejectedPos.y + CIRCLE_SIZE / 2,
      };
    }
    const tp = getStepPos(target.idx);
    const centerTx = tp.x + NODE_W / 2;
    const centerTy = tp.y + NODE_H / 2;
    if (fromPt.x < tp.x - 20) {
      return { x: tp.x, y: centerTy };
    }
    if (fromPt.x > tp.x + NODE_W + 20) {
      return { x: tp.x + NODE_W, y: centerTy };
    }
    if (fromPt.y < tp.y) {
      return { x: centerTx, y: tp.y };
    }
    return { x: centerTx, y: tp.y + NODE_H };
  };

  const buildEdgePath = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    branch: BpmnBranchKind | 'start',
    isBackwardLoop: boolean
  ) => {
    if (branch === 'start') {
      const dx = Math.max(50, Math.abs(to.x - from.x) * 0.45);
      const path = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
      return { path, midX: (from.x + to.x) / 2, midY: (from.y + to.y) / 2 };
    }

    if (isBackwardLoop) {
      // Smooth under-arc for revision/reject return arrows so they don't cut across cards
      const arcDepth = branch === 'revision' ? 75 : 108;
      const peakY = Math.max(from.y, to.y) + arcDepth;
      const path = `M ${from.x} ${from.y} C ${from.x} ${peakY}, ${to.x} ${peakY}, ${to.x} ${to.y}`;
      const midX = (from.x + to.x) / 2;
      const midY = 0.125 * from.y + 0.75 * peakY + 0.125 * to.y;
      return { path, midX, midY };
    }

    const dropY = branch === 'approve' ? 42 : branch === 'revision' ? 56 : 70;
    const c1x = from.x;
    const c1y = from.y + dropY;
    const c2x = to.x - (to.x > from.x ? 55 : -55);
    const c2y = to.y;
    const path = `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
    const midX = 0.125 * from.x + 0.375 * c1x + 0.375 * c2x + 0.125 * to.x;
    const midY = 0.125 * from.y + 0.375 * c1y + 0.375 * c2y + 0.125 * to.y;
    return { path, midX, midY };
  };

  const completeConnection = (
    target: { kind: 'step'; stepOrder: number } | { kind: 'end_approved' } | { kind: 'end_rejected' }
  ) => {
    if (!connecting) return;
    // Prevent nonsensical approve->end_rejected or reject->end_approved if clicked accidentally?
    // Actually allow connecting revision/reject to end_rejected or any step, and approve to end_approved or any step
    if (connecting.branch === 'approve' && target.kind === 'end_rejected') {
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

  const edges = useMemo(() => {
    const list: Array<{
      id: string;
      fromIdx: number;
      branch: BpmnBranchKind | 'start';
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
        branch: 'start',
        label: 'شروع',
        color: '#4f46e5',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        badgeText: '#3730a3',
        markerId: 'arrow-start',
        path,
        midX,
        midY,
      });
    }

    steps.forEach((_, idx) => {
      const { approveTarget, revisionTarget, rejectTarget } = resolveOutgoingTargets(idx);

      // Approve Flow
      {
        const from = getPortOrigin(idx, 'approve');
        const to = getTargetAnchor(from, approveTarget);
        const isBack = approveTarget.kind === 'step' && approveTarget.idx <= idx;
        const { path, midX, midY } = buildEdgePath(from, to, 'approve', isBack);
        list.push({
          id: `edge-${idx}-approve`,
          fromIdx: idx,
          branch: 'approve',
          label: approveTarget.kind === 'end_approved' ? 'تایید نهایی' : 'تایید',
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

      // Revision Flow
      {
        const from = getPortOrigin(idx, 'revision');
        const to = getTargetAnchor(from, revisionTarget);
        const isBack = revisionTarget.kind === 'step' && revisionTarget.idx <= idx;
        const { path, midX, midY } = buildEdgePath(from, to, 'revision', isBack);
        list.push({
          id: `edge-${idx}-revision`,
          fromIdx: idx,
          branch: 'revision',
          label: 'اصلاح',
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

      // Reject Flow
      {
        const from = getPortOrigin(idx, 'reject');
        const to = getTargetAnchor(from, rejectTarget);
        const isBack = rejectTarget.kind === 'step' && rejectTarget.idx <= idx;
        const { path, midX, midY } = buildEdgePath(from, to, 'reject', isBack);
        list.push({
          id: `edge-${idx}-reject`,
          fromIdx: idx,
          branch: 'reject',
          label: rejectTarget.kind === 'end_rejected' ? 'رد نهایی' : 'رد ← گام',
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
  }, [steps, startPos, endApprovedPos, endRejectedPos]);

  const approvalBadgeText = (cfg: WorkflowStepConfig) => {
    const mode = cfg.approvalMode || 'SINGLE';
    const base =
      mode === 'MAJORITY'
        ? 'اکثریت'
        : mode === 'ALL'
        ? 'اجماع'
        : mode === 'NOTIFY_ONLY'
        ? 'اطلاع‌رسانی'
        : 'تک‌نفره';
    return cfg.voteCollectionMode === 'WAIT_ALL' ? `${base} · صبر تا همه` : base;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
      {/* BPMN Canvas Toolbar */}
      <div className="px-3.5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-900">
            <GitBranch className="w-4 h-4 text-indigo-600" />
            بوم طراحی فرآیند BPMN ({steps.length} مرحله)
          </span>
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold mr-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              تایید
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              اصلاح
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              رد
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="کوچک‌نمایی"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-slate-700 px-1.5 tabular-nums">
              {Math.round(zoom * 100)}٪
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              title="بزرگ‌نمایی"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                title="بازنشانی بزرگ‌نمایی"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onAutoLayout}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="مرتب‌سازی خودکار گره‌ها و پیکان‌ها"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
            <span>چیدمان خودکار</span>
          </button>

          <button
            type="button"
            onClick={() => onAddBlankStepAt()}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن گام جدید</span>
          </button>
        </div>
      </div>

      {/* Interactive Status Hint Strip */}
      {connecting ? (
        <div className="px-3.5 py-2 bg-indigo-600 text-white text-xs font-bold flex items-center justify-between gap-2">
          <span>
            در حال اتصال مسیر «
            {connecting.branch === 'approve'
              ? 'تایید'
              : connecting.branch === 'revision'
              ? 'اصلاح'
              : 'رد'}
            » از گام {connecting.fromIdx + 1}: روی گام مقصد یا گره پایان مورد نظر کلیک کنید.
          </span>
          <button
            type="button"
            onClick={() => setConnecting(null)}
            className="px-2.5 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] cursor-pointer"
          >
            لغو اتصال
          </button>
        </div>
      ) : (
        <div className="px-3.5 py-1.5 bg-indigo-50/70 border-b border-indigo-100 text-[11px] text-indigo-950 flex flex-wrap items-center justify-between gap-2">
          <span>
            سمت‌ها را از لیست کنار بوم به فضای خالی بکشید یا برای ارسال هم‌زمان روی گام فعلی رها کنید؛ گره‌ها را جابجا کنید و با کلیک روی خروجی‌های <strong>تایید / اصلاح / رد</strong> فلش‌های مسیر را به هر گامی بچسبانید.
          </span>
        </div>
      )}

      {/* Scrollable BPMN Dot-Grid Diagram Viewport */}
      <div className="overflow-auto max-h-[460px] bg-slate-100/70 relative" dir="ltr">
        <div
          ref={canvasRef}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onClick={() => {
            if (connecting) setConnecting(null);
          }}
          onDragOver={(e) => {
            if (dragPayload?.kind === 'toolbox-position') {
              e.preventDefault();
              setIsCanvasDropActive(true);
            }
          }}
          onDragLeave={() => setIsCanvasDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsCanvasDropActive(false);
            setHoverDropStepIdx(null);
            if (dragPayload?.kind === 'toolbox-position') {
              const pt = toCanvasCoords(e.clientX, e.clientY);
              onDropPositionAtCanvas(dragPayload.positionId, dragPayload.title, {
                x: Math.max(120, pt.x - NODE_W / 2),
                y: Math.max(30, pt.y - NODE_H / 2),
              });
              onClearDrag();
            }
          }}
          style={{
            width: `${canvasDimensions.width * zoom}px`,
            height: `${canvasDimensions.height * zoom}px`,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${canvasDimensions.width}px`,
              height: `${canvasDimensions.height}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              backgroundImage: 'radial-gradient(#cbd5e1 1.25px, transparent 1.25px)',
              backgroundSize: '20px 20px',
            }}
            className={`relative select-none transition-colors ${
              isCanvasDropActive ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50/40' : ''
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
                  { id: 'arrow-approve', color: '#059669' },
                  { id: 'arrow-revision', color: '#d97706' },
                  { id: 'arrow-reject', color: '#e11d48' },
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
                const isSelectedSource = edge.branch !== 'start' && edge.fromIdx === selectedStepIdx;
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={edge.color}
                      strokeWidth={isSelectedSource ? 2.6 : 2}
                      strokeDasharray={edge.isDashed ? '6 4' : undefined}
                      markerEnd={`url(#${edge.markerId})`}
                      opacity={isSelectedSource || edge.branch === 'start' ? 0.95 : 0.72}
                    />
                  </g>
                );
              })}

              {/* Interactive live preview line when connecting a port */}
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

            {/* Edge Pill Labels (Clickable to focus step in inspector) */}
            {edges.map((edge) => (
              <button
                key={`${edge.id}-label`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStep(edge.fromIdx);
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
                className="absolute z-10 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-2xs hover:scale-105 transition cursor-pointer whitespace-nowrap"
              >
                {edge.label}
              </button>
            ))}

            {/* START EVENT NODE */}
            <div
              onPointerDown={(e) => startDragNode(e, { kind: 'start' }, startPos)}
              style={{
                left: `${startPos.x}px`,
                top: `${startPos.y}px`,
                width: `${CIRCLE_SIZE}px`,
                height: `${CIRCLE_SIZE}px`,
              }}
              dir="rtl"
              className="absolute z-20 rounded-full bg-emerald-50 border-2 border-emerald-600 shadow-sm flex flex-col items-center justify-center cursor-grab active:cursor-grabbing hover:ring-4 hover:ring-emerald-200/60 transition"
              title="نقطه آغاز گردش کار (قابل جابجایی)"
            >
              <Play className="w-4 h-4 text-emerald-700 fill-emerald-600" />
              <span className="text-[10px] font-black text-emerald-900 mt-0.5">شروع</span>
            </div>

            {/* END APPROVED NODE */}
            <div
              onPointerDown={(e) => startDragNode(e, { kind: 'end_approved' }, endApprovedPos)}
              onPointerEnter={() => connecting && setHoverTargetKey('end_approved')}
              onPointerLeave={() => hoverTargetKey === 'end_approved' && setHoverTargetKey(null)}
              onClick={(e) => {
                if (connecting) {
                  e.stopPropagation();
                  completeConnection({ kind: 'end_approved' });
                }
              }}
              style={{
                left: `${endApprovedPos.x}px`,
                top: `${endApprovedPos.y}px`,
                width: `${CIRCLE_SIZE}px`,
                height: `${CIRCLE_SIZE}px`,
              }}
              dir="rtl"
              className={`absolute z-20 rounded-full bg-emerald-50 border-4 border-emerald-600 shadow-sm flex flex-col items-center justify-center transition ${
                connecting
                  ? connecting.branch === 'approve'
                    ? 'cursor-crosshair ring-4 ring-emerald-300 scale-105'
                    : 'opacity-40 cursor-not-allowed'
                  : 'cursor-grab active:cursor-grabbing'
              } ${hoverTargetKey === 'end_approved' ? 'bg-emerald-100 scale-110' : ''}`}
              title="پایان فرآیند با تصویب نهایی"
            >
              <Flag className="w-4 h-4 text-emerald-700" />
              <span className="text-[9px] font-black text-emerald-900 leading-tight text-center">
                تصویب نهایی
              </span>
            </div>

            {/* END REJECTED NODE */}
            <div
              onPointerDown={(e) => startDragNode(e, { kind: 'end_rejected' }, endRejectedPos)}
              onPointerEnter={() => connecting && setHoverTargetKey('end_rejected')}
              onPointerLeave={() => hoverTargetKey === 'end_rejected' && setHoverTargetKey(null)}
              onClick={(e) => {
                if (connecting) {
                  e.stopPropagation();
                  completeConnection({ kind: 'end_rejected' });
                }
              }}
              style={{
                left: `${endRejectedPos.x}px`,
                top: `${endRejectedPos.y}px`,
                width: `${CIRCLE_SIZE}px`,
                height: `${CIRCLE_SIZE}px`,
              }}
              dir="rtl"
              className={`absolute z-20 rounded-full bg-rose-50 border-4 border-rose-600 shadow-sm flex flex-col items-center justify-center transition ${
                connecting
                  ? connecting.branch !== 'approve'
                    ? 'cursor-crosshair ring-4 ring-rose-300 scale-105'
                    : 'opacity-40 cursor-not-allowed'
                  : 'cursor-grab active:cursor-grabbing'
              } ${hoverTargetKey === 'end_rejected' ? 'bg-rose-100 scale-110' : ''}`}
              title="پایان فرآیند با رد طرح"
            >
              <XCircle className="w-4 h-4 text-rose-700" />
              <span className="text-[9px] font-black text-rose-900 leading-tight text-center">
                رد و خاتمه
              </span>
            </div>

            {/* STEP TASK + GATEWAY NODES */}
            {steps.map((st, idx) => {
              const pos = getStepPos(idx);
              const isSelected = idx === selectedStepIdx;
              const assigneeCount = getStepAssigneeCount(st);
              const isConnectTarget = Boolean(connecting);
              const isHoverConnect = hoverTargetKey === `step-${idx}`;
              const isParallelDrop =
                hoverDropStepIdx === idx && dragPayload?.kind === 'toolbox-position';
              const isWaitAll = st.config.voteCollectionMode === 'WAIT_ALL';

              return (
                <div
                  key={st.localKey}
                  onPointerDown={(e) => {
                    if (connecting) return;
                    onSelectStep(idx);
                    startDragNode(e, { kind: 'step', idx }, pos);
                  }}
                  onPointerEnter={() => connecting && setHoverTargetKey(`step-${idx}`)}
                  onPointerLeave={() => hoverTargetKey === `step-${idx}` && setHoverTargetKey(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connecting) {
                      completeConnection({ kind: 'step', stepOrder: idx + 1 });
                    } else {
                      onSelectStep(idx);
                    }
                  }}
                  onDragOver={(e) => {
                    if (dragPayload?.kind === 'toolbox-position') {
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
                    }
                  }}
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: `${NODE_W}px`,
                    height: `${NODE_H}px`,
                  }}
                  dir="rtl"
                  className={`absolute z-20 rounded-2xl bg-white border-2 flex flex-col justify-between transition shadow-sm ${
                    isParallelDrop
                      ? 'border-emerald-500 ring-4 ring-emerald-200 bg-emerald-50/40'
                      : isHoverConnect
                      ? 'border-indigo-600 ring-4 ring-indigo-300 scale-[1.02]'
                      : isSelected
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                      : 'border-slate-300 hover:border-indigo-400'
                  } ${isConnectTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                >
                  {/* Card Top Bar */}
                  <div className="px-3 pt-2.5 pb-1.5 border-b border-slate-100 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg text-[11px] font-black flex items-center justify-center shrink-0 tabular-nums ${
                          idx === 0
                            ? 'bg-emerald-600 text-white'
                            : idx === steps.length - 1
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-white'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-xs font-extrabold text-slate-900 truncate">
                        {st.title || `گام ${idx + 1}`}
                      </span>
                    </div>

                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteStep(idx);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        title="حذف گام"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Card Middle: Positions & Gateway Rule */}
                  <div className="px-3 py-1.5 space-y-1.5 flex-1 overflow-hidden">
                    <div className="flex flex-wrap gap-1">
                      {st.positionIds.slice(0, 2).map((pid) => (
                        <span
                          key={pid}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 truncate max-w-[100px]"
                        >
                          <Briefcase className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{getPositionTitle(pid, st.structureId)}</span>
                        </span>
                      ))}
                      {st.positionIds.length > 2 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                          +{st.positionIds.length - 2}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border ${
                          isWaitAll
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : 'bg-violet-50 text-violet-800 border-violet-200'
                        }`}
                      >
                        {isWaitAll && <Clock className="w-2.5 h-2.5 text-indigo-600 shrink-0" />}
                        <span className="truncate">{approvalBadgeText(st.config)}</span>
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-slate-500 font-semibold tabular-nums shrink-0">
                        <Users className="w-3 h-3 text-slate-400" />
                        {assigneeCount}
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom: 3 BPMN Outgoing Gateway Ports */}
                  <div className="px-2 pb-1.5 pt-1 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStep(idx);
                        const orig = getPortOrigin(idx, 'approve');
                        setConnecting({ fromIdx: idx, branch: 'approve', mouseX: orig.x, mouseY: orig.y + 30 });
                      }}
                      className={`flex-1 py-0.5 px-1 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer transition ${
                        connecting?.fromIdx === idx && connecting.branch === 'approve'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                      title="کلیک و اتصال مسیر تایید این گام"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                      <span>تایید</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStep(idx);
                        const orig = getPortOrigin(idx, 'revision');
                        setConnecting({ fromIdx: idx, branch: 'revision', mouseX: orig.x, mouseY: orig.y + 30 });
                      }}
                      className={`flex-1 py-0.5 px-1 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer transition ${
                        connecting?.fromIdx === idx && connecting.branch === 'revision'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                      title="کلیک و اتصال مسیر اصلاح این گام"
                    >
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      <span>اصلاح</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStep(idx);
                        const orig = getPortOrigin(idx, 'reject');
                        setConnecting({ fromIdx: idx, branch: 'reject', mouseX: orig.x, mouseY: orig.y + 30 });
                      }}
                      className={`flex-1 py-0.5 px-1 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer transition ${
                        connecting?.fromIdx === idx && connecting.branch === 'reject'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                      }`}
                      title="کلیک و اتصال مسیر رد این گام"
                    >
                      <XCircle className="w-2.5 h-2.5 shrink-0" />
                      <span>رد</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
