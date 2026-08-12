# Guia de Importacao para Outro Projeto

Este documento orienta um agente ou servico externo a consumir esta API e importar o dataset completo para outro banco ou API.

## 1. Fonte recomendada

Use a API como fonte principal. Nao dependa do HTML para importar os dados, pois o `index.html` e uma interface standalone e pode conter uma copia embutida do dataset.

Defina a URL base sem barra final:

```text
API_BASE_URL=http://localhost:3000
```

A API nao exige autenticacao e permite CORS. Em ambiente publicado, prefira configurar `ALLOWED_ORIGINS` e usar HTTPS.

## 2. Endpoints para ingestao

| Endpoint | Uso na importacao |
|---|---|
| `GET /exercises?page=1&limit=100` | Listar todos os exercicios em paginas |
| `GET /exercises/:id` | Reconsultar um registro individual |
| `GET /filters` | Importar opcoes de filtros |
| `GET /categories` | Categorias unicas |
| `GET /body-parts` | Partes do corpo unicas |
| `GET /equipment` | Equipamentos unicos |
| `GET /targets` | Alvos musculares unicos |
| `GET /images/<arquivo>` | Baixar thumbnail |
| `GET /videos/<arquivo>` | Baixar GIF de movimento |

Nao use `/exercises/random` para importar. Ele e destinado apenas a exibicao de um exercicio aleatorio.

## 3. Importacao completa

Use sempre `limit=100`, que e o maior valor permitido.

1. Buscar `GET /exercises?page=1&limit=100`.
2. Ler `total`, `page`, `limit` e `totalPages` da resposta.
3. Processar `data` da primeira resposta.
4. Buscar todas as paginas de `2` ate `totalPages`.
5. Fazer `upsert` no destino usando `id` como chave unica.
6. Confirmar que a quantidade importada e igual a `total`.
7. Confirmar que nao existem IDs duplicados.
8. Registrar a data, quantidade e resultado da sincronizacao.

A ordenacao atual e por `id`, mas o agente nao deve depender de uma posicao fixa. Use o `id` como identidade do registro.

Resposta de listagem:

```json
{
  "data": [],
  "total": 1324,
  "page": 1,
  "limit": 100,
  "totalPages": 14
}
```

Nao pare a importacao quando uma pagina tiver menos itens sem antes conferir `totalPages`. Para uma sincronizacao segura, mantenha os IDs recebidos em um `Set` e rejeite duplicidades.

## 4. Campos que devem ser preservados

O destino deve guardar todos estes campos:

```text
id
name
category
body_part
equipment
instructions_en
instructions_es
instructions_pt_br
instructions
instruction_steps
muscle_group
secondary_muscles
target
image
gif_url
media_id
attribution
created_at
```

Os tres idiomas autorizados sao:

```json
{
  "instructions": {
    "en": "...",
    "es": "...",
    "pt-br": "..."
  },
  "instruction_steps": {
    "en": ["..."],
    "es": ["..."],
    "pt-br": ["..."]
  }
}
```

`secondary_muscles` e um array de strings, nao uma string separada por virgulas. `instruction_steps` e um objeto JSON. Preserve os dois tipos no banco destino como JSON/JSONB ou como texto JSON validado.

Os campos `instructions_en`, `instructions_es` e `instructions_pt_br` sao equivalentes aos textos dentro de `instructions`. Preserve tambem o objeto `instructions` se o destino precisar reproduzir o formato original do dataset.

## 5. Relacionamento com midia

Cada exercicio ja possui os caminhos relativos relacionados:

```json
{
  "id": "0001",
  "image": "images/0001-2gPfomN.jpg",
  "gif_url": "videos/0001-2gPfomN.gif"
}
```

Converta-os em URLs absolutas usando a URL base:

```js
const imageUrl = new URL(exercise.image, `${API_BASE_URL}/`).href;
const gifUrl = new URL(exercise.gif_url, `${API_BASE_URL}/`).href;
```

Resultado:

```text
http://localhost:3000/images/0001-2gPfomN.jpg
http://localhost:3000/videos/0001-2gPfomN.gif
```

Existem duas estrategias validas:

- Referenciar as URLs da API no projeto destino e nao duplicar arquivos.
- Baixar os arquivos para o storage/CDN do projeto destino e guardar `source_image_url`, `source_gif_url`, `local_image_path`, `local_gif_path` e os checksums.

Se baixar a midia, valide o status HTTP, o `Content-Type`, o tamanho e o checksum. Nao monte nomes de arquivos apenas com o `id`; use o caminho retornado pela API. Preserve `media_id` e `attribution`.

