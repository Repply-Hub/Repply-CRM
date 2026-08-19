# Auditoria de Storage — projeto `hukeirrmsoiowvvrhivx` (MD Representações)

Auditoria **somente leitura**, executada em 2026-08-10 via `supabase db query --linked` (SELECTs diretos no Postgres do projeto). Nenhuma escrita, deleção ou migration foi realizada.

---

## 1. Tamanho total por bucket

| bucket | objetos | tamanho |
|---|---:|---:|
| `pedido-anexos` | 9.717 | 3.342,86 MB (3,265 GB) |
| `whatsapp-media` | 3.868 | 1.199,38 MB (1,171 GB) |
| `chat-files` | 118 | 40,15 MB |
| `avatars` | 20 | 5,74 MB |
| `email-assets` | 1 | 0,26 MB |
| **Total** | **13.724** | **~4,53 GB** |

`pedido-anexos` é o maior bucket do projeto (72% do volume total de Storage) e o foco desta auditoria.

---

## 2. Achado central: duas empresas duplicadas geraram uma importação Bitrix24 duplicada

Investigando o padrão de tamanhos duplicados, descobri que **quase todo o bucket `pedido-anexos` está concentrado em apenas duas pastas de topo**, cujos nomes não são IDs de pedido — são `empresa_id`:

| empresa_id | nome | criada em | usuários ativos | objetos no bucket | volume |
|---|---|---|---:|---:|---:|
| `bb5fce8c-…` | **MD** | 2026-06-25 16:49:50 | 2 | 4.506 | 1.611,37 MB |
| `0c5df684-…` | **MD Representações** | 2026-06-25 17:38:58 | 13 | 5.186 | 1.722,99 MB |

As duas empresas foram criadas com **49 minutos de diferença**, no mesmo dia. "MD Representações" é a empresa real em uso (13 usuários ativos, pedidos atualizados até hoje). "MD" parece ser um tenant duplicado/de teste (apenas 2 usuários) — mas **recebeu uma importação Bitrix24 quase completa em paralelo**, com muitos dos mesmos PDFs re-enviados.

Juntas, essas duas pastas somam **9.692 dos 9.717 objetos do bucket (99,7%)**. Isso explica sozinho o crescimento desproporcional.

> Esta é uma constatação sobre dados/tenants, não apenas sobre arquivos — está fora do escopo desta auditoria de storage decidir o que fazer com a empresa "MD" duplicada, mas é a causa raiz do problema e deveria ser avaliada por quem conhece o contexto de negócio antes de qualquer limpeza.

---

## 3. Top 20 maiores arquivos

Todos são `application/pdf`, entre 3,4 MB e 9,8 MB. Note os pares de **tamanho em bytes idêntico** entre as duas pastas de empresa, com ~5 dias de diferença — evidência direta de reimport duplicado do mesmo arquivo:

| bytes | tamanho | pasta (empresa) | criado em |
|---:|---:|---|---|
| 10.242.022 | 9,77 MB | MD Representações | 2026-08-01 18:45:23 |
| 10.242.022 | 9,77 MB | MD | 2026-08-06 20:33:40 |
| 9.769.489 | 9,32 MB | MD Representações | 2026-08-01 15:56:44 |
| 7.121.711 | 6,79 MB | MD Representações | 2026-08-01 20:07:59 |
| 6.830.875 | 6,51 MB | MD Representações | 2026-08-01 18:45:26 |
| 6.830.875 | 6,51 MB | MD | 2026-08-06 20:33:47 |
| 5.996.317 | 5,72 MB | MD | 2026-08-06 20:34:56 |
| 5.996.317 | 5,72 MB | MD Representações | 2026-08-01 18:45:50 |
| 4.986.991 | 4,76 MB | MD | 2026-08-06 20:33:22 |
| 4.986.991 | 4,76 MB | MD Representações | 2026-08-01 18:45:08 |
| 4.790.063 | 4,57 MB | MD | 2026-08-06 20:35:33 |
| 4.790.063 | 4,57 MB | MD Representações | 2026-08-01 18:46:10 |
| 4.698.882 | 4,48 MB | MD Representações | 2026-08-01 18:46:17 |
| 4.643.439 | 4,43 MB | MD Representações | 2026-08-01 15:56:43 |
| 4.619.987 | 4,41 MB | MD Representações | 2026-08-01 20:08:08 |
| 3.919.447 | 3,74 MB | MD Representações | 2026-08-01 12:52:56 |
| 3.879.691 | 3,70 MB | MD Representações | 2026-08-01 18:46:19 |
| 3.677.519 | 3,51 MB | MD Representações | 2026-08-01 18:45:04 |
| 3.635.018 | 3,47 MB | MD Representações | 2026-08-01 18:45:07 |
| 3.635.018 | 3,47 MB | MD | 2026-08-06 20:33:17 |

