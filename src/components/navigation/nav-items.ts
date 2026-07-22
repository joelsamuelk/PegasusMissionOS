import {
  Building2,
  FileText,
  FolderGit2,
  Landmark,
  LayoutGrid,
  Library,
  Settings,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "operate" | "organisation";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Command Centre", href: "/dashboard", icon: LayoutGrid, group: "operate" },
  { label: "Funding", href: "/funding", icon: Target, group: "operate" },
  { label: "Applications", href: "/applications", icon: FileText, group: "operate" },
  { label: "Grants", href: "/grants", icon: Landmark, group: "operate" },
  { label: "Programmes", href: "/programmes", icon: FolderGit2, group: "operate" },
  { label: "Impact", href: "/impact", icon: TrendingUp, group: "operate" },
  { label: "Evidence", href: "/evidence", icon: Library, group: "operate" },
  { label: "Organisation", href: "/organisation", icon: Building2, group: "organisation" },
  { label: "Team", href: "/team", icon: Users, group: "organisation" },
  { label: "Settings", href: "/settings", icon: Settings, group: "organisation" },
];
