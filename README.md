<div align="center">

# Exercises Dataset

<p>
  <img src="videos/0025-EIeI8Vf.gif" width="120" alt="supino com barra" />
  <img src="videos/0043-qXTaZnJ.gif" width="120" alt="agachamento completo com barra" />
  <img src="videos/0032-ila4NZS.gif" width="120" alt="levantamento terra com barra" />
  <img src="videos/0652-lBDjFxJ.gif" width="120" alt="barra fixa" />
  <img src="videos/0294-NbVPDMW.gif" width="120" alt="rosca bíceps com halteres" />
  <img src="videos/0334-DsgkuIt.gif" width="120" alt="elevação lateral com halteres" />
</p>

**1.324 exercícios** com GIF, thumbnail 180×180, slugs estáveis e conteúdo em **pt-BR, en e es**.

[![Exercises](https://img.shields.io/badge/Exercícios-1324-blue?style=flat-square)](data/exercises.json)
[![Languages](https://img.shields.io/badge/Idiomas-3-green?style=flat-square)](#modelo-de-dados)
[![License](https://img.shields.io/badge/License-MIT%20%2B%20media%20terms-blue?style=flat-square)](LICENSE)

</div>

Dataset de exercícios para apps de treino, pesquisa e protótipos. Identificadores canônicos ficam no exercício; rótulos traduzidos ficam na taxonomia; nome e passos ficam no `i18n`.

Mídia © [Gym visual](https://gymvisual.com/) — ver [Licença](#licença).

## Sumário

- [Início rápido](#início-rápido)
- [Modelo de dados](#modelo-de-dados)
- [Schema](#schema)
- [Estatísticas](#estatísticas)
- [API](#api)
- [Uso](#uso)
- [Estrutura](#estrutura)
- [Licença](#licença)

## Início rápido

```bash
npm install
npm start
```

Abra [http://localhost:3030](http://localhost:3030). O primeiro start cria `data/exercises.db` e importa `data/exercises.json`.

| Ferramenta | Função |
|---|---|
| `index.html` | Explorador com busca, filtros e infinite scroll |
| `setup.html` | Guia de importação SQL e exemplos de cliente |

Variáveis de ambiente: `PORT` (padrão `3030`), `DB_PATH`, `DATA_PATH`, `ALLOWED_ORIGINS`. Para só importar o banco: `npm run import`.

## Modelo de dados

Três camadas, sem duplicar rótulos:

| Camada | Onde | O que guarda |
|---|---|---|
| Identidade | raiz do exercício | slugs: `body_part`, `equipment`, `muscles` |
| Vocabulário | `data/taxonomy.json` | `slug → { en, es, pt-br }` |
| Conteúdo | `i18n` | só o que é único: `name` e `steps` |

Filtros e índices usam slug (`waist`, `body_weight`, `abs`). A UI resolve o rótulo com a taxonomia (`cintura`, `peso corporal`, `abdômen`).

Idiomas: `pt-br`, `en`, `es`.

## Schema

Cada item de `data/exercises.json` segue [`data/exercises.schema.json`](data/exercises.schema.json).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `string` | Identificador `"0001"`–`"1324"` |
| `body_part` | `string` | Slug da parte do corpo |
| `equipment` | `string` | Slug do equipamento |
| `muscles.primary` | `string[]` | Slugs dos músculos principais |
| `muscles.secondary` | `string[]` | Slugs dos músculos secundários |
| `i18n.<lang>.name` | `string` | Nome no idioma |
| `i18n.<lang>.steps` | `string[]` | Passos no idioma |
| `media.id` | `string` | Id original da mídia |
| `media.thumbnail` | `string` | Thumbnail 180×180 (`images/…jpg`) |
| `media.animation` | `string` | GIF 180×180 (`videos/…gif`) |
| `media.attribution` | `string` | `© Gym visual — https://gymvisual.com/` |

```json
{
  "id": "0001",
  "body_part": "waist",
  "equipment": "body_weight",
  "muscles": {
    "primary": ["abs"],
    "secondary": ["hip_flexors", "lower_back"]
  },
  "i18n": {
    "pt-br": {
      "name": "3/4 abdominal",
      "steps": ["Deite-se de costas com os joelhos dobrados…"]
    },
    "en": { "name": "3/4 sit-up", "steps": ["Lie flat on your back…"] },
    "es": { "name": "3/4 abdominal", "steps": ["Túmbate sobre tu espalda…"] }
  },
  "media": {
    "id": "2gPfomN",
    "thumbnail": "images/0001-2gPfomN.jpg",
    "animation": "videos/0001-2gPfomN.gif",
    "attribution": "© Gym visual — https://gymvisual.com/"
  }
}
```

A taxonomia mapeia os slugs:

```json
{
  "body_parts": { "waist": { "en": "waist", "es": "cintura", "pt-br": "cintura" } },
  "equipment": { "body_weight": { "en": "body weight", "es": "peso corporal", "pt-br": "peso corporal" } },
  "muscles": { "abs": { "en": "abs", "es": "abdomen", "pt-br": "abdômen" } }
}
```

## Estatísticas

| Métrica | Valor |
|---|---|
| Exercícios | **1.324** |
| Idiomas | **3** (`pt-br`, `en`, `es`) |
| Partes do corpo | **10** |
| Equipamentos | **28** |
| Músculos | **43** |
| Peso corporal | **325** (~25%) |

### Por parte do corpo

| Slug | pt-BR | Qtd |
|---|---|---|
| `upper_arms` | braços | 292 |
| `upper_legs` | coxas | 227 |
| `back` | costas | 203 |
| `waist` | cintura | 169 |
| `chest` | peito | 163 |
| `shoulders` | ombros | 143 |
| `lower_legs` | panturrilhas | 59 |
| `lower_arms` | antebraços | 37 |
| `cardio` | cardio | 29 |
| `neck` | pescoço | 2 |

### Por equipamento

| Slug | pt-BR | Qtd |
|---|---|---|
| `body_weight` | peso corporal | 325 |
| `dumbbell` | halteres | 294 |
| `cable` | polia | 157 |
| `barbell` | barra | 154 |
| `leverage_machine` | máquina de alavanca | 81 |
| `band` | faixa | 54 |
| `smith_machine` | máquina Smith | 48 |
| `kettlebell` | kettlebell | 41 |
| `weighted` | com peso | 36 |
| `stability_ball` | bola suíça | 28 |
| `ez_barbell` | barra W | 23 |
| *(demais 17)* | | 83 |

## API

Express + SQLite. Endpoints de vocabulário devolvem `{ id, labels: { en, es, pt-br } }`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/exercises` | Lista paginada |
| `GET` | `/exercises/:id` | Um exercício |
| `GET` | `/exercises/random` | Aleatório |
| `GET` | `/taxonomy` | Dicionário completo |
| `GET` | `/filters` | Valores distintos com rótulos |
| `GET` | `/body-parts` | Partes do corpo |
| `GET` | `/equipment` | Equipamentos |
| `GET` | `/muscles` | Músculos |
| `GET` | `/images/<arquivo>.jpg` | Thumbnail |
| `GET` | `/videos/<arquivo>.gif` | Animação |

Query de `/exercises`:

| Param | Padrão | Notas |
|---|---|---|
| `page` | `1` | Inteiro ≥ 1 |
| `limit` | `20` | Máximo `100` |
| `q` | — | Busca em nome, passos, slugs e rótulos da taxonomia |
| `body_part` | — | Slug; vários via vírgula |
| `equipment` | — | Slug; vários via vírgula |
| `muscle` | — | Slug em `primary` ou `secondary` |

```bash
curl "http://localhost:3030/exercises?body_part=chest&equipment=barbell&limit=5"
curl "http://localhost:3030/exercises?q=cintura"
curl "http://localhost:3030/exercises/0025"
```

Resposta da lista:

```json
{
  "data": [{ "id": "0025", "body_part": "chest", "equipment": "barbell", "muscles": {}, "i18n": {}, "media": {} }],
  "total": 154,
  "page": 1,
  "limit": 5,
  "totalPages": 31
}
```

## Uso

Resolva rótulos com a taxonomia. Não leia `body_part` / `equipment` / `muscles` de dentro do `i18n`.

```js
const exercises = require("./data/exercises.json");
const taxonomy = require("./data/taxonomy.json");

const lang = "pt-br";
const label = (group, slug) => taxonomy[group][slug]?.[lang] || slug;

const bodyweight = exercises.filter((ex) => ex.equipment === "body_weight");
const chest = exercises.filter((ex) => ex.body_part === "chest");

const ex = exercises[0];
console.log(ex.i18n[lang].name);
console.log(label("body_parts", ex.body_part));      // cintura
console.log(label("equipment", ex.equipment));       // peso corporal
console.log(ex.muscles.primary.map((slug) => label("muscles", slug)));
console.log(ex.i18n[lang].steps);
```

```python
import json

with open("data/exercises.json", encoding="utf-8") as f:
    exercises = json.load(f)
with open("data/taxonomy.json", encoding="utf-8") as f:
    taxonomy = json.load(f)

lang = "pt-br"
label = lambda group, slug: taxonomy[group][slug][lang]

chest = [ex for ex in exercises if ex["body_part"] == "chest"]
print(len(chest))  # 163

ex = exercises[0]
print(ex["i18n"][lang]["name"])
print(label("body_parts", ex["body_part"]))
```

```ts
type Locale = "en" | "es" | "pt-br";

interface Exercise {
  id: string;
  body_part: string;
  equipment: string;
  muscles: { primary: string[]; secondary: string[] };
  i18n: Record<Locale, { name: string; steps: string[] }>;
  media: {
    id: string;
    thumbnail: string;
    animation: string;
    attribution: string;
  };
}
```

## Estrutura

```
├── data/
│   ├── exercises.json         # 1.324 exercícios
│   ├── exercises.schema.json  # JSON Schema 2020-12
│   └── taxonomy.json          # slugs → rótulos
├── images/                    # thumbnails 180×180  (© Gym visual)
├── videos/                    # GIFs 180×180        (© Gym visual)
├── servidor/                  # API Express + SQLite
├── index.html                 # explorador
├── setup.html                 # guia de importação
├── LICENSE
└── NOTICE.md
```

## Licença

- **Código, estrutura do dataset e textos de instrução:** [MIT](LICENSE).
- **Mídia (`images/`, `videos/`):** © [Gym visual](https://gymvisual.com/), redistribuída com permissão em 180×180. Ver [`NOTICE.md`](NOTICE.md) e a exceção em [`LICENSE`](LICENSE). Mantenha a atribuição `© Gym visual — https://gymvisual.com/`. Reuso segue os [termos do Gym visual](https://gymvisual.com/content/3-terms-and-conditions-of-use); clonar o repositório não concede licença da mídia.
