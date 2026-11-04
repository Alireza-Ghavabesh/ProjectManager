import React, { useState, useEffect } from 'react';
import { User, Project, DynamicField, Position, DashboardStats, ProjectStructure, Workflow } from './types';
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
import { LoginModal } from './components/LoginModal';
import { OfflineIndicator } from './pwa/PWAComponents';
import { 
  Plus, 
  Layers, 
  Search, 
  RefreshCw
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

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<'projects' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats'>('projects');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_MY_VOTE' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [votingProject, setVotingProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [loading, setLoading] = useState(false);

  // Check login on mount with tab/window-isolated session
  useEffect(() => {
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
      const [prjs, flds, structs, usrs, pos, st, wfs] = await Promise.all([
        api.getProjects(),
        api.getDynamicFields(),
        api.getProjectStructures(),
        api.getUsers(),
        api.getPositions(),
        api.getDashboardStats(),
        api.getWorkflows(),
      ]);
      setProjects(prjs);
      setDynamicFields(flds);
      setProjectStructures(structs);
      setUsers(usrs);
      setPositions(pos);
      setStats(st);
      setWorkflows(wfs);
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      refreshData();
    }
  }, [currentUser]);

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
        />
      )}

      {/* PWA Offline indicator */}
      <OfflineIndicator />

    </div>
  );
}
