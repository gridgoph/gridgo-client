import { useReorderJob } from "@/store/reorderJob";
import { useSession } from "@/store/session";

/**
 * Who was doing what when a request went out.
 *
 * A slow answer can land after the client has signed out, or started another
 * job, and the screen that asked may be long gone. Whatever it would write or
 * navigate to belongs to the moment on its ticket, so it checks first.
 */
export type JobTicket = { ownerId: string | null; generation: number };

function ownerNow(): string | null {
  return useSession.getState().user?.id ?? null;
}

export function jobTicket(): JobTicket {
  return { ownerId: ownerNow(), generation: useReorderJob.getState().generation };
}

/** A ticket for a new job, which overtakes anything already in the air. */
export function newJobTicket(): JobTicket {
  return { ownerId: ownerNow(), generation: useReorderJob.getState().advance() };
}

export function ticketIsCurrent(ticket: JobTicket): boolean {
  return ticket.ownerId === ownerNow() && ticket.generation === useReorderJob.getState().generation;
}

export function ticketIsThisAccount(ticket: JobTicket): boolean {
  return ticket.ownerId === ownerNow();
}
