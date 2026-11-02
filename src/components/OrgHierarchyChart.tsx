import React, { useState } from 'react';
import { Position, User } from '../types';
import { api } from '../services/api';
import { PermissionsTreeModal } from './PermissionsTreeModal';
import { 
  Network, 
  Plus, 
  Users, 
  Edit3, 
  Trash2, 
  Lock, 
  X,
  Briefcase
} from 'lucide-react';

interface OrgHierarchyChartProps {
  positions: Position[];
  users: User[];
  currentUser: User;
  onRefresh: () => void;
}

export const OrgHierarchyChart: React.FC<OrgHierarchyChartProps> = ({
  positions,
  users,
  currentUser,
  onRefresh,
}) => {
  const [selectedPosForPerms, setSelectedPosForPerms] = useState<Position | null>(null);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [parentPositionId, setParentPositionId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('indigo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN';

  // Build tree hierarchy from flat positions
  const buildTree = (posList: Position[], parentId: string | null = null): (Position & { children?: any[] })[] => {
    return posList
      .filter((p) => (parentId === null ? !p.parentId : p.parentId === parentId))
      .map((p) => ({
        ...p,
        children: buildTree(posList, p.id),
      }));
  };

  const treeData = buildTree(positions, null);

  const openAddChildModal = (parent?: Position) => {
    setEditingPosition(null);
    setParentPositionId(parent ? parent.id : null);
    setTitle('');
    setDescription('');
    setColor(parent ? parent.color || 'indigo' : 'indigo');
    setError('');
    setShowAddEditModal(true);
  };

  const openEditModal = (pos: Position) => {
    setEditingPosition(pos);
    setParentPositionId(pos.parentId || null);
    setTitle(pos.title);
    setDescription(pos.description || '');
    setColor(pos.color || 'indigo');
    setError('');
    setShowAddEditModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('عنوان سمت الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (editingPosition) {
        await api.updatePosition(editingPosition.id, {
          title: title.trim(),
          description: description.trim(),
          color,
          parentId: parentPositionId,
        });
      } else {
        await api.createPosition({
          title: title.trim(),
          description: description.trim(),
          color,
          parentId: parentPositionId,
        });
      }

      setShowAddEditModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره سمت سازمانی');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, posTitle: string) => {
    if (!confirm(`آیا از حذف سمت «${posTitle}» از چارت سازمانی اطمینان دارید؟`)) return;
    try {
      await api.deletePosition(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف سمت');
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: Position & { children?: any[] }, depth: number = 0) => {
    const nodeUsers = users.filter((u) => u.positionId === node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="relative flex flex-col items-stretch">
        
        {/* Node Box */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition shadow-sm relative group ${
            depth === 0
              ? 'bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border-blue-200 ring-1 ring-blue-500/10'
              : depth === 1
              ? 'bg-white border-cyan-200'
              : 'bg-white border-slate-200'
          }`}
          style={{ marginRight: `${depth * 28}px` }}
        >
          {/* Top Row: Title, Level, Hierarchy tag */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border ${
                depth === 0
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-cyan-50 text-cyan-700 border-cyan-200'
              }`}>
                {depth + 1}
              </span>

              <div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{node.title}</span>
                  {depth === 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                      سطح عالیه (ریشه چارت)
                    </span>
                  )}
                </h4>
                {node.parentTitle && (
                  <span className="text-[11px] text-slate-500">
                    مستقر زیرمجموعه: <strong className="text-blue-700 font-bold">{node.parentTitle}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Actions for this node */}
            <div className="flex items-center gap-1.5">
              {/* Permission Tree Button */}
              <button
                onClick={() => setSelectedPosForPerms(node)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-xs font-medium transition cursor-pointer"
                title="مشاهده و ویرایش درخت دسترسی‌های این سمت"
              >
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">درخت دسترسی‌ها</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold">
                  {node.permissions?.length || 0}
                </span>
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => openAddChildModal(node)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                    title="افزودن سمت زیرمجموعه به این گره"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(node)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                    title="ویرایش سمت"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {depth > 0 && (
                    <button
                      onClick={() => handleDelete(node.id, node.title)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="حذف سمت"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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

          {/* Appointed Users in this Node */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                پرسنل منتصب در این گره:
              </span>
              {nodeUsers.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {nodeUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                    >
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-bold">
                        {u.name.charAt(0)}
                      </span>
                      <span>{u.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 italic">
                  (هیچ کاربری هنوز به این سمت منتصب نشده است)
                </span>
              )}
            </div>

            <span className="text-[10px] text-slate-400 font-medium">
              سطح سلسله‌مراتب: رده {node.level || depth + 1}
            </span>
          </div>

        </div>

        {/* Recursive Children with connector lines */}
        {hasChildren && node.children && (
          <div className="relative mt-3 space-y-3 pr-4 border-r-2 border-blue-200">
            {node.children.map((child: any) => renderTreeNode(child, depth + 1))}
          </div>
        )}

      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Network className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              ساختار درختی چارت سازمانی شورا و سطوح دسترسی
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            تعریف سلسله‌مراتب سازمانی، گره‌های والد و فرزند، و انتصاب فرآیندهای گردش کار بر پایه این ساختار سازمانی
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => openAddChildModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تعریف سمت جدید در ریشه</span>
          </button>
        )}
      </div>

      {/* Organizational Tree View */}
      <div className="p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
        <div className="text-xs font-bold text-slate-600 mb-2 flex items-center justify-between pb-3 border-b border-slate-100">
          <span>نمودار سلسله‌مراتب سازمانی شورا:</span>
          <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-lg">
            {positions.length} سمت سازمانی تعریف شده
          </span>
        </div>

        {treeData.map((rootNode) => renderTreeNode(rootNode, 0))}
      </div>

      {/* Permissions Modal */}
      {selectedPosForPerms && (
        <PermissionsTreeModal
          position={selectedPosForPerms}
          onClose={() => setSelectedPosForPerms(null)}
          onSuccess={onRefresh}
        />
      )}

      {/* Add / Edit Position Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                {editingPosition ? 'ویرایش گره در چارت سازمانی' : 'تعریف سمت سازمانی جدید در چارت'}
              </h3>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان سمت سازمانی *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: ناظر فنی و تجهیزات، مدیر تولید، کارشناس برآورد..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  required
                />
              </div>

              {/* Parent Position Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  سمت بالادست (والد در ساختار درختی چارت)
                </label>
                <select
                  value={parentPositionId || ''}
                  onChange={(e) => setParentPositionId(e.target.value || null)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white cursor-pointer transition"
                >
                  <option value="">-- بدون والد (گره ریشه / سطح عالیه) --</option>
                  {positions
                    .filter((p) => !editingPosition || p.id !== editingPosition.id)
                    .map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.title} (رده {pos.level || 1})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  شرح وظایف و مسئولیت‌ها در شورا
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="شرح اختیارات و حیطه وظایف در ارزیابی پروژه‌ها..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed transition"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  {loading ? 'در حال ذخیره...' : 'ذخیره در چارت سازمانی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
