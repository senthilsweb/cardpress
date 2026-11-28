/** What an open settings page asks for before it is left: a question when something would be lost, or a last save. */
export interface Hold {
  ask?: string;
  flush?: () => Promise<void>;
}

export class Holds {
  private all = new Map<string, Hold>();
  /** The person has just agreed to lose what is unsaved, so nothing asks a second time. */
  agreed = false;
  set(id: string, hold: Hold) { this.all.set(id, hold); this.agreed = false; }
  remove(id: string) { this.all.delete(id); }
  /** The question to put to the person, or undefined when nothing would be lost. */
  question(): string | undefined {
    for (const h of this.all.values()) if (h.ask) return h.ask;
    return undefined;
  }
  /** Save what is waiting to be saved. Rejects when a save fails, and then the page should stay. */
  async flush(): Promise<void> {
    await Promise.all([...this.all.values()].map((h) => h.flush?.()));
  }
}
