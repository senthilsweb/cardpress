# seed-test-users

Creates one account of each role on a running CardPress, plus a little work for the editor and the writer, so what each role
sees and may do can be compared. **For test servers only.**

```sh
node scripts/seed-test-users/seed.mjs --server http://127.0.0.1:8080
```

No dependencies: it needs Node 18 or later.

| Email | Role | Password |
|---|---|---|
| `admin@cardpress.test` | admin | `cardpress-test-password` |
| `editor@cardpress.test` | editor | `cardpress-test-password` |
| `writer@cardpress.test` | writer | `cardpress-test-password` |

These are fixed test values, which is why the script refuses any server that is not on this machine unless you pass `--force`
(for a throwaway server only). Use `--password <value>` to choose another. On a server that already has an admin, give
`--admin-email` and `--admin-password` of that admin and the other two accounts are added. Running it again changes nothing.

On an empty server, the first account (the admin) is created by sign-up, so it adopts any brands, drafts and settings that
were already there.

What to try: as the **writer**, open Post, write, and notice there is no Approve or Publish; as the **editor**, approve and
publish your own post and see that you cannot see the writer's; as the **admin**, see everyone's work and approve the writer's
draft. Account settings has the profile, **Change password** and **API keys**.