## 4. Agrupamento por dia de criação

Confirma que o crescimento coincide com a migração Bitrix24, concentrado em dois eventos de import em massa:

| dia | objetos | volume |
|---|---:|---:|
| 2026-08-01 | 5.148 | 1.721,73 MB |
| 2026-08-06 | 4.351 | 1.601,51 MB |
| demais dias (16/07 a 07/08) | 218 | ~19,6 MB |

**96,4% do volume do bucket foi criado em apenas dois dias** — 2026-08-01 (import na empresa "MD Representações") e 2026-08-06 (import na empresa "MD", cinco dias depois).

## 5. Duplicatas por tamanho em bytes

| métrica | valor |
|---|---:|
| Duplicatas por **nome de arquivo** | 0 (todo `name` no bucket é único) |
| Grupos de mesmo **tamanho em bytes** | 2.407 grupos |
| Objetos envolvidos em algum grupo | 8.022 (82,6% do bucket) |
| Bytes excedentes* se todos forem duplicatas de conteúdo real | 1.969,46 MB (1,923 GB) |

\* Estimativa **assumindo que mesmo-tamanho ⇒ mesmo conteúdo**. Não é prova de conteúdo idêntico (não há hash de conteúdo salvo em `storage.objects.metadata`), mas a amostra manual (item 3 acima) mostra pares com paths distintos, mimetypes iguais e datas de criação separadas por dias — consistente com reimport, não coincidência. 98,8% dos bytes excedentes (1.966 de 1.969 MB) vêm de grupos com arquivos ≥10 KB, o que reduz a chance de ser ruído estatístico de arquivos pequenos.

## 6. Objetos órfãos (sem referência em `pedidos.pdf_url`)

`pedidos` não tem uma tabela de anexos separada — a única referência a arquivos do bucket é a coluna `pedidos.pdf_url`.

| métrica | valor |
|---|---:|
| Total de objetos no bucket | 9.717 |
| Referências válidas em `pedidos.pdf_url` | 4.130 |
| Referências quebradas (`pdf_url` aponta para objeto inexistente) | **0** |
| **Objetos órfãos** (sem nenhuma referência) | **5.587 (57,5% dos objetos)** |
| Volume órfão | **2.313,70 MB (2,259 GB — 69% do volume do bucket)** |
| Órfãos que também têm duplicata por tamanho | 5.205 de 5.587 (93%) |

Nenhuma referência em `pedidos.pdf_url` está quebrada — o que existe hoje como link funciona. O problema é o inverso: mais da metade dos arquivos no bucket nunca foi vinculada a nenhum pedido (provavelmente sobras do import duplicado ou de tentativas parciais que nunca atualizaram `pdf_url`).

## 7. Cruzamento com os 31 registros de PDF Bitrix24 com URL corrompida

A URL corrompida (pontos trocados por vírgulas, ex. `cdn,bitrix24,com,br/.../arquivo,pdf`) **não está** na coluna `pedidos.pdf_url` — está preservada como metadado bruto em `pedidos.campos_extras->>'pdf_url'` (a URL original do Bitrix24, inutilizável, mantida só como histórico do import).

| métrica | valor |
|---|---:|
| Registros com `campos_extras->>'pdf_url'` corrompido | 31 (confere com o relatado) |
| Desses, com `pedidos.pdf_url` válido apontando pro bucket | **31 (100%)** |
| Desses, objeto realmente existe no bucket | **31 (100%)** |
| Desses, objeto também tem duplicata por tamanho | **31 (100%)** |

Conclusão: os 31 registros **não geraram uploads órfãos ou parciais próprios** — todos têm exatamente 1 objeto no bucket, corretamente referenciado. Todos os 31 pertencem à empresa "MD" (pasta `bb5fce8c-…`) e foram atualizados em 2026-08-06 (a segunda leva de import). Eles só entram na estatística de duplicação porque fazem parte do padrão geral do item 2 (empresa duplicada), não por um problema isolado de retry.

