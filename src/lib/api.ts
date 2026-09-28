export function apiError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

export function getEditKey(request: Request) {
  return request.headers.get("x-tournament-edit-key")?.trim() ?? "";
}

export function stateIsReasonableSize(value: unknown) {
  return JSON.stringify(value).length <= 500_000;
}
