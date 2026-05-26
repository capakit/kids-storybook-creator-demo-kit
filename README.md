# Kids Storybook Creator

Local-first demo kit for making a simple 10-page children's storybook.

The HTTP workload orchestrates two local dependencies:

- `llama-cpp-local` generates story ideas and page text.
- `stable-diffusion-local` generates page images from the per-page prompts.

## Run

```sh
env -u LOG_FORMAT capakit up . --mount models=/path/to/model-cache
```

Open the exposed HTTP URL, enter or spark an idea, generate the 10-page arc,
edit page text, then generate dirty page images. The print button uses the
browser print dialog.

## Options

- `story_model`: GGUF/Hugging Face model spec for local story text.
- `image_model`: diffusion model spec for page images.
- `image_style`: default visual style shown in the UI.
- `gpu`: `metal` or `none`, passed to the llama dependency.
- `image_backend`: `auto`, `cpu`, or `metal`, passed to the image dependency.
- `llama_context_size`: context size for llama.cpp.

Blank CapaKit AI app Kit. Add workloads with `capakit kit workloads add`.
