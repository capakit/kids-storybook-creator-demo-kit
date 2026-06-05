import { endpointPath } from "@capakit/sdk";
import type { WorkloadHttpHandlerContext } from "@capakit/sdk";
import type { WorkloadSdk } from "@capakit/sdk";
import { Hono } from "hono";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StorybookCreator } from "./storybook_core.ts";

declare const Bun: {
    file(path: string): Blob & { exists(): Promise<boolean> };
};

const sourceDir = dirname(fileURLToPath(import.meta.url));
const clientDistDir = join(sourceDir, "..", "dist", "client");

export function registerHttp(sdk: WorkloadSdk): void {
    const app = createApp(sdk);
    sdk.mount({
        protocol: "http",
        endpoint: endpointPath("/http"),
        handler: async (request, context) =>
            app.fetch(requestForMountedApp(request, context)),
    });
}

function createApp(sdk: WorkloadSdk): Hono {
    const creator = new StorybookCreator(sdk);
    const app = new Hono();

    app.get("/api/health", (c) =>
        c.json({
            ok: true,
            workload: process.env.CAPAKIT_WORKLOAD_MID ?? "storybook",
            title: "Kids Storybook Creator",
            text_model: process.env.STORYBOOK_MODEL ?? "storybook-text-model",
            image_model: process.env.STORYBOOK_IMAGE_MODEL ?? "storybook-image-model",
            image_style: process.env.STORYBOOK_IMAGE_STYLE ?? "soft watercolor storybook",
        }),
    );

    app.post("/api/idea", async (c) => {
        const payload = await c.req.json();
        return jsonResult(() => creator.suggestIdea(payload));
    });
    app.post("/api/story", async (c) => {
        const payload = await c.req.json();
        return jsonResult(() => creator.generateStory(payload));
    });
    app.post("/api/image", async (c) => {
        const payload = await c.req.json();
        return jsonResult(() => creator.generateImage(payload));
    });

    app.get("/assets/*", async (c) => {
        return serveClientFile(c.req.path.slice(1));
    });

    app.get("*", async () => {
        return serveClientFile("index.html");
    });

    return app;
}

async function jsonResult<T>(run: () => Promise<T>): Promise<Response> {
    try {
        return Response.json(await run());
    } catch (error) {
        return Response.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 400 },
        );
    }
}

function requestForMountedApp(
    request: Request,
    context: WorkloadHttpHandlerContext,
): Request {
    const url = new URL(request.url);
    const endpoint = context.endpoint.toString();
    if (endpoint !== "/" && url.pathname.startsWith(endpoint)) {
        url.pathname = url.pathname.slice(endpoint.length) || "/";
    }
    return new Request(url.toString(), request);
}

async function serveClientFile(relativePath: string): Promise<Response> {
    const filePath = safeClientFilePath(relativePath);
    if (!filePath) {
        return new Response("not found", { status: 404 });
    }
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
        return new Response("not found", { status: 404 });
    }
    return new Response(file, {
        headers: {
            "content-type": contentTypeFor(filePath),
        },
    });
}

function safeClientFilePath(relativePath: string): string | null {
    const parts = relativePath
        .split("/")
        .filter((part) => part.length > 0 && part !== "." && part !== "..");
    if (parts.length === 0) {
        return join(clientDistDir, "index.html");
    }
    return join(clientDistDir, ...parts);
}

function contentTypeFor(path: string): string {
    if (path.endsWith(".html")) return "text/html; charset=utf-8";
    if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (path.endsWith(".css")) return "text/css; charset=utf-8";
    if (path.endsWith(".svg")) return "image/svg+xml";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".webp")) return "image/webp";
    return "application/octet-stream";
}
