export class AccountEpoch {
  owner: string | null = null;
  generation = 0;
  accept(owner: string | null, force = false) {
    if (force || owner !== this.owner) { this.owner = owner; this.generation++; }
  }
  capture() { return { owner: this.owner, generation: this.generation }; }
  current(ticket: ReturnType<AccountEpoch['capture']>) {
    return ticket.owner === this.owner && ticket.generation === this.generation;
  }
}

type Outcome = { ok: boolean; code?: string; error?: string };
/** A request belongs to the account that rendered its controls, including its response. */
export async function runOwnedAction<T extends Outcome>(epoch: AccountEpoch, owner: string | null, mounted: () => boolean, action: (owner: string) => Promise<T>, expire: () => void): Promise<T | { ok: false; error: string } | null> {
  const ticket = epoch.capture();
  const current = () => mounted() && ticket.owner === owner && epoch.current(ticket);
  if (!owner || !current()) return null;
  let result: T;
  try { result = await action(owner); }
  catch { return current() ? { ok: false, error: "The request was not completed. Please try again." } : null; }
  if (!current()) return null;
  if (result.code === "AUTH_REQUIRED" || result.code === "SESSION_CHANGED") { expire(); return null; }
  return result;
}

export async function readOwned<T>(epoch: AccountEpoch, owner: string | null, mounted: () => boolean, read: () => Promise<T>): Promise<T | null> {
  const ticket = epoch.capture();
  if (!owner || ticket.owner !== owner || !mounted()) return null;
  const value = await read();
  return mounted() && epoch.current(ticket) ? value : null;
}
