import { Position, User, DynamicField, Project, ChatMessage, DashboardStats, Permission, Workflow, WorkflowLog, ProjectStructure, StructurePositionNode, ProjectAttachment, SystemSetting, PasswordResetRequest, SmsRule, SmsLog, PublicSettings, UploadProgressInfo } from '../types';

class ApiService {
  getToken(): string | null {
    if (typeof sessionStorage !== 'undefined') {
      const sToken = sessionStorage.getItem('council_jwt_token');
      if (sToken) return sToken;
    }
    return null;
  }

  getStoredUser(): User | null {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const sUser = sessionStorage.getItem('council_jwt_user');
        if (sUser) return JSON.parse(sUser);
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  private getAuthHeader(): Record<string, string> {
    const token = this.getToken();
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
    
    // Per-tab isolated storage strictly in sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('council_jwt_token', data.token);
      sessionStorage.setItem('council_jwt_user', JSON.stringify(data.user));
    }
    // Clean any old localStorage tokens to ensure private/new windows never leak
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('council_jwt_token');
      localStorage.removeItem('council_jwt_user');
      localStorage.removeItem('council_token');
      localStorage.removeItem('council_user');
    }

    return data;
  }

  async getMe(): Promise<User> {
    const res = await fetch('/api/auth/me', {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      this.logout();
      throw new Error('خطا در دریافت مشخصات کاربر');
    }
    const data = await res.json();
    // Keep cached user up to date in sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('council_jwt_user', JSON.stringify(data.user));
    }
    return data.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'خطا در تغییر رمز عبور');
    }
    return data;
  }

  async forgotPassword(username: string, phone?: string, note?: string): Promise<{ success: boolean; message: string; requestId?: string }> {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, phone, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'خطا در ارسال درخواست بازیابی رمز');
    }
    return data;
  }

  async getResetStatus(username: string): Promise<{ found: boolean; request?: PasswordResetRequest }> {
    const res = await fetch(`/api/auth/reset-status/${encodeURIComponent(username.trim().toLowerCase())}`);
    return await res.json();
  }

  async getPasswordResetRequests(): Promise<PasswordResetRequest[]> {
    const res = await fetch('/api/password-reset-requests', {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در دریافت درخواست‌های فراموشی رمز');
    }
    const data = await res.json();
    return data.requests || [];
  }

  async resolvePasswordResetRequest(id: string, action: 'APPROVE' | 'REJECT', newPassword?: string, adminNote?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/password-reset-requests/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ action, newPassword, adminNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'خطا در بررسی درخواست رمز');
    }
    return data;
  }

  logout() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('council_jwt_token');
      sessionStorage.removeItem('council_jwt_user');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('council_jwt_token');
      localStorage.removeItem('council_jwt_user');
      localStorage.removeItem('council_token');
      localStorage.removeItem('council_user');
    }
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

  // User Permissions
  async getUserPermissions(userId: string): Promise<{ permissions: string[]; customPermissions: string[]; inheritedPermissions: string[]; hasCustomPermissions?: boolean }> {
    const res = await fetch(`/api/users/${userId}/permissions`, {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در دریافت دسترسی‌های کاربر');
    return await res.json();
  }

  async updateUserPermissions(userId: string, permissions: string[]): Promise<void> {
    const res = await fetch(`/api/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ذخیره دسترسی‌های کاربر');
    }
  }

  async resetUserPermissions(userId: string): Promise<void> {
    const res = await fetch(`/api/users/${userId}/permissions/reset`, {
      method: 'POST',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در بازنشانی دسترسی‌های کاربر');
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

  async updateWorkflow(id: string, payload: { title: string; description?: string; isDefault?: boolean; steps: any[] }): Promise<void> {
    const res = await fetch(`/api/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ویرایش گردش کار');
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    const res = await fetch(`/api/workflows/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف گردش کار');
    }
  }

  async setDefaultWorkflow(id: string): Promise<void> {
    const res = await fetch(`/api/workflows/${id}/set-default`, {
      method: 'POST',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در تغییر گردش کار پیش‌فرض');
    }
  }

  // Project Structures & Types (انواع و ساختارهای پویا و غیر استاتیک)
  async getProjectStructures(): Promise<ProjectStructure[]> {
    const res = await fetch('/api/project-structures', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.structures || [];
  }

  async createProjectStructure(structure: Partial<ProjectStructure>): Promise<ProjectStructure> {
    const res = await fetch('/api/project-structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(structure),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ثبت ساختار جدید');
    return data.structure;
  }

  async updateProjectStructure(id: string, structure: Partial<ProjectStructure>): Promise<ProjectStructure> {
    const res = await fetch(`/api/project-structures/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(structure),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ویرایش ساختار');
    return data.structure;
  }

  async deleteProjectStructure(id: string): Promise<void> {
    const res = await fetch(`/api/project-structures/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف ساختار پروژه');
    }
  }

  // Structure Positions & Tree (درخت سمت‌ها و پرسنل ساختار)
  async getStructurePositions(structureId: string): Promise<{ structure: ProjectStructure; positions: StructurePositionNode[]; tree: StructurePositionNode[] }> {
    const res = await fetch(`/api/project-structures/${structureId}/positions`, {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در دریافت درخت سمت‌های ساختار');
    return await res.json();
  }

  async addStructurePosition(structureId: string, data: { positionId?: string; title?: string; description?: string; color?: string; parentId?: string | null; userIds?: string[] }): Promise<{ structurePositionId: string }> {
    const res = await fetch(`/api/project-structures/${structureId}/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'خطا در افزودن سمت به ساختار');
    return result;
  }

  async updateStructurePosition(structureId: string, spId: string, data: { parentId?: string | null; orderIndex?: number; title?: string; description?: string; color?: string }): Promise<void> {
    const res = await fetch(`/api/project-structures/${structureId}/positions/${spId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || 'خطا در ویرایش سمت در ساختار');
    }
  }

  async deleteStructurePosition(structureId: string, spId: string): Promise<void> {
    const res = await fetch(`/api/project-structures/${structureId}/positions/${spId}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || 'خطا در حذف سمت از ساختار');
    }
  }

  async assignUserToStructurePosition(structureId: string, spId: string, userId: string): Promise<void> {
    const res = await fetch(`/api/project-structures/${structureId}/positions/${spId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || 'خطا در انتصاب کاربر به این سمت');
    }
  }

  async removeUserFromStructurePosition(structureId: string, spId: string, userId: string): Promise<void> {
    const res = await fetch(`/api/project-structures/${structureId}/positions/${spId}/users/${userId}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || 'خطا در لغو انتصاب کاربر از سمت');
    }
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

  // Project Attachments & Files
  async getProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
    const res = await fetch(`/api/projects/${projectId}/attachments`, {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.attachments || [];
  }

  async uploadProjectAttachment(
    projectId: string,
    fileData: { fileName: string; fileSize: number; fileType: string; data: string }
  ): Promise<ProjectAttachment> {
    const res = await fetch(`/api/projects/${projectId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(fileData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در بارگذاری فایل');
    return data.attachment;
  }

  // Streaming binary upload with live progress tracking (supports large files up to 10GB with O(1) memory)
  async uploadProjectAttachmentStream(
    projectId: string,
    file: File,
    onProgress?: (progress: UploadProgressInfo) => void
  ): Promise<ProjectAttachment> {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const targetUrl = `/api/projects/${projectId}/attachments/stream?fileName=${encodeURIComponent(file.name)}`;
      xhr.open('POST', targetUrl);
      
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let lastTime = Date.now();
      let lastLoaded = 0;
      let calculatedSpeed = 0;

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            if (elapsed >= 0.25) {
              calculatedSpeed = Math.round((event.loaded - lastLoaded) / elapsed);
              lastTime = now;
              lastLoaded = event.loaded;
            }
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            onProgress({
              percent,
              loaded: event.loaded,
              total: event.total,
              speed: calculatedSpeed,
            });
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.attachment);
          } catch (e) {
            reject(new Error('خطا در تجزیه پاسخ سرور'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || `خطا در بارگذاری فایل (${xhr.status})`));
          } catch (e) {
            reject(new Error(`خطای آپلود (کد وضعیت سرور: ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('خطای ارتباط شبکه با سرور در زمان آپلود فایل'));
      };

      xhr.ontimeout = () => {
        reject(new Error('زمان مجاز ارسال فایل به سرور به پایان رسید (Timeout)'));
      };

      xhr.send(file);
    });
  }

  async deleteProjectAttachment(projectId: string, attachmentId: string): Promise<void> {
    const res = await fetch(`/api/projects/${projectId}/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف فایل');
    }
  }

  async downloadAttachment(attachmentId: string, fileName?: string): Promise<void> {
    const downloadUrl = `/api/attachments/${attachmentId}/download`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    if (fileName) {
      a.download = fileName;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch('/api/dashboard/stats', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data;
  }

  // System Settings
  async getSettings(): Promise<{ settings: Record<string, string>; list: SystemSetting[] }> {
    const res = await fetch('/api/settings', {
      headers: this.getAuthHeader(),
    });
    if (!res.ok) throw new Error('خطا در دریافت تنظیمات سامانه');
    return res.json();
  }

  async updateSettings(settings: Record<string, string>): Promise<{ settings: Record<string, string>; list: SystemSetting[] }> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ settings }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ذخیره تنظیمات');
    return data;
  }

  // Public Branding Settings (accessible without login)
  async getPublicSettings(): Promise<PublicSettings> {
    try {
      const res = await fetch('/api/system/public-settings');
      if (!res.ok) throw new Error('خطا در دریافت مشخصات ظاهری');
      const data = await res.json();
      const s = data.settings || data;
      return {
        login_title: s.login_title || 'شورای تولید و ارزیابی',
        login_subtitle: s.login_subtitle !== undefined ? s.login_subtitle : 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها',
        login_logo_url: s.login_logo_url || null,
        max_upload_size_mb: s.max_upload_size_mb || '1024',
      };
    } catch (e) {
      return {
        login_title: 'شورای تولید و ارزیابی',
        login_subtitle: 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها',
        login_logo_url: null,
        max_upload_size_mb: '1024',
      };
    }
  }

  // Upload Login Logo (Admin)
  async uploadLoginLogo(logoData: string, fileName?: string): Promise<{ success: boolean; logoUrl: string }> {
    const res = await fetch('/api/system/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ logoData, fileName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در بارگذاری لوگو');
    return data;
  }

  // SMS API & Rules
  async getSmsRules(): Promise<SmsRule[]> {
    const res = await fetch('/api/sms/rules', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.rules || [];
  }

  async createSmsRule(rule: Partial<SmsRule>): Promise<{ success: boolean; ruleId: string }> {
    const res = await fetch('/api/sms/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(rule),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ثبت شرط پیامک');
    return data;
  }

  async updateSmsRule(id: string, rule: Partial<SmsRule>): Promise<void> {
    const res = await fetch(`/api/sms/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ویرایش شرط پیامک');
    }
  }

  async deleteSmsRule(id: string): Promise<void> {
    const res = await fetch(`/api/sms/rules/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در حذف شرط پیامک');
    }
  }

  async toggleSmsRule(id: string): Promise<{ success: boolean; enabled: boolean }> {
    const res = await fetch(`/api/sms/rules/${id}/toggle`, {
      method: 'POST',
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در تغییر وضعیت شرط');
    return data;
  }

  async sendTestSms(phone: string, message?: string): Promise<{ success: boolean; simulated: boolean; message: string }> {
    const res = await fetch('/api/sms/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
      body: JSON.stringify({ phone, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در ارسال پیامک آزمایشی');
    return data;
  }

  async getSmsLogs(): Promise<SmsLog[]> {
    const res = await fetch('/api/sms/logs', {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    return data.logs || [];
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '۰ بایت';
  const k = 1024;
  const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(1);
  return `${val} ${sizes[i]}`;
}

export const api = new ApiService();
