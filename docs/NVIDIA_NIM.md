# NVIDIA NIM Guide Provider

CivicFlow can use NVIDIA’s hosted NIM chat-completions API as an optional alternative to Gemini. It selects NIM when `NVIDIA_NIM_API_KEY` is present; otherwise, it retains the existing Gemini path. If neither provider is configured, CivicFlow retains its source-safe offline fallback rather than pretending live AI guidance is available.

> Never put an API key in this repository, a `.env.example` value, a commit, a ticket, or chat. The production key belongs only in Render’s encrypted environment settings.

| Setting | Purpose | Safe value to commit? |
| --- | --- | --- |
| `NVIDIA_NIM_API_KEY` | NVIDIA-issued Bearer credential for the hosted API | No |
| `NVIDIA_NIM_MODEL` | Optional model identifier; defaults to `meta/llama-3.1-8b-instruct` | Yes |
| `GEMINI_API_KEY` | Existing fallback provider key, used only when NIM is absent | No |

In Render, open the CivicFlow service, select **Environment**, add `NVIDIA_NIM_API_KEY`, paste the existing key into the encrypted value field, and save. Optionally add `NVIDIA_NIM_MODEL` if the NVIDIA model page associated with the key specifies another supported chat model. Render will redeploy after the environment change.

The server calls NVIDIA’s OpenAI-compatible `POST /v1/chat/completions` endpoint at `https://integrate.api.nvidia.com`, sends the system instruction plus a short conversation history, and requests a non-streaming completion. NVIDIA documents this endpoint and its HTTP Bearer authentication model. [1] [2]

After redeploy, send a neutral civic question from the public guide. For a non-Indian preview context, also confirm the answer remains jurisdiction-aware; absence of a connected authority source must not be presented as verified local election data.

## Deployment Status

On 22 August 2026, Render accepted the encrypted `NVIDIA_NIM_API_KEY` environment variable and deployed CivicFlow commit `87f8538` successfully at `https://civicflow-oxyg.onrender.com`. The key value was neither copied into this repository nor recorded in this document. A public guide-response check remains the final validation step.

The final public smoke test asked what to check before confirming voter enrolment in Bengaluru. The deployed guide returned a substantive, context-aware checklist with official `eci.gov.in` and `nvsp.in` links, while preserving the site-wide instruction to verify final election information with the appropriate authority. The credential value was not displayed, logged, or committed.

## References

[1] [NVIDIA NIM LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis)

[2] [NVIDIA NIM chat-completion API reference](https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer)
