/**
 * Seeded demonstration workspace: Northstar Community Foundation.
 *
 * Fictional but realistic UK charity data. All funders and opportunities are
 * clearly marked as demonstration data (`isDemo: true`). No real beneficiary
 * records or special category data are included; programme and impact data are
 * aggregate.
 */

import type {
  ActivityEvent,
  Application,
  ApplicationAnswer,
  AuditEvent,
  EvidenceItem,
  EvidenceLink,
  Funder,
  FundingOpportunity,
  Grant,
  GrantDeliverable,
  GrantPayment,
  GrantReport,
  ImpactReport,
  Indicator,
  Notification,
  OpportunityQuestion,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  Outcome,
  Programme,
  ProgrammeGrantLink,
  Task,
  User,
} from "@/types/domain";

const ORG_ID = "org-northstar";
const stamp = (createdAt: string, updatedAt?: string) => ({
  createdAt,
  updatedAt: updatedAt ?? createdAt,
  createdBy: "user-amara",
  archivedAt: null,
});

// --- Users and membership ----------------------------------------------

export const users: User[] = [
  {
    id: "user-amara",
    name: "Amara Okafor",
    email: "amara@northstarcf.org.uk",
    jobTitle: "Chief Executive",
    avatarInitials: "AO",
  },
  {
    id: "user-james",
    name: "James Fielding",
    email: "james@northstarcf.org.uk",
    jobTitle: "Head of Funding",
    avatarInitials: "JF",
  },
  {
    id: "user-priya",
    name: "Priya Sharma",
    email: "priya@northstarcf.org.uk",
    jobTitle: "Programmes Manager",
    avatarInitials: "PS",
  },
  {
    id: "user-tom",
    name: "Tom Whitfield",
    email: "tom@northstarcf.org.uk",
    jobTitle: "Finance Officer",
    avatarInitials: "TW",
  },
  {
    id: "user-grace",
    name: "Grace Bello",
    email: "grace@northstarcf.org.uk",
    jobTitle: "Trustee",
    avatarInitials: "GB",
  },
];

export const members: OrganisationMember[] = [
  {
    id: "mem-1",
    organisationId: ORG_ID,
    userId: "user-amara",
    role: "owner",
    status: "active",
    joinedAt: "2019-04-01",
  },
  {
    id: "mem-2",
    organisationId: ORG_ID,
    userId: "user-james",
    role: "funding_lead",
    status: "active",
    joinedAt: "2020-09-14",
  },
  {
    id: "mem-3",
    organisationId: ORG_ID,
    userId: "user-priya",
    role: "programme_lead",
    status: "active",
    joinedAt: "2021-01-11",
  },
  {
    id: "mem-4",
    organisationId: ORG_ID,
    userId: "user-tom",
    role: "finance_contributor",
    status: "active",
    joinedAt: "2022-06-06",
  },
  {
    id: "mem-5",
    organisationId: ORG_ID,
    userId: "user-grace",
    role: "trustee_reviewer",
    status: "active",
    joinedAt: "2019-05-20",
  },
];

// --- Organisation and profile ------------------------------------------

export const organisation: Organisation = {
  id: ORG_ID,
  name: "Northstar Community Foundation",
  legalName: "Northstar Community Foundation",
  type: "charity",
  charityNumber: "1184023",
  yearFounded: 2011,
  website: "https://www.northstarcf.org.uk",
  registeredAddress: "Unit 4, Prospect Works, Leeds LS11 5AB",
  operatingRegions: ["West Yorkshire", "Leeds", "Bradford"],
  organisationSize: "24 staff, 60 volunteers",
  annualIncomeBand: "£1m to £5m",
  isDemo: true,
  aiEnabled: true,
  audit: stamp("2019-04-01", "2026-07-14"),
};

const v = <T>(value: T, verification: OrganisationProfile["missionStatement"]["verification"], source?: string) => ({
  value,
  verification,
  source,
  lastVerifiedAt: "2026-06-30",
});

