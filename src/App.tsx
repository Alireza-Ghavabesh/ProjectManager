import React, { useState, useEffect } from 'react';
import { User, Project, DynamicField, ProjectType, Position, DashboardStats, ProjectStructure, Workflow, PasswordResetRequest, PublicSettings } from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectCard } from './components/ProjectCard';
import { VotingModal } from './components/VotingModal';
import { WorkflowTransitionModal } from './components/WorkflowTransitionModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DynamicFieldsManager } from './components/DynamicFieldsManager';
import { ProjectStructuresManager } from './components/ProjectStructuresManager';
import { WorkflowManager } from './components/WorkflowManager';
import { UsersPositionsManager } from './components/UsersPositionsManager';
import { OrgHierarchyChart } from './components/OrgHierarchyChart';
import { CouncilChat } from './components/CouncilChat';
import { StatsView } from './components/StatsView';
import { SystemSettingsView } from './components/SystemSettingsView';
import { SmsTestLab } from './components/SmsTestLab';
import { LoginModal } from './components/LoginModal';
import { OfflineIndicator } from './pwa/PWAComponents';
import { hasPerm, hasAnyPerm } from './utils/permissions';
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
  Sparkles,
  FolderKanban
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Branding (Custom Title, Subtitle, and Custom Logo in Sidebar & Login)
  const [branding, setBranding] = useState<PublicSettings>({
    login_title: 'شورای تولید و ارزیابی',
    login_subtitle: 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها',
    login_logo_url: null,
  });

  // App Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [dynamicFields, setDynamicFields] = useState<DynamicField[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
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
  const [activeTab, setActiveTab] = useState<'projects' | 'project_list' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats' | 'settings' | 'smstest'>('projects');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MY_TURN' | 'PENDING_MY_VOTE' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [listStatusFilter, setListStatusFilter] = useState<'ALL' | 'MY_TURN' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('ALL');
  const [listSearchQuery, setListSearchQuery] = useState('');

  // Modals
  const [votingProject, setVotingProject] = useState<Project | null>(null);
  const [workflowProject, setWorkflowProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
  const [expandedListProjectIds, setExpandedListProjectIds] = useState<Record<string, boolean>>({});

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

  // Sync branding on mount & listen to live updates from Settings
  useEffect(() => {
    const fetchBranding = () => {
      api.getPublicSettings().then((res) => {
        if (res) {
          setBranding(res);
          if (res.login_title) {
            document.title = `${res.login_title} | سامانه کارتابل و مصوبات`;
          }
        }
      }).catch(() => {});
    };

    fetchBranding();

    const handleBrandingLiveUpdate = (e: any) => {
      if (e.detail) {
        setBranding((prev) => ({ ...prev, ...e.detail }));
        if (e.detail.login_title) {
          document.title = `${e.detail.login_title} | سامانه کارتابل و مصوبات`;
        }
      } else {
        fetchBranding();
      }
    };

    window.addEventListener('council_branding_updated', handleBrandingLiveUpdate);
    return () => window.removeEventListener('council_branding_updated', handleBrandingLiveUpdate);
  }, []);

  // Secret URL routing for /testsms
  useEffect(() => {
    const checkSecretRoute = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/testsms' || path === '/testsms/' || hash === '#testsms' || hash === '#/testsms') {
        setActiveTab('smstest');
      }
    };

    checkSecretRoute();
    window.addEventListener('popstate', checkSecretRoute);
    window.addEventListener('hashchange', checkSecretRoute);
    return () => {
      window.removeEventListener('popstate', checkSecretRoute);
      window.removeEventListener('hashchange', checkSecretRoute);
    };
  }, []);

  // Targeted lightweight refreshes to keep assignments/edits instantaneous without reloading all 9 endpoints
  const refreshStructuresData = async () => {
    if (!currentUser) return;
    try {
      const [structs, pos] = await Promise.all([
        api.getProjectStructures().catch(() => null),
        api.getPositions().catch(() => null),
      ]);
      if (structs) setProjectStructures(structs);
      if (pos) setPositions(pos);
    } catch (err) {
      console.error('Error refreshing structures:', err);
    }
  };

  const refreshOrgAndUsersData = async () => {
    if (!currentUser) return;
    try {
      const [usrs, pos, structs, me] = await Promise.all([
        api.getUsers().catch(() => null),
        api.getPositions().catch(() => null),
        api.getProjectStructures().catch(() => null),
        api.getMe().catch(() => null),
      ]);
      if (usrs) setUsers(usrs);
      if (pos) setPositions(pos);
      if (structs) setProjectStructures(structs);
      if (me) {
        const oldPerms = JSON.stringify(currentUser.permissions || []);
        const newPerms = JSON.stringify(me.permissions || []);
        if (
          me.id !== currentUser.id ||
          me.role !== currentUser.role ||
          me.name !== currentUser.name ||
          me.positionId !== currentUser.positionId ||
          oldPerms !== newPerms
        ) {
          setCurrentUser(me);
        }
      }
    } catch (err) {
      console.error('Error refreshing org/users:', err);
    }
  };

  const refreshWorkflowsData = async () => {
    if (!currentUser) return;
    try {
      const canSeeList = hasPerm(currentUser, 'project_list.view');
      const [wfs, prjs, allPrjs] = await Promise.all([
        api.getWorkflows().catch(() => null),
        api.getProjects('cartable').catch(() => null),
        canSeeList ? api.getProjects('all').catch(() => null) : Promise.resolve(null),
      ]);
      if (wfs) setWorkflows(wfs);
      if (prjs) setProjects(prjs);
      if (allPrjs) setAllProjects(allPrjs);
    } catch (err) {
      console.error('Error refreshing workflows:', err);
    }
  };

  const refreshDynamicFieldsData = async () => {
    if (!currentUser) return;
    try {
      const [flds, pTypes] = await Promise.all([
        api.getDynamicFields().catch(() => null),
        api.getProjectTypes().catch(() => null),
      ]);
      if (flds) setDynamicFields(flds);
      if (pTypes) setProjectTypes(pTypes);
    } catch (err) {
      console.error('Error refreshing dynamic fields:', err);
    }
  };

  // Fetch all council data
  const refreshData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const canHandleResets = hasPerm(currentUser, 'system.users.edit');
      const canSeeProjectList = hasPerm(currentUser, 'project_list.view');
      const fetchResetsPromise = canHandleResets
        ? api.getPasswordResetRequests().catch(() => [])
        : Promise.resolve([]);

      const [prjs, allPrjs, flds, pTypes, structs, usrs, pos, st, wfs, me, resets] = await Promise.all([
        api.getProjects('cartable').catch(() => []),
        canSeeProjectList ? api.getProjects('all').catch(() => []) : Promise.resolve([]),
        api.getDynamicFields().catch(() => []),
        api.getProjectTypes().catch(() => []),
        api.getProjectStructures().catch(() => []),
        api.getUsers().catch(() => []),
        api.getPositions().catch(() => []),
        api.getDashboardStats().catch(() => null),
        api.getWorkflows().catch(() => []),
        api.getMe().catch(() => null),
        fetchResetsPromise,
      ]);
      setProjects(prjs);
      setAllProjects(allPrjs);
      setDynamicFields(flds);
      setProjectTypes(pTypes);
      setProjectStructures(structs);
      setUsers(usrs);
      setPositions(pos);
      setStats(st);
      setWorkflows(wfs);
      setResetRequests(resets || []);
      if (me) {
        const oldPerms = JSON.stringify(currentUser.permissions || []);
        const newPerms = JSON.stringify(me.permissions || []);
        if (
          me.id !== currentUser.id ||
          me.role !== currentUser.role ||
          me.name !== currentUser.name ||
          me.positionId !== currentUser.positionId ||
          oldPerms !== newPerms
        ) {
          setCurrentUser(me);
        }
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshResetRequests = async () => {
    if (!hasPerm(currentUser, 'system.users.edit')) return;
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
    } else {
      setProjects([]);
      setAllProjects([]);
    }
  }, [currentUser?.id]);

  // Keep full project list synced reactively whenever user's project_list.view permission changes
  const canViewProjectListPerm = hasPerm(currentUser, 'project_list.view');
  useEffect(() => {
    if (!currentUser?.id) return;
    if (canViewProjectListPerm) {
      api.getProjects('all').then(setAllProjects).catch(() => {});
    } else {
      setAllProjects([]);
    }
  }, [currentUser?.id, canViewProjectListPerm]);

  // Silently sync user permissions on window focus / tab return (e.g., when admin updates position permissions)
  useEffect(() => {
    if (!currentUser?.id) return;
    let lastChecked = 0;

    const syncMeIfNeeded = async () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastChecked < 3000) return;
      lastChecked = now;
      try {
        const me = await api.getMe();
        if (!me) return;
        const oldPerms = JSON.stringify(currentUser.permissions || []);
        const newPerms = JSON.stringify(me.permissions || []);
        if (
          me.id !== currentUser.id ||
          me.role !== currentUser.role ||
          me.positionId !== currentUser.positionId ||
          oldPerms !== newPerms
        ) {
          setCurrentUser(me);
        }
      } catch {
        // Ignore transient network errors
      }
    };

    window.addEventListener('focus', syncMeIfNeeded);
    document.addEventListener('visibilitychange', syncMeIfNeeded);
    return () => {
      window.removeEventListener('focus', syncMeIfNeeded);
      document.removeEventListener('visibilitychange', syncMeIfNeeded);
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.positionId, currentUser?.permissions]);

  // Keep activeTab pointing to a section the user actually has permission to access
  useEffect(() => {
    if (!currentUser || activeTab === 'smstest') return;
    const tabPermissions: Array<{ tab: typeof activeTab; perms: string[] }> = [
      { tab: 'projects', perms: ['projects.view', 'projects.cartable.view', 'projects.create', 'projects.edit', 'projects.delete', 'workflow.forward', 'voting.cast', 'voting.confidential.view_all'] },
      { tab: 'project_list', perms: ['project_list.view', 'project_list.create', 'project_list.edit', 'project_list.delete'] },
      { tab: 'structures', perms: ['structures.view', 'structures.create', 'structures.edit', 'structures.delete'] },
      { tab: 'workflows', perms: ['workflow.view', 'workflow.history.view', 'workflow.create', 'workflow.edit', 'workflow.delete'] },
      { tab: 'users', perms: ['system.users.view', 'system.users.create', 'system.users.edit', 'system.users.delete', 'system.permissions.manage', 'org.positions.view', 'org.positions.create', 'org.positions.edit', 'org.positions.delete'] },
      { tab: 'fields', perms: ['projects.fields.view', 'projects.fields.create', 'projects.fields.edit', 'projects.fields.delete'] },
      { tab: 'settings', perms: ['settings.view', 'settings.edit', 'sms.rules.view', 'sms.rules.create', 'sms.rules.edit', 'sms.rules.delete'] },
      { tab: 'chat', perms: ['chat.view', 'chat.group.send', 'chat.direct.send'] },
    ];
    const currentEntry = tabPermissions.find((t) => t.tab === activeTab);
    if (currentEntry && hasAnyPerm(currentUser, currentEntry.perms)) return;
    const firstAllowed = tabPermissions.find((t) => hasAnyPerm(currentUser, t.perms));
    if (firstAllowed && firstAllowed.tab !== activeTab) {
      setActiveTab(firstAllowed.tab);
    }
  }, [currentUser, activeTab]);

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

  const isWorkflowProject = (p: Project) =>
    Boolean(p.hasWorkflow || p.workflowId || (p.workflowSteps && p.workflowSteps.length > 0));

  // Filtered Cartable projects (strictly scoped to current user)
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.workflowTrackingCode && p.workflowTrackingCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.projectTypeTitle && p.projectTypeTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.productionType && p.productionType.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'MY_TURN') return Boolean(p.isMyWorkflowTurn);
    if (statusFilter === 'PENDING_MY_VOTE') return !isWorkflowProject(p) && !p.hasVoted;
    if (statusFilter === 'APPROVED' || statusFilter === 'NEEDS_REVISION' || statusFilter === 'REJECTED') {
      if (isWorkflowProject(p)) {
        return p.status === statusFilter;
      }
      return p.majorityResult === statusFilter;
    }
    return p.majorityResult === statusFilter;
  });

  // Filtered Project List projects (all system projects when project_list.view is granted)
  const filteredProjectList = allProjects.filter((p) => {
    const q = listSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.creatorName && p.creatorName.toLowerCase().includes(q)) ||
      (p.workflowTrackingCode && p.workflowTrackingCode.toLowerCase().includes(q)) ||
      (p.projectTypeTitle && p.projectTypeTitle.toLowerCase().includes(q)) ||
      (p.productionType && p.productionType.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (listStatusFilter === 'ALL') return true;
    if (listStatusFilter === 'MY_TURN') return Boolean(p.isMyWorkflowTurn);
    if (listStatusFilter === 'IN_REVIEW') {
      if (isWorkflowProject(p)) return p.status === 'IN_REVIEW';
      return p.majorityResult === 'PENDING' || p.majorityResult === 'TIED';
    }
    if (listStatusFilter === 'APPROVED' || listStatusFilter === 'NEEDS_REVISION' || listStatusFilter === 'REJECTED') {
      if (isWorkflowProject(p)) return p.status === listStatusFilter;
      return p.majorityResult === listStatusFilter;
    }
    return true;
  });

  const canViewCartable = hasPerm(currentUser, ['projects.view', 'projects.cartable.view', 'workflow.forward']);
  const canCreateProject = hasPerm(currentUser, 'projects.create');
  const canViewProjectList = hasPerm(currentUser, 'project_list.view');
  const canCreateProjectList = hasPerm(currentUser, 'project_list.create');
  const canCastVote = hasPerm(currentUser, 'voting.cast');
  const canManagePasswordResets = hasPerm(currentUser, 'system.users.edit');

  const hasNonWorkflowProjects = projects.some((p) => !isWorkflowProject(p));
  const pendingVotesCount =
    canCastVote ? projects.filter((p) => !isWorkflowProject(p) && !p.hasVoted).length : 0;
  const myTurnCount = projects.filter((p) => Boolean(p.isMyWorkflowTurn)).length;
  const myTurnInListCount = allProjects.filter((p) => Boolean(p.isMyWorkflowTurn)).length;
  const canSeeCartableList = canViewCartable || canCastVote || projects.length > 0;
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
        myTurnCount={myTurnCount}
        allProjectsCount={canViewProjectList ? allProjects.length : 0}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        branding={branding}
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
              
              {/* ===================== CARTABLE: INLINE PASSWORD RESET REQUEST ROW ===================== */}
              {canManagePasswordResets && pendingResetRequests.length > 0 && (
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
                    کارتابل شخصی من
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    فقط پروژه‌هایی که هم‌اکنون در گردش کار یا رای‌گیری به شما مربوط و ارجاع شده‌اند در این بخش نمایش داده می‌شوند
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

                  {canCreateProject && (
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
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer tabular-nums ${
                      statusFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {`کارتابل من (${projects.length})`}
                  </button>

                  {myTurnCount > 0 && (
                    <button
                      onClick={() => setStatusFilter('MY_TURN')}
                      className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer tabular-nums ${
                        statusFilter === 'MY_TURN'
                          ? 'bg-blue-600 text-white shadow-xs font-bold'
                          : 'text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80'
                      }`}
                    >
                      نوبت اقدام من ({myTurnCount})
                    </button>
                  )}

                  {canCastVote && hasNonWorkflowProjects && (
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
                    onClick={() => setStatusFilter('NEEDS_REVISION')}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                      statusFilter === 'NEEDS_REVISION'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    نیازمند اصلاح
                  </button>
                </div>
              </div>

              {/* Cartable Projects List */}
              {!canSeeCartableList ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-600 space-y-4 shadow-xs">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">
                    {canCreateProject
                      ? 'حساب کاربری شما برای ثبت پروژه جدید تنظیم شده است'
                      : 'شما مجوز مشاهده پروژه‌های کارتابل را ندارید'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {canCreateProject
                      ? 'می‌توانید از دکمه زیر طرح جدید ثبت کنید تا وارد گردش کار شود. اگر لازم است سایر پروژه‌های ارجاع‌شده به شما نمایش داده شوند، دسترسی «نمایش فقط پروژه‌های کارتابل من» یا «تایید و ارجاع در مراحل گردش کار» را فعال نمایید.'
                      : 'برای مشاهده پروژه‌های ارجاع‌شده به خودتان، دسترسی «نمایش فقط پروژه‌های کارتابل من» یا «تایید و ارجاع در مراحل گردش کار» کافی است.'}
                  </p>
                  {canCreateProject && (
                    <div className="pt-1">
                      <button
                        onClick={() => {
                          setEditingProject(null);
                          setShowCreateModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>ثبت پروژه جدید</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3 shadow-xs">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">
                    {projects.length === 0
                      ? 'در حال حاضر پروژه‌ای در کارتابل شما نیست'
                      : 'پروژه‌ای با این مشخصات در کارتابل یافت نشد'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {projects.length === 0
                      ? 'هر پروژه‌ای که در گردش کار به سمت یا نام شما ارجاع شود (یا جهت اصلاح به شما بازگردد) به‌صورت خودکار در اینجا نمایش داده خواهد شد.'
                      : `می‌توانید فیلترهای جستجو را تغییر دهید${canCreateProject ? ' یا پروژه جدیدی ثبت فرمایید.' : '.'}`}
                  </p>
                  {projects.length === 0 && canCreateProject && (
                    <div className="pt-1">
                      <button
                        onClick={() => {
                          setEditingProject(null);
                          setShowCreateModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>ثبت پروژه جدید</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      نمایش {filteredProjects.length} پروژه در کارتابل شما (برای مشاهده جزئیات، فایل‌ها و اقدام روی هر ردیف کلیک کنید)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const allExpanded = filteredProjects.every((p) => expandedProjectIds[p.id]);
                        if (allExpanded) {
                          setExpandedProjectIds({});
                        } else {
                          const next: Record<string, boolean> = {};
                          filteredProjects.forEach((p) => {
                            next[p.id] = true;
                          });
                          setExpandedProjectIds(next);
                        }
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer whitespace-nowrap"
                    >
                      {filteredProjects.every((p) => expandedProjectIds[p.id]) ? 'بستن همه ردیف‌ها' : 'باز کردن همه ردیف‌ها'}
                    </button>
                  </div>

                  <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[11px] font-bold text-slate-600">
                    <div className="lg:col-span-5">عنوان و کد پروژه</div>
                    <div className="lg:col-span-2">مرحله گردش کار</div>
                    <div className="lg:col-span-2">وضعیت و مشارکت</div>
                    <div className="lg:col-span-1">مهلت و برآورد</div>
                    <div className="lg:col-span-2 text-left">اقدام سریع</div>
                  </div>

                  <div className="space-y-2">
                    {filteredProjects.map((prj) => (
                      <ProjectCard
                        key={prj.id}
                        project={prj}
                        currentUser={currentUser}
                        dynamicFields={dynamicFields}
                        viewContext="cartable"
                        isExpanded={Boolean(expandedProjectIds[prj.id])}
                        onToggleExpand={() =>
                          setExpandedProjectIds((prev) => ({
                            ...prev,
                            [prj.id]: !prev[prj.id],
                          }))
                        }
                        onOpenVoteModal={(p) => setVotingProject(p)}
                        onOpenWorkflowModal={(p) => setWorkflowProject(p)}
                        onEditProject={(p) => {
                          setEditingProject(p);
                          setShowCreateModal(true);
                        }}
                        onDeleteProject={handleDeleteProject}
                        onRefreshData={refreshData}
                      />
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ===================== TAB: ALL PROJECTS LIST (فهرست پروژه‌ها) ===================== */}
          {activeTab === 'project_list' && (
            <div className="space-y-6">
              {/* Top Action Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <FolderKanban className="w-5 h-5 text-indigo-600" />
                    فهرست جامع پروژه‌های سامانه
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    نمای کامل تمام پروژه‌های ثبت‌شده در سامانه با امکان جستجو، فیلتر وضعیت و مدیریت پرونده‌ها
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={refreshData}
                    disabled={loading}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    title="بروزرسانی فهرست پروژه‌ها"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                  </button>

                  {canCreateProjectList && (
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

              {!canViewProjectList ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-600 space-y-4 shadow-xs">
                  <FolderKanban className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">
                    شما مجوز «نمایش فهرست کامل پروژه‌ها» را ندارید
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {canCreateProjectList
                      ? 'در حال حاضر فقط دسترسی ثبت پروژه جدید در این بخش برای شما فعال است. برای دیدن فهرست تمام پروژه‌ها، دسترسی «نمایش فهرست کامل پروژه‌ها» را در ماتریس دسترسی‌ها فعال کنید.'
                      : 'برای مشاهده کل پروژه‌های ثبت‌شده در سامانه، دسترسی «نمایش» در بخش «فهرست پروژه‌ها» باید در ماتریس دسترسی‌ها برای حساب یا سمت شما فعال شود.'}
                  </p>
                  {canCreateProjectList && (
                    <div className="pt-1">
                      <button
                        onClick={() => {
                          setEditingProject(null);
                          setShowCreateModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>ثبت پروژه جدید</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Search & Filter Bar */}
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <input
                        type="text"
                        placeholder="جستجو در نام، کد، ثبت‌کننده یا کد رهگیری گردش کار..."
                        value={listSearchQuery}
                        onChange={(e) => setListSearchQuery(e.target.value)}
                        className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-2.5 pr-10 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-xs"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                      <button
                        onClick={() => setListStatusFilter('ALL')}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer tabular-nums ${
                          listStatusFilter === 'ALL'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        همه پروژه‌ها ({allProjects.length})
                      </button>

                      {myTurnInListCount > 0 && (
                        <button
                          onClick={() => setListStatusFilter('MY_TURN')}
                          className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer tabular-nums ${
                            listStatusFilter === 'MY_TURN'
                              ? 'bg-blue-600 text-white shadow-xs font-bold'
                              : 'text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80'
                          }`}
                        >
                          نوبت کارتابل من ({myTurnInListCount})
                        </button>
                      )}

                      <button
                        onClick={() => setListStatusFilter('IN_REVIEW')}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                          listStatusFilter === 'IN_REVIEW'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        در حال بررسی
                      </button>

                      <button
                        onClick={() => setListStatusFilter('APPROVED')}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                          listStatusFilter === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        تصویب نهایی
                      </button>

                      <button
                        onClick={() => setListStatusFilter('NEEDS_REVISION')}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                          listStatusFilter === 'NEEDS_REVISION'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        نیازمند اصلاح
                      </button>

                      <button
                        onClick={() => setListStatusFilter('REJECTED')}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                          listStatusFilter === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        رد شده
                      </button>
                    </div>
                  </div>

                  {filteredProjectList.length === 0 ? (
                    <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3 shadow-xs">
                      <FolderKanban className="w-12 h-12 text-slate-300 mx-auto" />
                      <h3 className="text-base font-bold text-slate-800">
                        پروژه‌ای در فهرست یافت نشد
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        {allProjects.length === 0
                          ? `هنوز پروژه‌ای در سامانه ثبت نشده است${canCreateProjectList ? '؛ می‌توانید اولین پروژه را ثبت کنید.' : '.'}`
                          : 'می‌توانید عبارت جستجو یا فیلتر وضعیت را تغییر دهید.'}
                      </p>
                      {allProjects.length === 0 && canCreateProjectList && (
                        <div className="pt-1">
                          <button
                            onClick={() => {
                              setEditingProject(null);
                              setShowCreateModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>ثبت پروژه جدید</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                          نمایش {filteredProjectList.length} پروژه از مجموع {allProjects.length} پروژه سامانه (برای مشاهده جزئیات، فایل‌ها و ویرایش/حذف روی هر ردیف کلیک کنید)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const allExpanded = filteredProjectList.every((p) => expandedListProjectIds[p.id]);
                            if (allExpanded) {
                              setExpandedListProjectIds({});
                            } else {
                              const next: Record<string, boolean> = {};
                              filteredProjectList.forEach((p) => {
                                next[p.id] = true;
                              });
                              setExpandedListProjectIds(next);
                            }
                          }}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer whitespace-nowrap"
                        >
                          {filteredProjectList.every((p) => expandedListProjectIds[p.id]) ? 'بستن همه ردیف‌ها' : 'باز کردن همه ردیف‌ها'}
                        </button>
                      </div>

                      <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[11px] font-bold text-slate-600">
                        <div className="lg:col-span-5">عنوان و کد پروژه</div>
                        <div className="lg:col-span-2">مرحله گردش کار</div>
                        <div className="lg:col-span-2">وضعیت و مشارکت</div>
                        <div className="lg:col-span-1">مهلت و برآورد</div>
                        <div className="lg:col-span-2 text-left">اقدام سریع</div>
                      </div>

                      <div className="space-y-2">
                        {filteredProjectList.map((prj) => (
                          <ProjectCard
                            key={prj.id}
                            project={prj}
                            currentUser={currentUser}
                            dynamicFields={dynamicFields}
                            viewContext="project_list"
                            isExpanded={Boolean(expandedListProjectIds[prj.id])}
                            onToggleExpand={() =>
                              setExpandedListProjectIds((prev) => ({
                                ...prev,
                                [prj.id]: !prev[prj.id],
                              }))
                            }
                            onOpenVoteModal={(p) => setVotingProject(p)}
                            onOpenWorkflowModal={(p) => setWorkflowProject(p)}
                            onEditProject={(p) => {
                              setEditingProject(p);
                              setShowCreateModal(true);
                            }}
                            onDeleteProject={handleDeleteProject}
                            onRefreshData={refreshData}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===================== TAB: ORG CHART & PERMISSION TREE ===================== */}
          {activeTab === 'org' && (
            <OrgHierarchyChart
              positions={positions}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshOrgAndUsersData}
            />
          )}

          {/* ===================== TAB: PROJECT STRUCTURES (ساختارهای سازمانی) ===================== */}
          {activeTab === 'structures' && (
            <ProjectStructuresManager
              structures={projectStructures}
              positions={positions}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshStructuresData}
            />
          )}

          {/* ===================== TAB: WORKFLOWS (طراحی و رهگیری گردش کار پروژه‌ها) ===================== */}
          {activeTab === 'workflows' && (
            <WorkflowManager
              workflows={workflows}
              positions={positions}
              structures={projectStructures}
              users={users}
              currentUser={currentUser}
              onRefresh={refreshWorkflowsData}
              onOpenWorkflowModalByProjectId={(projectId) => {
                const target =
                  projects.find((pr) => pr.id === projectId) ||
                  allProjects.find((pr) => pr.id === projectId);
                if (target) setWorkflowProject(target);
              }}
            />
          )}

          {/* ===================== TAB: DYNAMIC FIELDS BUILDER & PROJECT TYPES ===================== */}
          {activeTab === 'fields' && (
            <DynamicFieldsManager
              fields={dynamicFields}
              projectTypes={projectTypes}
              workflows={workflows}
              currentUser={currentUser}
              onRefresh={refreshDynamicFieldsData}
            />
          )}

          {/* ===================== TAB: USERS & POSITIONS ===================== */}
          {activeTab === 'users' && (
            <UsersPositionsManager
              users={users}
              positions={positions}
              currentUser={currentUser}
              onRefresh={refreshOrgAndUsersData}
            />
          )}

          {/* ===================== TAB: COUNCIL CHAT ===================== */}
          {activeTab === 'chat' && (
            <CouncilChat
              currentUser={currentUser}
              users={users}
              projects={allProjects.length > 0 ? allProjects : projects}
            />
          )}

          {/* ===================== TAB: STATS & DASHBOARD ===================== */}
          {activeTab === 'stats' && (
            <StatsView
              stats={stats}
              projects={allProjects.length > 0 ? allProjects : projects}
              users={users}
            />
          )}

          {/* ===================== TAB: SYSTEM SETTINGS (تنظیمات سامانه و مهلت ارزیابی) ===================== */}
          {activeTab === 'settings' && (
            <SystemSettingsView
              currentUser={currentUser}
            />
          )}

          {/* ===================== TAB: SMS TEST LAB (صفحه اختصاصی تست ارسال پیامک) ===================== */}
          {activeTab === 'smstest' && (
            <SmsTestLab />
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
          projectTypes={projectTypes}
          currentUser={currentUser}
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
