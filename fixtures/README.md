# fixtures/v1 (contract §13)

Example payloads per endpoint, published by ingest (W3).

| File | Endpoint | Sections |
| --- | --- | --- |
| `v1/events.json` | `POST /v1/e` | `valid`, `invalid` (with the `field` ingest names in its 400) |
| `v1/server-requests.json` | `POST /v1/r` | `valid`, `invalid`, `sender_violations` |
| `v1/wix-webhooks.json` | `POST /v1/w/{token}` | `valid` (with what is `stored`), `invalid`, `sender_violations` |
| `v1/plugin-hello.json` | `POST /v1/plugin/hello` | `valid`, `invalid` |
| `v1/site-config.json` | `GET /v1/config/{key}` | `valid` |

`valid` passes the strict schema in `contract/v1/` and ingest. `invalid` fails both. `sender_violations` fail the strict schema (a sender bug) but ingest accepts them and drops the extra keys. Checked by `ingest/test/fixtures.test.ts`.

Not done yet: the seed set of 20 visits with expected metric results for the dashboard (§13).
