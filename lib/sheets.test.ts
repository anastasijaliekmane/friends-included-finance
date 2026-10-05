import { describe, expect, it } from "vitest";
import { parseGoogleCredentials } from "./sheets";

describe("Google service-account credentials", () => {
  it("parses JSON before normalizing escaped private-key newlines", () => {
    const credentials = parseGoogleCredentials(JSON.stringify({
      client_email: "service@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    }));

    expect(credentials.private_key).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
  });
});
