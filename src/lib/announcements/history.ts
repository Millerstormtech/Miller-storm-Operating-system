// Past announcements: one entry per announcement ever sent, rebuilt from the
// per-recipient Notification rows (there is no Announcements collection; see
// pages/api/announcements.ts). PURE: the API runs the aggregation, this decides
// what each entry looks like and which ones a viewer's bell lists.

/** One announcement as the aggregation groups it (all recipients' rows collapsed). */
export interface AnnouncementGroup {
  title?: string;
  message?: string;
  link?: string | null;
  postedByName?: string | null;
  audienceLabel?: string | null;
  createdAt: Date | string;
  /** 1 when the viewer was one of the recipients (their row may since be read or deleted). */
  received?: number | boolean | null;
}

export interface PastAnnouncement {
  title: string;
  message: string;
  link: string;
  postedByName: string;
  audienceLabel: string;
  createdAt: Date | string;
}

/** Announcements from before audiences existed carry no label: they went to everyone. */
export function audienceOf(g: Pick<AnnouncementGroup, "audienceLabel">): string {
  return g.audienceLabel || "Everyone";
}

export function toPastAnnouncement(g: AnnouncementGroup): PastAnnouncement {
  return {
    title: g.title || "",
    message: g.message || "",
    link: g.link || "",
    postedByName: g.postedByName || "",
    audienceLabel: audienceOf(g),
    createdAt: g.createdAt,
  };
}

/**
 * The bell's Past Announcements: every company-wide announcement, plus any
 * team or branch announcement the viewer was sent. Another team's or branch's
 * announcements stay out. Company-wide ones show even when the viewer's own
 * copy was deleted (the phone deletes a notification when it is tapped) or
 * they joined after it went out. Input is newest first; so is the output.
 */
export function pastAnnouncementsFor(groups: AnnouncementGroup[], limit = 100): PastAnnouncement[] {
  return groups
    .filter((g) => audienceOf(g) === "Everyone" || !!g.received)
    .slice(0, limit)
    .map(toPastAnnouncement);
}
