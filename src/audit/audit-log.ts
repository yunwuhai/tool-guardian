// audit/audit-log.ts
// ===========================================================================
// Structured audit log — records every tool call decision.
//
// The audit log is an in-memory ring buffer (configurable size).
// Entries can be flushed to a callback for external storage.
// ===========================================================================

import type { AuditLogEntry, AppVerdict } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogCallback = (entry: AuditLogEntry) => void;

// ---------------------------------------------------------------------------
// AuditLog class
// ---------------------------------------------------------------------------

export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private maxSize: number;
  private callbacks: LogCallback[] = [];

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Record a tool call verdict.
   */
  record(
    tool: string,
    input: Record<string, unknown>,
    verdict: AppVerdict,
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      tool,
      input,
      verdict,
    };

    // Ring buffer behavior
    if (this.entries.length >= this.maxSize) {
      this.entries.shift();
    }
    this.entries.push(entry);

    // Notify callbacks
    for (const cb of this.callbacks) {
      try {
        cb(entry);
      } catch {
        // Swallow callback errors — don't break the audit
      }
    }
  }

  /**
   * Register a callback that receives every log entry.
   * Useful for writing to file, sending to monitoring, etc.
   */
  onEntry(callback: LogCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Get all entries (most recent last).
   */
  getEntries(): ReadonlyArray<AuditLogEntry> {
    return this.entries;
  }

  /**
   * Get the most recent entry, or undefined if empty.
   */
  getLastEntry(): AuditLogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Get entries filtered by tool name.
   */
  getEntriesByTool(tool: string): AuditLogEntry[] {
    return this.entries.filter(e => e.tool === tool);
  }

  /**
   * Get denied entries only.
   */
  getDeniedEntries(): AuditLogEntry[] {
    return this.entries.filter(e => !e.verdict.allowed);
  }

  /**
   * Get the number of entries.
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }
}
