import type { MetadataRoute } from "next";
import { CRAWLER_SKIP } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: CRAWLER_SKIP } };
}
