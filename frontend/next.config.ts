import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The data layer is a live REST API polled from the browser, so there is
   * little to prerender. `cacheComponents` would only block the shell on
   * request-time values such as the current pathname and footer year.
   */
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