export const profile: OrganisationProfile = {
  organisationId: ORG_ID,
  missionStatement: v(
    "We help young people aged 14 to 25 in West Yorkshire build the confidence, skills and support they need to thrive in work and in life.",
    "verified",
    "Trustee-approved strategy 2025 to 2028",
  ),
  vision: v(
    "A region where every young person, whatever their start in life, has a fair route into good work and good wellbeing.",
    "verified",
  ),
  summary: v(
    "Northstar Community Foundation delivers employment readiness, digital skills, mentoring and mental wellbeing support to young people across Leeds and Bradford. We work through schools, colleges and community partners, with a focus on young people facing disadvantage.",
    "provided",
  ),
  coreActivities: v(
    ["Employment readiness", "Digital skills", "Mentoring", "Mental wellbeing support"],
    "verified",
  ),
  strategicPriorities: v(
    [
      "Youth employment and employability",
      "Digital inclusion",
      "Mental health and wellbeing",
      "Reaching young people facing disadvantage",
    ],
    "verified",
  ),
  communitiesServed: v(
    ["Young people aged 14 to 25", "Care-experienced young people", "Young people not in education, employment or training"],
    "provided",
  ),
  geographicReach: v("West Yorkshire, with concentration in Leeds and Bradford", "verified"),
  trustees: v(
    ["Grace Bello (Chair)", "David Nuttall", "Fatima Rahman", "Michael Osei", "Helen Carr"],
    "verified",
    "Charity Commission record",
  ),
  keyPolicies: v(
    ["Safeguarding policy", "Data protection policy", "Equality and diversity policy", "Whistleblowing policy"],
    "provided",
  ),
  safeguardingStatus: v("Up to date. Reviewed February 2026. DBS checks current.", "verified"),
  dataProtectionStatus: v("ICO registered (ZA period). Data protection policy in place.", "verified"),
  insuranceStatus: v("Public liability and employer's liability current to March 2027.", "provided"),
  financialYearEnd: v("31 March", "verified"),
  auditors: v("Marsden Rowe LLP (independent examiner)", "provided"),
  typicalFundingRequirement: v("£25,000 to £150,000 per programme", "provided"),
  preferredFundingTypes: v(["Project", "Core", "Unrestricted"], "provided"),
  restrictedNeeds: v("Programme delivery costs for Youth Futures and Digital Bridge.", "provided"),
  unrestrictedNeeds: v("Core operating costs, including staffing and premises.", "needs_review"),
  pastFunders: v(
    ["The Henderson Trust", "West Yorkshire Combined Authority", "National Lottery Community Fund", "Garfield Weston Foundation"],
    "provided",
  ),
  matchFundingAvailable: v("Up to £20,000 available from unrestricted reserves for match funding.", "needs_review"),
};

// --- Funders and opportunities -----------------------------------------

export const funders: Funder[] = [
  { id: "fnd-horizon", organisationId: ORG_ID, name: "Horizon Fund for Youth", type: "Grant-making foundation", isDemo: true, contactName: "Rebecca Aldous", contactEmail: "grants@horizonfund.example" },
  { id: "fnd-wyca", organisationId: ORG_ID, name: "West Yorkshire Combined Authority", type: "Public body", isDemo: true },
  { id: "fnd-lottery", organisationId: ORG_ID, name: "National Lottery Community Fund", type: "Lottery distributor", isDemo: true },
  { id: "fnd-weston", organisationId: ORG_ID, name: "Garfield Weston Foundation", type: "Grant-making foundation", isDemo: true },
  { id: "fnd-tech", organisationId: ORG_ID, name: "TechForward Foundation", type: "Corporate foundation", isDemo: true },
  { id: "fnd-henderson", organisationId: ORG_ID, name: "The Henderson Trust", type: "Family foundation", isDemo: true },
];