## 6. Modelo recomendado no projeto destino

Alem dos campos do exercicio, estes metadados tornam a sincronizacao auditavel:

```text
source_system          = "exercises-api"
source_id              = id
source_payload         = JSON completo recebido
source_image_url       = URL absoluta da imagem
source_gif_url         = URL absoluta do GIF
image_sha256           = checksum opcional
gif_sha256             = checksum opcional
last_synced_at         = timestamp da sincronizacao
sync_version           = versao ou identificador do job
```

Recomendacoes:

- Chave unica: `source_system + source_id` ou apenas `id` se nao houver outras fontes.
- `INSERT ... ON CONFLICT DO UPDATE` para sincronizacao repetida.
- Nao apagar registros que nao vieram em uma pagina; somente remova no final se a reconciliacao completa confirmar que foram excluidos da fonte.
- Mantenha `source_payload` para reprocessar campos sem consultar a API novamente.
- Execute os upserts em lotes/transacoes.

## 7. Exemplo de cliente JavaScript

Este exemplo baixa todas as paginas, valida IDs e retorna o conjunto completo para o adaptador do banco destino:

```js
const API_BASE_URL = 'http://localhost:3000';
const PAGE_SIZE = 100;
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'pt-br']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, maxAttempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = await response.json();

      if (response.ok) return body;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      throw new Error(`Retryable HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function validateExercise(exercise) {
  if (!exercise.id || !exercise.name) {
    throw new Error('Exercise without id or name');
  }

  if (!Array.isArray(exercise.secondary_muscles)) {
    throw new Error(`Invalid secondary_muscles for ${exercise.id}`);
  }

  const stepLanguages = Object.keys(exercise.instruction_steps || {});
  if (stepLanguages.some((language) => !ALLOWED_LANGUAGES.has(language))) {
    throw new Error(`Unexpected instruction language for ${exercise.id}`);
  }
}

async function fetchAllExercises() {
  const firstPage = await requestJson(`/exercises?page=1&limit=${PAGE_SIZE}`);
  const records = [...firstPage.data];
  const ids = new Set();

  for (const exercise of records) {
    validateExercise(exercise);
    if (ids.has(exercise.id)) throw new Error(`Duplicated exercise id ${exercise.id}`);
    ids.add(exercise.id);
  }

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const result = await requestJson(`/exercises?page=${page}&limit=${PAGE_SIZE}`);
    if (result.page !== page) throw new Error(`Unexpected page ${result.page}`);

    for (const exercise of result.data) {
      validateExercise(exercise);
      if (ids.has(exercise.id)) throw new Error(`Duplicated exercise id ${exercise.id}`);
      ids.add(exercise.id);
      records.push(exercise);
    }
  }

  if (records.length !== firstPage.total) {
    throw new Error(`Expected ${firstPage.total} exercises, received ${records.length}`);
  }

  return records;
}

async function runImport(destination) {
  const exercises = await fetchAllExercises();
  await destination.upsertMany(exercises, { transaction: true });
  await destination.recordSync({
    source: API_BASE_URL,
    imported: exercises.length,
    finishedAt: new Date().toISOString(),
  });
}

// Implemente destination.upsertMany e destination.recordSync no projeto destino.
```

## 8. Traduzir nomes dos exercicios

Depois de importar os exercicios, o agente pode traduzir o campo `name` usando o servico local de traducao:

```js
const TRANSLATE_URL = 'http://localhost:8080/translate';
const TRANSLATE_API_KEY = process.env.TRANSLATE_API_KEY || '';

