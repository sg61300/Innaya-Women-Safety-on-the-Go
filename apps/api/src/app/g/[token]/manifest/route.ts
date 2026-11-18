import { verifyGuardianToken } from "@/lib/token";

// Guardian install manifest. Per link because /g/ alone has no page: an installed
// icon must open this guardian's own /g/<token>. The /products manifest is untouched.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!verifyGuardianToken(token)) return new Response("not found", { status: 404 });
  return new Response(
    JSON.stringify({
      name: "INNAYA",
      short_name: "INNAYA",
      start_url: `/g/${token}`,
      scope: "/g/",
      display: "standalone",
      background_color: "#0B0B0C",
      theme_color: "#0B0B0C",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    }),
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } },
  );
}
