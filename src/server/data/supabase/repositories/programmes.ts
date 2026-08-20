import type { ProgrammeRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createProgrammeRepository(q: Query, deps: Deps): ProgrammeRepository {
  return {
    async list(ctx) {
      return notImplemented("programmes", "list");
    },
    async get(ctx, id) {
      return notImplemented("programmes", "get");
    },
    async outcomes(ctx, programmeId) {
      return notImplemented("programmes", "outcomes");
    },
    async indicatorsForOutcome(ctx, outcomeId) {
      return notImplemented("programmes", "indicatorsForOutcome");
    },
    async indicatorsForProgramme(ctx, programmeId) {
      return notImplemented("programmes", "indicatorsForProgramme");
    },
    async allIndicators(ctx) {
      return notImplemented("programmes", "allIndicators");
    },
    async getIndicator(ctx, id) {
      return notImplemented("programmes", "getIndicator");
    },
    async activities(ctx, programmeId) {
      return notImplemented("programmes", "activities");
    },
    async getActivity(ctx, id) {
      return notImplemented("programmes", "getActivity");
    },
    async outputs(ctx, programmeId) {
      return notImplemented("programmes", "outputs");
    },
    async getOutput(ctx, id) {
      return notImplemented("programmes", "getOutput");
    },
    async getOutcome(ctx, id) {
      return notImplemented("programmes", "getOutcome");
    },
    async measurements(ctx, indicatorId) {
      return notImplemented("programmes", "measurements");
    },
    async updateIndicator(ctx, indicatorId, value, note) {
      return notImplemented("programmes", "updateIndicator");
    },
    async grantsFor(ctx, programmeId) {
      return notImplemented("programmes", "grantsFor");
    },
  };
}
