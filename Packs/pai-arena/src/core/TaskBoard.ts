/**
 * TaskBoard - Task state machine for arena sessions
 */

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentTaskId?: string;
  subtasks: string[];
  blockedBy?: string;
  blockedReason?: string;
}

export interface TaskTransition {
  from: TaskStatus;
  to: TaskStatus;
  timestamp: string;
  actor: string;
  reason?: string;
}

/**
 * TaskBoard class - manages task lifecycle
 */
export class TaskBoard {
  private tasks: Map<string, Task> = new Map();
  private transitions: TaskTransition[] = [];

  /**
   * Create a new task
   */
  createTask(
    title: string,
    description: string,
    priority: TaskPriority = 'medium',
    parentTaskId?: string
  ): Task {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const task: Task = {
      id,
      title,
      description,
      assignee: null,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
      parentTaskId,
      subtasks: [],
    };

    this.tasks.set(id, task);

    // Add to parent's subtasks if applicable
    if (parentTaskId) {
      const parent = this.tasks.get(parentTaskId);
      if (parent) {
        parent.subtasks.push(id);
      }
    }

    return task;
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  /**
   * Assign a task to an agent
   */
  assignTask(taskId: string, assignee: string, actor: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const previousStatus = task.status;
    task.assignee = assignee;
    task.status = 'assigned';
    task.updatedAt = new Date().toISOString();

    this.recordTransition(taskId, previousStatus, 'assigned', actor, `Assigned to ${assignee}`);

    return task;
  }

  /**
   * Start working on a task
   */
  startTask(taskId: string, actor: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'assigned') return null;

    const previousStatus = task.status;
    task.status = 'in_progress';
    task.updatedAt = new Date().toISOString();

    this.recordTransition(taskId, previousStatus, 'in_progress', actor);

    return task;
  }

  /**
   * Block a task
   */
  blockTask(taskId: string, blockedBy: string, reason: string, actor: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const previousStatus = task.status;
    task.status = 'blocked';
    task.blockedBy = blockedBy;
    task.blockedReason = reason;
    task.updatedAt = new Date().toISOString();

    this.recordTransition(taskId, previousStatus, 'blocked', actor, reason);

    return task;
  }

  /**
   * Unblock a task
   */
  unblockTask(taskId: string, actor: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'blocked') return null;

    const previousStatus = task.status;
    task.status = task.assignee ? 'assigned' : 'pending';
    task.blockedBy = undefined;
    task.blockedReason = undefined;
    task.updatedAt = new Date().toISOString();

    this.recordTransition(taskId, previousStatus, task.status, actor, 'Unblocked');

    return task;
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, actor: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const previousStatus = task.status;
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;

    this.recordTransition(taskId, previousStatus, 'completed', actor);

    return task;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, actor: string, reason: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const previousStatus = task.status;
    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();

    this.recordTransition(taskId, previousStatus, 'cancelled', actor, reason);

    return task;
  }

  /**
   * Record a transition
   */
  private recordTransition(
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    actor: string,
    reason?: string
  ): void {
    this.transitions.push({
      from,
      to,
      timestamp: new Date().toISOString(),
      actor,
      reason,
    });
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  /**
   * Get tasks by assignee
   */
  getTasksByAssignee(assignee: string): Task[] {
    return this.getAllTasks().filter((t) => t.assignee === assignee);
  }

  /**
   * Get pending tasks (not assigned)
   */
  getPendingTasks(): Task[] {
    return this.getTasksByStatus('pending');
  }

  /**
   * Get blocked tasks
   */
  getBlockedTasks(): Task[] {
    return this.getTasksByStatus('blocked');
  }

  /**
   * Get task completion stats
   */
  getStats(): {
    total: number;
    pending: number;
    assigned: number;
    inProgress: number;
    blocked: number;
    completed: number;
    cancelled: number;
  } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      assigned: tasks.filter((t) => t.status === 'assigned').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      blocked: tasks.filter((t) => t.status === 'blocked').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    };
  }

  /**
   * Export to JSON
   */
  toJSON(): { tasks: Task[]; transitions: TaskTransition[] } {
    return {
      tasks: this.getAllTasks(),
      transitions: this.transitions,
    };
  }

  /**
   * Import from JSON
   */
  fromJSON(data: { tasks: Task[]; transitions: TaskTransition[] }): void {
    this.tasks.clear();
    for (const task of data.tasks) {
      this.tasks.set(task.id, task);
    }
    this.transitions = data.transitions;
  }
}
