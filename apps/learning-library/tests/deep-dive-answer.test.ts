import { describe, expect, it } from "vitest";
import { cleanDeepDiveAnswer } from "@/lib/ai/services";

describe("deep-dive answer presentation", () => {
  it("removes inline citation markup while preserving the explanation", () => {
    expect(cleanDeepDiveAnswer(
      "A split changes share count without creating value. ([Investor.gov](https://www.investor.gov/stock-split?utm_source=openai)) The market price can still move [afterward](https://www.sec.gov/example). [1]",
    )).toBe(
      "A split changes share count without creating value. The market price can still move afterward.",
    );
  });

  it("removes raw URLs and model citation markers", () => {
    expect(cleanDeepDiveAnswer(
      "Check the eligibility rule (https://example.gov/rule). \u3010source:4†7\u3011 Then compare the exception: https://example.gov/exception",
    )).toBe("Check the eligibility rule. Then compare the exception.");
  });
});
