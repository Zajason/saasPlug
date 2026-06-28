export async function GET() {
    return Response.json({
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? null,
    });
  }