import { expect, it } from "vitest";
import { testEnvironment } from "../scripts/test-environment.mjs";

it("isolates test subprocesses without changing deployment settings in the build process", () => {
  const deployment = {
    NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production",
    OZ_ORIGIN: "https://research.example", OZ_SIGNUP_PAUSED: "1", OZ_TEST_POSTGRES: "1",
    DATABASE_URL: "synthetic-secret", POSTGRES_URL: "synthetic-secret", PGPASSWORD: "synthetic-secret",
    CENSUS_API_KEY: "synthetic-secret", NEXT_PUBLIC_EXAMPLE: "deployment-value",
    PATH: "local-tools", CI: "1",
  };
  expect(testEnvironment(deployment)).toEqual({ NODE_ENV: "test", PATH: "local-tools", CI: "1" });
  expect(deployment.NODE_ENV).toBe("production");
  expect(deployment.OZ_ORIGIN).toBe("https://research.example");
  expect(deployment.DATABASE_URL).toBe("synthetic-secret");
});
