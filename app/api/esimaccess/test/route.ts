export async function GET() {
  const accessCode = process.env.ESIM_ACCESS_CODE;
  const secretKey = process.env.ESIM_SECRET_KEY;

  return Response.json({
    ok: true,
    accessCodeLoaded: Boolean(accessCode),
    secretKeyLoaded: Boolean(secretKey),
  });
}
