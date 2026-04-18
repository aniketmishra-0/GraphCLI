# SMART CONTEXT PROMPT WRAPPER

Model target: Auto/Other. Enforce strict token discipline and avoid broad code scans.
Task: review changes safely

Rules:
1. Use only the packet context. Do not request full-codebase reads.
2. If a critical definition is missing, ask only for the specific symbol/file.
3. Keep response concise and grounded to packet evidence.

Input Packet:
- smart-context.md

Expected Output:
- Key findings
- Risk level
- Exact follow-up data needed (if any)

Token Tracking (estimated):
- budget_tokens: 605
- prompt_1_used_tokens: 390
- prompt_1_remaining_tokens: 215
- note: remaining token window can be used for the assistant response and follow-up.