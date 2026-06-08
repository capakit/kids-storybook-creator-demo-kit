import { endpointPath, type WorkloadSdk } from "@capakit/sdk";

import { StorybookCreator } from "./storybook_core.ts";

export function registerTestHttp(sdk: WorkloadSdk): void {
    const creator = new StorybookCreator(sdk);
    sdk.mount({
        protocol: "http",
        endpoint: endpointPath("/test"),
        handler: async (request) => {
            if (request.method !== "POST") {
                return Response.json({ error: "method not allowed" }, { status: 405 });
            }
            if (new URL(request.url).pathname !== "/generates-story-and-page-image-through-local-dependencies") {
                return Response.json({ error: "not found" }, { status: 404 });
            }
            try {
                return Response.json(await runStorybookSmoke(creator));
            } catch (error) {
                return Response.json(
                    { error: error instanceof Error ? error.message : String(error) },
                    { status: 500 },
                );
            }
        },
    });
}

async function runStorybookSmoke(creator: StorybookCreator) {
    const story = await creator.generateStory({
        idea: "A tiny lighthouse helps sleepy boats find their dreams.",
        audience: "ages 4-7",
        style: "soft watercolor storybook",
    });
    const firstPage = story.pages[0];
    if (!firstPage) {
        throw new Error("story generator returned no pages");
    }
    const image = await creator.generateImage({
        title: story.title,
        page_id: firstPage.id,
        page_text: firstPage.text,
        image_prompt: firstPage.image_prompt,
        style: "soft watercolor storybook",
    });
    const imageBytes = image.image_url.startsWith("data:image/")
        ? Math.floor(image.image_url.length * 3 / 4)
        : 0;

    return {
        title: story.title,
        page_count: story.pages.length,
        first_page_text: firstPage.text,
        image_provider: image.provider,
        image_bytes: imageBytes,
        image_url_prefix: image.image_url.slice(0, 32),
    };
}
