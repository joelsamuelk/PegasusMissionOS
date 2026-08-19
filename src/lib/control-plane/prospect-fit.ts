import type { ProspectFact, ProspectOrganisation } from "@/server/control-plane/types";

export type ProspectFitCategory = "strong_fit" | "potential_fit" | "review_required" | "poor_fit";
export type ProspectFitFactorKey = "organisation_type" | "organisation_size" | "funding_complexity" | "grant_dependence" | "programme_complexity" | "reporting_burden" | "evidence_maturity" | "relationship_complexity" | "digital_fragmentation" | "geographic_fit" | "commercial_fit";
export interface ProspectFitFactor { key: ProspectFitFactorKey; label: string; score: number; weight: number; status: "positive" | "mixed" | "negative" | "unknown"; reason: string; evidenceUsed: string[]; assumptions: string[]; missingInformation: string[] }
export interface ProspectFitResult { score: number; category: ProspectFitCategory; factors: ProspectFitFactor[]; missingInformation: string[]; methodologyVersion: "prospect-fit-v1" }

const definitions: { key: ProspectFitFactorKey; label: string; weight: number; terms: string[] }[] = [
  { key:"organisation_type",label:"Organisation type",weight:1.5,terms:["charity","nonprofit","non-profit","ngo","social enterprise","cic"] },
  { key:"organisation_size",label:"Organisation size",weight:1,terms:["staff","employees","income","turnover"] },
  { key:"funding_complexity",label:"Funding complexity",weight:1.5,terms:["multiple funders","restricted funding","funding mix","portfolio"] },
  { key:"grant_dependence",label:"Grant dependence",weight:1.2,terms:["grant","grants","grant funded"] },
  { key:"programme_complexity",label:"Programme complexity",weight:1.4,terms:["programmes","services","projects","locations"] },
  { key:"reporting_burden",label:"Reporting burden",weight:1.4,terms:["reporting","reports","evaluation","outcomes"] },
  { key:"evidence_maturity",label:"Evidence maturity",weight:1.2,terms:["impact report","evaluation","evidence","outcomes"] },
  { key:"relationship_complexity",label:"Relationship complexity",weight:1,terms:["partners","funders","stakeholders","consortium"] },
  { key:"digital_fragmentation",label:"Digital fragmentation",weight:1,terms:["spreadsheet","manual","multiple systems","fragmented"] },
  { key:"geographic_fit",label:"Geographic fit",weight:1,terms:["united kingdom","uk","england","wales","scotland","northern ireland"] },
  { key:"commercial_fit",label:"Commercial fit",weight:1.3,terms:["income","funding","growth","investment"] },
];
function category(score:number, known:number):ProspectFitCategory { if(known<5)return "review_required"; if(score>=75)return "strong_fit"; if(score>=55)return "potential_fit"; if(score>=35)return "review_required"; return "poor_fit"; }
export function assessProspectFit(prospect: ProspectOrganisation, facts: ProspectFact[]): ProspectFitResult {
  const corpus=[prospect.organisationType,prospect.country,...prospect.focusAreas,...prospect.sizeIndicators,...prospect.publicFinancialIndicators,...prospect.publicProgrammeIndicators,...facts.map(f=>f.value)].filter(Boolean).join(" ").toLowerCase();
  const factors=definitions.map((definition):ProspectFitFactor=>{
    const matches=definition.terms.filter(term=>corpus.includes(term));
    const evidence=facts.filter(f=>definition.terms.some(term=>f.value.toLowerCase().includes(term))).map(f=>`${f.field} (${f.sourceUrl})`);
    if(matches.length===0)return { ...definition,score:0,status:"unknown",reason:`No reliable ${definition.label.toLowerCase()} signal is recorded.`,evidenceUsed:[],assumptions:[],missingInformation:[`Confirm ${definition.label.toLowerCase()}.`] };
    const score=Math.min(100,55+matches.length*15);
    return { ...definition,score,status:score>=75?"positive":"mixed",reason:`Observed signals: ${matches.join(", ")}.`,evidenceUsed:evidence,assumptions:evidence.length===0?["Signal comes from manually recorded prospect metadata."]:[],missingInformation:[] };
  });
  const known=factors.filter(f=>f.status!=="unknown"); const weight=known.reduce((s,f)=>s+f.weight,0); const score=weight?Math.round(known.reduce((s,f)=>s+f.score*f.weight,0)/weight):0;
  return { score,category:category(score,known.length),factors,missingInformation:factors.flatMap(f=>f.missingInformation),methodologyVersion:"prospect-fit-v1" };
}
