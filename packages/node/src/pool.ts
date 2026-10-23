import * as http from "node:http";
import * as https from "node:https";
import type { PoolOptions, TlsOptions } from "./types.js";

export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.limit <= 0) {
      return () => {};
    }
    if (this.active < this.limit) {
      this.active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      });
    });
  }

  private release(): void {
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift()!;
      next();
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

export class ConnectionPool {
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;
  private readonly customAgents: Set<http.Agent | https.Agent> = new Set();
  private isDestroyed = false;
  readonly semaphore?: Semaphore;

  constructor(poolOptions?: PoolOptions, tlsOptions?: TlsOptions) {
    const keepAlive = poolOptions?.keepAlive ?? true;
    const maxSockets = poolOptions?.maxSockets ?? 64;
    const maxFreeSockets = poolOptions?.maxFreeSockets ?? 16;
    const timeout = poolOptions?.idleTimeout ?? 30000;

    if (poolOptions?.concurrency && poolOptions.concurrency > 0) {
      this.semaphore = new Semaphore(poolOptions.concurrency);
    }

    this.httpAgent = new http.Agent({
      keepAlive,
      maxSockets,
      maxFreeSockets,
      timeout,
    });

    this.httpsAgent = new https.Agent({
      keepAlive,
      maxSockets,
      maxFreeSockets,
      timeout,
      ca: tlsOptions?.ca,
      cert: tlsOptions?.cert,
      key: tlsOptions?.key,
      rejectUnauthorized: tlsOptions?.rejectUnauthorized ?? true,
      servername: tlsOptions?.servername,
    });
  }

  getAgent(protocol: string): http.Agent | https.Agent {
    if (this.isDestroyed) {
      throw new Error("ConnectionPool has been destroyed");
    }
    return protocol === "https:" ? this.httpsAgent : this.httpAgent;
  }

  registerCustomAgent(agent: http.Agent | https.Agent): void {
    this.customAgents.add(agent);
  }

  close(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    for (const agent of this.customAgents) {
      agent.destroy();
    }
    this.customAgents.clear();
  }
}
