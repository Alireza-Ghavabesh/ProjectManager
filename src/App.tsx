import React, { useState, useEffect } from 'react';
import { User, Project, DynamicField, Position, DashboardStats, ProjectStructure, Workflow, PasswordResetRequest } from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectCard } from './components/ProjectCard';
import { VotingModal } from './components/VotingModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DynamicFieldsManager } from './components/DynamicFieldsManager';
import { ProjectStructuresManager } from './components/ProjectStructuresManager';
import { WorkflowManager } from './components/WorkflowManager';
import { UsersPositionsManager } from './components/UsersPositionsManager';
import { OrgHierarchyChart } from './components/OrgHierarchyChart';
import { CouncilChat } from './components/CouncilChat';
import { StatsView } from './components/StatsView';
import { SystemSettingsView } from './components/SystemSettingsView';
import { LoginModal } from './components/LoginModal';
import { OfflineIndicator } from './pwa/PWAComponents';
import { 
  Plus, 
  Layers, 
  Search, 
  RefreshCw,
  Key,
  Check,
  Clock,
  Phone,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // App Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [dynamicFields, setDynamicFields] = useState<DynamicField[]>([]);
  const [projectStructures, setProjectStructures] = useState<ProjectStructure[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Password Reset Requests (کارتابل فراموشی رمز مدیر)
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [cartablePasswordInputs, setCartablePasswordInputs] = useState<{ [key: string]: string }>({});
  const [cartableResetLoading, setCartableResetLoading] = useState(false);
  const [cartableFeedbackMsg, setCartableFeedbackMsg] = useState('');

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<'projects' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats' | 'settings'>('projects');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_MY_VOTE' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [votingProject, setVotingProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [loading, setLoading] = useState(false);

  // Check login on mount with tab/window-isolated session
  useEffect(() => {
    // Purge legacy localStorage tokens so new/private windows always show login screen
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('council_jwt_token');
      localStorage.removeItem('council_jwt_user');
      localStorage.removeItem('council_token');
      localStorage.removeItem('council_user');
    }

    const token = api.getToken();
    const storedUser = api.getStoredUser();

    if (token) {
      if (storedUser) {
        setCurrentUser(storedUser);
      }
      // Validate token with backend using JWT
      api.getMe()
        .then((user) => {
          setCurrentUser(user);
        })
        .catch(() => {
          api.logout();
          setCurrentUser(null);
        })
        .finally(() => {
          setAuthChecked(true);
        });
    } else {
      // If no valid session in this tab/window, show Login modal cleanly (never auto-login)
      setCurrentUser(null);
      setAuthChecked(true);
    }
  }, []);

  // Fetch all council data
  const refreshData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const fetchResetsPromise = currentUser.role === 'ADMIN'
        ? api.getPasswordResetRequests().catch(() => [])
        : Promise.resolve([]);

      const [prjs, flds, structs, usrs, pos, st, wfs, me, resets] = await Promise.all([
        api.getProjects(),
        api.getDynamicFields(),
        api.getProjectStructures(),
        api.getUsers(),
        api.getPositions(),
        api.getDashboardStats(),
        api.getWorkflows(),
        api.getMe().catch(() => null),
        fetchResetsPromise,
      ]);
      setProjects(prjs);
      setDynamicFields(flds);
      setProjectStructures(structs);
      setUsers(usrs);
      setPositions(pos);
      setStats(st);
      setWorkflows(wfs);
      setResetRequests(resets || []);
      if (me && (
        me.id !== currentUser.id ||
        me.role !== currentUser.role ||
        me.name !== currentUser.name ||
        me.positionId !== currentUser.positionId
      )) {
        setCurrentUser(me);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshResetRequests = async () => {
    if (currentUser?.role !== 'ADMIN') return;
    try {
      const reqs = await api.getPasswordResetRequests();
      setResetRequests(reqs);
    } catch (err) {
      console.error('Error fetching reset requests:', err);
    }
  };

  // Quick resolve password reset request directly in Admin Cartable
  const handleResolveResetInCartable = async (req: PasswordResetRequest, action: 'APPROVE' | 'REJECT') => {
    const pass = cartablePasswordInputs[req.id]?.trim() || `pass${Math.floor(1000 + Math.random() * 9000)}`;
    if (action === 'APPROVE' && pass.length < 4) {
      alert('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    setCartableResetLoading(true);
    setCartableFeedbackMsg('');
    try {
      const res = await api.resolvePasswordResetRequest(req.id, action, action === 'APPROVE' ? pass : undefined);
      setCartableFeedbackMsg(res.message);
      await refreshResetRequests();
    } catch (err: any) {
      alert(err.message || 'خطا در رسیدگی به درخواست تغییر رمز');
    } finally {
      setCartableResetLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      refreshData();
    }
  }, [currentUser?.id]);

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      refreshData();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف پروژه');
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        در حال بارگذاری سامانه شورا...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginModal onSuccess={(user) => setCurrentUser(user)} />;
  }

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.productionType && p.productionType.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING_MY_VOTE') return !p.hasVoted;
    return p.majorityResult === statusFilter;
  });

  const pendingVotesCount = projects.filter((p) => !p.hasVoted).length;
  const pendingResetRequests = resetRequests.filter((r) => r.status === 'PENDING');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex selection:bg-indigo-600 selection:text-white">
      
      {/* Right-Hand Navigation Drawer with Permission-Based Dynamic Menu */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        pendingVotesCount={pendingVotesCount}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Content Area (Spaced on the right according to sidebar width) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
        sidebarCollapsed ? 'md:mr-20' : 'md:mr-72'
      }`}>
        
        {/* Top Header Bar */}
        <Header
          currentUser={currentUser}
          activeTab={activeTab}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          
          {/* ===================== TAB: PROJECTS & CARTABLE ===================== */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              
              {/* ===================== ADMIN CARTABLE: INLINE PASSWORD RESET REQUEST ROW (ظاهر شدن خودکار در صورت وجود درخواست) ===================== */}
              {currentUser.role === 'ADMIN' && pendingResetRequests.length > 0 && (
                <div className="space-y-3 animate-in slide-in-from-top-3 duration-200">
                  {cartableFeedbackMsg && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{cartableFeedbackMsg}</span>
                      </div>
                      <button
                        onClick={() => setCartableFeedbackMsg('')}
                        className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold"
                      >
                        بستن
                      </button>
                    </div>
                  )}

                  {pendingResetRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-400 shadow-md shadow-amber-500/10 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 text-slate-800 animate-in fade-in"
                    >
                      {/* Left: Alert icon & User details */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ring-4 ring-amber-200/80">
                          <Key className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-extrabold animate-pulse">
                              درخواست تغییر رمز عبور
                            </span>
                            <span className="text-sm font-extrabold text-slate-900 truncate">
                              {req.fullName || req.username}
                            </span>
                            <span className="text-xs text-slate-600 font-mono" dir="ltr">
                              @{req.username}
                            </span>
                          </div>
                          <div className="flex items-center gap-3.5 text-xs text-slate-500 mt-1 flex-wrap">
                            {req.phone && (
                              <span className="flex items-center gap-1 text-slate-700 font-medium" dir="ltr">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {req.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              زمان ثبت درخواست: {new Date(req.requestedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })} ({new Date(req.requestedAt).toLocaleDateString('fa-IR')})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Inline Action Controls */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 pt-3 xl:pt-0 border-t xl:border-t-0 border-amber-200/80">
                        <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                          <input
                            type="text"
                            value={cartablePasswordInputs[req.id] || ''}
                            onChange={(e) =>
                              setCartablePasswordInputs({
                                ...cartablePasswordInputs,
                                [req.id]: e.target.value,
                              })
                            }
                            placeholder="رمز جدید (مثلاً: pass123)"
                            className="w-full sm:w-44 rounded-2xl bg-white border border-amber-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs font-mono"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCartablePasswordInputs({
                                ...cartablePasswordInputs,
                                [req.id]: `pass${Math.floor(1000 + Math.random() * 9000)}`,
                              })
                            }
                            className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-bold text-slate-700 transition cursor-pointer shrink-0 shadow-2xs"
                            title="تولید خودکار رمز عبور تصادفی"
                          >
                            تولید رمز
                          </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleResolveResetInCartable(req, 'APPROVE')}
                            disabled={cartableResetLoading}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>تایید و ارسال رمز به کاربر</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveResetInCartable(req, 'REJECT')}
                            disabled={cartableResetLoading}
                            className="px-3.5 py-2 rounded-2xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            رد درخواست
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Top Action Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    {currentUser.role === 'ADMIN' ? 'مدیریت و کارتابل مصوبات پروژه‌ها' : 'کارتابل ارزیابی پروژه‌های شورا'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentUser.role === 'ADMIN'
                      ? 'مشاهده وضعیت تجمیعی آرا، گردش کار سازمانی، ارجاعات و محاسبه خودکار اکثریت'
                      : 'مشاهده پروژه‌های ارجاع شده، ثبت رای محرمانه ۳ حالته (تایید، رد، اصلاح) و پیگیری گردش کار'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={refreshData}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    title="بروزرسانی کارتابل"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                  </button>

                  {currentUser.role === 'ADMIN' && (
                    <button
                      onClick={() => {
                        setEditingProject(null);
                        setShowCreateModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>ثبت پروژه جدید</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="جستجو در نام پروژه، کد رهگیری، نوع ساختار..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-2.5 pr-10 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-xs"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    همه پروژه‌ها ({projects.length})
                  </button>

                  {currentUser.role === 'COUNCIL' && (
                    <button
                      onClick={() => setStatusFilter('PENDING_MY_VOTE')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                        statusFilter === 'PENDING_MY_VOTE'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      در انتظار رای من ({pendingVotesCount})
                    </button>
                  )}

                  <button
                    onClick={() => setStatusFilter('APPROVED')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    اکثریت موافق (تایید)
                  </button>

                  <button
                    onClick={() => setStatusFilter('NEEDS_REVISION')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'NEEDS_REVISION'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    اکثریت نیازمند اصلاح
                  </button>

                  <button
                    onClick={() => setStatusFilter('REJECTED')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    اکثریت مخالف (رد)
                  </button>
                </div>
              </div>

              {/* Projects List */}
              {filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3 shadow-xs">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">پروژه‌ای با این مشخصات یافت نشد</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    می‌توانید فیلترهای جستجو را تغییر دهید یا با حساب کاربری مدیر، پروژه جدیدی را ثبت فرمایید.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredProjects.map((prj) => (
                    <ProjectCard
                      key={prj.id}
                      project={prj}
                      currentUser={currentUser}
                      dynamicFields={dynamicFields}
                      onOpenVoteModal={(p) => setVotingProject(p)}
                      onEditProject={(p) => {
                        setEditingProject(p);
                        setShowCreateModal(true);
                      }}
                      onDeleteProject={handleDeleteProject}
                      onRefreshData={refreshData}
                    />
                  ))}
                </div>
              )}

            </div>
          )}

          {/* ===================== TAB: ORG CHART & PERMISSION TREE ===================== */}
          {activeTab === 'org' && (
            <OrgHierarchyChart
              positions={positions}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {/* ===================== TAB: PROJECT STRUCTURES (ساختارهای سازمانی) ===================== */}
          {activeTab === 'structures' && (
            <ProjectStructuresManager
              structures={projectStructures}
              positions={positions}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {/* ===================== TAB: WORKFLOWS (طراحی و مدیریت گردش کار پروژه‌ها) ===================== */}
          {activeTab === 'workflows' && (
            <WorkflowManager
              workflows={workflows}
              positions={positions}
              structures={projectStructures}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {/* ===================== TAB: DYNAMIC FIELDS BUILDER ===================== */}
          {activeTab === 'fields' && (
            <DynamicFieldsManager
              fields={dynamicFields}
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {/* ===================== TAB: USERS & POSITIONS ===================== */}
          {activeTab === 'users' && (
            <UsersPositionsManager
              users={users}
              positions={positions}
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {/* ===================== TAB: COUNCIL CHAT ===================== */}
          {activeTab === 'chat' && (
            <CouncilChat
              currentUser={currentUser}
              users={users}
              projects={projects}
            />
          )}

          {/* ===================== TAB: STATS & DASHBOARD ===================== */}
          {activeTab === 'stats' && (
            <StatsView
              stats={stats}
              projects={projects}
              users={users}
            />
          )}

          {/* ===================== TAB: SYSTEM SETTINGS (تنظیمات سامانه و مهلت ارزیابی) ===================== */}
          {activeTab === 'settings' && (
            <SystemSettingsView
              currentUser={currentUser}
            />
          )}

        </main>
      </div>

      {/* Voting Modal */}
      {votingProject && (
        <VotingModal
          project={votingProject}
          onClose={() => setVotingProject(null)}
          onVoteSuccess={refreshData}
        />
      )}

      {/* Create / Edit Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          dynamicFields={dynamicFields}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProject(null);
          }}
          onSuccess={refreshData}
          editProject={editingProject}
          workflows={workflows}
        />
      )}

      {/* PWA Offline indicator */}
      <OfflineIndicator />

    </div>
  );
}
