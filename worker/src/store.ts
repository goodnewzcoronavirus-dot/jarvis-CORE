import { DurableObject } from 'cloudflare:workers';
import { applyChanges, EMPTY, migrate, type ChangeSet, type PlanData } from '../../src/lib/core.ts';

export interface Snapshot {
  version: number;
  plan: PlanData;
}

// The single source of truth. Durable Objects run one request at a time,
// so read-modify-write here can't interleave.
export class PlanStore extends DurableObject {
  private async load(): Promise<Snapshot> {
    const [plan, version] = await Promise.all([this.ctx.storage.get<PlanData>('plan'), this.ctx.storage.get<number>('version')]);
    return { version: version ?? 0, plan: plan ? migrate(plan) : { ...EMPTY } };
  }

  private async save(plan: PlanData, version: number): Promise<Snapshot> {
    await this.ctx.storage.put({ plan, version });
    return { version, plan };
  }

  async read(): Promise<Snapshot> {
    return this.load();
  }

  async version(): Promise<number> {
    return (await this.ctx.storage.get<number>('version')) ?? 0;
  }

  async apply(changes: ChangeSet): Promise<Snapshot> {
    const cur = await this.load();
    return this.save(applyChanges(cur.plan, changes), cur.version + 1);
  }

  async replace(plan: PlanData): Promise<Snapshot> {
    const cur = await this.load();
    return this.save(migrate(plan), cur.version + 1);
  }
}
