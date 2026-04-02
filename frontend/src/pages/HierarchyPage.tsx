import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, UserCheck, Users, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import api from "../api/client";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
}

interface Supervisor {
  id: string;
  name: string;
  agents: Agent[];
}

interface Site {
  id: string;
  name: string;
  supervisors: Supervisor[];
}

interface Company {
  id: string;
  name: string;
  sites: Site[];
}

type HierarchyTree = Company[];

function countAll(tree: HierarchyTree) {
  let companies = tree.length;
  let sites = 0;
  let supervisors = 0;
  let agents = 0;
  for (const c of tree) {
    sites += c.sites.length;
    for (const s of c.sites) {
      supervisors += s.supervisors.length;
      for (const sup of s.supervisors) {
        agents += sup.agents.length;
      }
    }
  }
  return { companies, sites, supervisors, agents };
}

function TreeNode({
  label,
  icon: Icon,
  iconColor,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  count?: number;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!children;

  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen(!open)}
        className={cn(
          "flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm",
          hasChildren ? "cursor-pointer" : "cursor-default"
        )}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className={`p-1 rounded ${iconColor}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium">{label}</span>
        {count != null && (
          <span className="text-xs text-muted-foreground ml-auto">({count})</span>
        )}
      </button>
      {open && hasChildren && <div className="ml-6 border-l border-border pl-2">{children}</div>}
    </div>
  );
}

export default function HierarchyPage() {
  const { data: tree, isLoading } = useQuery<HierarchyTree>({
    queryKey: ["hierarchy-tree"],
    queryFn: async () => {
      const res = await api.get("/hierarchy/tree");
      return res.data;
    },
  });

  const counts = tree ? countAll(tree) : { companies: 0, sites: 0, supervisors: 0, agents: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your company hierarchy: Company &rarr; Site &rarr; Supervisor &rarr; Agent
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: "Companies", count: counts.companies, color: "text-blue-600 bg-blue-50" },
          { icon: MapPin, label: "Sites", count: counts.sites, color: "text-purple-600 bg-purple-50" },
          { icon: UserCheck, label: "Supervisors", count: counts.supervisors, color: "text-indigo-600 bg-indigo-50" },
          { icon: Users, label: "Agents", count: counts.agents, color: "text-emerald-600 bg-emerald-50" },
        ].map((item) => (
          <div key={item.label} className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.color}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.count}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !tree || tree.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create your first company to get started with the hierarchy. You can also import agents via CSV on the Import Data page.
          </p>
        ) : (
          <div className="space-y-1">
            {tree.map((company) => (
              <TreeNode
                key={company.id}
                label={company.name}
                icon={Building2}
                iconColor="text-blue-600 bg-blue-50"
                count={company.sites.reduce(
                  (a, s) => a + s.supervisors.reduce((b, sup) => b + sup.agents.length, 0),
                  0
                )}
                defaultOpen
              >
                {company.sites.map((site) => (
                  <TreeNode
                    key={site.id}
                    label={site.name}
                    icon={MapPin}
                    iconColor="text-purple-600 bg-purple-50"
                    count={site.supervisors.reduce((a, sup) => a + sup.agents.length, 0)}
                  >
                    {site.supervisors.map((sup) => (
                      <TreeNode
                        key={sup.id}
                        label={sup.name}
                        icon={UserCheck}
                        iconColor="text-indigo-600 bg-indigo-50"
                        count={sup.agents.length}
                      >
                        {sup.agents.map((agent) => (
                          <TreeNode
                            key={agent.id}
                            label={agent.name}
                            icon={Users}
                            iconColor="text-emerald-600 bg-emerald-50"
                          />
                        ))}
                      </TreeNode>
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
