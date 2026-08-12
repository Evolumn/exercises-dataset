# Guia de Consumo da API de Exercicios

Esta API disponibiliza os 1.324 exercicios do dataset, com filtros, paginacao, instrucoes em ingles, espanhol e portugues do Brasil, alem de acesso aos arquivos de imagem e GIF.

## 1. Iniciar a API

Na raiz do projeto:

```bash
npm install
node index.js
```

Por padrao, a API fica disponivel em:

```text
http://localhost:3000
```

O primeiro inicio cria o banco `data/exercises.db` e importa automaticamente `data/exercises.json`.

Para importar novamente sem iniciar o servidor:

```bash
npm run import
```

Variaveis de ambiente:

| Variavel | Padrao | Funcao |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DB_PATH` | `./data/exercises.db` | Caminho do banco SQLite |
| `DATA_PATH` | `./data/exercises.json` | Caminho do dataset JSON |
| `ALLOWED_ORIGINS` | todas as origens | Lista de origens CORS separadas por virgula |

Exemplo:

```bash
PORT=8080 ALLOWED_ORIGINS=http://localhost:5173 node index.js
```

## 2. Formato dos exercicios

Cada exercicio retornado pela API possui estes campos:

| Campo | Tipo | Descricao |
|---|---|---|
| `id` | `string` | Identificador, por exemplo `0001` |
| `name` | `string` | Nome do exercicio |
| `category` | `string` | Categoria |
| `body_part` | `string` | Parte do corpo |
| `equipment` | `string` | Equipamento necessario |
| `instructions_en` | `string` | Instrucoes em ingles |
| `instructions_es` | `string` | Instrucoes em espanhol |
| `instructions_pt_br` | `string` | Instrucoes em portugues do Brasil |
| `instruction_steps` | `object` | Passos separados por idioma |
| `muscle_group` | `string` | Grupo muscular auxiliar |
| `secondary_muscles` | `string[]` | Musculos secundarios |
| `target` | `string` | Musculo alvo principal |
| `image` | `string` | Caminho relativo da imagem |
| `gif_url` | `string` | Caminho relativo do GIF |
| `media_id` | `string` | Identificador da midia original |
| `attribution` | `string` | Atribuicao da midia |
| `created_at` | `string` | Data de criacao em ISO 8601 |

O campo `instructions` tambem e retornado em formato aninhado, com as chaves `en`, `es` e `pt-br`. Os campos `instructions_en`, `instructions_es` e `instructions_pt_br` continuam disponiveis para facilitar consultas e compatibilidade com bancos relacionais.

Os nomes de idioma usados em `instruction_steps` sao `en`, `es` e `pt-br`.

## 3. Buscar um exercicio

### `GET /exercises/:id`

Busca um exercicio pelo identificador.

```bash
curl http://localhost:3000/exercises/0001
```

Resposta de sucesso: `200 OK` com um objeto de exercicio.

Quando o ID nao existe:

```json
{
  "error": "Exercise not found"
}
```

Status: `404 Not Found`.

## 4. Listar, paginar e filtrar

### `GET /exercises`

Parametros opcionais:

| Parametro | Padrao | Limite | Funcao |
|---|---:|---:|---|
| `page` | `1` | inteiro positivo | Numero da pagina |
| `limit` | `20` | de `1` a `100` | Itens por pagina |
| `category` | - | texto | Busca parcial, sem diferenciar maiusculas |
| `body_part` | - | texto | Busca parcial, sem diferenciar maiusculas |
| `equipment` | - | texto | Busca parcial, sem diferenciar maiusculas |
| `muscle_group` | - | texto | Busca parcial, sem diferenciar maiusculas |
| `target` | - | texto | Busca parcial, sem diferenciar maiusculas |

Para reproduzir a busca da interface `index.html`, use `q`. Ela pesquisa em `name`, `category`, `target`, `equipment` e `muscle_group`:

```bash
curl 'http://localhost:3000/exercises?q=barbell&limit=60'
```

Um mesmo filtro pode ser repetido ou receber valores separados por virgula. Os valores do mesmo filtro usam `OR`; filtros diferentes usam `AND`:

```bash
# category=chest OU category=back, e equipment=dumbbell
curl 'http://localhost:3000/exercises?category=chest&category=back&equipment=dumbbell&limit=60'
curl 'http://localhost:3000/exercises?category=chest,back&equipment=dumbbell&limit=60'
```

Exemplos:

```bash
# Primeira pagina com 20 itens
curl 'http://localhost:3000/exercises'

