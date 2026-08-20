import type { ProgrammeRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createProgrammeRepository(_q: Query, _deps: Deps): ProgrammeRepository {
  return {
    async list(_ctx) {
      return notImplemented("programmes", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("programmes", "get");
    },
    async outcomes(_ctx, _programmeId) {
      return notImplemented("programmes", "outcomes");
    },
    async indicatorsForOutcome(_ctx, _outcomeId) {
      return notImplemented("programmes", "indicatorsForOutcome");
    },
    async indicatorsForProgramme(_ctx, _programmeId) {
      return notImplemented("programmes", "indicatorsForProgramme");
    },
    async allIndicators(_ctx) {
      return notImplemented("programmes", "allIndicators");
    },
    async getIndicator(_ctx, _id) {
      return notImplemented("programmes", "getIndicator");
    },
    async activities(_ctx, _programmeId) {
      return notImplemented("programmes", "activities");
    },
    async getActivity(_ctx, _id) {
      return notImplemented("programmes", "getActivity");
    },
    async outputs(_ctx, _programmeId) {
      return notImplemented("programmes", "outputs");
    },
    async getOutput(_ctx, _id) {
      return notImplemented("programmes", "getOutput");
    },
    async getOutcome(_ctx, _id) {
      return notImplemented("programmes", "getOutcome");
    },
    async measurements(_ctx, _indicatorId) {
      return notImplemented("programmes", "measurements");
    },
    async updateIndicator(_ctx, _indicatorId, _value, _note) {
      return notImplemented("programmes", "updateIndicator");
    },
    async grantsFor(_ctx, _programmeId) {
      return notImplemented("programmes", "grantsFor");
    },
  };
}
