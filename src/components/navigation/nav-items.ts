import {
  Building2,
  ClipboardList,
  DoorOpen,
  FileText,
  FolderGit2,
  Handshake,
  HeartHandshake,
  Landmark,
  LayoutGrid,
  Library,
  Plug,
  PoundSterling,
  Radar,
  Settings,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "operate" | "organisation";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Command Centre", href: "/dashboard", icon: LayoutGrid, group: "operate" },
  { label: "Intelligence", href: "/intelligence", icon: Radar, group: "operate" },
  { label: "Relationships", href: "/relationships", icon: Handshake, group: "operate" },
  { label: "Supporters", href: "/supporters", icon: HeartHandshake, group: "operate" },
  { label: "Funding", href: "/funding", icon: Target, group: "operate" },
  { label: "Applications", href: "/applications", icon: FileText, group: "operate" },
  { label: "Grants", href: "/grants", icon: Landmark, group: "operate" },
  { label: "Finance", href: "/finance", icon: PoundSterling, group: "operate" },
  { label: "Programmes", href: "/programmes", icon: FolderGit2, group: "operate" },
  { label: "Impact", href: "/impact", icon: TrendingUp, group: "operate" },
  { label: "Evidence", href: "/evidence", icon: Library, group: "operate" },
  { label: "Forms", href: "/forms", icon: ClipboardList, group: "operate" },
  { label: "Automations", href: "/automations", icon: Workflow, group: "organisation" },
  { label: "Portals", href: "/portals", icon: DoorOpen, group: "organisation" },
  { label: "Integrations", href: "/integrations", icon: Plug, group: "organisation" },
  { label: "Organisation", href: "/organisation", icon: Building2, group: "organisation" },
  { label: "Team", href: "/team", icon: Users, group: "organisation" },
  { label: "Settings", href: "/settings", icon: Settings, group: "organisation" },
];
