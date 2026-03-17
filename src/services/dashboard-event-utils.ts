import type { TimelineEvent } from "@/types";

export const getTimelineEventSignature = (event: TimelineEvent): string =>
  `${event.id}:${event.timesort}`;

export const dedupeTimelineEvents = (
  events: TimelineEvent[],
): TimelineEvent[] => {
  const seenSignatures = new Set<string>();

  return events.filter((event) => {
    const signature = getTimelineEventSignature(event);
    if (seenSignatures.has(signature)) {
      return false;
    }

    seenSignatures.add(signature);
    return true;
  });
};
