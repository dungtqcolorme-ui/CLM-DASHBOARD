# Private dashboard release source

`clm-dashboard-private-34.html` is the reviewed private dashboard release source.
The shell route reads this tracked copy first so a Vercel deployment and the
reviewed Git revision always render the same interface. Older releases remain
available in the `clm-dashboard-private` Supabase Storage bucket as rollback
fallbacks.

The Next.js shell route injects the signed-in profile at request time. The
tracked source must therefore never contain a real `__CLM_BOOTSTRAP_PROFILE__`
payload or rendered user data.

Use `scripts/materialize-dashboard-release.mjs` when capturing a production DOM
snapshot so the rendered root and injected profile are removed before the file
is committed or republished.
