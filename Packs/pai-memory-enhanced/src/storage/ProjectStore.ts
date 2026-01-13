/**
 * Project Store - active project contexts
 *
 * Manages project contexts for organizing work and
 * maintaining project-specific memory states.
 */

import { join } from 'path';
import { readdirSync } from 'fs';
import { readJson, writeJson, ensureDir } from './JsonlStore';
import { getMemoryDir } from '../config/defaults';
import type { Project } from '../schema/BootstrapSlice';
import { createProject } from '../schema/BootstrapSlice';

export class ProjectStore {
  private baseDir: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.baseDir = join(memoryDir, 'projects');
    ensureDir(this.baseDir + '/');
  }

  private getFilePath(slug: string): string {
    return join(this.baseDir, `${slug}.json`);
  }

  list(): string[] {
    try {
      return readdirSync(this.baseDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  load(slug: string): Project {
    const defaultProject: Project = createProject(slug);
    return readJson(this.getFilePath(slug), defaultProject);
  }

  save(project: Project): void {
    project.updated = new Date().toISOString();
    writeJson(this.getFilePath(project.slug), project);
  }

  create(slug: string, goal: string = ''): Project {
    const project = createProject(slug, goal);
    this.save(project);
    return project;
  }

  getActive(): Project | null {
    for (const slug of this.list()) {
      const project = this.load(slug);
      if (project.active) {
        return project;
      }
    }
    // Return most recently updated
    const all = this.list().map((s) => this.load(s));
    if (!all.length) return null;
    all.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    return all[0];
  }

  setActive(slug: string): Project | null {
    // Deactivate all other projects
    for (const existingSlug of this.list()) {
      const project = this.load(existingSlug);
      if (project.active) {
        project.active = false;
        this.save(project);
      }
    }

    // Activate the specified project
    const project = this.load(slug);
    project.active = true;
    this.save(project);
    return project;
  }

  delete(slug: string): boolean {
    try {
      const { unlinkSync, existsSync } = require('fs');
      const filePath = this.getFilePath(slug);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
