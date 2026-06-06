# Documentazione — Visual Notebook (`va_project`)

> 🇮🇹 Italiano · [🇬🇧 English](./en/README.md)

Strumento no-code di esplorazione interattiva di CSV/TSV/Parquet, ispirato a
Jupyter ma orientato all'**analisi visiva** invece che al codice. L'utente
costruisce un *notebook* di celle (tabelle e grafici) che si **rebasano in
cascata** quando una manipolazione viene applicata su un nodo a monte.

## Indice

| # | Documento | Cosa trovi |
|---|---|---|
| 01 | [Architettura](./01-architettura.md) | Vista d'insieme: 4 strati, stack tech, decisioni di design, struttura cartelle |
| 02 | [Backend](./02-backend.md) | File per file della parte Python: `data/`, `domain/`, `viz/`, `api/`, `controller.py`, `session.py`, `main.py` |
| 03 | [Frontend](./03-frontend.md) | File per file della parte React: `api/`, `store/`, `lib/`, `components/`, `App.tsx`, `main.tsx` |
| 04 | [Cascade Rebase](./04-cascade.md) | Deep-dive sul meccanismo di "operations in cascata" che rebasa tutte le celle a valle quando applichi un'op a monte |
| 05 | [Catalogo Operazioni](./05-operazioni.md) | Le 21 operazioni esposte (Data, Filter, Group, Visualize, View) con segnatura dei parametri e semantica esatta |

## TL;DR per chi ha fretta

```
              UPLOAD CSV
                  ↓
       ┌──────────────────────┐
       │ Cella 0: Root        │  ← LazyFrame originale
       └──────┬───────────────┘
              │  + filter sales > 100
       ┌──────▼───────────────┐
       │ Cella 1: filtered    │  ← stato derivato
       └──────┬───────────────┘
              │  + viz histogram
       ┌──────▼───────────────┐
       │ Cella 2: chart       │  ← leaf, non avanza lo stato
       └──────────────────────┘
```

Quando applichi una nuova op sulla **cella 0** (es. `sort_by`), la cella 0
non cambia (è l'upload), ma viene **inserita** una nuova cella subito sotto
e le celle 1 e 2 vengono **rebasate** sopra di essa: la cella 1 ri-applica
il suo `filter sales > 100` sul nuovo stato, la cella 2 ri-renderizza
l'istogramma. Tutto in una singola Promise lato frontend, una catena di
chiamate `/api/branch` e `/api/execute` lato backend.

Se ti interessa solo capire questo meccanismo → [04-cascade.md](./04-cascade.md).

## Comandi rapidi

```bash
# Setup (uv crea il .venv automaticamente al primo run)
cd va_project
uv sync

# Backend (porta 8000, OpenAPI su /docs)
uv run uvicorn visual_notebook.main:app --reload --port 8000

# Frontend (porta 5173, Vite proxa /api/* sul backend)
cd frontend
npm install
npm run dev

# Test backend
uv run pytest backend
```

## Stack tecnologico

| Layer | Tecnologia | Perché |
|---|---|---|
| Data engine | **Polars** (lazy) | Single-user, in-process; lazy lascia comporre i piani senza materializzare |
| Backend HTTP | **FastAPI** + Pydantic | Tipato, OpenAPI gratis, performante con uvicorn |
| Pacchetto Python | **uv** workspace | Gestisce venv + lockfile + dipendenze in modo unificato |
| Frontend | **React 18** + TS + **Vite** | Standard moderno, HMR rapido, type-safety end-to-end |
| Stato server | **TanStack Query 5** | Cache + invalidazione intelligente, retry, dedupe |
| Stato UI | **Zustand 4** | Più leggero di Redux, perfetto per stato locale del notebook |
| Drag-and-drop | **@dnd-kit/core** | Accessibile, type-safe, granulare nei sensori |
| Charts | **Apache ECharts** (via `echarts-for-react`) | API più semplice di BokehJS, moltissimi chart out of the box |
| Mappe | **Leaflet** (via `react-leaflet`) | Standard del settore, tile providers liberi |
| Styling | **Tailwind CSS 3** | Utility-first, palette light minimalist custom in `tailwind.config.js` |

## Convenzioni della codebase

- **Italiano** nei commenti UI / messaggi user-facing; **inglese** in docstring,
  identifier, log diagnostici.
- **Layer puri**: `data/` non importa nulla di sopra; `domain/` non importa
  da `api/` o `frontend/`; le funzioni viz sono pure `(df, params) -> dict`.
- **Sessioni cookie-based** (cookie `vn_session`), in-memory dict server-side.
  Una sessione per browser tab.
- **Persistenza notebook**: localStorage (Zustand persist), versionata.
  Bumpando `version` nello store invalida automaticamente lo stato vecchio.
- **History tree** server-side tiene tutti gli stati (root → derivati);
  il frontend ne mostra una *vista lineare* (notebook flat).

## Glossario

| Termine | Significato |
|---|---|
| **State** | Un nodo nel `History` tree server-side. Ha un `id` univoco, un `LazyFrame` Polars associato, una `description` e un `parent`. Cell istante immutabile dei dati a quel punto. |
| **Cell** | Un'unità del notebook frontend. `TableCellData` punta a uno `state_id`; `ChartCellData` ha uno spec ECharts (o map payload) e un `sourceStateId`. |
| **`opChain`** | Lista di step `{op_id, params}` che hanno prodotto una cella tabella dal genitore. Replay-abile per la cascade. |
| **Cascade** | Re-applicare gli `opChain` di tutte le celle figlie su un nuovo stato genitore quando una nuova op è inserita a monte. |
| **fromChartId** | Tag che marca le celle filtro nate da un click interattivo su un chart (bin istogramma, brush scatter, ecc.). Un click successivo sullo stesso chart **rimpiazza** invece di accumulare. |
| **Branch / branch_from** | Nel `History` tree, applicare un'op partendo da uno `state_id` specifico (non necessariamente quello "corrente"). Crea un nuovo nodo figlio di quello stato. |
