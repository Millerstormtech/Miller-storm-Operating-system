import { describe, it, expect } from "vitest";
import { pastAnnouncementsFor, toPastAnnouncement, type AnnouncementGroup } from "./history";

const at = (day: string) => new Date(`${day}T15:00:00.000Z`);

const everyone: AnnouncementGroup = { title: "Holiday hours", message: "Closed Monday.", audienceLabel: "Everyone", createdAt: at("2026-10-12") };
const myTeam: AnnouncementGroup = { title: "Team huddle", message: "8 AM.", audienceLabel: "Team: Luke Huber", createdAt: at("2026-10-11"), received: 1 };
const otherTeam: AnnouncementGroup = { title: "Cooper's huddle", message: "9 AM.", audienceLabel: "Team: Cooper Bledsoe", createdAt: at("2026-10-10"), received: 0 };
const legacy: AnnouncementGroup = { title: "Welcome", message: "Hi all.", createdAt: at("2026-08-01") };

describe("pastAnnouncementsFor (the bell's Past Announcements)", () => {
  it("lists company-wide announcements and the ones the viewer was sent, newest first", () => {
    const list = pastAnnouncementsFor([everyone, myTeam, otherTeam, legacy]);
    expect(list.map((a) => a.title)).toEqual(["Holiday hours", "Team huddle", "Welcome"]);
  });

  it("keeps a company-wide announcement whose own copy is gone (deleted on the phone, or joined later)", () => {
    expect(pastAnnouncementsFor([{ ...everyone, received: 0 }]).map((a) => a.title)).toEqual(["Holiday hours"]);
  });

  it("leaves out another team's or branch's announcement", () => {
    expect(pastAnnouncementsFor([otherTeam, { ...otherTeam, audienceLabel: "Branch: Dallas" }])).toEqual([]);
  });

  it("counts the cap after the viewer's filter, so another team's posts never crowd theirs out", () => {
    const many = Array.from({ length: 5 }, () => otherTeam);
    expect(pastAnnouncementsFor([...many, everyone, myTeam], 2).map((a) => a.title)).toEqual(["Holiday hours", "Team huddle"]);
  });
});

describe("toPastAnnouncement", () => {
  it("reads an announcement from before audiences as Everyone, with blanks for missing fields", () => {
    expect(toPastAnnouncement(legacy)).toEqual({
      title: "Welcome",
      message: "Hi all.",
      link: "",
      postedByName: "",
      audienceLabel: "Everyone",
      createdAt: at("2026-08-01"),
    });
  });
});
