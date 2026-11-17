import { Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { formatSmsTemplate, sendSmsViaProvider } from './sms.js';
import type {
  WorkflowDiagramLayout,
  WorkflowNotificationRule,
  WorkflowNotificationTriggerEvent,
} from '../types/index.js';

// Active Server-Sent Events (SSE) connections keyed by userId
const sseClients = new Map<string, Set<Response>>();

export function registerNotificationClient(userId: string, res: Response): void {
  let set = sseClients.get(userId);
  if (!set) {
    set = new Set();
    sseClients.set(userId, set);
  }
  set.add(res);
}

export function unregisterNotificationClient(userId: string, res: Response): void {
  const set = sseClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    sseClients.delete(userId);
  }
}

export function pushRealTimeNotification(userId: string, eventName: string, payload: any): void {
  const set = sseClients.get(userId);
  if (!set || set.size === 0) return;
  const serialized = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of Array.from(set)) {
    try {
      res.write(serialized);
    } catch {
      set.delete(res);
    }
  }
  if (set.size === 0) {
    sseClients.delete(userId);
  }
}

export interface DispatchWorkflowNotificationsParams {
  workflowId: string;
  projectId: string;
  triggerEvent: WorkflowNotificationTriggerEvent;
  stepOrder?: number | null;
  branchOutcome?: 'APPROVE' | 'REVISION' | 'REJECT' | null;
  endOutcome?: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | null;
  actorUser?: any;
  comment?: string | null;
  taskTitle?: string | null;
  stepTitle?: string | null;
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getDecisionLabel(outcome?: string | null): string {
  switch (outcome) {
    case 'APPROVE':
    case 'APPROVED':
      return 'تایید / موافقت';
    case 'REVISION':
    case 'NEEDS_REVISION':
      return 'نیاز به اصلاح';
    case 'REJECT':
    case 'REJECTED':
      return 'رد / مخالفت';
    default:
      return outcome || '';
  }
}

function getStatusLabel(status?: string | null): string {
  switch (status) {
    case 'APPROVED':
      return 'تصویب شده';
    case 'REJECTED':
      return 'رد شده';
    case 'NEEDS_REVISION':
      return 'نیازمند اصلاح';
    case 'IN_REVIEW':
      return 'در حال بررسی';
    default:
      return status || 'در جریان';
  }
}

function inferSeverity(params: DispatchWorkflowNotificationsParams): 'info' | 'success' | 'warning' | 'danger' {
  if (params.endOutcome === 'APPROVED' || params.branchOutcome === 'APPROVE') return 'success';
  if (params.endOutcome === 'REJECTED' || params.branchOutcome === 'REJECT') return 'danger';
  if (params.endOutcome === 'NEEDS_REVISION' || params.branchOutcome === 'REVISION') return 'warning';
  return 'info';
}

function getActorPositionIds(actorUser: any): Set<string> {
  const set = new Set<string>();
  if (!actorUser?.id) return set;
  if (actorUser.positionId) set.add(actorUser.positionId);
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT sp.positionId
         FROM structure_position_users spu
         JOIN structure_positions sp ON spu.structurePositionId = sp.id
         WHERE spu.userId = ?`
      )
      .all(actorUser.id) as Array<{ positionId: string }>;
    for (const r of rows) {
      if (r.positionId) set.add(r.positionId);
    }
  } catch {
    // ignore
  }
  return set;
}

function resolveStepUsers(stepRow: any, creatorId: string | null, allUsersMap: Map<string, any>): any[] {
  if (!stepRow) return [];
  const cfg = safeJsonParse<any>(stepRow.configJson, {});
  const results = new Map<string, any>();

  if (cfg.assigneeMode === 'CREATOR') {
    if (creatorId && allUsersMap.has(creatorId)) {
      results.set(creatorId, allUsersMap.get(creatorId));
    }
  } else {
    const posIds = safeJsonParse<string[]>(stepRow.positionIdsJson, []);
    if (posIds.length === 0 && stepRow.positionId) {
      posIds.push(stepRow.positionId);
    }

    if (posIds.length > 0) {
      const posSet = new Set(posIds);
      for (const u of allUsersMap.values()) {
        if (u.positionId && posSet.has(u.positionId)) {
          results.set(u.id, u);
        }
      }
      try {
        const structRows = db
          .prepare(
            `SELECT DISTINCT spu.userId, sp.positionId, sp.structureId
             FROM structure_position_users spu
             JOIN structure_positions sp ON spu.structurePositionId = sp.id`
          )
          .all() as Array<{ userId: string; positionId: string; structureId: string }>;

        for (const r of structRows) {
          if (posSet.has(r.positionId) && (!stepRow.structureId || r.structureId === stepRow.structureId)) {
            const u = allUsersMap.get(r.userId);
            if (u) results.set(u.id, u);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (Array.isArray(cfg.userIds)) {
    for (const uid of cfg.userIds) {
      const u = allUsersMap.get(uid);
      if (u) results.set(u.id, u);
    }
  }

  return Array.from(results.values());
}

export async function dispatchWorkflowNotifications(params: DispatchWorkflowNotificationsParams): Promise<void> {
  try {
    const wfRow = db
      .prepare('SELECT id, title, diagramJson FROM workflows WHERE id = ?')
      .get(params.workflowId) as { id: string; title: string; diagramJson?: string } | undefined;
    if (!wfRow) return;

    const diagram = safeJsonParse<WorkflowDiagramLayout | null>(wfRow.diagramJson, null);
    const rules: WorkflowNotificationRule[] = Array.isArray(diagram?.notifications)
      ? diagram!.notifications.filter((r) => r && r.enabled !== false && Array.isArray(r.channels) && r.channels.length > 0)
      : [];

    if (rules.length === 0) return;

    const project = db
      .prepare(
        `SELECT p.*, pt.title as projectTypeTitle, u.name as creatorName, u.positionId as creatorPositionId
         FROM projects p
         LEFT JOIN project_types pt ON p.projectTypeId = pt.id
         LEFT JOIN users u ON p.createdById = u.id
         WHERE p.id = ?`
      )
      .get(params.projectId) as any;
    if (!project) return;

    const actorPosIds = params.actorUser ? getActorPositionIds(params.actorUser) : new Set<string>();

    const matchingRules = rules.filter((rule) => {
      if (rule.triggerEvent !== params.triggerEvent) return false;

      if (rule.projectTypeId && rule.projectTypeId !== project.projectTypeId) {
        return false;
      }

      if (rule.actorPositionId && !actorPosIds.has(rule.actorPositionId)) {
        return false;
      }

      if (
        (params.triggerEvent === 'ON_STEP_ENTER' ||
          params.triggerEvent === 'ON_STEP_VOTE' ||
          params.triggerEvent === 'ON_GATEWAY_OUTCOME') &&
        rule.sourceStepOrder != null &&
        Number(rule.sourceStepOrder) > 0 &&
        Number(params.stepOrder || 0) !== Number(rule.sourceStepOrder)
      ) {
        return false;
      }

      if (params.triggerEvent === 'ON_STEP_VOTE' || params.triggerEvent === 'ON_GATEWAY_OUTCOME') {
        const cond = rule.branchCondition || 'ANY';
        if (cond !== 'ANY' && params.branchOutcome && cond !== params.branchOutcome) {
          return false;
        }
      }

      if (params.triggerEvent === 'ON_WORKFLOW_END') {
        const endCond = rule.endOutcomeCondition || 'ANY';
        if (endCond !== 'ANY' && params.endOutcome && endCond !== params.endOutcome) {
          return false;
        }
      }

      return true;
    });

    if (matchingRules.length === 0) return;

    // Preload users, steps, and SMS settings once for all matching rules
    const allUserRows = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.role, u.positionId, u.phone, p.title as positionTitle
         FROM users u
         LEFT JOIN positions p ON u.positionId = p.id`
      )
      .all() as any[];
    const allUsersMap = new Map<string, any>();
    for (const u of allUserRows) allUsersMap.set(u.id, u);

