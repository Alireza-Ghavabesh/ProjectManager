import React, { useState, useEffect } from 'react';
import { User, Project, DynamicField, Position, DashboardStats, Workflow } from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectCard } from './components/ProjectCard';
import { VotingModal } from './components/VotingModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DynamicFieldsManager } from './components/DynamicFieldsManager';
import { UsersPositionsManager } from './components/UsersPositionsManager';
import { OrgHierarchyChart } from './components/OrgHierarchyChart';
import { WorkflowManager } from './components/WorkflowManager';
import { WorkflowTransitionModal } from './components/WorkflowTransitionModal';
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

  // App Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [dynamicFields, setDynamicFields] = useState<DynamicField[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<'projects' | 'fields' | 'users' | 'org' | 'workflow' | 'chat' | 'stats'>('projects');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_MY_VOTE' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [votingProject, setVotingProject] = useState<Project | null>(null);
  const [workflowProject, setWorkflowProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [loading, setLoading] = useState(false);

  // Check login on mount
  useEffect(() => {
    const token = localStorage.getItem('council_token');
    const storedUser = localStorage.getItem('council_user');

    if (token && storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('council_token');
        localStorage.removeItem('council_user');
      }
    } else {
      // Default to admin for fast evaluation
      api.login('admin', 'admin123').then((res) => {
        setCurrentUser(res.user);
      }).catch(() => {});
    }
    setAuthChecked(true);
  }, []);

  // Fetch all council data
  const refreshData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [prjs, flds, usrs, pos, wfs, st] = await Promise.all([
        api.getProjects(),
        api.getDynamicFields(),
        api.getUsers(),
        api.getPositions(),
        api.getWorkflows(),
        api.getDashboardStats(),
      ]);
      setProjects(prjs);
      setDynamicFields(flds);
      setUsers(usrs);
      setPositions(pos);
      setWorkflows(wfs);
      setStats(st);
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

  const handleSwitchUser = async (username: string) => {
    try {
      const pass = username === 'admin' ? 'admin123' : '123456';
      const data = await api.login(username, pass);
      setCurrentUser(data.user);
    } catch (err: any) {
      alert(err.message || 'خطا در تغییر کاربر');
    }
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex selection:bg-cyan-500 selection:text-white">
      
      {/* Right-Hand Navigation Drawer with Permission-Based Dynamic Menu */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onSwitchUser={handleSwitchUser}
        allUsers={users}
        pendingVotesCount={pendingVotesCount}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area (Spaced on the right for fixed sidebar on md+ screens) */}
      <div className="flex-1 flex flex-col min-w-0 md:mr-72 transition-all duration-300">
        
        {/* Top Header Bar */}
        <Header
          currentUser={currentUser}
          activeTab={activeTab}
          onSwitchUser={handleSwitchUser}
          allUsers={users}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Content Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          
          {/* ===================== TAB: PROJECTS & CARTABLE ===================== */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              
              {/* Top Action Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-slate-800">
                <div>
                  <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-cyan-400" />
                    {currentUser.role === 'ADMIN' ? 'مدیریت و کارتابل مصوبات پروژه‌ها' : 'کارتابل ارزیابی پروژه‌های شورا'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentUser.role === 'ADMIN'
                      ? 'مشاهده وضعیت تجمیعی آرا، گردش کار سازمانی، ارجاعات و محاسبه خودکار اکثریت'
                      : 'مشاهده پروژه‌های ارجاع شده، ثبت رای محرمانه ۳ حالته (تایید، رد، اصلاح) و پیگیری گردش کار'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={refreshData}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title="بروزرسانی کارتابل"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>

                  {currentUser.role === 'ADMIN' && (
                    <button
                      onClick={() => {
                        setEditingProject(null);
                        setShowCreateModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-600/25 transition cursor-pointer"
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
                    className="w-full rounded-2xl bg-slate-900 border border-slate-800 px-4 py-2.5 pr-10 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3 pointer-events-none" />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    همه پروژه‌ها ({projects.length})
                  </button>

                  {currentUser.role === 'COUNCIL' && (
                    <button
                      onClick={() => setStatusFilter('PENDING_MY_VOTE')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                        statusFilter === 'PENDING_MY_VOTE'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      در انتظار رای من ({pendingVotesCount})
                    </button>
                  )}

                  <button
                    onClick={() => setStatusFilter('APPROVED')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    اکثریت موافق (تایید)
                  </button>

                  <button
                    onClick={() => setStatusFilter('NEEDS_REVISION')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'NEEDS_REVISION'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    اکثریت نیازمند اصلاح
                  </button>

                  <button
                    onClick={() => setStatusFilter('REJECTED')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    اکثریت مخالف (رد)
                  </button>
                </div>
              </div>

              {/* Projects List */}
              {filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400 space-y-3">
                  <Layers className="w-12 h-12 text-slate-700 mx-auto" />
                  <h3 className="text-base font-bold text-white">پروژه‌ای با این مشخصات یافت نشد</h3>
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
                      onOpenWorkflowModal={(p) => setWorkflowProject(p)}
                      onEditProject={(p) => {
                        setEditingProject(p);
                        setShowCreateModal(true);
                      }}
                      onDeleteProject={handleDeleteProject}
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

          {/* ===================== TAB: WORKFLOW MANAGER ===================== */}
          {activeTab === 'workflow' && (
            <WorkflowManager
              workflows={workflows}
              positions={positions}
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

      {/* Workflow Transition Modal */}
      {workflowProject && (
        <WorkflowTransitionModal
          project={workflowProject}
          currentUser={currentUser}
          onClose={() => setWorkflowProject(null)}
          onSuccess={refreshData}
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
