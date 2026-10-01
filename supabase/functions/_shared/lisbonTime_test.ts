import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { lisbonWallClockToDate } from "./lisbonTime.ts";

Deno.test("14:00 on 10/07/2026 (WEST, UTC+1) converts to 13:00Z", () => {
  const result = lisbonWallClockToDate("2026-07-10", "14:00");
  assertEquals(result.toISOString(), "2026-07-10T13:00:00.000Z");
});

Deno.test("14:00 on 10/11/2026 (WET, UTC+0) converts to 14:00Z", () => {
  const result = lisbonWallClockToDate("2026-11-10", "14:00");
  assertEquals(result.toISOString(), "2026-11-10T14:00:00.000Z");
});