    const wfSteps = db
      .prepare('SELECT * FROM workflow_steps WHERE workflowId = ? ORDER BY stepOrder ASC')
      .all(params.workflowId) as any[];

    const activeStepRow =
      params.stepOrder && params.stepOrder >= 1
        ? wfSteps.find((s) => Number(s.stepOrder) === Number(params.stepOrder))
        : project.currentStepOrder && Number(project.currentStepOrder) >= 1
        ? wfSteps.find((s) => Number(s.stepOrder) === Number(project.currentStepOrder))
        : null;

    const settingRows = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'sms_%'").all() as any[];
    const smsSettings: Record<string, string> = {};
    for (const row of settingRows) smsSettings[row.key] = row.value;
    const smsGloballyEnabled = smsSettings.sms_enabled !== 'false';

    let actorPosTitle = params.actorUser?.positionTitle || '';
    if (!actorPosTitle && params.actorUser?.positionId) {
      const pr = db.prepare('SELECT title FROM positions WHERE id = ?').get(params.actorUser.positionId) as any;
      if (pr?.title) actorPosTitle = pr.title;
    }

    const now = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('fa-IR');
    const timeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const stepCfg = activeStepRow ? safeJsonParse<any>(activeStepRow.configJson, {}) : {};
    const resolvedStepTitle = params.stepTitle || activeStepRow?.title || (Number(params.stepOrder) === 0 ? 'کارتابل ثبت‌کننده' : '');
    const resolvedTaskTitle = params.taskTitle || project.currentTaskTitle || stepCfg.taskTitle || resolvedStepTitle || '';
    const resolvedDecision = getDecisionLabel(params.branchOutcome || params.endOutcome);
    const severity = inferSeverity(params);

