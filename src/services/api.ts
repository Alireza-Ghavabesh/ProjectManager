import { Position, User, DynamicField, Project, ChatMessage, DashboardStats, Permission, Workflow, WorkflowLog } from '../types';

class ApiService {
  private getAuthHeader(): Record<string, string> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('council_token') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'خطا در ورود به سامانه');
    }
    const data = await res.json();
    localStorage.setItem('council_token', data.token);
    localStorage.setItem('council_user', JSON.stringify(data.user));
    return data;
  }

  async getMe(): Promise<User> {
    const res = await fetch('/api/auth/me', {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در دریافت مشخصات کاربر');
    const data = await res.json();
    return data.user;
  }

  logout() {
    localStorage.removeItem('council_token');
    localStorage.removeItem('council_user');
  }

  // Users
  async getUsers(): Promise<User[]> {
    const res = await fetch('/api/users', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.users || [];
  }

  async createUser(user: Partial<User> & { password: string }): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ایجاد کاربر');
    return data.user;
  }

  async updateUser(id: string, user: Partial<User> & { password?: string }): Promise<User> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ویرایش کاربر');
    return data.user;
  }

  async deleteUser(id: string): Promise<void> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف کاربر');
    }
  }

  // Permissions Tree
  async getPermissions(): Promise<{ permissions: Permission[]; tree: Permission[] }> {
    const res = await fetch('/api/permissions', {
      headers: this.getAuthHeader(),
    });
    return await res.json();
  }

  async getPositionPermissions(positionId: string): Promise<string[]> {
    const res = await fetch(`/api/positions/${positionId}/permissions`, {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.permissions || [];
  }

  async updatePositionPermissions(positionId: string, permissions: string[]): Promise<void> {
    const res = await fetch(`/api/positions/${positionId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ذخیره دسترسی‌ها');
    }
  }

  // Positions & Org Chart
  async getPositions(): Promise<Position[]> {
    const res = await fetch('/api/positions', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.positions || [];
  }

  async createPosition(pos: { title: string; description?: string; color?: string; parentId?: string | null }): Promise<Position> {
    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(pos),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در تعریف سمت');
    return data.position;
  }

  async updatePosition(id: string, pos: { title: string; description?: string; color?: string; parentId?: string | null }): Promise<Position> {
    const res = await fetch(`/api/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(pos),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در بروزرسانی سمت');
    return data.position;
  }

  async deletePosition(id: string): Promise<void> {
    const res = await fetch(`/api/positions/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف سمت');
    }
  }

  // Workflows
  async getWorkflows(): Promise<Workflow[]> {
    const res = await fetch('/api/workflows', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.workflows || [];
  }

  async createWorkflow(payload: { title: string; description?: string; steps: any[] }): Promise<{ workflowId: string }> {
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در تعریف گردش کار');
    return data;
  }

  async transitionWorkflow(projectId: string, payload: { action: string; comment?: string; nextStepOrder?: number; nextPositionId?: string }) {
    const res = await fetch(`/api/projects/${projectId}/workflow-transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در انتقال گردش کار');
    return data;
  }

  async getWorkflowLogs(projectId: string): Promise<WorkflowLog[]> {
    const res = await fetch(`/api/projects/${projectId}/workflow-logs`, {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.logs || [];
  }

  // Dynamic Fields
  async getDynamicFields(): Promise<DynamicField[]> {
    const res = await fetch('/api/dynamic-fields', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.fields || [];
  }

  async createDynamicField(field: Partial<DynamicField>): Promise<DynamicField> {
    const res = await fetch('/api/dynamic-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(field),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در تعریف فیلد جدید');
    return data.field;
  }

  async deleteDynamicField(id: string): Promise<void> {
    const res = await fetch(`/api/dynamic-fields/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف فیلد');
    }
  }

  // Projects & Cartable
  async getProjects(): Promise<Project[]> {
    const res = await fetch('/api/projects', {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در دریافت پروژه‌ها');
    const data = await res.json();
    return data.projects || [];
  }

  async createProject(project: Partial<Project>): Promise<{ projectId: string }> {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(project),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ثبت پروژه');
    return data;
  }

  async updateProject(id: string, project: Partial<Project>): Promise<void> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ویرایش پروژه');
    }
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در حذف پروژه');
  }

  // Vote
  async submitVote(projectId: string, status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION', reason?: string) {
    const res = await fetch(`/api/projects/${projectId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ status, reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ثبت رای');
    return data;
  }

  // Chat
  async getMessages(isGroup: boolean, partnerId?: string): Promise<ChatMessage[]> {
    const params = new URLSearchParams();
    if (isGroup) {
      params.append('isGroup', '1');
    } else if (partnerId) {
      params.append('partnerId', partnerId);
    }

    const res = await fetch(`/api/messages?${params.toString()}`, {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.messages || [];
  }

  async sendMessage(payload: { content: string; isGroup: boolean; receiverId?: string; projectId?: string }): Promise<ChatMessage> {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ارسال پیام');
    return data.message;
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch('/api/dashboard/stats', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data;
  }
}

export const api = new ApiService();
