import { logEvent } from "@/server/logger";

type RequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
};

type ErrorRequest = Readonly<{ path: string; method: string }>;

export async function onRequestError(error: unknown, request: ErrorRequest, context: RequestErrorContext) {
  logEvent("error", "http.request_failed", {
    method: request.method,
    route: context.routePath,
    router: context.routerKind,
    routeType: context.routeType,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