    const insertNotifStmt = db.prepare(`
      INSERT INTO user_notifications (
        id, userId, projectId, workflowId, ruleId, channel, title, message, severity,
        actorId, actorName, stepOrder, eventType, isRead, isDismissed, pushDelivered, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
    `);

    const insertSmsLogStmt = db.prepare(`
      INSERT INTO sms_logs (id, ruleId, recipientPhone, recipientName, message, eventType, status, providerResponse, sentAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of matchingRules) {
      const modes = Array.isArray(rule.recipientModes) ? rule.recipientModes : [];
      const userRecipientMap = new Map<string, any>();

      for (const mode of modes) {
        if (mode === 'PROJECT_CREATOR') {
          if (project.createdById && allUsersMap.has(project.createdById)) {
            userRecipientMap.set(project.createdById, allUsersMap.get(project.createdById));
          }
        } else if (mode === 'ACTOR') {
          if (params.actorUser?.id && allUsersMap.has(params.actorUser.id)) {
            userRecipientMap.set(params.actorUser.id, allUsersMap.get(params.actorUser.id));
          }
        } else if (mode === 'CURRENT_STEP_ASSIGNEES') {
          const assignees = resolveStepUsers(activeStepRow, project.createdById || null, allUsersMap);
          for (const u of assignees) userRecipientMap.set(u.id, u);
        } else if (mode === 'WORKFLOW_PARTICIPANTS') {
          if (project.createdById && allUsersMap.has(project.createdById)) {
            userRecipientMap.set(project.createdById, allUsersMap.get(project.createdById));
          }
          for (const st of wfSteps) {
            const stUsers = resolveStepUsers(st, project.createdById || null, allUsersMap);
            for (const u of stUsers) userRecipientMap.set(u.id, u);
          }
          const logUsers = db
            .prepare('SELECT DISTINCT fromUserId as uid FROM workflow_logs WHERE projectId = ?')
            .all(project.id) as Array<{ uid: string }>;
          for (const l of logUsers) {
            if (l.uid && allUsersMap.has(l.uid)) userRecipientMap.set(l.uid, allUsersMap.get(l.uid));
          }
          const voteUsers = db
            .prepare('SELECT DISTINCT userId as uid FROM workflow_step_approvals WHERE projectId = ?')
            .all(project.id) as Array<{ uid: string }>;
          for (const v of voteUsers) {
            if (v.uid && allUsersMap.has(v.uid)) userRecipientMap.set(v.uid, allUsersMap.get(v.uid));
          }
        } else if (mode === 'SPECIFIC_POSITIONS') {
          const posIds = Array.isArray(rule.targetPositionIds) ? rule.targetPositionIds : [];
          if (posIds.length > 0) {
            const posSet = new Set(posIds);
            if (rule.targetStructureId) {
              const structHolders = db
                .prepare(
                  `SELECT DISTINCT spu.userId, sp.positionId
                   FROM structure_position_users spu
                   JOIN structure_positions sp ON spu.structurePositionId = sp.id
                   WHERE sp.structureId = ?`
                )
                .all(rule.targetStructureId) as Array<{ userId: string; positionId: string }>;
              for (const sh of structHolders) {
                if (posSet.has(sh.positionId) && allUsersMap.has(sh.userId)) {
                  userRecipientMap.set(sh.userId, allUsersMap.get(sh.userId));
                }
              }
            } else {
              for (const u of allUsersMap.values()) {
                if (u.positionId && posSet.has(u.positionId)) {
                  userRecipientMap.set(u.id, u);
                }
              }
              const structHolders = db
                .prepare(
                  `SELECT DISTINCT spu.userId, sp.positionId
                   FROM structure_position_users spu
                   JOIN structure_positions sp ON spu.structurePositionId = sp.id`
                )
                .all() as Array<{ userId: string; positionId: string }>;
              for (const sh of structHolders) {
                if (posSet.has(sh.positionId) && allUsersMap.has(sh.userId)) {
                  userRecipientMap.set(sh.userId, allUsersMap.get(sh.userId));
                }
              }
            }
          }
        } else if (mode === 'SPECIFIC_USERS') {
          const uids = Array.isArray(rule.targetUserIds) ? rule.targetUserIds : [];
          for (const uid of uids) {
            if (allUsersMap.has(uid)) userRecipientMap.set(uid, allUsersMap.get(uid));
          }
        } else if (mode === 'ALL_ADMINS') {
          for (const u of allUsersMap.values()) {
            if (u.role === 'ADMIN') userRecipientMap.set(u.id, u);
          }
        } else if (mode === 'ALL_COUNCIL') {
          for (const u of allUsersMap.values()) {
            if (u.role === 'COUNCIL') userRecipientMap.set(u.id, u);
          }
        }
      }

      const baseVars: Record<string, string> = {
        project_title: project.title || 'پروژه',
        project_code: project.code || '',
        tracking_code: project.workflowTrackingCode || '',
        project_status: getStatusLabel(project.status),
        status: getStatusLabel(project.status),
        step_title: resolvedStepTitle,
        task_title: resolvedTaskTitle,
        actor_name: params.actorUser?.name || 'سامانه',
        actor_position: actorPosTitle || 'عضو شورا',
        decision: resolvedDecision,
        comment: params.comment || '',
        creator_name: project.creatorName || '',
        budget: project.budgetEstimated || '',
        deadline: project.deadline || '',
        location: project.location || '',
        workflow_title: wfRow.title || '',
        date: dateStr,
        time: timeStr,
      };

      const defaultTitle = rule.titleTemplate?.trim() || rule.title?.trim() || `اطلاع‌رسانی گردش کار: ${project.title}`;
      const baseMessage = rule.messageTemplate?.trim() || 'رویداد جدید در گردش کار پروژه «{project_title}» رخ داد.';

      // 1) Dispatch PUSH & CARTABLE per unique resolved user
      const wantsPush = rule.channels.includes('PUSH');
      const wantsCartable = rule.channels.includes('CARTABLE');

      for (const recipient of userRecipientMap.values()) {
        const vars = {
          ...baseVars,
          recipient_name: recipient.name || 'همکار گرامی',
        };
        const formattedTitle = formatSmsTemplate(defaultTitle, vars);

        if (wantsPush) {
          const pushBody = formatSmsTemplate(
            (rule.pushTemplate && rule.pushTemplate.trim()) || baseMessage,
            vars
          );
          const notifId = `ntf-${randomUUID().substring(0, 12)}`;
          insertNotifStmt.run(
            notifId,
            recipient.id,
            project.id,
            wfRow.id,
            rule.id,
            'PUSH',
            formattedTitle,
            pushBody,
            severity,
            params.actorUser?.id || null,
            params.actorUser?.name || null,
            params.stepOrder ?? activeStepRow?.stepOrder ?? null,
            params.triggerEvent,
            now
          );

          pushRealTimeNotification(recipient.id, 'notification', {
            id: notifId,
            userId: recipient.id,
            projectId: project.id,
            projectTitle: project.title,
            projectCode: project.code,
            workflowTrackingCode: project.workflowTrackingCode,
            workflowId: wfRow.id,
            ruleId: rule.id,
            channel: 'PUSH',
            title: formattedTitle,
            message: pushBody,
            severity,
            actorId: params.actorUser?.id || null,
            actorName: params.actorUser?.name || null,
            stepOrder: params.stepOrder ?? activeStepRow?.stepOrder ?? null,
            eventType: params.triggerEvent,
            isRead: false,
            isDismissed: false,
            pushDelivered: false,
            createdAt: now,
          });
        }

        if (wantsCartable) {
          const cartableBody = formatSmsTemplate(
            (rule.cartableTemplate && rule.cartableTemplate.trim()) || baseMessage,
            vars
          );
          const notifId = `crt-${randomUUID().substring(0, 12)}`;
          insertNotifStmt.run(
            notifId,
            recipient.id,
            project.id,
            wfRow.id,
            rule.id,
            'CARTABLE',
            formattedTitle,
            cartableBody,
            severity,
            params.actorUser?.id || null,
            params.actorUser?.name || null,
            params.stepOrder ?? activeStepRow?.stepOrder ?? null,
            params.triggerEvent,
            now
          );

          pushRealTimeNotification(recipient.id, 'notification', {
            id: notifId,
            userId: recipient.id,
            projectId: project.id,
            projectTitle: project.title,
            projectCode: project.code,
            workflowTrackingCode: project.workflowTrackingCode,
            workflowId: wfRow.id,
            ruleId: rule.id,
            channel: 'CARTABLE',
            title: formattedTitle,
            message: cartableBody,
            severity,
            actorId: params.actorUser?.id || null,
            actorName: params.actorUser?.name || null,
            stepOrder: params.stepOrder ?? activeStepRow?.stepOrder ?? null,
            eventType: params.triggerEvent,
            isRead: false,
            isDismissed: false,
            pushDelivered: false,
            createdAt: now,
          });
        }
      }

      // 2) Dispatch SMS (deduplicated by phone number, including CUSTOM_PHONES)
      if (rule.channels.includes('SMS') && smsGloballyEnabled) {
        const phoneMap = new Map<string, string | undefined>();
        for (const recipient of userRecipientMap.values()) {
          const clean = (recipient.phone || '').trim();
          if (clean.length >= 10 && !phoneMap.has(clean)) {
            phoneMap.set(clean, recipient.name);
          }
        }
        if (modes.includes('CUSTOM_PHONES') && Array.isArray(rule.customPhones)) {
          for (const raw of rule.customPhones) {
            const clean = (raw || '').trim();
            if (clean.length >= 10 && !phoneMap.has(clean)) {
              phoneMap.set(clean, undefined);
            }
          }
        }

        const smsTemplateStr = (rule.smsTemplate && rule.smsTemplate.trim()) || baseMessage;
        for (const [phone, name] of phoneMap.entries()) {
          const smsText = formatSmsTemplate(smsTemplateStr, {
            ...baseVars,
            recipient_name: name || 'همکار گرامی',
          });
          const sendResult = await sendSmsViaProvider(phone, smsText, smsSettings);
          const logId = `sms-${randomUUID().substring(0, 8)}`;
          const logStatus = sendResult.success ? (sendResult.simulated ? 'SIMULATED' : 'SENT') : 'FAILED';
          insertSmsLogStmt.run(
            logId,
            `wf-rule:${rule.id}`,
            phone,
            name || null,
            smsText,
            `WORKFLOW_${params.triggerEvent}`,
            logStatus,
            sendResult.providerResponse,
            now
          );
        }
      }
    }
  } catch (err) {
    console.error('dispatchWorkflowNotifications error:', err);
  }
}