# Segunda pagina com 50 itens
curl 'http://localhost:3000/exercises?page=2&limit=50'

# Exercicios de peito que usam halteres
curl 'http://localhost:3000/exercises?body_part=chest&equipment=dumbbell'

# Busca parcial e case-insensitive
curl 'http://localhost:3000/exercises?target=BI'
```

Os filtros sao combinados com `AND`. O resultado possui este formato:

```json
{
  "data": [],
  "total": 1324,
  "page": 1,
  "limit": 20,
  "totalPages": 67
}
```

`total` representa a quantidade depois dos filtros. Quando nao houver resultados, `data` sera um array vazio e `totalPages` sera `0`.

`page` e `limit` devem ser inteiros positivos. O valor de `limit` nao pode ultrapassar `100`. Valores invalidos retornam `400 Bad Request`.

## 5. Buscar exercicio aleatorio

### `GET /exercises/random`

```bash
curl http://localhost:3000/exercises/random
```

Retorna um unico objeto de exercicio com status `200 OK`.

## 6. Buscar listas para filtros

Os endpoints abaixo retornam arrays ordenados e sem valores duplicados:

```bash
curl http://localhost:3000/categories
curl http://localhost:3000/body-parts
curl http://localhost:3000/equipment
curl http://localhost:3000/targets
curl http://localhost:3000/filters
```

Exemplo de resposta:

```json
["back", "cardio", "chest", "shoulders", "waist"]
```

`GET /filters` retorna todas as opções em uma unica requisicao:

```json
{
  "categories": ["back", "chest"],
  "body_parts": ["back", "chest"],
  "equipment": ["barbell", "dumbbell"],
  "muscle_groups": ["chest", "triceps"],
  "targets": ["abs", "biceps"]
}
```

## 7. Usar imagens e videos

Os arquivos de midia ficam disponiveis por HTTP. A API nao grava os binarios dentro do SQLite; ela grava os caminhos e o Express serve os arquivos das pastas locais.

Se um exercicio retornar:

```json
{
  "id": "0001",
  "image": "images/0001-2gPfomN.jpg",
  "gif_url": "videos/0001-2gPfomN.gif"
}
```

As URLs completas sao:

```text
http://localhost:3000/images/0001-2gPfomN.jpg
http://localhost:3000/videos/0001-2gPfomN.gif
```

No frontend, prefira montar a URL com `URL` para funcionar mesmo se a API mudar de dominio:

```js
const API_URL = 'http://localhost:3000';

const imageUrl = new URL(exercise.image, `${API_URL}/`).href;
const gifUrl = new URL(exercise.gif_url, `${API_URL}/`).href;
```

HTML:

```html
<img src="http://localhost:3000/images/0001-2gPfomN.jpg" alt="3/4 sit-up">
<img src="http://localhost:3000/videos/0001-2gPfomN.gif" alt="Animacao do exercicio">
```

## 8. Cliente JavaScript completo

Este cliente trata erros HTTP, busca exercicios, pagina resultados e monta URLs de midia:

```js
const API_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return body;
}

async function getExercise(id) {
  return request(`/exercises/${encodeURIComponent(id)}`);
}

async function getRandomExercise() {
  return request('/exercises/random');
}

async function searchExercises(filters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return request(`/exercises${query ? `?${query}` : ''}`);
}

async function getAllExercises(filters = {}) {
  const firstPage = await searchExercises({ ...filters, page: 1, limit: 100 });
  const exercises = [...firstPage.data];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await searchExercises({ ...filters, page, limit: 100 });
    exercises.push(...nextPage.data);
  }

  return exercises;
}

