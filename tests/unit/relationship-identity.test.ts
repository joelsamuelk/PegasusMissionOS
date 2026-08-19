import { describe, expect, it } from "vitest";
import type { ExternalOrganisation, Person } from "@/types/domain";
import {
  emailDomain,
  findDuplicateCandidates,
  normaliseEmail,
  normaliseOrganisationName,
  resolvePersonByEmail,
  suggestOrganisationByEmail,
  websiteHost,
} from "@/lib/logic/relationship-identity";

function audit() {
  return { createdAt: "2025-01-01", updatedAt: "2025-01-01", archivedAt: null };
}

function person(id: string, emails: string[], rest: Partial<Person> = {}): Person {
  return {
    id,
    organisationId: "org-1",
    firstName: "Sarah",
    lastName: "Ahmed",
    emails: emails.map((value, i) => ({
      id: `${id}-cp-${i}`,
      kind: "email" as const,
      value,
      isPrimary: i === 0,
      verification: "verified" as const,
    })),
    phones: [],
    tags: [],
    isDemo: true,
    audit: audit(),
    ...rest,
  };
}

function organisation(
  id: string,
  name: string,
  rest: Partial<ExternalOrganisation> = {},
): ExternalOrganisation {
  return {
    id,
    organisationId: "org-1",
    name,
    type: "foundation",
    tags: [],
    isDemo: true,
    audit: audit(),
    ...rest,
  };
}

describe("normalisation", () => {
  it("strips display names and casing from an address", () => {
    expect(normaliseEmail("Sarah Ahmed <Sarah.Ahmed@Example.Org>")).toBe(
      "sarah.ahmed@example.org",
    );
    expect(normaliseEmail("  SARAH@EXAMPLE.ORG ")).toBe("sarah@example.org");
  });

  it("extracts the domain, and refuses a value that is not an address", () => {
    expect(emailDomain("sarah@example.org")).toBe("example.org");
    expect(emailDomain("not-an-address")).toBeNull();
    expect(emailDomain("@example.org")).toBeNull();
  });

  it("reduces a website to its host", () => {
    expect(websiteHost("https://www.example.org/grants/apply")).toBe("example.org");
    expect(websiteHost("http://example.org")).toBe("example.org");
    expect(websiteHost(undefined)).toBeNull();
  });

  it("normalises away legal form and region so they do not read as difference", () => {
    expect(normaliseOrganisationName("Comic Relief")).toBe("comic relief");
    expect(normaliseOrganisationName("Comic Relief UK")).toBe("comic relief");
    expect(normaliseOrganisationName("Comic Relief Ltd")).toBe("comic relief");
    expect(normaliseOrganisationName("The Henderson Trust")).toBe("henderson");
  });
});

describe("resolvePersonByEmail", () => {
  const people = [
    person("per-1", ["sarah.ahmed@example.org", "s.ahmed@example.org"]),
    person("per-2", ["daniel@other.example"], { firstName: "Daniel", lastName: "Osei" }),
  ];

  it("matches any recorded address, not just the primary one", () => {
    expect(resolvePersonByEmail(people, "s.ahmed@example.org")?.record.id).toBe("per-1");
  });

  it("matches regardless of casing or display name wrapping", () => {
    expect(resolvePersonByEmail(people, "Sarah Ahmed <SARAH.AHMED@example.org>")?.record.id).toBe(
      "per-1",
    );
  });

  it("is the only match applied automatically", () => {
    const match = resolvePersonByEmail(people, "sarah.ahmed@example.org");
    expect(match?.confidence).toBe("high");
    expect(match?.autoApply).toBe(true);
    expect(match?.reason).toContain("Exact match");
  });

  it("returns nothing for an unknown address rather than a nearest guess", () => {
    expect(resolvePersonByEmail(people, "sarah.ahmed@different.example")).toBeNull();
    expect(resolvePersonByEmail(people, "sarah")).toBeNull();
  });

  it("never matches on name similarity", () => {
    // "S. Ahmed" at an unrelated address may or may not be the same person.
    // Guessing here would silently merge two people.
    expect(resolvePersonByEmail(people, "s.ahmed@totally-different.example")).toBeNull();
  });
});