export const opportunities: FundingOpportunity[] = [
  {
    id: "opp-horizon",
    organisationId: ORG_ID,
    funderId: "fnd-horizon",
    programmeName: "Youth Opportunity Grant 2026",
    description:
      "Multi-year funding for organisations helping disadvantaged young people into employment, education or training. Priority for programmes combining skills and wellbeing support.",
    minAward: 40000,
    maxAward: 120000,
    currency: "GBP",
    deadline: "2026-08-14",
    fundingDurationMonths: 24,
    fundingType: "project",
    eligibleOrgTypes: ["charity", "cic", "social_enterprise"],
    eligibleLocations: ["England", "West Yorkshire"],
    priorityThemes: ["Youth employment", "Mental health and wellbeing", "Disadvantage"],
    requiredDocuments: ["Latest accounts", "Safeguarding policy", "Project budget", "Trustee list", "Monitoring plan"],
    reportingRequirements: ["Six-monthly progress reports", "Annual outcomes report", "Final evaluation"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-07-10",
    ownerId: "user-james",
    stage: "applying",
    probability: 55,
    nextAction: "Complete the organisational capacity answer",
    saved: true,
    isDemo: true,
    notes: "Strong fit. Priya to provide outcome data for section 4.",
    audit: stamp("2026-06-02", "2026-07-15"),
  },
  {
    id: "opp-digital",
    organisationId: ORG_ID,
    funderId: "fnd-tech",
    programmeName: "Digital Inclusion Programme",
    description:
      "Grants for projects closing the digital skills gap for young people and adults facing disadvantage. Supports devices, connectivity and training.",
    minAward: 15000,
    maxAward: 50000,
    currency: "GBP",
    deadline: "2026-07-31",
    fundingDurationMonths: 12,
    fundingType: "restricted",
    eligibleOrgTypes: ["charity", "cic", "community_group"],
    eligibleLocations: ["UK"],
    priorityThemes: ["Digital inclusion", "Digital skills", "Disadvantage"],
    requiredDocuments: ["Project plan", "Budget", "Safeguarding policy"],
    reportingRequirements: ["Quarterly reports", "Final report with case studies"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-07-05",
    ownerId: "user-james",
    stage: "internal_review",
    probability: 65,
    nextAction: "Trustee review of draft answers",
    saved: true,
    isDemo: true,
    audit: stamp("2026-05-20", "2026-07-16"),
  },
  {
    id: "opp-wellbeing",
    organisationId: ORG_ID,
    funderId: "fnd-lottery",
    programmeName: "Community Wellbeing Fund",
    description:
      "Flexible funding for community-led wellbeing and mental health projects. Encourages young people's voice and co-design.",
    minAward: 10000,
    maxAward: 100000,
    currency: "GBP",
    deadline: "2026-09-30",
    fundingDurationMonths: 36,
    fundingType: "project",
    eligibleOrgTypes: ["charity", "cic", "social_enterprise", "community_group"],
    eligibleLocations: ["UK"],
    priorityThemes: ["Mental health and wellbeing", "Young people's voice", "Community"],
    requiredDocuments: ["Accounts", "Safeguarding policy", "Project outline"],
    reportingRequirements: ["Annual monitoring", "End of grant report"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-07-01",
    ownerId: "user-priya",
    stage: "qualified",
    probability: 40,
    nextAction: "Run a fit assessment and decide whether to apply",
    saved: true,
    isDemo: true,
    audit: stamp("2026-06-25", "2026-07-12"),
  },
  {
    id: "opp-core",
    organisationId: ORG_ID,
    funderId: "fnd-weston",
    programmeName: "Core Support Grant",
    description:
      "Unrestricted core funding for established charities with a strong track record. Values organisational resilience.",
    minAward: 20000,
    maxAward: 60000,
    currency: "GBP",
    deadline: "2026-10-20",
    fundingDurationMonths: 12,
    fundingType: "unrestricted",
    eligibleOrgTypes: ["charity"],
    eligibleLocations: ["UK"],
    priorityThemes: ["Organisational resilience", "Core costs"],
    requiredDocuments: ["Accounts", "Annual report"],
    reportingRequirements: ["Brief annual update"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-06-28",
    ownerId: "user-james",
    stage: "reviewing",
    probability: 30,
    nextAction: "Confirm eligibility and income band",
    saved: false,
    isDemo: true,
    audit: stamp("2026-07-08"),
  },
  {
    id: "opp-skills",
    organisationId: ORG_ID,
    funderId: "fnd-wyca",
    programmeName: "Regional Skills Accelerator",
    description:
      "Regional funding to help young people gain employability and technical skills aligned to local labour market needs.",
    minAward: 30000,
    maxAward: 90000,
    currency: "GBP",
    deadline: "2026-08-29",
    fundingDurationMonths: 18,
    fundingType: "project",
    eligibleOrgTypes: ["charity", "cic", "social_enterprise"],
    eligibleLocations: ["West Yorkshire"],
    priorityThemes: ["Youth employment", "Skills", "Local labour market"],
    requiredDocuments: ["Delivery plan", "Budget", "Partnership letters", "Monitoring framework"],
    reportingRequirements: ["Quarterly delivery reports", "Outcomes reporting against regional framework"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-07-09",
    ownerId: "user-james",
    stage: "discovered",
    probability: 25,
    nextAction: "Review eligibility and priority themes",
    saved: true,
    isDemo: true,
    audit: stamp("2026-07-11"),
  },
  {
    id: "opp-mentor",
    organisationId: ORG_ID,
    funderId: "fnd-henderson",
    programmeName: "Mentoring Matters Grant",
    description:
      "Funding for structured mentoring programmes that improve outcomes for young people leaving care or at risk of exclusion.",
    minAward: 25000,
    maxAward: 75000,
    currency: "GBP",
    deadline: "2026-11-15",
    fundingDurationMonths: 24,
    fundingType: "project",
    eligibleOrgTypes: ["charity", "cic"],
    eligibleLocations: ["UK"],
    priorityThemes: ["Mentoring", "Care-experienced young people", "Disadvantage"],
    requiredDocuments: ["Accounts", "Safeguarding policy", "Mentoring model description"],
    reportingRequirements: ["Six-monthly reports", "Final report"],
    sourceReference: "Demonstration opportunity",
    lastVerifiedAt: "2026-07-02",
    ownerId: "user-priya",
    stage: "discovered",
    probability: 35,
    nextAction: "Assess fit against mentoring programme",
    saved: false,
    isDemo: true,
    audit: stamp("2026-07-13"),
  },
];

export const opportunityQuestions: OpportunityQuestion[] = [
  { id: "oq-h1", opportunityId: "opp-horizon", organisationId: ORG_ID, order: 1, text: "Describe the young people your project will support and the need you are addressing.", guidance: "Focus on evidence of need in your area.", wordLimit: 300 },
  { id: "oq-h2", opportunityId: "opp-horizon", organisationId: ORG_ID, order: 2, text: "What will your project do, and what outcomes do you expect to achieve?", guidance: "Be specific about activities and measurable outcomes.", wordLimit: 400 },
  { id: "oq-h3", opportunityId: "opp-horizon", organisationId: ORG_ID, order: 3, text: "Describe your organisation's capacity and track record to deliver this work.", guidance: "Include governance, staffing and relevant experience.", wordLimit: 350 },
  { id: "oq-h4", opportunityId: "opp-horizon", organisationId: ORG_ID, order: 4, text: "How will you monitor, evaluate and evidence your outcomes?", guidance: "Describe your indicators and data sources.", wordLimit: 300 },
];

// --- Applications and answers ------------------------------------------

export const applications: Application[] = [
  {
    id: "app-horizon",
    organisationId: ORG_ID,
    opportunityId: "opp-horizon",
    title: "Horizon Youth Opportunity Grant 2026",
    status: "in_progress",
    ownerId: "user-james",
    contributorIds: ["user-priya", "user-amara"],
    reviewerIds: ["user-grace"],
    deadline: "2026-08-14",
    requiredDocuments: [
      { name: "Latest accounts", provided: true },
      { name: "Safeguarding policy", provided: true },
      { name: "Project budget", provided: false },
      { name: "Trustee list", provided: true },
      { name: "Monitoring plan", provided: false },
    ],
    submissionChecklist: [
      { label: "All answers approved", done: false },
      { label: "Required documents attached", done: false },
      { label: "Budget signed off by finance", done: false },
      { label: "Trustee sign-off", done: false },
    ],
    notes: "Priority application. Deadline is firm.",
    audit: stamp("2026-06-10", "2026-07-16"),
  },
  {
    id: "app-digital",
    organisationId: ORG_ID,
    opportunityId: "opp-digital",
    title: "Digital Bridge: Digital Inclusion Programme",
    status: "internal_review",
    ownerId: "user-james",
    contributorIds: ["user-priya"],
    reviewerIds: ["user-grace", "user-amara"],
    deadline: "2026-07-31",
    requiredDocuments: [
      { name: "Project plan", provided: true },
      { name: "Budget", provided: true },
      { name: "Safeguarding policy", provided: true },
    ],
    submissionChecklist: [
      { label: "All answers approved", done: false },
      { label: "Required documents attached", done: true },
      { label: "Trustee sign-off", done: false },
    ],
    audit: stamp("2026-05-28", "2026-07-17"),
  },
  {
    id: "app-wellbeing",
    organisationId: ORG_ID,
    opportunityId: "opp-wellbeing",
    title: "Community Wellbeing Fund application",
    status: "not_started",
    ownerId: "user-priya",
    contributorIds: [],
    reviewerIds: ["user-grace"],
    deadline: "2026-09-30",
    requiredDocuments: [
      { name: "Accounts", provided: true },
      { name: "Safeguarding policy", provided: true },
      { name: "Project outline", provided: false },
    ],
    submissionChecklist: [{ label: "All answers approved", done: false }],
    audit: stamp("2026-07-01"),
  },
];

export const applicationAnswers: ApplicationAnswer[] = [
  {
    id: "ans-h1",
    applicationId: "app-horizon",
    organisationId: ORG_ID,
    order: 1,
    questionText: "Describe the young people your project will support and the need you are addressing.",
    guidance: "Focus on evidence of need in your area.",
    wordLimit: 300,
    draft:
      "Northstar works with young people aged 14 to 25 across Leeds and Bradford, with a focus on those facing disadvantage, including care-experienced young people and those not in education, employment or training. In our operating area, youth unemployment remains above the regional average and access to digital skills support is uneven. Our project responds to this by combining employability support with mentoring and wellbeing provision, recognising that young people rarely face a single barrier in isolation.",
    status: "approved",
    assignedTo: "user-priya",
    evidenceIds: ["ev-stat-neet", "ev-eval-2025"],
    audit: stamp("2026-06-12", "2026-07-14"),
  },
  {
    id: "ans-h2",
    applicationId: "app-horizon",
    organisationId: ORG_ID,
    order: 2,
    questionText: "What will your project do, and what outcomes do you expect to achieve?",
    guidance: "Be specific about activities and measurable outcomes.",
    wordLimit: 400,
    draft:
      "The project will deliver a structured 24-month programme of employability workshops, one-to-one mentoring and wellbeing sessions for 240 young people. We expect at least 70 per cent of participants to progress into education, employment or training within six months of completing the programme, and to report improved confidence and wellbeing.",
    status: "ready_for_review",
    assignedTo: "user-priya",
    evidenceIds: ["ev-eval-2025", "ev-stat-progression"],
    audit: stamp("2026-06-14", "2026-07-15"),
  },
  {
    id: "ans-h3",
    applicationId: "app-horizon",
    organisationId: ORG_ID,
    order: 3,
    questionText: "Describe your organisation's capacity and track record to deliver this work.",
    guidance: "Include governance, staffing and relevant experience.",
    wordLimit: 350,
    draft: "",
    status: "not_started",
    assignedTo: "user-james",
    evidenceIds: [],
    audit: stamp("2026-06-10"),
  },
  {
    id: "ans-h4",
    applicationId: "app-horizon",
    organisationId: ORG_ID,
    order: 4,
    questionText: "How will you monitor, evaluate and evidence your outcomes?",
    guidance: "Describe your indicators and data sources.",
    wordLimit: 300,
    draft:
      "We track a defined set of indicators for each programme, including progression into education, employment or training, and validated wellbeing measures. Data is collected at intake, mid-point and follow-up.",
    status: "needs_evidence",
    assignedTo: "user-priya",
    evidenceIds: [],
    audit: stamp("2026-06-16", "2026-07-10"),
  },
  {
    id: "ans-d1",
    applicationId: "app-digital",
    organisationId: ORG_ID,
    order: 1,
    questionText: "How will your project improve digital inclusion for young people?",
    guidance: "Describe your approach to devices, connectivity and skills.",
    wordLimit: 300,
    draft:
      "Digital Bridge provides refurbished laptops, data connectivity and a structured digital skills curriculum to young people who lack reliable access at home. Participants complete a recognised digital skills award and receive ongoing support from trained volunteers.",
    status: "approved",
    assignedTo: "user-priya",
    evidenceIds: ["ev-case-digital"],
    audit: stamp("2026-06-01", "2026-07-16"),
  },
  {
    id: "ans-d2",
    applicationId: "app-digital",
    organisationId: ORG_ID,
    order: 2,
    questionText: "What outcomes will you measure and how?",
    guidance: "Be specific and realistic.",
    wordLimit: 250,
    draft:
      "We will measure the number of young people gaining a digital skills qualification, improvements in self-reported digital confidence, and progression into further learning or work.",
    status: "changes_requested",
    assignedTo: "user-priya",
    evidenceIds: [],
    audit: stamp("2026-06-05", "2026-07-17"),
  },
];

// --- Grants -------------------------------------------------------------

export const grants: Grant[] = [
  {
    id: "grant-henderson",
    organisationId: ORG_ID,
    applicationId: undefined,
    funderId: "fnd-henderson",
    title: "Youth Futures programme grant",
    awardValue: 95000,
    currency: "GBP",
    restricted: true,
    startDate: "2025-04-01",
    endDate: "2027-03-31",
    grantManagerId: "user-priya",
    funderContact: "The Henderson Trust, grants team",
    spentToDate: 41000,
    conditions: [
      "Funding restricted to Youth Futures delivery costs",
      "Six-monthly progress reports required",
      "Acknowledge funder in public materials",
    ],
    status: "active",
    audit: stamp("2025-03-15", "2026-07-10"),
  },
  {
    id: "grant-wyca",
    organisationId: ORG_ID,
    applicationId: undefined,
    funderId: "fnd-wyca",
    title: "Digital Bridge delivery grant",
    awardValue: 48000,
    currency: "GBP",
    restricted: true,
    startDate: "2025-09-01",
    endDate: "2026-08-31",
    grantManagerId: "user-james",
    funderContact: "WYCA skills team",
    spentToDate: 39000,
    conditions: [
      "Funding restricted to Digital Bridge delivery",
      "Quarterly reporting against regional framework",
    ],
    status: "active",
    audit: stamp("2025-08-20", "2026-07-12"),
  },
];

export const grantPayments: GrantPayment[] = [
  { id: "pay-1", grantId: "grant-henderson", organisationId: ORG_ID, label: "Year 1 instalment", amount: 47500, dueDate: "2025-04-15", received: true },
  { id: "pay-2", grantId: "grant-henderson", organisationId: ORG_ID, label: "Year 2 instalment", amount: 47500, dueDate: "2026-04-15", received: true },
  { id: "pay-3", grantId: "grant-wyca", organisationId: ORG_ID, label: "First payment", amount: 24000, dueDate: "2025-09-15", received: true },
  { id: "pay-4", grantId: "grant-wyca", organisationId: ORG_ID, label: "Second payment", amount: 24000, dueDate: "2026-03-15", received: true },
];

export const grantDeliverables: GrantDeliverable[] = [
  { id: "del-1", grantId: "grant-henderson", organisationId: ORG_ID, title: "Recruit programme cohort 3", dueDate: "2026-09-15", status: "in_progress" },
  { id: "del-2", grantId: "grant-henderson", organisationId: ORG_ID, title: "Deliver 40 mentoring matches", dueDate: "2026-06-30", status: "complete" },
  { id: "del-3", grantId: "grant-wyca", organisationId: ORG_ID, title: "Distribute 120 devices", dueDate: "2026-06-30", status: "complete" },
  { id: "del-4", grantId: "grant-wyca", organisationId: ORG_ID, title: "Final delivery report", dueDate: "2026-07-10", status: "overdue" },
];

export const grantReports: GrantReport[] = [
  { id: "rep-1", grantId: "grant-henderson", organisationId: ORG_ID, title: "Six-monthly progress report", dueDate: "2026-08-01", status: "drafting" },
  { id: "rep-2", grantId: "grant-wyca", organisationId: ORG_ID, title: "Final grant report", dueDate: "2026-07-28", status: "not_started" },
];

// --- Programmes, outcomes, indicators ----------------------------------

export const programmes: Programme[] = [
  {
    id: "prog-youth",
    organisationId: ORG_ID,
    name: "Youth Futures",
    summary:
      "An employability and mentoring programme helping young people aged 16 to 25 move into education, employment or training.",
    status: "active",
    ownerId: "user-priya",
    startDate: "2025-04-01",
    endDate: "2027-03-31",
    location: "Leeds and Bradford",
    communitiesServed: ["Young people not in education, employment or training", "Care-experienced young people"],
    budget: 180000,
    activities: ["Employability workshops", "One-to-one mentoring", "Employer taster days"],
    outputs: ["240 young people supported", "60 mentoring matches", "24 employer sessions"],
    deliveryPartners: ["Leeds City College", "Bradford Works"],
    risks: ["Volunteer mentor capacity", "Employer engagement in summer months"],
    audit: stamp("2025-03-20", "2026-07-14"),
  },
  {
    id: "prog-digital",
    organisationId: ORG_ID,
    name: "Digital Bridge",
    summary:
      "A digital inclusion programme providing devices, connectivity and skills training to young people who lack reliable access.",
    status: "active",
    ownerId: "user-james",
    startDate: "2025-09-01",
    endDate: "2026-08-31",
    location: "Leeds",
    communitiesServed: ["Young people facing disadvantage"],
    budget: 60000,
    activities: ["Device refurbishment and distribution", "Digital skills curriculum", "Volunteer digital coaching"],
    outputs: ["150 devices distributed", "120 digital skills awards"],
    deliveryPartners: ["Leeds Libraries"],
    risks: ["Device supply", "Data connectivity costs"],
    audit: stamp("2025-08-25", "2026-07-12"),
  },
  {
    id: "prog-wellbeing",
    organisationId: ORG_ID,
    name: "Steady",
    summary:
      "A mental wellbeing programme offering group and one-to-one support to young people, co-designed with a youth panel.",
    status: "planning",
    ownerId: "user-priya",
    startDate: "2026-10-01",
    endDate: "2029-09-30",
    location: "West Yorkshire",
    communitiesServed: ["Young people aged 14 to 25"],
    budget: 100000,
    activities: ["Wellbeing groups", "One-to-one support", "Youth co-design panel"],
    outputs: ["Planned: 300 young people supported"],
    deliveryPartners: [],
    risks: ["Dependent on Community Wellbeing Fund decision"],
    audit: stamp("2026-07-01"),
  },
];

export const programmeGrantLinks: ProgrammeGrantLink[] = [
  { id: "pgl-1", organisationId: ORG_ID, programmeId: "prog-youth", grantId: "grant-henderson" },
  { id: "pgl-2", organisationId: ORG_ID, programmeId: "prog-digital", grantId: "grant-wyca" },
];

export const outcomes: Outcome[] = [
  { id: "out-youth-eet", organisationId: ORG_ID, programmeId: "prog-youth", title: "Progression into education, employment or training", description: "Young people move into a positive destination within six months.", level: "outcome", audit: stamp("2025-04-05") },
  { id: "out-youth-conf", organisationId: ORG_ID, programmeId: "prog-youth", title: "Improved confidence and wellbeing", description: "Participants report increased confidence and wellbeing.", level: "outcome", audit: stamp("2025-04-05") },
  { id: "out-digital-skill", organisationId: ORG_ID, programmeId: "prog-digital", title: "Improved digital skills", description: "Young people gain a recognised digital skills award.", level: "outcome", audit: stamp("2025-09-05") },
  { id: "out-digital-access", organisationId: ORG_ID, programmeId: "prog-digital", title: "Reliable digital access", description: "Young people have a device and connectivity at home.", level: "output", audit: stamp("2025-09-05") },
];

export const indicators: Indicator[] = [
  {
    id: "ind-eet",
    organisationId: ORG_ID,
    outcomeId: "out-youth-eet",
    name: "Progression rate into EET",
    definition: "Percentage of completers in education, employment or training at six-month follow-up.",
    baseline: 0,
    target: 70,
    currentValue: 58,
    unit: "%",
    measurementFrequency: "Six-monthly",
    evidenceSource: "Follow-up survey",
    dataOwnerId: "user-priya",
    lastUpdated: "2026-06-30",
    confidence: "medium",
    audit: stamp("2025-04-10", "2026-06-30"),
  },
  {
    id: "ind-supported",
    organisationId: ORG_ID,
    outcomeId: "out-youth-eet",
    name: "Young people supported",
    definition: "Number of young people who started the programme.",
    baseline: 0,
    target: 240,
    currentValue: 168,
    unit: "people",
    measurementFrequency: "Monthly",
    evidenceSource: "Attendance records",
    dataOwnerId: "user-priya",
    lastUpdated: "2026-07-05",
    confidence: "high",
    audit: stamp("2025-04-10", "2026-07-05"),
  },
  {
    id: "ind-wellbeing",
    organisationId: ORG_ID,
    outcomeId: "out-youth-conf",
    name: "Wellbeing improvement",
    definition: "Percentage reporting improved wellbeing on a validated scale.",
    baseline: 0,
    target: 65,
    currentValue: 61,
    unit: "%",
    measurementFrequency: "Six-monthly",
    evidenceSource: "Wellbeing survey",
    dataOwnerId: "user-priya",
    lastUpdated: "2026-06-30",
    confidence: "medium",
    audit: stamp("2025-04-10", "2026-06-30"),
  },
  {
    id: "ind-awards",
    organisationId: ORG_ID,
    outcomeId: "out-digital-skill",
    name: "Digital skills awards achieved",
    definition: "Number of young people achieving a recognised digital skills award.",
    baseline: 0,
    target: 120,
    currentValue: 96,
    unit: "awards",
    measurementFrequency: "Quarterly",
    evidenceSource: "Awarding body records",
    dataOwnerId: "user-james",
    lastUpdated: "2026-06-20",
    confidence: "high",
    audit: stamp("2025-09-10", "2026-06-20"),
  },
  {
    id: "ind-devices",
    organisationId: ORG_ID,
    outcomeId: "out-digital-access",
    name: "Devices distributed",
    definition: "Number of refurbished devices given to young people.",
    baseline: 0,
    target: 150,
    currentValue: 132,
    unit: "devices",
    measurementFrequency: "Monthly",
    evidenceSource: "Distribution log",
    dataOwnerId: "user-james",
    lastUpdated: "2026-07-01",
    confidence: "high",
    audit: stamp("2025-09-10", "2026-07-01"),
  },
];

// --- Evidence -----------------------------------------------------------

export const evidenceItems: EvidenceItem[] = [
  { id: "ev-stat-neet", organisationId: ORG_ID, title: "Youth unemployment above regional average", type: "statistic", description: "Local youth unemployment rate compared with the regional average.", verification: "verified", statValue: "14.2%", statLabel: "youth unemployment in operating area", location: "Leeds and Bradford", reportingPeriod: "2025", tags: ["need", "employment"], audit: stamp("2026-02-10") },
  { id: "ev-stat-progression", organisationId: ORG_ID, title: "Progression outcomes 2025", type: "statistic", description: "Share of Youth Futures completers progressing into EET.", verification: "provided", statValue: "58%", statLabel: "progressed into education, employment or training", reportingPeriod: "2025 to 2026", tags: ["outcome", "youth-futures"], audit: stamp("2026-06-30") },
  { id: "ev-eval-2025", organisationId: ORG_ID, title: "Youth Futures independent evaluation 2025", type: "evaluation", description: "Independent evaluation of the Youth Futures programme.", verification: "verified", fileName: "youth-futures-evaluation-2025.pdf", fileSizeKb: 1840, reportingPeriod: "2025", tags: ["evaluation", "youth-futures"], audit: stamp("2026-01-20") },
  { id: "ev-case-digital", organisationId: ORG_ID, title: "Case study: reaching a digital skills award", type: "case_study", description: "Aggregate, anonymised case study of a Digital Bridge participant's journey.", verification: "provided", reportingPeriod: "2026", location: "Leeds", community: "Young people facing disadvantage", tags: ["case-study", "digital-bridge"], audit: stamp("2026-05-15") },
  { id: "ev-testimonial-mentor", organisationId: ORG_ID, title: "Mentoring testimonial", type: "testimonial", description: "Feedback from a programme participant about mentoring.", verification: "provided", quote: "Having a mentor helped me believe I could actually get an apprenticeship.", attribution: "Youth Futures participant, 2026", tags: ["testimonial", "mentoring"], audit: stamp("2026-04-02") },
  { id: "ev-survey-wellbeing", organisationId: ORG_ID, title: "Wellbeing survey summary", type: "survey", description: "Aggregate summary of participant wellbeing survey responses.", verification: "provided", statValue: "61%", statLabel: "reported improved wellbeing", reportingPeriod: "2025 to 2026", tags: ["wellbeing", "survey"], audit: stamp("2026-06-30") },
  { id: "ev-accounts", organisationId: ORG_ID, title: "Annual accounts 2024 to 2025", type: "financial", description: "Independently examined annual accounts.", verification: "verified", fileName: "northstar-accounts-2024-25.pdf", fileSizeKb: 620, reportingPeriod: "2024 to 2025", tags: ["accounts", "governance"], audit: stamp("2025-11-01") },
  { id: "ev-safeguarding", organisationId: ORG_ID, title: "Safeguarding policy", type: "policy", description: "Current safeguarding policy, reviewed February 2026.", verification: "verified", fileName: "safeguarding-policy-2026.pdf", fileSizeKb: 240, tags: ["policy", "safeguarding"], audit: stamp("2026-02-15") },
];

export const evidenceLinks: EvidenceLink[] = [
  { id: "el-1", organisationId: ORG_ID, evidenceId: "ev-eval-2025", targetType: "programme", targetId: "prog-youth" },
  { id: "el-2", organisationId: ORG_ID, evidenceId: "ev-stat-progression", targetType: "outcome", targetId: "out-youth-eet" },
  { id: "el-3", organisationId: ORG_ID, evidenceId: "ev-case-digital", targetType: "programme", targetId: "prog-digital" },
  { id: "el-4", organisationId: ORG_ID, evidenceId: "ev-survey-wellbeing", targetType: "outcome", targetId: "out-youth-conf" },
  { id: "el-5", organisationId: ORG_ID, evidenceId: "ev-eval-2025", targetType: "grant", targetId: "grant-henderson" },
];

// --- Tasks, notifications, activity, report ----------------------------

export const tasks: Task[] = [
  { id: "task-1", organisationId: ORG_ID, title: "Draft organisational capacity answer for Horizon", status: "in_progress", dueDate: "2026-07-24", assigneeId: "user-james", relatedType: "application", relatedId: "app-horizon", audit: stamp("2026-07-14") },
  { id: "task-2", organisationId: ORG_ID, title: "Provide outcome data for Horizon section 4", status: "todo", dueDate: "2026-07-25", assigneeId: "user-priya", relatedType: "application", relatedId: "app-horizon", audit: stamp("2026-07-14") },
  { id: "task-3", organisationId: ORG_ID, title: "Submit WYCA final delivery report", status: "todo", dueDate: "2026-07-28", assigneeId: "user-james", relatedType: "grant", relatedId: "grant-wyca", audit: stamp("2026-07-10") },
  { id: "task-4", organisationId: ORG_ID, title: "Trustee review of Digital Bridge answers", status: "todo", dueDate: "2026-07-23", assigneeId: "user-grace", relatedType: "application", relatedId: "app-digital", audit: stamp("2026-07-16") },
  { id: "task-5", organisationId: ORG_ID, title: "Update wellbeing indicator with Q2 data", status: "done", assigneeId: "user-priya", relatedType: "indicator", relatedId: "ind-wellbeing", audit: stamp("2026-06-30") },
];

export const notifications: Notification[] = [
  { id: "not-1", organisationId: ORG_ID, title: "Deadline approaching", body: "Digital Inclusion Programme closes in 10 days.", kind: "deadline", read: false, createdAt: "2026-07-21T08:10:00Z", href: "/funding/opp-digital" },
  { id: "not-2", organisationId: ORG_ID, title: "Answer ready for review", body: "James marked a Horizon answer ready for review.", kind: "review", read: false, createdAt: "2026-07-20T15:30:00Z", href: "/applications/app-horizon" },
  { id: "not-3", organisationId: ORG_ID, title: "Grant report due", body: "WYCA final grant report is due on 28 July.", kind: "grant", read: false, createdAt: "2026-07-20T09:00:00Z", href: "/grants/grant-wyca" },
  { id: "not-4", organisationId: ORG_ID, title: "Deliverable overdue", body: "Digital Bridge final delivery report is overdue.", kind: "deadline", read: true, createdAt: "2026-07-11T09:00:00Z", href: "/grants/grant-wyca" },
];

export const activity: ActivityEvent[] = [
  { id: "act-1", organisationId: ORG_ID, actorId: "user-james", actorName: "James Fielding", verb: "marked ready for review", target: "Horizon answer: expected outcomes", createdAt: "2026-07-20T15:30:00Z" },
  { id: "act-2", organisationId: ORG_ID, actorId: "user-priya", actorName: "Priya Sharma", verb: "updated indicator", target: "Young people supported (168 of 240)", createdAt: "2026-07-05T11:12:00Z" },
  { id: "act-3", organisationId: ORG_ID, actorId: "user-amara", actorName: "Amara Okafor", verb: "approved answer", target: "Digital Bridge: digital inclusion approach", createdAt: "2026-07-16T14:02:00Z" },
  { id: "act-4", organisationId: ORG_ID, actorId: "user-priya", actorName: "Priya Sharma", verb: "added evidence", target: "Wellbeing survey summary", createdAt: "2026-06-30T16:40:00Z" },
  { id: "act-5", organisationId: ORG_ID, actorId: "user-james", actorName: "James Fielding", verb: "moved opportunity to", target: "Digital Inclusion Programme: internal review", createdAt: "2026-07-16T10:05:00Z" },
];

export const impactReports: ImpactReport[] = [
  {
    id: "report-youth-2026",
    organisationId: ORG_ID,
    title: "Youth Futures interim impact report",
    programmeId: "prog-youth",
    grantId: "grant-henderson",
    reportingPeriod: "April 2025 to June 2026",
    status: "draft",
    includedIndicatorIds: ["ind-eet", "ind-supported", "ind-wellbeing"],
    includedEvidenceIds: ["ev-eval-2025", "ev-stat-progression", "ev-testimonial-mentor", "ev-survey-wellbeing"],
    sections: [
      { key: "executive_summary", title: "Executive summary", content: "" },
      { key: "organisation_overview", title: "Organisation overview", content: "" },
      { key: "programme_summary", title: "Programme summary", content: "" },
      { key: "activities", title: "Activities delivered", content: "" },
      { key: "outputs", title: "Outputs achieved", content: "" },
      { key: "outcomes", title: "Outcomes achieved", content: "" },
      { key: "beneficiary_stories", title: "Beneficiary stories", content: "" },
      { key: "challenges_learning", title: "Challenges and learning", content: "" },
      { key: "future_plans", title: "Future plans", content: "" },
    ],
    audit: stamp("2026-07-08", "2026-07-15"),
  },
];

export const auditEvents: AuditEvent[] = [
  { id: "aud-1", organisationId: ORG_ID, actorId: "user-amara", actorName: "Amara Okafor", action: "application.answer.approved", entityType: "application_answer", entityId: "ans-d1", summary: "Approved Digital Bridge answer 1", createdAt: "2026-07-16T14:02:00Z" },
  { id: "aud-2", organisationId: ORG_ID, actorId: "user-priya", actorName: "Priya Sharma", action: "indicator.updated", entityType: "indicator", entityId: "ind-supported", summary: "Updated 'Young people supported' to 168", createdAt: "2026-07-05T11:12:00Z" },
  { id: "aud-3", organisationId: ORG_ID, actorId: "user-james", actorName: "James Fielding", action: "ai.generation.created", entityType: "application_answer", entityId: "ans-h2", summary: "Generated a first draft for the expected outcomes answer", createdAt: "2026-07-15T09:40:00Z" },
];