async function getFilterOptions() {
  return request('/filters');
}

async function example() {
  const exercise = await getExercise('0001');
  const imageUrl = new URL(exercise.image, `${API_URL}/`).href;
  const gifUrl = new URL(exercise.gif_url, `${API_URL}/`).href;

  console.log(exercise.name);
  console.log(exercise.instructions_pt_br);
  console.log(exercise.instruction_steps['pt-br']);
  console.log(imageUrl, gifUrl);

  const dumbbellExercises = await searchExercises({
    equipment: 'dumbbell',
    body_part: 'chest',
    limit: 20,
  });
  console.log(dumbbellExercises.data);

  const searchResults = await searchExercises({ q: 'barbell', limit: 60 });
  console.log(searchResults.data);
}

example().catch(console.error);
```

## 9. Processar instrucoes por idioma

Para selecionar o idioma dinamicamente:

```js
const language = 'pt_br';
const instructionField = `instructions_${language}`;
const instructions = exercise[instructionField];
```

Para `instruction_steps`, o portugues brasileiro usa a chave com hifen:

```js
const steps = exercise.instruction_steps['pt-br'];

for (const [index, step] of steps.entries()) {
  console.log(`${index + 1}. ${step}`);
}
```

Mapeamento dos campos:

| Idioma | Texto | Passos |
|---|---|---|
| Ingles | `instructions_en` | `instruction_steps.en` |
| Espanhol | `instructions_es` | `instruction_steps.es` |
| Portugues brasileiro | `instructions_pt_br` | `instruction_steps['pt-br']` |

## 10. Exemplo de tela paginada

```js
let currentPage = 1;
const limit = 20;

async function loadPage(page) {
  const result = await searchExercises({ page, limit, target: 'biceps' });

  currentPage = result.page;
  renderExercises(result.data);
  renderPagination({
    currentPage: result.page,
    totalPages: result.totalPages,
    total: result.total,
  });
}

function renderExercises(exercises) {
  const container = document.querySelector('#exercises');
  container.innerHTML = exercises.map((exercise) => {
    const imageUrl = new URL(exercise.image, `${API_URL}/`).href;
    return `
      <article class="exercise-card">
        <img src="${imageUrl}" alt="${exercise.name}">
        <h2>${exercise.name}</h2>
        <p>${exercise.body_part} | ${exercise.equipment}</p>
        <p>Alvo: ${exercise.target}</p>
      </article>
    `;
  }).join('');
}

loadPage(currentPage).catch(console.error);
```

Ao inserir dados recebidos da API em HTML, escape o texto ou use `textContent` em vez de concatenar HTML diretamente. O exemplo acima e apenas demonstrativo.

## 11. Erros e status HTTP

| Status | Significado | Exemplo |
|---:|---|---|
| `200` | Requisicao concluida | Busca ou listagem bem-sucedida |
| `204` | Preflight CORS concluido | Requisicao `OPTIONS` |
| `400` | Parametro invalido | `page=0` ou `limit=101` |
| `404` | Recurso nao encontrado | ID inexistente ou rota invalida |
| `500` | Erro inesperado no servidor | Falha de banco ou infraestrutura |

Formato dos erros:

```json
{
  "error": "Exercise not found"
}
```

Erros inesperados retornam sempre:

```json
{
  "error": "Internal server error"
}
```

## 12. Boas praticas

- Use `limit=100` ao sincronizar muitos registros e respeite `totalPages`.
- Use os filtros da API em vez de baixar todo o dataset para filtrar no frontend.
- Use `encodeURIComponent` para IDs e `URLSearchParams` para filtros.
- Mostre `instructions_pt_br` ou `instruction_steps['pt-br']` quando o idioma do usuario for portugues.
- Use `image` e `gif_url` retornados pelo banco; nao reconstrua nomes de arquivos manualmente.
- Mantenha a atribuicao existente em `attribution` ao exibir ou redistribuir a midia.
- Trate `secondary_muscles` como array e `instruction_steps` como objeto.
- Nao dependa de uma ordem fixa dos resultados alem da ordenacao atual por `id`.
