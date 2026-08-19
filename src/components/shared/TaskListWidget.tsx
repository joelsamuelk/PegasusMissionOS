"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { Task, User } from "@/types/domain";
import { toggleTask } from "@/server/actions/mutations";
import { DeadlineIndicator } from "@/components/shared/misc";
import { cn } from "@/lib/utils";

export function TaskListWidget({
  tasks,
  users,
  now,
}: {
  tasks: Task[];
  users: User[];
  now?: Date;
}) {
  const [pending, start] = useTransition();

  function hrefFor(task: Task): string {
    if (task.relatedType === "application") return `/applications/${task.relatedId}`;
    if (task.relatedType === "grant") return `/grants/${task.relatedId}`;
    if (task.relatedType === "indicator") return `/programmes`;
    return "#";
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-subtle">No open tasks. Nice work.</p>;
  }

  return (
    <ul className={cn("flex flex-col", pending && "opacity-70")}>
      {tasks.map((task) => {
        const assignee = users.find((u) => u.id === task.assigneeId);
        const done = task.status === "done";
        return (
          <li
            key={task.id}
            className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
          >
            <button
              onClick={() =>
                start(async () => {
                  await toggleTask(task.id);
                })
              }
              aria-label={done ? "Mark as not done" : "Mark as done"}
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                done
                  ? "border-success bg-success text-white"
                  : "border-line-strong hover:border-ink",
              )}
            >
              {done && <Check className="h-3 w-3" />}
            </button>
            <div className="min-w-0 flex-1">
              <Link
                href={hrefFor(task)}
                className={cn(
                  "text-sm hover:underline",
                  done ? "text-ink-subtle line-through" : "text-ink",
                )}
              >
                {task.title}
              </Link>
              <div className="flex items-center gap-3 text-xs text-ink-subtle">
                {assignee && <span>{assignee.name}</span>}
                {task.dueDate && !done && (
                  <DeadlineIndicator deadline={task.dueDate} now={now} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
