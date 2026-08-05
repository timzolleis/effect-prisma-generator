import { defineConfig } from "prisma/config";

// Generation-only fixture: `prisma generate` never connects, so the URL is a
// syntactically valid placeholder.
export default defineConfig({
  datasource: {
    url: "postgresql://user:pass@localhost:5432/unused",
  },
});
