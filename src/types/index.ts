export interface Permission {
  id: string;
  code: string;
  title: string;
  category: string;
  parentCode: string | null;
  description?: string;
  isDanger?: number | boolean;
  children?: Permission[];
}

export interface Position {
  id: string;
  title: string;
  description?: string;
  color?: string;
  parentId?: string | null;
  parentTitle?: string;
  level?: number;
  orderIndex?: number;
  createdAt: string;
  userCount?: number;
  permissions?: string[];
  children?: Position[];
  users?: User[];
}

export interface StructurePositionNode {
  id: string; // structure_position record ID
  structureId: string;
  positionId: string;
  parentId?: string | null;
  parentTitle?: string;
  title: string;
  description?: string;
  color?: string;
  level?: number;
  orderIndex: number;
  createdAt?: string;
  permissions?: string[];
  users: User[];
  children?: StructurePositionNode[];
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'COUNCIL';
  positionId?: string;
  positionTitle?: string;
  positionColor?: string;
  avatar?: string;
  phone?: string;
  createdAt?: string;
  permissions?: string[];
}

export interface ProjectStructure {
  id: string;
  title: string;
  code?: string;
  description?: string;
  category?: string;
  defaultWorkflowId?: string | null;
  defaultWorkflowTitle?: string;
  orderIndex: number;
  isActive: number | boolean;
  createdAt: string;
  projectCount?: number;
  positionCount?: number;
  userCount?: number;
}

export interface DynamicField {
  id: string;
  name: string;
  key: string;
  fieldType: 'number' | 'text' | 'select' | 'currency';
  unit?: string;
  defaultValue?: string;
  optionsJson?: string;
  required: number | boolean;
  orderIndex: number;
  isActive: number | boolean;
  icon?: string;
  category?: string;
  parentId?: string | null;
  parentName?: string;
  children?: DynamicField[];
  createdAt: string;
}

export interface ProjectType {
  id: string;
  title: string;
  description?: string;
  defaultWorkflowId?: string | null;
  defaultWorkflowTitle?: string | null;
  orderIndex: number;
  isActive: number | boolean;
  createdAt: string;
  fieldIds: string[];
  fieldCount?: number;
  projectCount?: number;
}

export interface Vote {
  id: string;
  projectId: string;
  userId: string;
  status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  reason?: string;
  votedAt: string;
  userName?: string;
  userAvatar?: string;
  userPositionTitle?: string;
  userPositionColor?: string;
}

export interface WorkflowStepConfig {
  approvalMode?: 'SINGLE' | 'MAJORITY' | 'ALL' | 'NOTIFY_ONLY';
  onRejectAction?: 'RETURN_PREV' | 'RETURN_CREATOR' | 'REJECT_PROJECT' | 'CUSTOM_STEP';
  onRejectStepOrder?: number;
  onApproveStepOrder?: number;
  conditionLabel?: string;
  customActionLabel?: string;
  color?: string;
}

export interface WorkflowStepApprovalProgress {
  mode: 'SINGLE' | 'MAJORITY' | 'ALL' | 'NOTIFY_ONLY';
  approvedUserIds: string[];
  approvedUsers: Array<{
    userId: string;
    userName: string;
    positionTitle?: string;
    createdAt: string;
  }>;
  totalAssignees: number;
  requiredCount: number;
  hasCurrentUserApproved: boolean;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  title: string;
  structureId?: string | null;
  structureTitle?: string;
  positionId: string;
  positionIds?: string[];
  positions?: Array<{ id: string; title: string; color?: string }>;
  positionTitle?: string;
  positionColor?: string;
  actionType: string;
  description?: string;
  configJson?: string;
  config?: WorkflowStepConfig;
}

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  isDefault: number | boolean;
  createdAt?: string;
  steps: WorkflowStep[];
}

export interface WorkflowLog {
  id: string;
  projectId: string;
  stepOrder: number;
  fromUserId: string;
  fromUserName?: string;
  fromUsername?: string;
  fromUserPosition?: string;
  toPositionId?: string;
  toPositionTitle?: string;
  action: string;
  comment?: string;
  createdAt: string;
}

export interface WorkflowTrackingAssignee {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  phone?: string;
  role: string;
  positionTitle?: string;
  sources: string[];
}

export interface WorkflowTrackingStep extends WorkflowStep {
  assignees: WorkflowTrackingAssignee[];
}

