# Migration Index

Referencia entre migrations do Drizzle (journal) e scripts manuais legados.

## Migrations gerenciadas pelo Drizzle (journal `meta/_journal.json`)

Estas sao as migrations oficiais executadas pelo `drizzle-kit migrate`:

| idx | tag (journal)                     | arquivo                          |
|-----|-----------------------------------|----------------------------------|
| 0   | 0000_friendly_jackal              | 0000_friendly_jackal.sql         |
| 1   | 0001_large_scarlet_witch          | 0001_large_scarlet_witch.sql     |
| 2   | 0002_acoustic_the_fallen          | 0002_acoustic_the_fallen.sql     |
| 3   | 0003_overrated_leader             | 0003_overrated_leader.sql        |
| 4   | 0004_add_no_show_reason_notes     | 0004_add_no_show_reason_notes.sql|
| 5   | 0005_add_email_case_insensitive_unique | 0005_add_email_case_insensitive_unique.sql |
| 6   | 0006_add_cpf_to_document_type     | 0006_add_cpf_to_document_type.sql|
| 7   | 0007_add_personal_approval_status | 0007_add_personal_approval_status.sql |
| 8   | 0008_equal_betty_ross             | 0008_equal_betty_ross.sql        |
| 9   | 0009_presence_snapshot_unique     | 0009_presence_snapshot_unique.sql |
| 10  | 0010_tan_shotgun                  | 0010_tan_shotgun.sql             |
| 11  | 0011_friendly_justice             | 0011_friendly_justice.sql        |
| 12  | 0012_hesitant_jocasta             | 0012_hesitant_jocasta.sql        |
| 13  | 0013_absent_legion                | 0013_absent_legion.sql           |
| 14  | 0014_slim_serpent_society          | 0014_slim_serpent_society.sql     |
| 15  | 0015_ensure_user_push_tokens_token_unique | 0015_ensure_user_push_tokens_token_unique.sql |
| 16  | 0016_backfill_user_push_tokens            | 0016_backfill_user_push_tokens.sql            |

## Scripts manuais (aplicados fora do Drizzle, NAO reexecutar)

Estes scripts foram aplicados manualmente antes de terem equivalente no journal.
Mantidos para rastreabilidade; NAO devem ser executados novamente.

| arquivo (prefixo `_legacy_`)                | equivalente no journal |
|---------------------------------------------|------------------------|
| _legacy_0003_add_is_personal_online.sql     | 0003_overrated_leader  |
| _legacy_0008_dispute_code4_geo_45min.sql    | 0008_equal_betty_ross  |
| _legacy_0010_add_dispute_defense_status.sql | 0010_tan_shotgun       |
| _legacy_0012_user_push_tokens.sql           | 0012_hesitant_jocasta  |

> **Convenção**: prefixo `_legacy_` impede execução acidental pelo Drizzle
> (que procura `0xxx_*.sql`) e sinaliza visualmente que são scripts históricos.
