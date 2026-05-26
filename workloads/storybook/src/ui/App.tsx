import { useEffect, useState } from "react";

type Health = {
    ok: boolean;
    workload: string;
    title: string;
    text_model: string;
    image_model: string;
    image_style: string;
};

type StoryPage = {
    id: number;
    text: string;
    image_prompt: string;
    image_url?: string;
    image_dirty: boolean;
    generating?: boolean;
};

type Story = {
    title: string;
    pages: StoryPage[];
};

const styleOptions = [
    "soft watercolor storybook",
    "colored pencil bedtime book",
    "paper cutout collage",
    "warm gouache picture book",
    "gentle 3D clay illustration",
];

export function App() {
    const [health, setHealth] = useState<Health | null>(null);
    const [idea, setIdea] = useState("");
    const [style, setStyle] = useState(styleOptions[0]);
    const [audience, setAudience] = useState("ages 4-7");
    const [story, setStory] = useState<Story | null>(null);
    const [status, setStatus] = useState("Ready");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void fetch("/api/health")
            .then((response) => response.json())
            .then((payload: Health) => {
                setHealth(payload);
                setStyle(payload.image_style);
            });
    }, []);

    const dirtyPages = story?.pages.filter((page) => page.image_dirty) ?? [];

    async function suggestIdea() {
        await withBusy("Generating idea", async () => {
            const payload = await postJson<{ idea: string }>("/api/idea", { style, audience });
            setIdea(payload.idea);
            setStatus("Idea ready");
        });
    }

    async function generateStory() {
        await withBusy("Generating 10 pages", async () => {
            const payload = await postJson<{ title: string; pages: StoryPage[] }>("/api/story", {
                idea,
                style,
                audience,
            });
            setStory({
                title: payload.title,
                pages: payload.pages.map((page) => ({
                    ...page,
                    image_dirty: true,
                })),
            });
            setStatus("Pages ready for editing");
        });
    }

    async function generatePageImage(pageId: number) {
        if (!story) return;
        const page = story.pages.find((candidate) => candidate.id === pageId);
        if (!page) return;

        setStory(markPageGenerating(story, pageId, true));
        try {
            const payload = await postJson<{
                image_url: string;
                prompt: string;
                provider: string;
            }>("/api/image", {
                title: story.title,
                page_id: page.id,
                page_text: page.text,
                image_prompt: page.image_prompt,
                style,
            });
            setStory((current) =>
                current
                    ? updatePage(current, pageId, {
                        image_url: payload.image_url,
                        image_dirty: false,
                        generating: false,
                    })
                    : current,
            );
            setStatus(`Page ${pageId} image ready`);
        } catch (error) {
            setStory((current) =>
                current ? markPageGenerating(current, pageId, false) : current,
            );
            setStatus(errorMessage(error));
        }
    }

    async function generateDirtyImages() {
        for (const page of dirtyPages) {
            await generatePageImage(page.id);
        }
    }

    async function withBusy(label: string, run: () => Promise<void>) {
        setBusy(true);
        setStatus(label);
        try {
            await run();
        } catch (error) {
            setStatus(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="app-shell">
            <section className="workspace">
                <header className="toolbar">
                    <div>
                        <h1>Kids Storybook Creator</h1>
                        <p>{status}</p>
                    </div>
                    <div className="toolbar-actions">
                        <button
                            type="button"
                            disabled={dirtyPages.length === 0 || busy}
                            onClick={() => void generateDirtyImages()}
                        >
                            Generate images
                        </button>
                        <button
                            type="button"
                            className="secondary"
                            disabled={!story}
                            onClick={() => window.print()}
                        >
                            Print
                        </button>
                    </div>
                </header>

                <section className="setup-panel">
                    <label>
                        Story idea
                        <textarea
                            rows={4}
                            value={idea}
                            placeholder="A bedtime adventure about..."
                            onChange={(event) => setIdea(event.target.value)}
                        />
                    </label>
                    <div className="setup-grid">
                        <label>
                            Image style
                            <select value={style} onChange={(event) => setStyle(event.target.value)}>
                                {styleOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Audience
                            <input
                                value={audience}
                                onChange={(event) => setAudience(event.target.value)}
                            />
                        </label>
                    </div>
                    <div className="setup-actions">
                        <button type="button" onClick={() => void suggestIdea()} disabled={busy}>
                            Spark idea
                        </button>
                        <button
                            type="button"
                            onClick={() => void generateStory()}
                            disabled={!idea.trim() || busy}
                        >
                            Generate 10 pages
                        </button>
                    </div>
                </section>

                {story ? (
                    <section className="book">
                        <header className="book-title">
                            <input
                                value={story.title}
                                onChange={(event) =>
                                    setStory({ ...story, title: event.target.value })}
                            />
                        </header>
                        <div className="page-grid">
                            {story.pages.map((page) => (
                                <article className="page-card" key={page.id}>
                                    <div className="image-frame">
                                        {page.image_url ? (
                                            <img src={page.image_url} alt={`Page ${page.id}`} />
                                        ) : (
                                            <span>Page {page.id}</span>
                                        )}
                                    </div>
                                    <div className="page-editor">
                                        <div className="page-meta">
                                            <strong>Page {page.id}</strong>
                                            <span>{page.image_dirty ? "image dirty" : "image current"}</span>
                                        </div>
                                        <textarea
                                            rows={5}
                                            value={page.text}
                                            onChange={(event) =>
                                                setStory(markPageText(story, page.id, event.target.value))}
                                        />
                                        <button
                                            type="button"
                                            disabled={!page.image_dirty || page.generating}
                                            onClick={() => void generatePageImage(page.id)}
                                        >
                                            {page.generating ? "Generating..." : "Generate page image"}
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}

                <footer className="runtime">
                    <dl>
                        <div>
                            <dt>Status</dt>
                            <dd>{health?.ok ? "ready" : "starting"}</dd>
                        </div>
                        <div>
                            <dt>Text model</dt>
                            <dd>{health?.text_model ?? "local"}</dd>
                        </div>
                        <div>
                            <dt>Image model</dt>
                            <dd>{health?.image_model ?? "local"}</dd>
                        </div>
                        <div>
                            <dt>Workload</dt>
                            <dd>{health?.workload ?? "storybook"}</dd>
                        </div>
                    </dl>
                </footer>
            </section>
        </main>
    );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error ?? `request failed: ${response.status}`);
    }
    return payload as T;
}

function markPageText(story: Story, pageId: number, text: string): Story {
    return updatePage(story, pageId, { text, image_dirty: true });
}

function markPageGenerating(story: Story, pageId: number, generating: boolean): Story {
    return updatePage(story, pageId, { generating });
}

function updatePage(story: Story, pageId: number, patch: Partial<StoryPage>): Story {
    return {
        ...story,
        pages: story.pages.map((page) =>
            page.id === pageId ? { ...page, ...patch } : page,
        ),
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