describe("suggestOrganisationByEmail", () => {
  const organisations = [
    organisation("xorg-1", "Example Foundation", { website: "https://www.example.org" }),
    organisation("xorg-2", "Other Trust", { website: "https://other.example" }),
  ];

  it("suggests on a domain match, but never applies it automatically", () => {
    const match = suggestOrganisationByEmail(organisations, "sarah@example.org");
    expect(match?.record.id).toBe("xorg-1");
    expect(match?.confidence).toBe("medium");
    expect(match?.autoApply).toBe(false);
  });

  it("matches a subdomain of the organisation's host", () => {
    expect(suggestOrganisationByEmail(organisations, "s@grants.example.org")?.record.id).toBe(
      "xorg-1",
    );
  });

  it("ignores consumer mail hosts, which say nothing about employer", () => {
    const consumer = [organisation("xorg-3", "Gmail Trust", { website: "https://gmail.com" })];
    expect(suggestOrganisationByEmail(consumer, "someone@gmail.com")).toBeNull();
  });

  it("returns nothing when no organisation has a matching website", () => {
    expect(suggestOrganisationByEmail(organisations, "x@nowhere.example")).toBeNull();
  });
});

describe("findDuplicateCandidates", () => {
  it("never permits automatic merging, whatever the confidence", () => {
    const candidates = findDuplicateCandidates([
      organisation("a", "Comic Relief", { charityNumber: "326568" }),
      organisation("b", "Comic Relief Ltd", { charityNumber: "326568" }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("high");
    expect(candidates[0]?.autoMergeAllowed).toBe(false);
  });

  it("ranks an identical charity number above a shared website above a similar name", () => {
    const byNumber = findDuplicateCandidates([
      organisation("a", "Alpha", { charityNumber: "111" }),
      organisation("b", "Beta", { charityNumber: "111" }),
    ]);
    const byWebsite = findDuplicateCandidates([
      organisation("a", "Alpha", { website: "https://shared.example" }),
      organisation("b", "Beta", { website: "https://www.shared.example" }),
    ]);
    const byName = findDuplicateCandidates([
      organisation("a", "Comic Relief"),
      organisation("b", "Comic Relief UK"),
    ]);

    expect(byNumber[0]?.confidence).toBe("high");
    expect(byWebsite[0]?.confidence).toBe("medium");
    expect(byName[0]?.confidence).toBe("low");
  });

  it("explains why each pair was flagged", () => {
    const candidates = findDuplicateCandidates([
      organisation("a", "Comic Relief"),
      organisation("b", "Comic Relief UK"),
    ]);

    expect(candidates[0]?.reason).toContain("Comic Relief");
    expect(candidates[0]?.reason).toContain("legal form or region");
  });

  it("does not pair genuinely different organisations", () => {
    expect(
      findDuplicateCandidates([
        organisation("a", "The Henderson Trust"),
        organisation("b", "Horizon Fund for Youth"),
      ]),
    ).toEqual([]);
  });

  it("does not pair two records whose names reduce to nothing but noise words", () => {
    // "The Trust" and "The Foundation" both normalise to an empty string. A
    // blank match is not a match.
    expect(
      findDuplicateCandidates([
        organisation("a", "The Trust"),
        organisation("b", "The Foundation"),
      ]),
    ).toEqual([]);
  });

  it("reports each pair once, not once per direction", () => {
    const candidates = findDuplicateCandidates([
      organisation("a", "Comic Relief"),
      organisation("b", "Comic Relief UK"),
      organisation("c", "Comic Relief Ltd"),
    ]);

    expect(candidates).toHaveLength(3); // a-b, a-c, b-c
    const pairs = candidates.map((c) => [c.a.id, c.b.id].sort().join("-"));
    expect(new Set(pairs).size).toBe(3);
  });
});
