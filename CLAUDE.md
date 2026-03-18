Read and follow all instructions in @AGENTS.md

# Claude-Specific Notes

- Use `force-dynamic` on all page server components (data should be fresh on every request)
- When modifying SDK queries, check the `@itm-studio/partner-sdk` types for available fields — the SDK is fully typed with autocomplete
- The event splitting logic (upcoming/past) exists in both `app/page.tsx` and `app/collections/[slug]/page.tsx` — keep them in sync when modifying
- This is a template repo — keep it minimal and well-documented so partners can understand and customize it
