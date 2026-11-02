import React, { useState, useEffect } from 'react';
import { ProjectStructure, User, Position, StructurePositionNode } from '../types';
import { api } from '../services/api';
import { PermissionsTreeModal } from './PermissionsTreeModal';
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
  FolderOpen
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
  // Navigation / View state: 'list' for all structures cards, 'tree' for managing a specific structure's positions
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
  const [structureTreeData, setStructureTreeData] = useState<StructurePositionNode[]>([]);
  const [structureRawPositions, setStructureRawPositions] = useState<StructurePositionNode[]>([]);
  const [currentStructureDetail, setCurrentStructureDetail] = useState<ProjectStructure | null>(null);

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

  // Assign User to Node Modal
  const [assignUserModalOpen, setAssignUserModalOpen] = useState(false);
  const [assignTargetNode, setAssignTargetNode] = useState<StructurePositionNode | null>(null);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState<string>('');

  // Permissions Modal state (can target user OR position directly from tree node)
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<User | null>(null);
  const [selectedPosForPerms, setSelectedPosForPerms] = useState<Position | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN' || 
    (Array.isArray(currentUser.permissions) && 
      (currentUser.permissions.includes('system.structures.manage') || currentUser.permissions.includes('org.positions.manage')));

  // Extract unique categories
  const categories = Array.from(new Set(structures.map((s) => s.category || 'سازمانی و اداری')));

  // Load structure positions when tree view is active or structure changes
  const loadStructureTree = async (structId: string) => {
    if (!structId) return;
    setTreeLoading(true);
    try {
      const data = await api.getStructurePositions(structId);
      setCurrentStructureDetail(data.structure);
      setStructureTreeData(data.tree);
      setStructureRawPositions(data.positions);
    } catch (err: any) {
      console.error('Error loading structure positions tree:', err);
    } finally {
      setTreeLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'tree' && selectedStructureId) {
      loadStructureTree(selectedStructureId);
    }
  }, [viewMode, selectedStructureId]);

  // Open Tree View for a specific structure
  const handleOpenStructureTree = (structId: string) => {
    setSelectedStructureId(structId);
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
      } else {
        const created = await api.createProjectStructure(payload);
        if (created && created.id) {
          setSelectedStructureId(created.id);
        }
      }

      setStructureModalOpen(false);
      onRefresh();
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
    setPositionMode('existing');
    setSelectedExistingPosId(positions[0]?.id || '');
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
      if (editingNode) {
        // Update existing node
        await api.updateStructurePosition(selectedStructureId, editingNode.id, {
          parentId: nodeParentSpId,
          title: newPosTitle.trim(),
          description: newPosDescription.trim(),
          color: newPosColor,
        });
      } else {
        // Add new node to structure
        if (positionMode === 'existing') {
          if (!selectedExistingPosId) {
            setError('لطفاً یک سمت را انتخاب کنید.');
            setLoading(false);
            return;
          }
          await api.addStructurePosition(selectedStructureId, {
            positionId: selectedExistingPosId,
            parentId: nodeParentSpId,
            userIds: selectedInitialUserIds,
          });
        } else {
          if (!newPosTitle.trim()) {
            setError('عنوان سمت الزامی است.');
            setLoading(false);
            return;
          }
          await api.addStructurePosition(selectedStructureId, {
            title: newPosTitle.trim(),
            description: newPosDescription.trim(),
            color: newPosColor,
            parentId: nodeParentSpId,
            userIds: selectedInitialUserIds,
          });
        }
      }

      setPositionModalOpen(false);
      await loadStructureTree(selectedStructureId);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت سمت در ساختار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePositionNode = async (node: StructurePositionNode) => {
    if (!confirm(`آیا از حذف سمت «${node.title}» از ساختار اطمینان دارید؟ (در صورت وجود زیرمجموعه، به سمت والد منتقل خواهند شد)`)) return;
    try {
      await api.deleteStructurePosition(selectedStructureId, node.id);
      await loadStructureTree(selectedStructureId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف سمت از ساختار');
    }
  };

  // User Assignment to Position Node
  const handleOpenAssignUser = (node: StructurePositionNode) => {
    setAssignTargetNode(node);
    // Filter users not already in this node
    const existingUserIds = new Set(node.users.map((u) => u.id));
    const available = users.filter((u) => !existingUserIds.has(u.id));
    setSelectedUserToAssign(available[0]?.id || '');
    setAssignUserModalOpen(true);
  };

  const handleConfirmAssignUser = async () => {
    if (!assignTargetNode || !selectedUserToAssign) return;
    try {
      await api.assignUserToStructurePosition(selectedStructureId, assignTargetNode.id, selectedUserToAssign);
      setAssignUserModalOpen(false);
      await loadStructureTree(selectedStructureId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در انتصاب کاربر به این سمت');
    }
  };

  const handleRemoveUserFromNode = async (node: StructurePositionNode, user: User) => {
    if (!confirm(`آیا از لغو انتصاب کاربر «${user.name}» از سمت «${node.title}» در این ساختار اطمینان دارید؟`)) return;
    try {
      await api.removeUserFromStructurePosition(selectedStructureId, node.id, user.id);
      await loadStructureTree(selectedStructureId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در لغو انتصاب');
    }
  };

  // Recursive Tree Node Renderer for Structure Positions
  const renderStructureTreeNode = (node: StructurePositionNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isRoot = depth === 0;

    return (
      <div key={node.id} className="relative flex flex-col items-stretch">
        
        {/* Node Box */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition shadow-xs relative group ${
            isRoot
              ? 'bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border-indigo-200 ring-1 ring-indigo-500/10'
              : depth === 1
              ? 'bg-white border-blue-200 hover:border-indigo-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          style={{ marginRight: `${depth * 28}px` }}
        >
          {/* Header Row: Position Title, Hierarchy Level, Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border ${
                isRoot
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {depth + 1}
              </span>

              <div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{node.title}</span>
                  {isRoot && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                      سمت ریشه ساختار
                    </span>
                  )}
                </h4>
                {node.parentTitle && (
                  <span className="text-[11px] text-slate-500">
                    مستقر زیرمجموعه: <strong className="text-indigo-700 font-bold">{node.parentTitle}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Actions for this Node */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Position-level permissions button */}
              <button
                onClick={() => {
                  const basePos = positions.find((p) => p.id === node.positionId) || {
                    id: node.positionId,
                    title: node.title,
                    createdAt: node.createdAt || new Date().toISOString(),
                  };
                  setSelectedPosForPerms(basePos);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-medium transition cursor-pointer"
                title="مشاهده و ویرایش ماتریس دسترسی‌های پایه این سمت"
              >
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">دسترسی‌های سمت</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-bold">
                  {node.permissions?.length || 0}
                </span>
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => handleOpenAssignUser(node)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold transition cursor-pointer"
                    title="انتصاب پرسنل و کاربر به این سمت در ساختار"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">انتصاب کاربر</span>
                  </button>

                  <button
                    onClick={() => handleOpenAddNode(node)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                    title="افزودن سمت زیرمجموعه به این گره"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleOpenEditNode(node)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                    title="ویرایش سمت یا تغییر والد"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeletePositionNode(node)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="حذف سمت از این ساختار"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Description */}
          {node.description && (
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              {node.description}
            </p>
          )}

          {/* Personnel Assigned to this Node & Granular Individual Permissions Button */}
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                پرسنل منتصب در این سمت:
              </span>
              <span className="text-[10px] text-slate-400">
                سلسله‌مراتب: رده {node.level || depth + 1}
              </span>
            </div>

            {node.users && node.users.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1">
                {node.users.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between gap-2 hover:bg-white hover:border-indigo-200 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-indigo-200">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            {u.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">{u.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">@{u.username}</div>
                      </div>
                    </div>

                    {/* Direct Button: Edit Individual User Permissions right from this node! */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setSelectedUserForPerms(u)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-2xs transition cursor-pointer"
                        title="ویرایش مستقیم دسترسی‌های این کاربر در سامانه"
                      >
                        <Shield className="w-3 h-3" />
                        <span>دسترسی‌ها</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveUserFromNode(node, u)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="لغو انتصاب این کاربر از این سمت"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 text-center">
                <span className="text-xs text-slate-400">
                  هنوز کاربری به این سمت در ساختار «{currentStructureDetail?.title || ''}» منتصب نشده است.
                </span>
                {isAdmin && (
                  <button
                    onClick={() => handleOpenAssignUser(node)}
                    className="mr-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    انتصاب کاربر از سیستم
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Recursive Children with RTL connector lines */}
        {hasChildren && node.children && (
          <div className="relative mt-3 space-y-3 pr-4 border-r-2 border-indigo-200">
            {node.children.map((child) => renderStructureTreeNode(child, depth + 1))}
          </div>
        )}

      </div>
    );
  };

  const filteredStructures = structures.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(search.toLowerCase())) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = categoryFilter === 'ALL' || s.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Mode Toggle */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60">
              <FolderTree className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              {viewMode === 'list' 
                ? 'مدیریت ساختار سازمانی'
                : `چارت سازمانی، سمت‌ها و پرسنل ساختار: ${currentStructureDetail?.title || ''}`
              }
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {viewMode === 'list'
              ? 'تعریف ساختارهای سازمانی (مانند اداری، مالی، ماموریت، مرخصی و...)، چینش درختی سمت‌ها، انتصاب پرسنل و تنظیم دسترسی‌های فردی.'
              : 'طراحی درخت سلسله‌مراتب سمت‌ها در این ساختار، انتصاب کاربران به هر سمت و ویرایش مستقیم سطوح دسترسی هر فرد.'
            }
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {viewMode === 'tree' ? (
            <>
              <button
                onClick={() => setViewMode('list')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>بازگشت به فهرست ساختارها</span>
              </button>

              <button
                onClick={() => loadStructureTree(selectedStructureId)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                title="بروزرسانی درخت سمت‌ها"
              >
                <RefreshCw className={`w-4 h-4 ${treeLoading ? 'animate-spin text-indigo-600' : ''}`} />
              </button>

              {isAdmin && (
                <button
                  onClick={() => handleOpenAddNode()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن سمت جدید در ریشه ساختار</span>
                </button>
              )}
            </>
          ) : (
            isAdmin && (
              <button
                onClick={handleOpenCreateStructure}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
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
        <div className="space-y-6">
          
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
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

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs text-slate-500 whitespace-nowrap">دسته‌بندی:</span>
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  categoryFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-xs'
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
                      ? 'bg-indigo-600 text-white shadow-xs'
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
                  className={`p-5 rounded-2xl bg-white border transition shadow-xs flex flex-col justify-between ${
                    isAct ? 'border-slate-200 hover:border-indigo-300' : 'border-slate-200 opacity-60 bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                          <Layers className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {struct.title}
                          </h3>
                          {struct.code && (
                            <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                              #{struct.code}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        isAct 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {isAct ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>فعال</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span>غیرفعال</span>
                          </>
                        )}
                      </span>
                    </div>

                    {struct.description && (
                      <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">
                        {struct.description}
                      </p>
                    )}

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          دسته‌بندی:
                        </span>
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                          {struct.category || 'تولید تلویزیونی'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-emerald-600" />
                          گردش کار متصل:
                        </span>
                        <span className="font-semibold text-emerald-700 text-[11px] truncate max-w-[150px]">
                          {struct.defaultWorkflowTitle || 'گردش کار پیش‌فرض'}
                        </span>
                      </div>

                      {/* Stats Badges */}
                      <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-100 text-center">
                        <div className="p-2 rounded-xl bg-indigo-50/60 border border-indigo-100">
                          <div className="text-[10px] text-indigo-500 font-medium">سمت‌های ساختار</div>
                          <div className="text-xs font-bold text-indigo-700">{struct.positionCount || 0}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                          <div className="text-[10px] text-emerald-600 font-medium">پرسنل منصوب‌شده</div>
                          <div className="text-xs font-bold text-emerald-700">{struct.userCount || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Core Action: Open Structure's Dedicated Tree */}
                  <div className="pt-3 mt-4 border-t border-slate-100 space-y-2">
                    <button
                      onClick={() => handleOpenStructureTree(struct.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <Network className="w-4 h-4" />
                      <span>مدیریت چارت، سمت‌ها و پرسنل این ساختار</span>
                    </button>

                    {isAdmin && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => handleToggleActiveStructure(struct)}
                          className="text-[11px] text-slate-500 hover:text-slate-800 transition cursor-pointer"
                        >
                          {isAct ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditStructure(struct)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="ویرایش مشخصات ساختار"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStructure(struct)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="حذف ساختار"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
              <p className="text-xs text-slate-400 mt-1">می‌توانید با زدن دکمه «تعریف ساختار سازمانی جدید» گزینه مورد نظرتان را اضافه کنید.</p>
            </div>
          )}

        </div>
      )}

      {/* ===================== VIEW MODE 2: HIERARCHICAL TREE OF CHOSEN STRUCTURE ===================== */}
      {viewMode === 'tree' && (
        <div className="space-y-6">
          
          {/* Structure Selector Toolbar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                انتخاب ساختار جهت نمایش چارت:
              </label>
              <select
                value={selectedStructureId}
                onChange={(e) => setSelectedStructureId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.category || 'تولید'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>تعداد سمت‌های چارت: <strong className="text-indigo-600 font-bold">{structureRawPositions.length}</strong></span>
              <span>تعداد پرسنل منتصب: <strong className="text-emerald-600 font-bold">{structureRawPositions.reduce((acc, p) => acc + (p.users?.length || 0), 0)}</strong></span>
            </div>
          </div>

          {/* Tree Visualization Container */}
          <div className="p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Network className="w-4 h-4 text-indigo-600" />
                  <span>سلسله‌مراتب درختی سمت‌های ساختار «{currentStructureDetail?.title || ''}»</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  برای هر سمت می‌توانید پرسنل سیستم را منتصب کرده و دسترسی‌های اختصاصی آن‌ها را مستقیماً از روی گره ویرایش فرمایید.
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleOpenAddNode()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن سمت ریشه</span>
                </button>
              )}
            </div>

            {treeLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                در حال بارگذاری چارت سازمانی ساختار...
              </div>
            ) : structureTreeData.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-300 space-y-3">
                <Network className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">هنوز سمتی در این ساختار تعریف نشده است</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  با استفاده از دکمه زیر می‌توانید از میان سمت‌های موجود (تهیه‌کننده، کارگردان، مدیر تولید، ناظر کیفی و...) سمت اضافه کنید یا سمت جدیدی بسازید.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => handleOpenAddNode()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تعریف اولین سمت برای این ساختار</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {structureTreeData.map((rootNode) => renderStructureTreeNode(rootNode, 0))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ===================== MODAL: CREATE / EDIT PROJECT STRUCTURE ===================== */}
      {structureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
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
                    تعریف ساختار سازمانی و چیدمان درختی سمت‌ها و پرسنل
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
                  placeholder="مثال: ساختار ماموریت‌ها، ساختار مرخصی و رفاهی، ساختار مالی و بودجه..."
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
                  توضیحات و شرح ساختار سازمانی
                </label>
                <textarea
                  rows={2}
                  value={structDescription}
                  onChange={(e) => setStructDescription(e.target.value)}
                  placeholder="مثال: این ساختار جهت هماهنگی، تصویب و کنترل امور ماموریت‌های خارج از سازمان استفاده می‌شود..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
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
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingStructure ? 'بروزرسانی ساختار' : 'ثبت و ساخت چارت'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD / EDIT POSITION IN STRUCTURE TREE ===================== */}
      {positionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Network className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingNode ? `ویرایش سمت در چارت ساختار` : `افزودن سمت به ساختار «${currentStructureDetail?.title || ''}»`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تعیین موقعیت درختی و پرسنل متصدی
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
                      positionMode === 'existing' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    انتخاب از سمت‌های تعریف‌شده سامانه
                  </button>
                  <button
                    type="button"
                    onClick={() => setPositionMode('new')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                      positionMode === 'new' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    تعریف سمت جدید اختصاصی
                  </button>
                </div>
              )}

              {/* Mode 1: Select existing position */}
              {!editingNode && positionMode === 'existing' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    انتخاب سمت مورد نظر از فهرست:
                  </label>
                  <select
                    value={selectedExistingPosId}
                    onChange={(e) => setSelectedExistingPosId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  >
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} {p.description ? `- (${p.description})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode 2: Define new position */}
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
                      placeholder="مثال: سرپرست نویسندگان، ناظر فنی میدانی..."
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      شرح وظایف و مسئولیت‌های سمت
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

              {/* Parent Node in Tree */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  جایگاه در درخت سلسله‌مراتب (سمت والد):
                </label>
                <select
                  value={nodeParentSpId || ''}
                  onChange={(e) => setNodeParentSpId(e.target.value || null)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                >
                  <option value="">سطح ریشه ساختار (بدون والد)</option>
                  {structureRawPositions
                    .filter((sp) => editingNode ? sp.id !== editingNode.id : true)
                    .map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        زیرمجموعه: {sp.title}
                      </option>
                    ))}
                </select>
              </div>

              {/* Optional initial users assignment when creating */}
              {!editingNode && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    انتصاب اولیه پرسنل به این سمت (اختیاری):
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
                          <span className="text-[10px] text-slate-400">({u.positionTitle || 'عضو'})</span>
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
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition cursor-pointer flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingNode ? 'ذخیره تغییرات سمت' : 'افزودن به چارت ساختار'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ASSIGN USER TO NODE ===================== */}
      {assignUserModalOpen && assignTargetNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <UserPlus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    انتصاب پرسنل به سمت «{assignTargetNode.title}»
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    انتخاب کاربر از فهرست پرسنل ثبت‌شده در سیستم
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssignUserModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  انتخاب کاربر مورد نظر:
                </label>
                <select
                  value={selectedUserToAssign}
                  onChange={(e) => setSelectedUserToAssign(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                >
                  {users.map((u) => {
                    const alreadyAssigned = assignTargetNode.users.some((nodeU) => nodeU.id === u.id);
                    return (
                      <option key={u.id} value={u.id} disabled={alreadyAssigned}>
                        {u.name} (@{u.username}) {alreadyAssigned ? '- (قبلاً در این سمت منتصب است)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssignUser}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                >
                  تایید و انتصاب به این سمت
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== PERMISSIONS TREE MODAL (USER OR POSITION) ===================== */}
      {selectedUserForPerms && (
        <PermissionsTreeModal
          user={selectedUserForPerms}
          onClose={() => setSelectedUserForPerms(null)}
          onSuccess={() => {
            loadStructureTree(selectedStructureId);
            onRefresh();
          }}
        />
      )}

      {selectedPosForPerms && (
        <PermissionsTreeModal
          position={selectedPosForPerms}
          onClose={() => setSelectedPosForPerms(null)}
          onSuccess={() => {
            loadStructureTree(selectedStructureId);
            onRefresh();
          }}
        />
      )}

    </div>
  );
};
