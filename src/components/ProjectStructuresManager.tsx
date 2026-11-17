import React, { useState, useEffect, useMemo } from 'react';
import { ProjectStructure, User, Position, StructurePositionNode } from '../types';
import { api } from '../services/api';
import { PermissionsTreeModal } from './PermissionsTreeModal';
import { hasPerm, hasAnyPerm } from '../utils/permissions';
import {
  FolderTree,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Search,
  GitBranch,
  Layers,
  Tag,
  X,
  AlertCircle,
  Network,
  Users,
  Lock,
  ArrowRight,
  Shield,
  Briefcase,
  UserPlus,
  UserMinus,
  RefreshCw,
  GripVertical,
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';

interface ProjectStructuresManagerProps {
  structures: ProjectStructure[];
  positions: Position[];
  users: User[];
  currentUser: User;
  onRefresh: () => void;
}

export const ProjectStructuresManager: React.FC<ProjectStructuresManagerProps> = ({
  structures,
  positions,
  users,
  currentUser,
  onRefresh,
}) => {
  // Navigation / View state: strictly 'list' or 'tree'
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [selectedStructureId, setSelectedStructureId] = useState<string>(structures[0]?.id || '');

  // List view filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Structure Metadata Modal (Create / Edit Structure itself)
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<ProjectStructure | null>(null);
  const [structTitle, setStructTitle] = useState('');
  const [structCode, setStructCode] = useState('');
  const [structCategory, setStructCategory] = useState('سازمانی و اداری');
  const [structDescription, setStructDescription] = useState('');
  const [structIsActive, setStructIsActive] = useState(true);

  // Structure Tree & Positions State
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeSyncing, setTreeSyncing] = useState(false);
  const [structureTreeData, setStructureTreeData] = useState<StructurePositionNode[]>([]);
  const [structureRawPositions, setStructureRawPositions] = useState<StructurePositionNode[]>([]);
  const [currentStructureDetail, setCurrentStructureDetail] = useState<ProjectStructure | null>(null);

  // Selected branch in tree -> displays members & scoped permissions on left panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [inspectorUserSearch, setInspectorUserSearch] = useState('');

  // Position Node Add/Edit Modal
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<StructurePositionNode | null>(null);
  const [nodeParentSpId, setNodeParentSpId] = useState<string | null>(null);
  const [positionMode, setPositionMode] = useState<'existing' | 'new'>('existing');
  const [selectedExistingPosId, setSelectedExistingPosId] = useState<string>('');
  const [newPosTitle, setNewPosTitle] = useState('');
  const [newPosDescription, setNewPosDescription] = useState('');
  const [newPosColor, setNewPosColor] = useState('indigo');
  const [selectedInitialUserIds, setSelectedInitialUserIds] = useState<string[]>([]);

  // Permissions Modal state: either direct User OR scoped Structure-Position branch
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<User | null>(null);
  const [selectedSpForPerms, setSelectedSpForPerms] = useState<{
    id: string;
    positionTitle: string;
    structureTitle?: string;
    structureId?: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dndToast, setDndToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Drag & Drop state for visual tree builder
  type StructDragPayload =
    | { kind: 'tree-node'; nodeId: string }
    | { kind: 'palette-position'; positionId: string };
  const [dragPayload, setDragPayload] = useState<StructDragPayload | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [palettePosSearch, setPalettePosSearch] = useState('');
  const [quickPosTitle, setQuickPosTitle] = useState('');
  const [quickPosAdding, setQuickPosAdding] = useState(false);
  const [showPositionCatalog, setShowPositionCatalog] = useState(false);

  const canCreateStruct = hasPerm(currentUser, 'structures.create');
  const canEditStruct = hasPerm(currentUser, 'structures.edit');
  const canDeleteStruct = hasPerm(currentUser, 'structures.delete');
  const canAddPosNode = hasAnyPerm(currentUser, ['structures.create', 'structures.edit', 'org.positions.create']);
  const canEditPosNode = hasAnyPerm(currentUser, ['structures.edit', 'org.positions.edit']);
  const canDeletePosNode = hasAnyPerm(currentUser, ['structures.delete', 'org.positions.delete']);
  const canAssignUsers = hasAnyPerm(currentUser, ['structures.edit', 'org.positions.assign']);
  const canManagePerms = hasPerm(currentUser, 'system.permissions.manage');

  const categories = Array.from(new Set(structures.map((s) => s.category || 'سازمانی و اداری')));

  const buildLocalStructureTree = (flatNodes: StructurePositionNode[]): StructurePositionNode[] => {
    const map = new Map<string, StructurePositionNode>();
    flatNodes.forEach((n) => {
      map.set(n.id, { ...n, children: [] });
    });
    const roots: StructurePositionNode[] = [];
    const sorted = [...flatNodes].sort(
      (a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.title.localeCompare(b.title, 'fa')
    );
    for (const item of sorted) {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  };

  const updateLocalNodeUsers = (nodeId: string, transformUsers: (prevUsers: User[]) => User[]) => {
    setStructureRawPositions((prevRaw) => {
      const nextRaw = prevRaw.map((n) =>
        n.id === nodeId ? { ...n, users: transformUsers(n.users || []) } : n
      );
      setStructureTreeData(buildLocalStructureTree(nextRaw));
      return nextRaw;
    });
  };

  const loadStructureTree = async (structId: string, options?: { silent?: boolean; selectSpId?: string }) => {
    if (!structId) return;
    const isSameStructLoaded = currentStructureDetail?.id === structId && structureRawPositions.length > 0;
    const silent = Boolean(options?.silent || isSameStructLoaded);
    if (silent) {
      setTreeSyncing(true);
    } else {
      setTreeLoading(true);
    }
    try {
      const data = await api.getStructurePositions(structId);
      setCurrentStructureDetail(data.structure);
      setStructureTreeData(data.tree);
      setStructureRawPositions(data.positions);
      if (options?.selectSpId && data.positions.some((p) => p.id === options.selectSpId)) {
        setSelectedNodeId(options.selectSpId);
      } else {
        setSelectedNodeId((prev) => {
          if (prev && data.positions.some((p) => p.id === prev)) return prev;
          return data.tree[0]?.id || data.positions[0]?.id || null;
        });
      }
    } catch (err: any) {
      console.error('Error loading structure positions tree:', err);
    } finally {
      setTreeLoading(false);
      setTreeSyncing(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'tree' && selectedStructureId) {
      loadStructureTree(selectedStructureId);
    }
  }, [viewMode, selectedStructureId]);

  const selectedNode = useMemo(
    () => structureRawPositions.find((n) => n.id === selectedNodeId) || null,
    [structureRawPositions, selectedNodeId]
  );

  // Build ancestor breadcrumb for the selected branch
  const selectedNodePath = useMemo(() => {
    if (!selectedNode) return [];
    const path: StructurePositionNode[] = [];
    const seen = new Set<string>();
    let cur: StructurePositionNode | undefined = selectedNode;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? structureRawPositions.find((n) => n.id === cur?.parentId) : undefined;
    }
    return path;
  }, [selectedNode, structureRawPositions]);

  // Candidate users not yet assigned to the selected branch
  const availableUsersForSelectedNode = useMemo(() => {
    if (!selectedNode) return [];
    const assignedSet = new Set((selectedNode.users || []).map((u) => u.id));
    const q = inspectorUserSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (assignedSet.has(u.id)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.positionTitle && u.positionTitle.toLowerCase().includes(q))
      );
    });
  }, [selectedNode, users, inspectorUserSearch]);

  const handleOpenStructureTree = (structId: string) => {
    setSelectedStructureId(structId);
    setSelectedNodeId(null);
    setInspectorUserSearch('');
    setViewMode('tree');
  };

  // Structure Creation / Edit handlers
  const handleOpenCreateStructure = () => {
    setEditingStructure(null);
    setStructTitle('');
    setStructCode('');
    setStructCategory('سازمانی و اداری');
    setStructDescription('');
    setStructIsActive(true);
    setError('');
    setStructureModalOpen(true);
  };

  const handleOpenEditStructure = (struct: ProjectStructure) => {
    setEditingStructure(struct);
    setStructTitle(struct.title);
    setStructCode(struct.code || '');
    setStructCategory(struct.category || 'سازمانی و اداری');
    setStructDescription(struct.description || '');
    setStructIsActive(Boolean(struct.isActive));
    setError('');
    setStructureModalOpen(true);
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structTitle.trim()) {
      setError('عنوان ساختار الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: structTitle.trim(),
        code: structCode.trim() || undefined,
        category: structCategory.trim() || 'سازمانی و اداری',
        description: structDescription.trim(),
        isActive: structIsActive,
      };

      if (editingStructure) {
        await api.updateProjectStructure(editingStructure.id, payload);
        setStructureModalOpen(false);
        onRefresh();
      } else {
        const created = await api.createProjectStructure(payload);
        setStructureModalOpen(false);
        onRefresh();
        if (created && created.id) {
          setSelectedStructureId(created.id);
          setSelectedNodeId(null);
          setViewMode('tree');
        }
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت ساختار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStructure = async (struct: ProjectStructure) => {
    if (!confirm(`آیا از حذف ساختار «${struct.title}» اطمینان دارید؟`)) return;
    try {
      await api.deleteProjectStructure(struct.id);
      onRefresh();
      if (selectedStructureId === struct.id) {
        setViewMode('list');
      }
    } catch (err: any) {
      alert(err.message || 'خطا در حذف ساختار');
    }
  };

  const handleToggleActiveStructure = async (struct: ProjectStructure) => {
    try {
      await api.updateProjectStructure(struct.id, {
        title: struct.title,
        code: struct.code,
        category: struct.category,
        description: struct.description,
        isActive: !struct.isActive,
      });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در تغییر وضعیت');
    }
  };

  // Node (Position within structure) management
  const handleOpenAddNode = (parentNode?: StructurePositionNode) => {
    setEditingNode(null);
    setNodeParentSpId(parentNode ? parentNode.id : null);
    const firstUnused = positions.find((p) => !structureRawPositions.some((sp) => sp.positionId === p.id));
    setPositionMode(firstUnused ? 'existing' : 'new');
    setSelectedExistingPosId(firstUnused?.id || '');
    setNewPosTitle('');
    setNewPosDescription('');
    setNewPosColor(parentNode ? parentNode.color || 'indigo' : 'indigo');
    setSelectedInitialUserIds([]);
    setError('');
    setPositionModalOpen(true);
  };

  const handleOpenEditNode = (node: StructurePositionNode) => {
    setEditingNode(node);
    setNodeParentSpId(node.parentId || null);
    setPositionMode('new');
    setNewPosTitle(node.title);
    setNewPosDescription(node.description || '');
    setNewPosColor(node.color || 'indigo');
    setError('');
    setPositionModalOpen(true);
  };

  const handleSavePositionNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let createdSpId: string | undefined;
      if (editingNode) {
        await api.updateStructurePosition(selectedStructureId, editingNode.id, {
          parentId: nodeParentSpId,
          title: newPosTitle.trim(),
          description: newPosDescription.trim(),
          color: newPosColor,
        });
        createdSpId = editingNode.id;
      } else if (positionMode === 'existing') {
        if (!selectedExistingPosId) {
          setError('لطفاً یک سمت را انتخاب کنید.');
          setLoading(false);
          return;
        }
        const resp = await api.addStructurePosition(selectedStructureId, {
          positionId: selectedExistingPosId,
          parentId: nodeParentSpId,
          userIds: selectedInitialUserIds,
        });
        createdSpId = resp.structurePositionId;
      } else {
        if (!newPosTitle.trim()) {
          setError('عنوان سمت الزامی است.');
          setLoading(false);
          return;
        }
        const resp = await api.addStructurePosition(selectedStructureId, {
          title: newPosTitle.trim(),
          description: newPosDescription.trim(),
          color: newPosColor,
          parentId: nodeParentSpId,
          userIds: selectedInitialUserIds,
        });
        createdSpId = resp.structurePositionId;
      }

      setPositionModalOpen(false);
      await loadStructureTree(selectedStructureId, { silent: true, selectSpId: createdSpId });
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت سمت در ساختار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePositionNode = async (node: StructurePositionNode) => {
    if (
      !confirm(
        `آیا از حذف شاخه «${node.title}» از ساختار اطمینان دارید؟ (زیرشاخه‌ها به شاخه والد منتقل می‌شوند)`
      )
    ) {
      return;
    }
    try {
      await api.deleteStructurePosition(selectedStructureId, node.id);
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null);
      }
      await loadStructureTree(selectedStructureId, { silent: true });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف شاخه از ساختار');
    }
  };

  const handleAssignUserInline = async (nodeId: string, userId: string) => {
    const assignedUser = users.find((u) => u.id === userId);
    if (assignedUser) {
      updateLocalNodeUsers(nodeId, (prev) =>
        prev.some((u) => u.id === userId) ? prev : [...prev, assignedUser]
      );
    }
    try {
      await api.assignUserToStructurePosition(selectedStructureId, nodeId, userId);
      loadStructureTree(selectedStructureId, { silent: true, selectSpId: nodeId });
      onRefresh();
    } catch (err: any) {
      await loadStructureTree(selectedStructureId, { silent: true, selectSpId: nodeId });
      showToast('error', err.message || 'خطا در انتصاب کاربر به این شاخه');
    }
  };

  const handleRemoveUserFromNode = async (node: StructurePositionNode, user: User) => {
    if (!confirm(`آیا از لغو انتصاب «${user.name}» از سمت «${node.title}» در این ساختار اطمینان دارید؟`)) return;
    updateLocalNodeUsers(node.id, (prev) => prev.filter((u) => u.id !== user.id));
    try {
      await api.removeUserFromStructurePosition(selectedStructureId, node.id, user.id);
      loadStructureTree(selectedStructureId, { silent: true, selectSpId: node.id });
      onRefresh();
    } catch (err: any) {
      await loadStructureTree(selectedStructureId, { silent: true, selectSpId: node.id });
      showToast('error', err.message || 'خطا در لغو انتصاب');
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setDndToast({ type, text });
    setTimeout(() => {
      setDndToast((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  const isNodeDescendant = (potentialAncestorId: string, nodeId: string): boolean => {
    if (potentialAncestorId === nodeId) return true;
    let cur = structureRawPositions.find((n) => n.id === nodeId);
    const seen = new Set<string>();
    while (cur && cur.parentId) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      if (cur.parentId === potentialAncestorId) return true;
      cur = structureRawPositions.find((n) => n.id === cur?.parentId);
    }
    return false;
  };

  const moveStructureNode = async (
    draggedNodeId: string,
    newParentId: string | null,
    insertBeforeNodeId?: string | null
  ) => {
    if (!selectedStructureId) return;
    if (draggedNodeId === newParentId) return;
    if (newParentId && isNodeDescendant(draggedNodeId, newParentId)) {
      showToast('error', 'یک شاخه نمی‌تواند زیرمجموعه زیرشاخه‌های خودش قرار گیرد.');
      return;
    }

    const targetSiblings = structureRawPositions
      .filter((n) => (n.parentId || null) === (newParentId || null) && n.id !== draggedNodeId)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const draggedNode = structureRawPositions.find((n) => n.id === draggedNodeId);
    if (!draggedNode) return;

    let insertIdx = targetSiblings.length;
    if (insertBeforeNodeId) {
      const idx = targetSiblings.findIndex((s) => s.id === insertBeforeNodeId);
      if (idx !== -1) insertIdx = idx;
    }

    const updatedSiblings = [...targetSiblings];
    updatedSiblings.splice(insertIdx, 0, { ...draggedNode, parentId: newParentId });

    const itemsPayload = updatedSiblings.map((s, idx) => ({
      id: s.id,
      parentId: newParentId,
      orderIndex: idx,
    }));

    const orderMap = new Map<string, { parentId: string | null; orderIndex: number }>();
    itemsPayload.forEach((it) => orderMap.set(it.id, { parentId: it.parentId, orderIndex: it.orderIndex }));
    setStructureRawPositions((prevRaw) => {
      const nextRaw = prevRaw.map((n) => {
        const upd = orderMap.get(n.id);
        return upd ? { ...n, parentId: upd.parentId, orderIndex: upd.orderIndex } : n;
      });
      setStructureTreeData(buildLocalStructureTree(nextRaw));
      return nextRaw;
    });

    try {
      await api.reorderStructurePositions(selectedStructureId, itemsPayload);
      loadStructureTree(selectedStructureId, { silent: true, selectSpId: draggedNodeId });
      onRefresh();
      showToast('success', `جایگاه «${draggedNode.title}» به‌روزرسانی شد.`);
    } catch (err: any) {
      await loadStructureTree(selectedStructureId, { silent: true });
      showToast('error', err.message || 'خطا در تغییر جایگاه');
    }
  };

  const handleDropOnNode = async (e: React.DragEvent, targetNodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetKey(null);
    if (!dragPayload) return;

    const payload = dragPayload;
    setDragPayload(null);

    if (payload.kind === 'tree-node') {
      if (!canEditPosNode) return;
      await moveStructureNode(payload.nodeId, targetNodeId);
    } else if (payload.kind === 'palette-position') {
      if (!canAddPosNode) return;
      try {
        const resp = await api.addStructurePosition(selectedStructureId, {
          positionId: payload.positionId,
          parentId: targetNodeId,
        });
        await loadStructureTree(selectedStructureId, { silent: true, selectSpId: resp.structurePositionId });
        onRefresh();
        showToast('success', 'سمت به عنوان زیرشاخه جدید اضافه شد.');
      } catch (err: any) {
        showToast('error', err.message || 'خطا در افزودن سمت');
      }
    }
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetKey(null);
    if (!dragPayload) return;

    const payload = dragPayload;
    setDragPayload(null);

    if (payload.kind === 'tree-node') {
      if (!canEditPosNode) return;
      await moveStructureNode(payload.nodeId, null);
    } else if (payload.kind === 'palette-position') {
      if (!canAddPosNode) return;
      try {
        const resp = await api.addStructurePosition(selectedStructureId, {
          positionId: payload.positionId,
          parentId: null,
        });
        await loadStructureTree(selectedStructureId, { silent: true, selectSpId: resp.structurePositionId });
        onRefresh();
        showToast('success', 'سمت در سطح ریشه ساختار اضافه شد.');
      } catch (err: any) {
        showToast('error', err.message || 'خطا در افزودن سمت به ریشه');
      }
    }
  };

  const handleDropBetweenSiblings = async (
    e: React.DragEvent,
    parentId: string | null,
    beforeNodeId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetKey(null);
    if (!dragPayload) return;

    const payload = dragPayload;
    setDragPayload(null);

    if (payload.kind === 'tree-node') {
      await moveStructureNode(payload.nodeId, parentId, beforeNodeId);
    } else if (payload.kind === 'palette-position') {
      try {
        const resp = await api.addStructurePosition(selectedStructureId, {
          positionId: payload.positionId,
          parentId,
        });
        await loadStructureTree(selectedStructureId, { silent: true, selectSpId: resp.structurePositionId });
        onRefresh();
        showToast('success', 'سمت به ساختار اضافه شد.');
      } catch (err: any) {
        showToast('error', err.message || 'خطا در افزودن سمت');
      }
    }
  };

  const handleQuickAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPosTitle.trim() || !selectedStructureId) return;
    setQuickPosAdding(true);
    try {
      const targetParentId = selectedNodeId || null;
      const resp = await api.addStructurePosition(selectedStructureId, {
        title: quickPosTitle.trim(),
        parentId: targetParentId,
      });
      setQuickPosTitle('');
      await loadStructureTree(selectedStructureId, { silent: true, selectSpId: resp.structurePositionId });
      onRefresh();
      showToast('success', targetParentId ? 'شاخه زیرمجموعه جدید اضافه شد.' : 'شاخه جدید به ریشه ساختار اضافه شد.');
    } catch (err: any) {
      showToast('error', err.message || 'خطا در ایجاد شاخه سمت');
    } finally {
      setQuickPosAdding(false);
    }
  };

  const toggleNodeCollapsed = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // Recursive Tree Branch Renderer (Compact Hierarchical Explorer with clear RTL parent-child lines)
  const renderTreeBranch = (
    node: StructurePositionNode,
    depth: number = 0,
    isLastSibling: boolean = true
  ) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isCollapsed = collapsedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const isBeingDragged = dragPayload?.kind === 'tree-node' && dragPayload.nodeId === node.id;
    const isInvalidDrop = dragPayload?.kind === 'tree-node' && isNodeDescendant(dragPayload.nodeId, node.id);
    const isDropHighlight = dropTargetKey === `node:${node.id}` && !isInvalidDrop;
    const dropBetweenKey = `before:${node.parentId || 'root'}:${node.id}`;
    const userCount = node.users?.length || 0;
    const permCount = node.permissions?.length || 0;

    return (
      <div key={node.id} className="select-none relative">
        {/* Horizontal L/T connector from parent's vertical trunk to this child node (RTL) */}
        {depth > 0 && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-4 top-3.5 w-3.5 h-px bg-slate-300"
            />
            {isLastSibling && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-[17px] top-3.5 bottom-0 w-0.5 bg-white"
              />
            )}
          </>
        )}

        {canEditPosNode && dragPayload && (
          <div
            onDragOver={(e) => {
              if (
                dragPayload.kind === 'tree-node' &&
                (dragPayload.nodeId === node.id ||
                  (node.parentId && isNodeDescendant(dragPayload.nodeId, node.parentId)))
              ) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              setDropTargetKey(dropBetweenKey);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (dropTargetKey === dropBetweenKey) setDropTargetKey(null);
            }}
            onDrop={(e) => handleDropBetweenSiblings(e, node.parentId || null, node.id)}
            className={`transition-all rounded-full ${
              dropTargetKey === dropBetweenKey ? 'h-1.5 my-0.5 bg-indigo-500' : 'h-0.5 bg-transparent'
            }`}
          />
        )}

        {/* Slim Compact Branch Row */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedNodeId(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedNodeId(node.id);
            }
          }}
          draggable={canEditPosNode}
          onDragStart={(e) => {
            if (!canEditPosNode) return;
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
            setDragPayload({ kind: 'tree-node', nodeId: node.id });
          }}
          onDragEnd={() => {
            setDragPayload(null);
            setDropTargetKey(null);
          }}
          onDragOver={(e) => {
            if (!dragPayload || isInvalidDrop) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTargetKey(`node:${node.id}`);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (dropTargetKey === `node:${node.id}`) setDropTargetKey(null);
          }}
          onDrop={(e) => handleDropOnNode(e, node.id)}
          className={`group flex items-center justify-between gap-2 px-2 py-1 rounded-lg border transition cursor-pointer min-h-[30px] ${
            isBeingDragged
              ? 'opacity-45 border-dashed border-indigo-400 bg-indigo-50/40'
              : isDropHighlight
              ? 'ring-1 ring-indigo-500 border-indigo-500 bg-indigo-50/80'
              : isSelected
              ? 'border-indigo-400 bg-indigo-50/90 text-indigo-950'
              : 'border-transparent hover:border-slate-200 hover:bg-slate-50/90'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {canEditPosNode && (
              <span
                className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 cursor-grab active:cursor-grabbing shrink-0 transition-opacity"
                title="جابجایی در درخت"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-3 h-3" />
              </span>
            )}

            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleNodeCollapsed(node.id, e)}
                className="w-4 h-4 rounded hover:bg-slate-200/80 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                title={isCollapsed ? 'باز کردن زیرشاخه‌ها' : 'بستن زیرشاخه‌ها'}
              >
                {isCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-indigo-600' : depth === 0 ? 'bg-slate-500' : 'bg-slate-300'
                  }`}
                />
              </span>
            )}

            <span
              className={`text-xs truncate ${
                isSelected ? 'font-bold text-indigo-950' : depth === 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
              }`}
            >
              {node.title}
            </span>

            {depth === 0 && (
              <span className="text-[10px] text-indigo-600 font-semibold shrink-0">(ریشه)</span>
            )}

            <span className="text-[10px] text-slate-400 tabular-nums shrink-0 mr-1">
              ({userCount} نفر • {permCount} مجوز)
            </span>
          </div>

          <div
            className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
              isSelected || isDropHighlight ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            {isDropHighlight && (
              <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-0.5 ml-1">
                <ArrowDownToLine className="w-3 h-3" />
                <span>زیرشاخه</span>
              </span>
            )}
            {canAddPosNode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAddNode(node);
                }}
                className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-100/70 transition cursor-pointer"
                title="افزودن زیرشاخه"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {canEditPosNode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEditNode(node);
                }}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition cursor-pointer"
                title="ویرایش شاخه"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
            {canDeletePosNode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePositionNode(node);
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="حذف شاخه"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Children container with crisp RTL vertical trunk line */}
        {hasChildren && !isCollapsed && node.children && (
          <div className="relative mr-3.5 pr-4 border-r border-slate-300 space-y-0.5 mt-0.5">
            {node.children.map((child, idx) =>
              renderTreeBranch(child, depth + 1, idx === (node.children?.length || 1) - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const filteredStructures = structures.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(search.toLowerCase())) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = categoryFilter === 'ALL' || s.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60">
              <FolderTree className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {viewMode === 'tree'
                ? `درختواره ساختار: ${currentStructureDetail?.title || ''}`
                : 'مدیریت ساختارهای سازمانی'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {viewMode === 'tree'
              ? 'روی هر شاخه در درختواره سمت راست کلیک کنید تا اعضای منتصب و دسترسی‌های اختصاصی آن سمت در همین ساختار را در ستون چپ مدیریت کنید.'
              : 'تعریف ساختارهای سازمانی، چیدمان درختواره سمت‌ها و تنظیم دسترسی و اعضای هر شاخه به صورت مستقل برای هر ساختار.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {viewMode === 'tree' ? (
            <>
              <button
                onClick={() => setViewMode('list')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>بازگشت به فهرست ساختارها</span>
              </button>

              <button
                onClick={() => loadStructureTree(selectedStructureId, { silent: true })}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                title="بروزرسانی درختواره"
              >
                <RefreshCw className={`w-4 h-4 ${treeLoading || treeSyncing ? 'animate-spin text-indigo-600' : ''}`} />
              </button>

              {canAddPosNode && (
                <button
                  onClick={() => handleOpenAddNode()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن سمت به ریشه</span>
                </button>
              )}
            </>
          ) : (
            canCreateStruct && (
              <button
                onClick={handleOpenCreateStructure}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف ساختار سازمانی جدید</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* ===================== VIEW MODE 1: LIST OF STRUCTURES ===================== */}
      {viewMode === 'list' && (
        <div className="space-y-5">
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در ساختارها یا کد..."
                className="w-full pr-9 pl-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs text-slate-500 whitespace-nowrap ml-1">دسته‌بندی:</span>
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  categoryFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                همه ({structures.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Structures */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStructures.map((struct) => {
              const isAct = Boolean(struct.isActive);
              return (
                <div
                  key={struct.id}
                  className={`p-5 rounded-2xl bg-white border transition flex flex-col justify-between ${
                    isAct ? 'border-slate-200 hover:border-indigo-300' : 'border-slate-200 opacity-65 bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                          <Layers className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                            {struct.title}
                          </h3>
                          {struct.code && (
                            <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                              #{struct.code}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                          isAct
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {isAct ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{isAct ? 'فعال' : 'غیرفعال'}</span>
                      </span>
                    </div>

                    {struct.description && (
                      <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">
                        {struct.description}
                      </p>
                    )}

                    <div className="space-y-1.5 pt-2.5 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          دسته‌بندی:
                        </span>
                        <span className="font-medium text-slate-700 text-[11px]">
                          {struct.category || 'سازمانی و اداری'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-emerald-600" />
                          گردش کار متصل:
                        </span>
                        <span className="font-semibold text-emerald-700 text-[11px] truncate max-w-[160px]">
                          {struct.defaultWorkflowTitle || 'گردش کار پیش‌فرض'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100 text-center tabular-nums">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] text-slate-500">سمت‌های ساختار</div>
                          <div className="text-xs font-bold text-slate-900">{struct.positionCount || 0}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] text-slate-500">افراد منتصب</div>
                          <div className="text-xs font-bold text-slate-900">{struct.userCount || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-slate-100 space-y-2">
                    <button
                      onClick={() => handleOpenStructureTree(struct.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      <Network className="w-4 h-4" />
                      <span>باز کردن درختواره، اعضا و دسترسی‌ها</span>
                    </button>

                    {(canEditStruct || canDeleteStruct) && (
                      <div className="flex items-center justify-between pt-1">
                        {canEditStruct ? (
                          <button
                            onClick={() => handleToggleActiveStructure(struct)}
                            className="text-[11px] text-slate-500 hover:text-slate-800 transition cursor-pointer"
                          >
                            {isAct ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                          </button>
                        ) : (
                          <span />
                        )}

                        <div className="flex items-center gap-1.5">
                          {canEditStruct && (
                            <button
                              onClick={() => handleOpenEditStructure(struct)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                              title="ویرایش مشخصات ساختار"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteStruct && (
                            <button
                              onClick={() => handleDeleteStructure(struct)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="حذف ساختار"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredStructures.length === 0 && (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">ساختاری با مشخصات فوق یافت نشد.</p>
              <p className="text-xs text-slate-400 mt-1">
                می‌توانید با دکمه «تعریف ساختار سازمانی جدید» ساختار مورد نظرتان را ایجاد کنید.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW MODE 2: RTL SPLIT TREE WORKSPACE ===================== */}
      {viewMode === 'tree' && (
        <div className="space-y-4">
          {/* Structure Selector Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                ساختار انتخاب‌شده:
              </label>
              <select
                value={selectedStructureId}
                onChange={(e) => {
                  setSelectedStructureId(e.target.value);
                  setSelectedNodeId(null);
                  setInspectorUserSearch('');
                }}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.category || 'ساختار سازمانی'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 tabular-nums">
              <span>
                شاخه‌ها: <strong className="text-slate-900 font-bold">{structureRawPositions.length}</strong>
              </span>
              <span>
                کل افراد منتصب:{' '}
                <strong className="text-slate-900 font-bold">
                  {structureRawPositions.reduce((acc, p) => acc + (p.users?.length || 0), 0)}
                </strong>
              </span>
            </div>
          </div>

          {dndToast && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                dndToast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{dndToast.text}</span>
              <button onClick={() => setDndToast(null)} className="p-0.5 hover:opacity-70 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Split RTL Workspace: Right = Tree Explorer | Left = Selected Branch Members & Scoped Permissions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* RIGHT COLUMN (in RTL): Compact Scrollable Tree Explorer */}
            <div className="lg:col-span-7 space-y-3">
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      درختواره سمت‌های ساختار «{currentStructureDetail?.title || ''}»
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {canAddPosNode && (
                      <button
                        type="button"
                        onClick={() => setShowPositionCatalog((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition flex items-center gap-1 ${
                          showPositionCatalog
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <Briefcase className="w-3 h-3" />
                        <span>سمت‌های آماده ({positions.length})</span>
                      </button>
                    )}
                    {structureTreeData.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (collapsedNodes.size > 0) setCollapsedNodes(new Set());
                          else setCollapsedNodes(new Set(structureRawPositions.map((n) => n.id)));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer transition"
                      >
                        {collapsedNodes.size > 0 ? 'باز کردن همه' : 'بستن شاخه‌ها'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Add Position Branch Bar */}
                {canAddPosNode && (
                  <form onSubmit={handleQuickAddPosition} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={quickPosTitle}
                      onChange={(e) => setQuickPosTitle(e.target.value)}
                      placeholder={
                        selectedNode
                          ? `افزودن سمت جدید زیرمجموعه «${selectedNode.title}» + Enter...`
                          : 'نام سمت جدید برای افزودن به ریشه + Enter...'
                      }
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                    />
                    <button
                      type="submit"
                      disabled={quickPosAdding || !quickPosTitle.trim()}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{selectedNode ? 'زیرشاخه' : 'در ریشه'}</span>
                    </button>
                  </form>
                )}

                {/* Collapsible System Positions Catalog (inline right inside tree card when toggled) */}
                {canAddPosNode && showPositionCatalog && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700">
                        {selectedNode
                          ? `افزودن زیرشاخه برای «${selectedNode.title}» از سمت‌های سیستم:`
                          : 'افزودن به ریشه ساختار از سمت‌های سیستم:'}
                      </span>
                      <div className="relative w-full sm:w-48">
                        <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={palettePosSearch}
                          onChange={(e) => setPalettePosSearch(e.target.value)}
                          placeholder="جستجوی سمت..."
                          className="w-full pr-7 pl-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pl-1">
                      {positions
                        .filter((p) => p.title.toLowerCase().includes(palettePosSearch.toLowerCase()))
                        .map((pos) => {
                          const alreadyInStruct = structureRawPositions.some((sp) => sp.positionId === pos.id);
                          return (
                            <div
                              key={pos.id}
                              draggable={!alreadyInStruct}
                              onDragStart={(e) => {
                                if (alreadyInStruct) return;
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData('text/plain', pos.id);
                                setDragPayload({ kind: 'palette-position', positionId: pos.id });
                              }}
                              onDragEnd={() => {
                                setDragPayload(null);
                                setDropTargetKey(null);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 transition ${
                                alreadyInStruct
                                  ? 'bg-slate-100 border-slate-200 text-slate-400'
                                  : 'bg-white hover:bg-indigo-50/40 border-slate-200 hover:border-indigo-300 text-slate-800 cursor-grab active:cursor-grabbing'
                              }`}
                            >
                              <span className="font-semibold truncate">{pos.title}</span>
                              {alreadyInStruct ? (
                                <span className="text-[10px] text-emerald-700 font-semibold shrink-0">در ساختار</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const resp = await api.addStructurePosition(selectedStructureId, {
                                        positionId: pos.id,
                                        parentId: selectedNodeId || null,
                                      });
                                      await loadStructureTree(selectedStructureId, {
                                        silent: true,
                                        selectSpId: resp.structurePositionId,
                                      });
                                      onRefresh();
                                      showToast(
                                        'success',
                                        selectedNode
                                          ? `«${pos.title}» زیرمجموعه «${selectedNode.title}» اضافه شد.`
                                          : `«${pos.title}» به ریشه ساختار اضافه شد.`
                                      );
                                    } catch (err: any) {
                                      showToast('error', err.message || 'خطا در افزودن سمت');
                                    }
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 transition font-bold cursor-pointer shrink-0"
                                >
                                  + افزودن
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Root Drop Zone when dragging */}
                {canEditPosNode && dragPayload && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTargetKey('root-zone');
                    }}
                    onDragLeave={() => {
                      if (dropTargetKey === 'root-zone') setDropTargetKey(null);
                    }}
                    onDrop={handleDropOnRoot}
                    className={`p-2 rounded-lg border-2 border-dashed text-center text-[11px] transition ${
                      dropTargetKey === 'root-zone'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-bold'
                        : 'border-indigo-300 bg-indigo-50/30 text-indigo-700 font-medium'
                    }`}
                  >
                    اینجا رها کنید تا در بالاترین سطح (ریشه ساختار) قرار گیرد
                  </div>
                )}

                {treeLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    در حال بارگذاری درختواره ساختار...
                  </div>
                ) : structureTreeData.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-3">
                    <Network className="w-9 h-9 text-slate-300 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-800">هنوز سمتی در این ساختار تعریف نشده است</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      از کادر بالا نام سمت را وارد کنید یا از دکمه «سمت‌های آماده» یک سمت را به این ساختار اضافه کنید.
                    </p>
                    {canAddPosNode && (
                      <button
                        onClick={() => handleOpenAddNode()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>افزودن اولین سمت به ساختار</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-280px)] min-h-[240px] overflow-y-auto overflow-x-auto pl-1 py-1 space-y-0.5">
                    {structureTreeData.map((rootNode, idx) =>
                      renderTreeBranch(rootNode, 0, idx === structureTreeData.length - 1)
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* LEFT COLUMN (in RTL): Selected Branch Inspector — Assigned Users & Scoped Permissions */}
            <div className="lg:col-span-5 lg:sticky lg:top-4">
              {selectedNode ? (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-5">
                  {/* Selected Branch Header */}
                  <div className="space-y-2 pb-4 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap mb-1">
                          <span>{currentStructureDetail?.title || ''}</span>
                          {selectedNodePath.map((seg) => (
                            <React.Fragment key={seg.id}>
                              <span>/</span>
                              <span className={seg.id === selectedNode.id ? 'font-bold text-indigo-700' : ''}>
                                {seg.title}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>{selectedNode.title}</span>
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canEditPosNode && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditNode(selectedNode)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                            title="ویرایش شاخه"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedNode.description && (
                      <p className="text-xs text-slate-600 leading-relaxed">{selectedNode.description}</p>
                    )}

                    {/* Isolated Structure-Position Permissions Card */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 mt-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>دسترسی‌های این سمت در این ساختار</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {selectedNode.permissions?.length || 0} مجوز فعال (کاملاً مجزا از سایر ساختارها)
                        </div>
                      </div>
                      {canManagePerms && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSpForPerms({
                              id: selectedNode.id,
                              positionTitle: selectedNode.title,
                              structureTitle: currentStructureDetail?.title,
                              structureId: currentStructureDetail?.id,
                            })
                          }
                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>تنظیم دسترسی</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assigned Personnel inside Selected Branch */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>افراد منتصب در «{selectedNode.title}»</span>
                      </h4>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {selectedNode.users?.length || 0} نفر
                      </span>
                    </div>

                    {selectedNode.users && selectedNode.users.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto pl-1">
                        {selectedNode.users.map((u) => (
                          <div
                            key={u.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-white">
                                {u.avatar ? (
                                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                    {u.name.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate">{u.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate">@{u.username}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {canManagePerms && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedUserForPerms(u)}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                                  title="دسترسی‌های شخصی و ارث‌بری شده کاربر"
                                >
                                  <Shield className="w-3 h-3 text-indigo-600" />
                                  <span>دسترسی‌ها</span>
                                </button>
                              )}
                              {canAssignUsers && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveUserFromNode(selectedNode, u)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="حذف فرد از این شاخه"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                        هنوز هیچ کاربری در سمت «{selectedNode.title}» داخل این ساختار عضو نشده است.
                      </div>
                    )}
                  </div>

                  {/* Quick Inline User Assignment Picker */}
                  {canAssignUsers && (
                    <div className="pt-4 border-t border-slate-100 space-y-2.5">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-emerald-600" />
                        <span>افزودن فرد به «{selectedNode.title}»</span>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={inspectorUserSearch}
                          onChange={(e) => setInspectorUserSearch(e.target.value)}
                          placeholder="جستجوی نام یا نام کاربری برای انتصاب..."
                          className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pl-1">
                        {availableUsersForSelectedNode.length === 0 ? (
                          <div className="py-3 text-center text-[11px] text-slate-400">
                            کاربر دیگری برای انتصاب یافت نشد.
                          </div>
                        ) : (
                          availableUsersForSelectedNode.map((u) => (
                            <div
                              key={u.id}
                              className="px-3 py-2 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white flex items-center justify-between gap-2 transition"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-800 truncate">{u.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">@{u.username}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAssignUserInline(selectedNode.id, u.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-[11px] font-bold transition cursor-pointer shrink-0"
                              >
                                + انتصاب
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
                  <Users className="w-9 h-9 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">یک شاخه از درختواره انتخاب کنید</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    با کلیک روی هر سمت در درختواره ساختار، اعضای آن و تنظیمات دسترسی اختصاصی‌اش در این بخش نمایش داده می‌شود.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE / EDIT PROJECT STRUCTURE ===================== */}
      {structureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <FolderTree className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingStructure ? 'ویرایش مشخصات ساختار سازمانی' : 'تعریف ساختار سازمانی جدید'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تعریف ساختار و چیدمان درختواره سمت‌ها و پرسنل
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStructureModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveStructure} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان ساختار سازمانی *
                </label>
                <input
                  type="text"
                  required
                  value={structTitle}
                  onChange={(e) => setStructTitle(e.target.value)}
                  placeholder="مثال: ساختار ماموریت‌ها، ساختار مالی، ساختار شورا..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    کد سیستمی / شناسه یکتا
                  </label>
                  <input
                    type="text"
                    value={structCode}
                    onChange={(e) => setStructCode(e.target.value)}
                    placeholder="مثال: MISSION_AFFAIRS"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition text-left"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حوزه / دسته‌بندی
                  </label>
                  <input
                    type="text"
                    value={structCategory}
                    onChange={(e) => setStructCategory(e.target.value)}
                    placeholder="امور اداری، منابع انسانی، مالی..."
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  توضیحات ساختار
                </label>
                <textarea
                  rows={2}
                  value={structDescription}
                  onChange={(e) => setStructDescription(e.target.value)}
                  placeholder="توضیح کاربرد این ساختار..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="structActiveCheckbox"
                  checked={structIsActive}
                  onChange={(e) => setStructIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="structActiveCheckbox" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  این ساختار سازمانی در سامانه فعال باشد.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStructureModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingStructure ? 'بروزرسانی ساختار' : 'ثبت و ساخت درختواره'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD / EDIT POSITION IN STRUCTURE TREE ===================== */}
      {positionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Network className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingNode
                      ? 'ویرایش شاخه در ساختار'
                      : `افزودن سمت به ساختار «${currentStructureDetail?.title || ''}»`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تعیین موقعیت شاخه و اعضای آن در این ساختار
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPositionModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSavePositionNode} className="p-5 space-y-4">
              {!editingNode && (
                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-700">
                  <button
                    type="button"
                    onClick={() => setPositionMode('existing')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                      positionMode === 'existing' ? 'bg-white text-indigo-700' : 'text-slate-600'
                    }`}
                  >
                    انتخاب از سمت‌های تعریف‌شده سیستم
                  </button>
                  <button
                    type="button"
                    onClick={() => setPositionMode('new')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                      positionMode === 'new' ? 'bg-white text-indigo-700' : 'text-slate-600'
                    }`}
                  >
                    ایجاد سمت با عنوان جدید
                  </button>
                </div>
              )}

              {!editingNode && positionMode === 'existing' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    انتخاب سمت (دسترسی‌ها منحصراً برای همین ساختار تنظیم می‌شوند):
                  </label>
                  <select
                    value={selectedExistingPosId}
                    onChange={(e) => setSelectedExistingPosId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  >
                    <option value="">-- یک سمت انتخاب کنید --</option>
                    {positions.map((p) => {
                      const alreadyInThisStruct = structureRawPositions.some((sp) => sp.positionId === p.id);
                      return (
                        <option key={p.id} value={p.id} disabled={alreadyInThisStruct}>
                          {p.title}
                          {alreadyInThisStruct ? ' (قبلاً در این ساختار اضافه شده)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {(editingNode || positionMode === 'new') && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      عنوان سمت *
                    </label>
                    <input
                      type="text"
                      required
                      value={newPosTitle}
                      onChange={(e) => setNewPosTitle(e.target.value)}
                      placeholder="مثال: مدیر، ناظر فنی..."
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      شرح وظایف سمت
                    </label>
                    <textarea
                      rows={2}
                      value={newPosDescription}
                      onChange={(e) => setNewPosDescription(e.target.value)}
                      placeholder="توضیح اختیاری..."
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition resize-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شاخه بالادست (والد در درختواره):
                </label>
                <select
                  value={nodeParentSpId || ''}
                  onChange={(e) => setNodeParentSpId(e.target.value || null)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                >
                  <option value="">سطح ریشه ساختار (بدون والد)</option>
                  {structureRawPositions
                    .filter((sp) => (editingNode ? sp.id !== editingNode.id : true))
                    .map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        زیرشاخه: {sp.title}
                      </option>
                    ))}
                </select>
              </div>

              {!editingNode && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    انتصاب اولیه افراد به این شاخه (اختیاری):
                  </label>
                  <div className="max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    {users.map((u) => {
                      const isSelected = selectedInitialUserIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedInitialUserIds((prev) => [...prev, u.id]);
                              } else {
                                setSelectedInitialUserIds((prev) => prev.filter((id) => id !== u.id));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-semibold text-slate-800">{u.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">@{u.username}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPositionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingNode ? 'ذخیره تغییرات شاخه' : 'افزودن به درختواره'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== PERMISSIONS TREE MODAL (USER OR STRUCTURE POSITION) ===================== */}
      {selectedUserForPerms && (
        <PermissionsTreeModal
          user={selectedUserForPerms}
          onClose={() => setSelectedUserForPerms(null)}
          onSuccess={() => {
            loadStructureTree(selectedStructureId, { silent: true });
            onRefresh();
          }}
        />
      )}

      {selectedSpForPerms && (
        <PermissionsTreeModal
          structurePosition={selectedSpForPerms}
          onClose={() => setSelectedSpForPerms(null)}
          onSuccess={() => {
            loadStructureTree(selectedStructureId, { silent: true });
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