## 8. Imagens não comprimidas

| mimetype | objetos | volume | tamanho médio |
|---|---:|---:|---:|
| `application/pdf` | 9.526 | 3.340,56 MB | 359,1 KB |
| `image/png` | 171 | 1,50 MB | 9,0 KB |
| `.docx` | 17 | 0,52 MB | 31,3 KB |
| `image/jpeg` | 1 | 0,13 MB | 129,5 KB |
| `.xlsx` | 1 | 0,12 MB | 124,2 KB |
| `.zip` | 1 | 0,03 MB | 30,8 KB |

**Não há problema de imagens não comprimidas.** 99,9% do volume é PDF; PNG/JPEG somam menos de 1,7 MB no total (0,05% do bucket) e já são pequenos em média (9 KB). O crescimento do bucket é 100% explicado pela duplicação de PDFs entre as duas empresas, não por formato de imagem ineficiente.

---

## Resumo — top ofensores

1. **Empresa duplicada "MD" vs "MD Representações"** (item 2) — causa raiz de quase todo o volume do bucket; duas importações Bitrix24 quase completas, 5 dias de diferença.
2. **5.587 objetos órfãos, 2,26 GB (69% do bucket)** — sem nenhuma referência em `pedidos.pdf_url` (item 6).
3. **2.407 grupos de arquivos com tamanho idêntico, 8.022 objetos, ~1,92 GB de excedente estimado** (item 5) — quase totalmente sobreposto com os órfãos.
4. Imagens não são um fator (item 8) — descartar essa hipótese.

## Estimativa de espaço recuperável

- **Seguro e confirmado por ausência total de referência**: **5.587 objetos / ~2,26 GB** (órfãos, item 6) — nenhum `pedidos.pdf_url` aponta para eles hoje, logo removê-los não quebraria nenhum link ativo *supondo que não existam outras referências fora de `pedidos` que eu não tenha visto* (não há tabela de anexos separada; não verifiquei `campos_extras` de outros módulos como `clientes`/`obras`, que estão fora do escopo pedido).
- **Estimativa adicional, não confirmada por conteúdo**: dos 4.130 objetos referenciados, 2.817 ainda têm duplicata por tamanho com outro objeto — isso sugere que pode haver dedup adicional possível (dois pedidos diferentes apontando para o "mesmo" PDF fisicamente duplicado), mas confirmar isso exige hash de conteúdo (SHA-256), que não está disponível em `storage.objects.metadata` — não dá pra quantificar com segurança sem baixar e comparar os arquivos.
- **Total teórico máximo** (se toda duplicata por tamanho for de fato conteúdo idêntico e um lado for descartável): até ~1,92 GB, mas isso **inclui** boa parte dos 2,26 GB de órfãos — os dois números não devem ser somados.

**Estimativa recomendada para planejamento: ~2,2–2,3 GB recuperáveis com segurança** (órfãos confirmados), de um bucket de 3,27 GB — ou seja, o bucket poderia cair para cerca de **1 GB** só removendo o que hoje não tem nenhum link ativo.

## Recomendação (não implementar agora)

1. **Investigar a empresa "MD" (`bb5fce8c-…`) com o dono do negócio** antes de qualquer limpeza de storage — ela parece ser um tenant duplicado/de teste criado por engano durante o onboarding, mas tem 2 usuários ativos e 6.225 pedidos; decidir se deve ser mesclada, arquivada ou realmente é um tenant separado válido é uma decisão de produto/negócio, não técnica.
2. **Antes de deletar qualquer objeto órfão**, confirmar que não há outras referências fora de `pedidos.pdf_url` (ex. anexos linkados em `historico_contatos`, e-mails, ou frontend que monte a URL dinamicamente) — o escopo desta auditoria cobriu apenas `pedidos`.
3. Se confirmado, remover os 5.587 objetos órfãos primeiro — é o ganho mais seguro e maior (2,26 GB / 69% do bucket), sem tocar em nada referenciado.
4. Para os objetos ainda referenciados com duplicata por tamanho (2.817), considerar implementar um processo de dedup por hash de conteúdo (SHA-256) antes de próximos imports/reimports, para não repetir o padrão.
5. Adicionar uma validação no fluxo de import Bitrix24 (`IMPORT_STRUCTURE.md` / `import-data` edge function) para impedir a criação de uma segunda empresa com nome quase idêntico sem confirmação explícita — isso teria evitado o problema na origem.
