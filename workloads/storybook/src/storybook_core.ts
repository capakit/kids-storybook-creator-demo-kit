import { endpointPath, workloadMid } from "@capakit/sdk";
import type { RunnerSdk } from "@capakit/sdk";

const LLAMA_WORKLOAD = workloadMid("llama");
const LLAMA_ENDPOINT = endpointPath("/oaic");
const IMAGEGEN_WORKLOAD = workloadMid("imagegen");
const IMAGEGEN_ENDPOINT = endpointPath("/oaic");
const PAGE_COUNT = 10;

export type IdeaRequest = {
    style?: string;
    audience?: string;
};

export type StoryRequest = {
    idea: string;
    style?: string;
    audience?: string;
};

export type StoryPage = {
    id: number;
    text: string;
    image_prompt: string;
};

export type StoryResponse = {
    title: string;
    pages: StoryPage[];
};

export type ImageRequest = {
    title?: string;
    page_id: number;
    page_text: string;
    image_prompt?: string;
    style?: string;
};

export type ImageResponse = {
    image_url: string;
    prompt: string;
    provider: string;
};

export class StorybookCreator {
    constructor(private readonly sdk: RunnerSdk) {}

    async suggestIdea(input: IdeaRequest): Promise<{ idea: string }> {
        const text = await this.completeText({
            temperature: 0.9,
            maxTokens: 90,
            prompt: [
                "Suggest one imaginative, gentle children's picture-book idea.",
                `Audience: ${audience(input.audience)}.`,
                `Visual style: ${imageStyle(input.style)}.`,
                "Return one sentence only. No title prefix.",
            ].join("\n"),
        });

        return {
            idea: cleanLine(text) || "A shy moonbeam helps a child find a lost bedtime song.",
        };
    }

    async generateStory(input: StoryRequest): Promise<StoryResponse> {
        const idea = cleanLine(input.idea);
        if (!idea) {
            throw new Error("story idea is required");
        }

        const raw = await this.completeText({
            temperature: 0.75,
            maxTokens: 1500,
            prompt: storyPrompt(idea, input),
        });
        return coerceStory(raw, idea, imageStyle(input.style));
    }

    async generateImage(input: ImageRequest): Promise<ImageResponse> {
        const pageText = cleanLine(input.page_text);
        if (!pageText) {
            throw new Error("page text is required");
        }

        const prompt = pageImagePrompt({
            title: input.title,
            pageId: input.page_id,
            pageText,
            imagePrompt: input.image_prompt,
            style: imageStyle(input.style),
        });
        const client = await this.sdk.workloads.oaicClient(IMAGEGEN_WORKLOAD, IMAGEGEN_ENDPOINT);
        const response = await client.images.generate({
            model: process.env.STORYBOOK_IMAGE_MODEL ?? "storybook-image-model",
            prompt,
            n: 1,
            size: "512x512",
            response_format: "b64_json",
        } as never);
        const image = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
        const imageUrl = image?.b64_json
            ? `data:image/png;base64,${image.b64_json}`
            : image?.url;
        if (!imageUrl) {
            throw new Error("image generator did not return an image");
        }

        return {
            image_url: imageUrl,
            prompt,
            provider: "imagegen",
        };
    }

    private async completeText(input: {
        prompt: string;
        temperature: number;
        maxTokens: number;
    }): Promise<string> {
        const client = await this.sdk.workloads.oaicClient(LLAMA_WORKLOAD, LLAMA_ENDPOINT);
        const response = await client.chat.completions.create({
            model: process.env.STORYBOOK_MODEL ?? "storybook-text-model",
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            messages: [{ role: "user", content: input.prompt }],
        });
        return response.choices[0]?.message?.content ?? "";
    }
}

function storyPrompt(idea: string, input: StoryRequest): string {
    return [
        "Create a complete 10-page children's picture-book arc.",
        `Core idea: ${idea}`,
        `Audience: ${audience(input.audience)}.`,
        `Visual style: ${imageStyle(input.style)}.`,
        "Keep each page to 1-2 short read-aloud sentences.",
        "Make the story gentle, age-appropriate, and visually concrete.",
        "Avoid scary peril, violence, brand names, and copyrighted characters.",
        "Return strict JSON only with this shape:",
        "{\"title\":\"...\",\"pages\":[{\"id\":1,\"text\":\"...\",\"image_prompt\":\"...\"}]}",
        "The pages array must contain exactly 10 pages with ids 1 through 10.",
    ].join("\n");
}

function coerceStory(raw: string, idea: string, style: string): StoryResponse {
    const parsed = parseJsonObject(raw);
    const title = cleanLine(readString(parsed?.title)) || titleFromIdea(idea);
    const modelPages = Array.isArray(parsed?.pages) ? parsed.pages : [];
    const pages = modelPages
        .slice(0, PAGE_COUNT)
        .map((page, index) => coercePage(page, index + 1, style))
        .filter((page) => page.text.length > 0);

    while (pages.length < PAGE_COUNT) {
        const id = pages.length + 1;
        pages.push({
            id,
            text: fallbackPageText(id, idea),
            image_prompt: fallbackImagePrompt(id, idea, style),
        });
    }

    return {
        title,
        pages: pages.map((page, index) => ({ ...page, id: index + 1 })),
    };
}

function coercePage(value: unknown, id: number, style: string): StoryPage {
    const record = isRecord(value) ? value : {};
    const text = cleanLine(readString(record.text));
    const prompt = cleanLine(readString(record.image_prompt)) || `${style}; ${text}`;
    return { id, text, image_prompt: prompt };
}

function pageImagePrompt(input: {
    title?: string;
    pageId: number;
    pageText: string;
    imagePrompt?: string;
    style: string;
}): string {
    return [
        `Children's picture book illustration, ${input.style}.`,
        input.title ? `Book title: ${input.title}.` : "",
        `Page ${input.pageId}.`,
        `Scene: ${cleanLine(input.imagePrompt) || input.pageText}`,
        "Keep characters visually consistent with the story.",
        "No text, captions, logos, speech bubbles, or watermarks in the image.",
    ].filter(Boolean).join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) {
        return null;
    }
    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function fallbackPageText(pageId: number, idea: string): string {
    const beats = [
        "The adventure begins with a small surprise.",
        "A kind helper appears just when needed.",
        "The world opens into something bright and strange.",
        "The hero tries a brave little idea.",
        "A problem becomes easier when shared.",
        "Everyone notices a clue they missed before.",
        "The hero chooses kindness over rushing.",
        "A joyful discovery changes the day.",
        "The friends bring the magic safely home.",
        "Bedtime arrives with a new story to remember.",
    ];
    return `${beats[pageId - 1]} It all grows from this idea: ${idea}`;
}

function fallbackImagePrompt(pageId: number, idea: string, style: string): string {
    return `${style}; picture-book scene ${pageId} inspired by ${idea}`;
}

function titleFromIdea(idea: string): string {
    const words = idea
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6);
    return words.length > 0
        ? words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ")
        : "Little Story";
}

function cleanLine(value: unknown): string {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .replace(/^["'`]+|["'`]+$/g, "")
        .trim();
}

function audience(value: string | undefined): string {
    return cleanLine(value) || "ages 4-7";
}

function imageStyle(value: string | undefined): string {
    return cleanLine(value) || process.env.STORYBOOK_IMAGE_STYLE || "soft watercolor storybook";
}

function readString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