export interface WorkflowTrackingItem {
  projectId: string;
  projectTitle: string;
  projectCode: string;
  workflowTrackingCode: string;
  productionType?: string;
  budgetEstimated?: string;
  deadline?: string;
  deliveryDate?: string;
  isDeadlineExpired?: boolean;
  status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  majorityResult: string;
  workflowId: string;
  workflowTitle: string;
  currentStepOrder: number;
  totalSteps: number;
  currentStepTitle?: string;
  currentStepActionType?: string;
  currentStructureId?: string | null;
  currentStructureTitle?: string | null;
  currentPositionId?: string | null;
  currentPositionIds?: string[];
  currentPositions?: Array<{ id: string; title: string; color?: string }>;
  currentPositionTitle?: string | null;
  currentPositionColor?: string;
  currentAssignees: WorkflowTrackingAssignee[];
  currentStepApprovalProgress?: WorkflowStepApprovalProgress | null;
  creatorId?: string | null;
  creatorName?: string;
  creatorUsername?: string;
  creatorPositionTitle?: string;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowTrackingStep[];
  logs: WorkflowLog[];
}

export interface ProjectAttachment {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  fileType?: string;
  data?: string;
  uploadedBy?: string;
  uploaderName?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  code: string;
  description?: string;
  productionType?: string;
  projectTypeId?: string | null;
  projectTypeTitle?: string | null;
  location?: string;
  deadline?: string;
  deliveryDate?: string;
  isDeadlineExpired?: boolean;
  budgetEstimated?: string;
  status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  majorityResult: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'TIED';
  requirements: Record<string, any>;
  createdById?: string;
  creatorName?: string;
  workflowId?: string;
  workflowTitle?: string;
  hasWorkflow?: boolean;
  currentStepOrder?: number;
  currentPositionId?: string;
  currentPositionIds?: string[];
  currentPositions?: Array<{ id: string; title: string; color?: string }>;
  currentPositionTitle?: string;
  currentPositionColor?: string;
  currentAssignees?: WorkflowTrackingAssignee[];
  currentStepApprovalProgress?: WorkflowStepApprovalProgress | null;
  workflowTrackingCode?: string;
  workflowParticipatedCount?: number;
  workflowTotalParticipants?: number;
  isMyWorkflowTurn?: boolean;
  createdAt: string;
  updatedAt: string;
  
  // Attachments
  attachments?: ProjectAttachment[];
  attachmentCount?: number;

  // Council Member View
  hasVoted?: boolean;
  userVote?: {
    id: string;
    status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
    reason?: string;
    votedAt: string;
  } | null;

  // Admin View
  allVotes?: Vote[];
  voteCounts?: {
    APPROVED: number;
    REJECTED: number;
    NEEDS_REVISION: number;
    total: number;
  };
  totalCouncilMembers?: number;

  // Workflow Details
  workflowSteps?: WorkflowStep[];
  workflowLogs?: WorkflowLog[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole?: 'ADMIN' | 'COUNCIL';
  senderPosition?: string;
  receiverId?: string | null;
  isGroup: number | boolean;
  content: string;
  projectId?: string | null;
  projectTitle?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalProjects: number;
  totalCouncil: number;
  totalVotesCast: number;
  approvedMajority: number;
  revisionMajority: number;
  rejectedMajority: number;
  pendingMajority: number;
  userPendingCount: number;
  totalPositions?: number;
  activeWorkflows?: number;
}

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  updatedAt: string;
}

export interface PasswordResetRequest {
  id: string;
  userId?: string;
  username: string;
  fullName?: string;
  phone?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  newPassword?: string;
  adminNote?: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

export type SmsEventType =
  | 'PROJECT_CREATED'
  | 'PROJECT_APPROVED'
  | 'PROJECT_REJECTED'
  | 'PROJECT_NEEDS_REVISION'
  | 'NEW_VOTE_CAST'
  | 'PASSWORD_RESET';

export type SmsTargetType =
  | 'ALL_COUNCIL'
  | 'ALL_ADMINS'
  | 'ADMINS'
  | 'PROJECT_CREATOR'
  | 'REQUESTER'
  | 'PASSWORD_REQUESTER'
  | 'SPECIFIC_POSITIONS'
  | 'CUSTOM_NUMBERS';

export interface SmsRule {
  id: string;
  title: string;
  event?: SmsEventType;
  eventType: SmsEventType;
  target?: SmsTargetType;
  targetType: SmsTargetType;
  actorPositionIds?: string[]; // شرط سمت انجام‌دهنده رویداد (خالی یعنی هر سمتی)
  actorUserIds?: string[]; // شرط کاربر خاص انجام‌دهنده
  targetPositionIds?: string[];
  targetCustomNumbers?: string[];
  customPhones?: string;
  template?: string;
  messageTemplate: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SmsLog {
  id: string;
  ruleId?: string;
  recipientPhone: string;
  recipientName?: string;
  message: string;
  event: string;
  eventType?: string;
  status: 'SENT' | 'FAILED' | 'SIMULATED';
  providerResponse?: string;
  error?: string;
  createdAt: string;
  sentAt?: string;
}

export interface PublicSettings {
  login_title?: string;
  login_subtitle?: string;
  login_logo_url?: string | null;
  max_file_size_mb?: string;
  max_upload_size_mb?: string;
}

export interface UploadProgressInfo {
  percent: number;
  loaded: number;
  total: number;
  speed: number; // bytes per second
}

