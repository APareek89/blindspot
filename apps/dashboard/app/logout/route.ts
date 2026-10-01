// Legacy project-key/invitation human access is retired.
export function GET(_req:Request){return Response.json({error:'Use email and password sign-in.'},{status:410});}
export const POST=GET;
