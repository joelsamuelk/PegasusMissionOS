import { appConfig } from "@/lib/config";
import { createAnonClient } from "@/server/data/supabase/client";
import type { ControlRepository } from "./repository";
import { createInMemoryControlRepository, type ControlMemoryState } from "./in-memory";
import { createSupabaseControlRepository } from "./supabase";

const mockNow = "2026-08-19T09:00:00.000Z";
const mockState: ControlMemoryState = {
  users: [
    {
      id: "internal-demo",
      email: "control@pegasus-studio.co",
      name: "Pegasus Operator",
      role: "super_admin",
      status: "active",
      createdAt: mockNow,
      updatedAt: mockNow,
    },
  ],
  audit: [],
};

let mockRepository: ControlRepository | null = null;

export async function getControlRepository(): Promise<ControlRepository> {
  if (appConfig.control.mockEnabled) {
    mockRepository ??= createInMemoryControlRepository(mockState);
    return mockRepository;
  }
  if (appConfig.isMockData) {
    throw new Error(
      "Control Plane is not configured. Configure Supabase or explicitly set CONTROL_PLANE_MOCK=true for local demonstration data.",
    );
  }
  return createSupabaseControlRepository(await createAnonClient());
}
