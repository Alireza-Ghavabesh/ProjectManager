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
  fieldType: 'number' | 'text' | 'select';
  unit?: string;
  defaultValue?: string;
  optionsJson?: string;
  required: number | boolean;
  orderIndex: number;
  isActive: number | boolean;
  icon?: string;
  category?: string;
  createdAt: string;
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

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  title: string;
  structureId?: string | null;
  structureTitle?: string;
  positionId: string;
  positionTitle?: string;
  positionColor?: string;
  actionType: string;
  description?: string;
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
  fromUserPosition?: string;
  toPositionId?: string;
  toPositionTitle?: string;
  action: string;
  comment?: string;
  createdAt: string;
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
  location?: string;
  deadline?: string;
  budgetEstimated?: string;
  status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  majorityResult: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'TIED';
  requirements: Record<string, any>;
  createdById?: string;
  creatorName?: string;
  workflowId?: string;
  workflowTitle?: string;
  currentStepOrder?: number;
  currentPositionId?: string;
  currentPositionTitle?: string;
  currentPositionColor?: string;
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
