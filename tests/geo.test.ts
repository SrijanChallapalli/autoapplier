import { describe, it, expect } from "vitest";
import { detectCountry, countryAllowed, canonicalCountry } from "../src/lib/geo";

describe("detectCountry", () => {
  it("detects US from state abbreviations and names", () => {
    expect(detectCountry("San Francisco, CA")).toBe("United States");
    expect(detectCountry("Austin, TX (Hybrid)")).toBe("United States");
    expect(detectCountry("Remote - United States")).toBe("United States");
  });
  it("detects other countries", () => {
    expect(detectCountry("Seoul, South Korea")).toBe("South Korea");
    expect(detectCountry("London, United Kingdom")).toBe("United Kingdom");
    expect(detectCountry("Toronto, Canada")).toBe("Canada");
    expect(detectCountry("Dublin, Ireland")).toBe("Ireland");
  });
  it("detects native-language names and more countries", () => {
    expect(detectCountry("Berlin, Deutschland")).toBe("Germany");
    expect(detectCountry("Amsterdam, The Netherlands")).toBe("Netherlands");
    expect(detectCountry("Madrid, España")).toBe("Spain");
    expect(detectCountry("Luxembourg City, Luxembourg")).toBe("Luxembourg");
  });
  it("still resolves US state cities near new aliases (no false Australia)", () => {
    expect(detectCountry("Austin, TX (Hybrid)")).toBe("United States");
  });
  it("returns undefined for bare remote or unknown", () => {
    expect(detectCountry("Remote")).toBeUndefined();
    expect(detectCountry(undefined)).toBeUndefined();
  });
});

describe("countryAllowed", () => {
  it("allows anything when the list is empty", () => {
    expect(countryAllowed("Seoul, South Korea", [])).toBe(true);
  });
  it("filters by allowed countries, aliases included", () => {
    expect(countryAllowed("San Francisco, CA", ["United States"])).toBe(true);
    expect(countryAllowed("San Francisco, CA", ["US"])).toBe(true);
    expect(countryAllowed("Seoul, South Korea", ["United States"])).toBe(false);
    expect(countryAllowed("London, United Kingdom", ["United States"])).toBe(false);
  });
  it("never excludes a location it can't place (bare Remote)", () => {
    expect(countryAllowed("Remote", ["United States"])).toBe(true);
  });
  it("canonicalizes aliases", () => {
    expect(canonicalCountry("usa")).toBe("United States");
    expect(canonicalCountry("uk")).toBe("United Kingdom");
  });
});