async function translateName(name, target = 'en') {
  const response = await fetch(TRANSLATE_URL, {
    method: 'POST',
    body: JSON.stringify({
      q: name,
      source: 'auto',
      target,
      format: 'text',
      alternatives: 3,
      api_key: TRANSLATE_API_KEY,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Translation HTTP ${response.status}`);
  }

  const translatedText = body.translatedText || body.translation || body.text;
  if (!translatedText) {
    throw new Error(`Unexpected translation response: ${JSON.stringify(body)}`);
  }

  return {
    text: translatedText,
    alternatives: Array.isArray(body.alternatives) ? body.alternatives : [],
    raw: body,
  };
}

const result = await translateName('supino com barra', 'en');
console.log(result.text);
console.log(result.alternatives);
```

O corpo enviado para cada nome deve seguir este formato:

```json
{
  "q": "nome original do exercicio",
  "source": "auto",
  "target": "en",
  "format": "text",
  "alternatives": 3,
  "api_key": ""
}
```

### Regras de traducao

- Preserve sempre o `name` original; nunca o substitua pelo texto traduzido.
- Guarde as traducoes em campos separados, como `name_en`, `name_es` e `name_pt_br`.
- Para cada traducao, guarde tambem `translation_source`, `translation_target`, `translation_alternatives`, `translation_raw` e `translated_at`.
- Use `source: "auto"` para permitir que o servico detecte o idioma original.
- Use `target: "en"` para ingles, `target: "es"` para espanhol e o codigo aceito pelo servidor para portugues. Alguns servidores esperam `pt` em vez de `pt-br`; confirme o codigo suportado antes do lote.
- Traduza somente `name`, nao traduza novamente as instrucoes que ja estao disponiveis nos tres idiomas.
- Use `id + target + name` como chave de cache. Se o nome nao mudou, nao chame o tradutor novamente.
- Preserve as tres alternativas retornadas sempre que o servico as fornecer; use `text`/`translatedText` como traducao principal.
- Nao envie todos os nomes em paralelo sem limite. Use no maximo 2 a 4 requisicoes simultaneas, conforme a capacidade do servico.
- Em timeout, `429` ou `5xx`, repita com backoff exponencial. Em `4xx` por idioma invalido, interrompa esse idioma e registre o erro.
- Se uma traducao falhar, mantenha o exercicio importado e marque a traducao como `pending` ou `failed`.

### Campos recomendados no destino

```text
name                 = nome original da API
name_en              = traducao principal para ingles
name_es              = traducao principal para espanhol
name_pt_br           = traducao principal para portugues
name_translations    = JSON com alternativas e payloads
translation_status   = pending | partial | complete | failed
translated_at        = timestamp da ultima traducao
```

Exemplo de `name_translations`:

```json
{
  "en": {
    "text": "Barbell Bench Press",
    "alternatives": ["Bench Press with Barbell"],
    "raw": { "translatedText": "Barbell Bench Press" },
    "translated_at": "2026-08-11T12:00:00.000Z"
  }
}
```

### Lote com cache e limite de concorrencia

```js
async function translateExerciseNames(exercises, targets = ['en', 'es', 'pt-br']) {
  const output = [];
  const concurrency = 3;

  for (let start = 0; start < exercises.length; start += concurrency) {
    const batch = exercises.slice(start, start + concurrency);
    const translated = await Promise.all(batch.map(async (exercise) => {
      const names = { original: exercise.name };

      for (const target of targets) {
        // Substitua por uma leitura do cache do banco antes de chamar o servico.
        const result = await translateNameWithRetry(exercise.name, target);
        names[target] = result;
      }

      return { ...exercise, translated_names: names };
    }));

    output.push(...translated);
  }

  return output;
}
```

`translateNameWithRetry` deve reutilizar a funcao `requestJson` da importacao, mas enviar `POST` para o servico de traducao e aplicar o mesmo timeout/backoff. Para 1.324 exercicios e tres idiomas, serao ate 3.972 chamadas se nao houver cache; execute esse job uma vez e depois sincronize somente nomes novos ou alterados.

## 9. Baixar midias com seguranca

Se o projeto destino precisar de copia local, use o caminho retornado pela API e restrinja o destino a `images/` e `videos/`:

```js
const path = require('node:path');
const fs = require('node:fs/promises');

async function downloadMedia(relativePath, outputRoot) {
  if (!/^(images|videos)\/[A-Za-z0-9._-]+$/.test(relativePath)) {
    throw new Error(`Unsafe media path: ${relativePath}`);
  }

  const url = new URL(relativePath, `${API_BASE_URL}/`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media HTTP ${response.status}: ${url}`);

  const outputPath = path.join(outputRoot, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}
```

Em producao, adicione retry/backoff, limite de concorrencia e validacao do `Content-Type` esperado (`image/jpeg` para thumbnails e `image/gif` para animacoes).

## 10. Filtros e sincronizacoes parciais

Para importar apenas um subconjunto:

```text
/exercises?category=chest&limit=100
/exercises?equipment=dumbbell&target=biceps&limit=100
/exercises?q=barbell&limit=100
```

Filtros repetidos usam `OR` dentro do mesmo campo e `AND` entre campos:

```text
/exercises?category=chest&category=back&equipment=dumbbell
```

Para sincronizacao completa, nao use filtros. Para reconciliação, compare o conjunto completo de IDs recebido com os IDs marcados como `source_system = "exercises-api"` no destino.

## 11. Tratamento de falhas

O agente deve tratar:

- `400`: corrigir parametros; nao repetir automaticamente.
- `404`: registrar o ID e seguir somente quando for uma consulta individual opcional.
- `429` ou `5xx`: repetir com backoff exponencial e limite de tentativas.
- Timeout ou erro de rede: repetir a requisicao.
- JSON invalido ou schema inesperado: interromper o lote e registrar o payload problemático.
- Falha de uma midia: registrar como pendente sem descartar o exercicio.

Nunca faça `INSERT` concatenando valores recebidos. Use queries parametrizadas ou o mecanismo de upsert do ORM.

## 12. Fallback de scraping

Se a API estiver temporariamente indisponivel, use scraping somente como fallback:

- Prefira extrair o JSON original do `data/exercises.json` ou o array `EXERCISES` embutido no `index.html`.
- Nao percorra somente os cards renderizados; a interface usa carregamento incremental e lazy loading.
- Nao dependa de textos visuais, labels ou ordem dos elementos HTML.
- Valide cada objeto pelo menos com `id`, `name`, `category`, `equipment`, `image` e `gif_url`.
- Use `id` como chave de deduplicacao.
- Normalize `instructions` e `instruction_steps` para somente `en`, `es` e `pt-br`.
- Resolva caminhos de midia contra a origem dos arquivos antes de salvar.
- Registre que o lote veio de `scrape` e nao de `api`.

Quando a API voltar, execute uma sincronizacao completa pela API e trate-a como fonte de verdade.

## 13. Prompt pronto para o agente do outro projeto

Copie o prompt abaixo e substitua os valores entre `<...>`:

```text
Você é responsável por importar o dataset de exercícios da API <API_BASE_URL> para <BANCO_OU_API_DESTINO>.

Use GET /exercises?page=N&limit=100 como fonte principal. Busque todas as páginas usando totalPages e valide que a quantidade final seja igual a total. Use id como chave única e faça upsert transacional, sem duplicar registros.

Preserve integralmente estes campos: id, name, category, body_part, equipment, instructions_en, instructions_es, instructions_pt_br, instructions, instruction_steps, muscle_group, secondary_muscles, target, image, gif_url, media_id, attribution e created_at.

Aceite somente os idiomas en, es e pt-br em instructions e instruction_steps. Preserve secondary_muscles como array JSON e instruction_steps como objeto JSON.

Implemente validação de schema, retry com backoff para timeout/429/5xx, timeout de 30 segundos, logs por página, detecção de IDs duplicados e relatório final. Use queries parametrizadas.

Para cada image e gif_url, construa a URL absoluta usando <API_BASE_URL>. Não monte nomes de arquivo manualmente. Se for necessário copiar mídias, baixe /images e /videos com validação de caminho, Content-Type, tamanho e checksum. Preserve media_id e attribution.

Armazene source_system, source_id, source_payload, URLs de origem, timestamps de sincronização e status de mídia para auditoria. Não apague dados antigos até concluir uma reconciliação completa de IDs.

Depois da importação, traduza cada `name` com POST http://localhost:8080/translate. Envie q com o nome original, source auto, target en/es/pt-br conforme os idiomas suportados, format text, alternatives 3 e api_key pela variável de ambiente. Preserve o nome original, salve a tradução principal, alternativas e payload bruto, use cache por id+target+nome, limite a concorrência e aplique retry/backoff.

Ao terminar, informe: páginas lidas, registros recebidos, inseridos, atualizados, rejeitados, IDs duplicados, falhas de validação, mídias baixadas, mídias pendentes e erros detalhados.
```

## 14. Checklist final

- API acessível pela URL configurada.
- `GET /exercises?page=1&limit=100` retorna `200`.
- `total` e `totalPages` foram lidos da resposta.
- Todas as páginas foram processadas.
- Quantidade recebida confere com `total`.
- IDs são únicos.
- Os tres idiomas foram preservados.
- `secondary_muscles` e `instruction_steps` mantêm seus tipos JSON.
- Imagem e GIF foram referenciados ou copiados.
- `attribution` foi preservado.
- Upsert e retry foram usados.
- Relatorio de importacao foi gravado.
- Nomes traduzidos foram armazenados sem sobrescrever `name`.
- Cache, alternativas, status e payloads de tradução foram persistidos.
- Falhas de tradução ficaram pendentes para reprocessamento.
