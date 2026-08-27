import type { ProcessRecord } from "./types";

const rows: Array<[string,string,string,number,number,string[],number,string]> = [
 ["Monthly donor report","Fundraising","monthly",240,2,["Salesforce","Excel"],88,"Export, clean and reconcile donor activity before drafting the monthly report."],
 ["Process supplier invoice","Finance","weekly",35,2,["Gmail","Accounting software"],76,"Receive, code, approve and enter supplier invoices."],
 ["Volunteer onboarding","People","weekly",90,3,["Gmail","Google Drive"],62,"Collect details, checks and induction materials for a new volunteer."],
 ["Funding enquiry response","Fundraising","daily",25,1,["Gmail","Salesforce"],71,"Read incoming requests, find context and prepare an appropriate response."],
 ["Programme attendance return","Programmes","weekly",75,2,["Google Sheets","Internal system"],83,"Re-enter attendance data and reconcile missing records."],
 ["Safeguarding referral","Programmes","ad_hoc",120,3,["Internal system","Teams"],18,"Assess and escalate a safeguarding concern under policy."],
 ["Social media planning","Communications","weekly",150,2,["Canva","Google Sheets"],65,"Plan, draft and approve the next week of social content."],
 ["Board finance pack","Finance","monthly",360,3,["Excel","Accounting software"],81,"Build and check the monthly management accounts pack."],
 ["New starter setup","People","monthly",180,4,["Gmail","Slack","Internal system"],72,"Coordinate accounts, equipment and induction for a new colleague."],
 ["Website story publishing","Communications","weekly",70,2,["Google Drive","Internal system"],68,"Edit, approve and publish a beneficiary story."],
 ["Venue booking","Operations","monthly",60,2,["Outlook","Excel"],59,"Find a suitable venue, confirm requirements and record the booking."],
 ["Impact case review","Programmes","quarterly",240,4,["Google Drive","Teams"],27,"Review qualitative evidence and agree what can responsibly be claimed."],
];

export const demoProcesses: ProcessRecord[] = rows.map(([name,department,frequency,duration,people,systems,score,narrative], index) => ({
  id: `demo-process-${index + 1}`, organisationId: "demo-mission-org", name, department,
  frequency: frequency as ProcessRecord["frequency"], durationMinutes: duration, peopleCount: people,
  annualHours: Math.round((({monthly:12,weekly:52,daily:260,quarterly:4,ad_hoc:3}[frequency] ?? 1) * duration * people) / 60),
  systems, score, reviewState: index % 4 === 0 ? "APPROVE" : "AWAITING_REVIEW", risk: score < 30 ? "high" : score < 65 ? "medium" : "low", narrative,
  painPoints: [index % 2 ? "Waiting for approval" : "Copying and reconciling data", index % 3 ? "Repeated manual checks" : "Inconsistent source information"],
  steps: [
    {title:"Receive trigger",actor:"Coordinator",system:systems[0],classification:"AUTOMATE"},
    {title:"Prepare and check information",actor:"Team member",system:systems[1],classification: score < 35 ? "HUMAN" : "AI_ASSIST"},
    {title:"Approve outcome",actor:"Manager",classification:"HUMAN"},
    {title:"Record and share",actor:"Coordinator",system:systems[0],classification:"AUTOMATE"},
  ],
}));
