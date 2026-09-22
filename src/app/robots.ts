import type { MetadataRoute } from "next";

// Keep the operations console out of search engines: it is internet-facing in the supported
// deployment, and indexed login pages only invite drive-by attempts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/admin", "/admin-api"],
      },
    ],
  };
}