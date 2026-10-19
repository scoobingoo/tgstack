import { ConflictException } from "@nestjs/common";
import type { BroadcastStatus } from "@tgstack/db";
import { describe, expect, it } from "vitest";
import {
  allowedFrom,
  assertAction,
  canTransition,
  isTerminal,
} from "../src/modules/broadcasts/broadcast-state.js";

const ALL: BroadcastStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
];

describe("broadcast state machine", () => {
  it.each([
    ["DRAFT", "QUEUED", true],
    ["DRAFT", "SCHEDULED", true],
    ["SCHEDULED", "SCHEDULED", true],
    ["SCHEDULED", "QUEUED", true],
    ["SCHEDULED", "DRAFT", true],
    ["SCHEDULED", "CANCELLED", true],
    ["SCHEDULED", "RUNNING", false],
    ["DRAFT", "CANCELLED", true],
    ["DRAFT", "RUNNING", false],
    ["DRAFT", "COMPLETED", false],
    ["QUEUED", "RUNNING", true],
    ["QUEUED", "CANCELLED", true],
    ["QUEUED", "FAILED", true],
    ["QUEUED", "DRAFT", false],
    ["RUNNING", "COMPLETED", true],
    ["RUNNING", "CANCELLED", true],
    ["RUNNING", "FAILED", true],
    ["RUNNING", "QUEUED", false],
    ["COMPLETED", "QUEUED", false],
    ["COMPLETED", "CANCELLED", false],
    ["CANCELLED", "QUEUED", false],
    ["FAILED", "QUEUED", false],
  ] as const)("%s → %s: %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("knows which statuses allow each action", () => {
    expect(allowedFrom("start")).toEqual(["DRAFT", "SCHEDULED"]);
    expect(allowedFrom("schedule")).toEqual(["DRAFT", "SCHEDULED"]);
    expect(allowedFrom("unschedule")).toEqual(["SCHEDULED"]);
    expect(allowedFrom("cancel")).toEqual(["DRAFT", "SCHEDULED", "QUEUED", "RUNNING"]);
    expect(allowedFrom("edit")).toEqual(["DRAFT"]);
  });

  it("only terminal statuses are final", () => {
    expect(ALL.filter(isTerminal)).toEqual(["COMPLETED", "CANCELLED", "FAILED"]);
  });

  it("explains forbidden actions with a 409", () => {
    expect(() => assertAction("COMPLETED", "start")).toThrow(ConflictException);
    expect(() => assertAction("COMPLETED", "start")).toThrow("Cannot start a completed broadcast");
    expect(() => assertAction("CANCELLED", "cancel")).toThrow(
      "Cannot cancel a cancelled broadcast",
    );
    expect(() => assertAction("RUNNING", "edit")).toThrow("Cannot edit a running broadcast");
    expect(() => assertAction("SCHEDULED", "edit")).toThrow("Cannot edit a scheduled broadcast");
    expect(() => assertAction("DRAFT", "unschedule")).toThrow(ConflictException);
    expect(() => assertAction("DRAFT", "start")).not.toThrow();
  });
});
