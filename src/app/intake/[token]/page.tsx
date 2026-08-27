import type { Metadata } from "next";
import { PublicIntake } from "@/components/process-intelligence/PublicIntake";
export const metadata:Metadata={title:"Describe your work | Pegasus",robots:{index:false,follow:false}};
export default async function IntakePage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicIntake token={token}/>}
